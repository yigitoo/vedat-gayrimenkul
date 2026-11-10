const { formatMonthYear, now } = require('./format');
const { categoryLabel } = require('./categories');
const { getTenantDueInfo, rentAtMonth } = require('./rentSchedule');

const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function startedBy(tenant, month, year) {
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);
  const start = tenant.contractStart || tenant.createdAt;
  return !start || new Date(start) <= endOfMonth;
}

function monthKeys(count, reference = now()) {
  const base = reference.toDate ? reference.toDate() : new Date(reference);
  const keys = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const shifted = new Date(base.getFullYear(), base.getMonth() - index, 1);
    keys.push({ month: shifted.getMonth() + 1, year: shifted.getFullYear() });
  }
  return keys;
}

function reportDateError(message) {
  const error = new Error(message);
  error.code = 'INVALID_REPORT_RANGE';
  return error;
}

function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw reportDateError('Başlangıç ve bitiş tarihleri YYYY-AA-GG biçiminde olmalı.');
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (
    year < 2000
    || year > 2100
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    throw reportDateError('Geçerli bir tarih aralığı seçin.');
  }

  return { key: value, date };
}

function parseDateRange(startValue, endValue) {
  const hasStart = startValue !== undefined && startValue !== null && String(startValue).trim() !== '';
  const hasEnd = endValue !== undefined && endValue !== null && String(endValue).trim() !== '';
  if (!hasStart && !hasEnd) return null;
  if (!hasStart || !hasEnd) {
    throw reportDateError('Başlangıç ve bitiş tarihlerini birlikte seçin.');
  }

  const start = parseDateOnly(startValue);
  const end = parseDateOnly(endValue);
  if (start.date > end.date) {
    throw reportDateError('Bitiş tarihi başlangıç tarihinden önce olamaz.');
  }

  const endExclusive = new Date(end.date);
  endExclusive.setDate(endExclusive.getDate() + 1);

  return {
    start: start.date,
    end: end.date,
    endExclusive,
    startKey: start.key,
    endKey: end.key,
  };
}

function monthKeysBetween(startDate, endDate) {
  const startIndex = startDate.getFullYear() * 12 + startDate.getMonth();
  const endIndex = endDate.getFullYear() * 12 + endDate.getMonth();
  const count = endIndex - startIndex + 1;
  if (count < 1 || count > 120) {
    throw reportDateError('Rapor aralığı en fazla 10 yıl olabilir.');
  }

  return Array.from({ length: count }, (_, index) => {
    const shifted = new Date(startDate.getFullYear(), startDate.getMonth() + index, 1);
    return { month: shifted.getMonth() + 1, year: shifted.getFullYear() };
  });
}

function buildSeries({ months, tenants, payments, expenses }) {
  const paymentTotals = new Map();
  for (const payment of payments) {
    const key = payment.year + '-' + payment.month;
    paymentTotals.set(key, (paymentTotals.get(key) || 0) + payment.amount);
  }

  const expenseTotals = new Map();
  for (const expense of expenses) {
    const key = expense.year + '-' + expense.month;
    expenseTotals.set(key, (expenseTotals.get(key) || 0) + expense.amount);
  }

  return months.map(({ month, year }) => {
    const key = year + '-' + month;
    const expected = tenants.reduce(
      (sum, tenant) => sum + (startedBy(tenant, month, year) ? rentAtMonth(tenant, month, year) : 0),
      0
    );
    const received = paymentTotals.get(key) || 0;
    const expense = expenseTotals.get(key) || 0;
    return {
      month,
      year,
      label: formatMonthYear(month, year),
      short: new Intl.DateTimeFormat('tr-TR', { month: 'short' }).format(new Date(year, month - 1, 1)),
      expected,
      received,
      expense,
      net: received - expense,
      rate: expected ? Math.min(Math.round((received / expected) * 100), 100) : 0,
    };
  });
}

function buildTenantBreakdown({ months, tenants, payments }) {
  const byTenant = new Map();
  for (const payment of payments) {
    const id = payment.tenant?.toString();
    if (!id) continue;
    byTenant.set(id, (byTenant.get(id) || 0) + payment.amount);
  }

  return tenants
    .map((tenant) => {
      const id = tenant._id.toString();
      const expected = months.reduce(
        (sum, { month, year }) => sum + (startedBy(tenant, month, year) ? rentAtMonth(tenant, month, year) : 0),
        0
      );
      const received = byTenant.get(id) || 0;
      return {
        tenantId: id,
        name: tenant.name,
        address: tenant.address,
        expected,
        received,
        outstanding: Math.max(expected - received, 0),
        rate: expected ? Math.min(Math.round((received / expected) * 100), 100) : 0,
      };
    })
    .sort((a, b) => b.received - a.received);
}

function buildCategoryBreakdown(expenses) {
  const totals = new Map();
  for (const expense of expenses) {
    totals.set(expense.category, (totals.get(expense.category) || 0) + expense.amount);
  }
  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, label: categoryLabel(category), total }))
    .sort((a, b) => b.total - a.total);
}

/* Yaklaşan sözleşme bitişleri ve kira artış yıldönümleri.
   Yıldönümü sözleşme başlangıcından, o yoksa son zam tarihinden sayılır. */
function buildAgenda(tenants, reference = now().toDate()) {
  const today = new Date(reference);
  today.setHours(0, 0, 0, 0);
  const items = [];

  for (const tenant of tenants) {
    if (tenant.contractEnd) {
      const end = new Date(tenant.contractEnd);
      const days = Math.round((end - today) / 86400000);
      if (days >= -30 && days <= 120) {
        items.push({
          type: 'contract',
          tenantId: tenant._id.toString(),
          name: tenant.name,
          date: end.toISOString(),
          days,
        });
      }
    }

    const anchor = tenant.contractStart
      || (tenant.rentHistory || []).map((item) => item.effectiveFrom).sort((a, b) => new Date(b) - new Date(a))[0]
      || tenant.createdAt;
    if (!anchor) continue;

    const anchorDate = new Date(anchor);
    const next = new Date(today.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
    if (next < today) next.setFullYear(next.getFullYear() + 1);
    const days = Math.round((next - today) / 86400000);
    if (days <= 60) {
      const rate = tenant.increaseRate || 0;
      items.push({
        type: 'increase',
        tenantId: tenant._id.toString(),
        name: tenant.name,
        date: next.toISOString(),
        days,
        rate,
        currentAmount: tenant.rentAmount,
        suggestedAmount: rate ? Math.round(tenant.rentAmount * (1 + rate / 100)) : 0,
      });
    }
  }

  return items.sort((a, b) => a.days - b.days);
}

function tenantStart(tenant) {
  return tenant.contractStart || tenant.createdAt || null;
}

/* Yıllık tablo: satır kiracı, sütun ay. Kiracının portföye girdiği aydan
   öncesi "dahil değil" olarak işaretlenir, o ay ayrıca etiketlenir. */
function buildAnnual({ year, tenants, payments, expenses, reference = now().toDate() }) {
  const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, year }));
  const today = new Date(reference);
  // Henüz gelmemiş aylar "ödenmedi" sayılmaz; ayrı bir durum taşır.
  const isFuture = (month) =>
    year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth() + 1);
  const series = buildSeries({ months, tenants, payments, expenses });

  const paidMap = new Map();
  for (const payment of payments) {
    if (payment.year !== year) continue;
    const key = payment.tenant.toString() + ':' + payment.month;
    paidMap.set(key, (paidMap.get(key) || 0) + payment.amount);
  }

  const rows = tenants.map((tenant) => {
    const id = tenant._id.toString();
    const start = tenantStart(tenant);
    const startDate = start ? new Date(start) : null;

    let joinMonth = null;
    if (startDate) {
      if (startDate.getFullYear() < year) joinMonth = 0;
      else if (startDate.getFullYear() === year) joinMonth = startDate.getMonth() + 1;
    }

    const cells = months.map(({ month }) => {
      const inside = startedBy(tenant, month, year);
      const expected = inside ? rentAtMonth(tenant, month, year) : 0;
      const paid = paidMap.get(id + ':' + month) || 0;

      let state = 'outside';
      if (inside) {
        if (paid >= expected && expected > 0) state = 'paid';
        else if (paid > 0) state = 'partial';
        else state = isFuture(month) ? 'future' : 'unpaid';
      }

      return { month, expected, paid, state, isStart: joinMonth === month };
    });

    const expected = cells.reduce((sum, cell) => sum + cell.expected, 0);
    const received = cells.reduce((sum, cell) => sum + cell.paid, 0);

    return {
      tenantId: id,
      name: tenant.name,
      address: tenant.address,
      archived: tenant.isActive === false,
      rentAmount: tenant.rentAmount,
      startDate: startDate ? startDate.toISOString() : null,
      startLabel: startDate
        ? formatMonthYear(startDate.getMonth() + 1, startDate.getFullYear())
        : 'Bilinmiyor',
      joinMonth,
      activeMonths: cells.filter((cell) => cell.state !== 'outside').length,
      cells,
      expected,
      received,
      outstanding: Math.max(expected - received, 0),
      rate: expected ? Math.min(Math.round((received / expected) * 100), 100) : 0,
    };
  })
  .sort((a, b) => b.received - a.received);

  const totals = series.reduce(
    (acc, item) => ({
      expected: acc.expected + item.expected,
      received: acc.received + item.received,
      expense: acc.expense + item.expense,
      net: acc.net + item.net,
    }),
    { expected: 0, received: 0, expense: 0, net: 0 }
  );

  return {
    year,
    series,
    rows,
    byCategory: buildCategoryBreakdown(expenses.filter((item) => item.year === year)),
    totals: {
      ...totals,
      rate: totals.expected ? Math.min(Math.round((totals.received / totals.expected) * 100), 100) : 0,
      tenantCount: rows.length,
      newTenants: rows.filter((row) => row.joinMonth && row.joinMonth > 0).length,
    },
  };
}


/* Yıl çizelgesi: satır kiracı, sütun 12 ay. Panel ve bot aynı kutucukları
   işaretler, bu yüzden hücrenin beklenen tutarı ve durumu tek yerden çıkar.
   Sözleşme başlangıcından önceki aylar "outside" işaretlenir ama beklenen
   tutar yine hesaplanır: geçmişe dönük giriş yapılabilsin. */
function buildYearGrid({ year, tenants, payments, reference = now().toDate() }) {
  const today = new Date(reference);
  today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const cells = new Map();
  for (const payment of payments) {
    if (payment.year !== year) continue;
    const key = payment.tenant.toString() + ':' + payment.month;
    const entry = cells.get(key) || { total: 0, count: 0, lastDate: null };
    entry.total += payment.amount;
    entry.count += 1;
    const date = payment.date ? new Date(payment.date) : null;
    if (date && (!entry.lastDate || date > entry.lastDate)) entry.lastDate = date;
    cells.set(key, entry);
  }

  const rows = tenants.map((tenant) => {
    const id = tenant._id.toString();

    const months = Array.from({ length: 12 }, (unused, index) => {
      const month = index + 1;
      const inside = startedBy(tenant, month, year);
      const expected = rentAtMonth(tenant, month, year);
      const entry = cells.get(id + ':' + month) || { total: 0, count: 0, lastDate: null };
      const dueInfo = getTenantDueInfo(tenant, month, year);
      const dueDate = new Date(dueInfo.dueDate);
      const dueDay = new Date(dueDate);
      dueDay.setHours(0, 0, 0, 0);
      const daysUntilDue = Math.round((dueDay - today) / 86400000);
      const ahead = year > currentYear || (year === currentYear && month > currentMonth);

      let status;
      if (expected > 0 && entry.total >= expected) status = 'paid';
      else if (entry.total > 0) status = 'partial';
      else if (!inside) status = 'outside';
      else if (daysUntilDue < 0) status = 'overdue';
      else if (ahead) status = 'future';
      else if (daysUntilDue <= 7) status = 'upcoming';
      else status = 'pending';

      return {
        month,
        label: MONTH_SHORT[index],
        inside,
        expected,
        paid: entry.total,
        count: entry.count,
        remaining: Math.max(expected - entry.total, 0),
        lastDate: entry.lastDate ? entry.lastDate.toISOString() : null,
        dueDate: dueDate.toISOString(),
        isDeferred: dueInfo.isDeferred,
        defermentNote: dueInfo.note || '',
        daysUntilDue,
        daysOverdue: -daysUntilDue,
        status,
      };
    });

    const expected = months.reduce((sum, cell) => sum + (cell.inside ? cell.expected : 0), 0);
    const received = months.reduce((sum, cell) => sum + cell.paid, 0);

    return {
      tenantId: id,
      name: tenant.name,
      address: tenant.address,
      rentAmount: tenant.rentAmount,
      paymentDay: tenant.paymentDay || 1,
      startLabel: tenantStart(tenant)
        ? formatMonthYear(new Date(tenantStart(tenant)).getMonth() + 1, new Date(tenantStart(tenant)).getFullYear())
        : 'Bilinmiyor',
      months,
      paidMonths: months.filter((cell) => cell.status === 'paid').length,
      openMonths: months.filter((cell) => cell.status === 'overdue' || cell.status === 'partial').length,
      expected,
      received,
      outstanding: Math.max(expected - received, 0),
      rate: expected ? Math.min(Math.round((received / expected) * 100), 100) : 0,
    };
  });

  const totals = rows.reduce(
    (acc, row) => ({
      expected: acc.expected + row.expected,
      received: acc.received + row.received,
      paidMonths: acc.paidMonths + row.paidMonths,
      openMonths: acc.openMonths + row.openMonths,
    }),
    { expected: 0, received: 0, paidMonths: 0, openMonths: 0 }
  );

  return {
    year,
    monthLabels: MONTH_SHORT,
    currentMonth: year === currentYear ? currentMonth : null,
    rows,
    totals: {
      ...totals,
      tenantCount: rows.length,
      outstanding: Math.max(totals.expected - totals.received, 0),
      rate: totals.expected ? Math.min(Math.round((totals.received / totals.expected) * 100), 100) : 0,
    },
  };
}

module.exports = {
  MONTH_SHORT,
  buildAnnual,
  buildAgenda,
  buildCategoryBreakdown,
  buildSeries,
  buildTenantBreakdown,
  buildYearGrid,
  monthKeys,
  monthKeysBetween,
  parseDateRange,
  rentAtMonth,
};
