const Tenant = require('../models/tenant');
const Payment = require('../models/payment');
const Expense = require('../models/expense');
const Recurrence = require('../models/recurrence');
const LedgerEntry = require('../models/ledgerEntry');
const Todo = require('../models/todo');
const { formatMonthYear, now } = require('../utils/format');
const { categoryLabel } = require('../utils/categories');
const { buildDuesPeriod, buildDuesYearGrid, coversPeriod, withoutArchivedTenants } = require('../utils/dues');
const { dueDateForDay, getTenantDeferment } = require('../utils/rentSchedule');
const busService = require('./bus');
const {
  buildAgenda,
  buildAnnual,
  buildCategoryBreakdown,
  buildSeries,
  buildTenantBreakdown,
  buildYearGrid,
  monthKeys,
  monthKeysBetween,
  parseDateRange,
} = require('../utils/reports');

/* Rapor verisi tek yerde toplanır: web API'si de Telegram botu da aynı
   nesneyi alır, böylece PDF ile ekran hiçbir zaman ayrışmaz.
   Arşivdeki kiracı, tahsilatı ve aidatıyla birlikte hiçbir toplama girmez. */

async function loadDueItems() {
  const items = await Recurrence.find({ category: 'aidat' })
    .sort({ dayOfMonth: 1, title: 1 })
    .populate('tenant', 'name isActive');
  return withoutArchivedTenants(items);
}

function tenantRef(item) {
  return item?.tenant?._id || item?.tenant || null;
}

function onlyTenants(records, tenantIds) {
  return records.filter((item) => {
    const ref = tenantRef(item);
    return !ref || tenantIds.has(ref.toString());
  });
}

async function monthReport(month, year) {
  const [tenants, payments, expenses, dueItems] = await Promise.all([
    Tenant.find({ isActive: true }).sort({ name: 1 }),
    Payment.find({ month, year }).sort({ date: 1 }),
    Expense.find({ month, year }).sort({ date: 1 }).populate('tenant', 'name'),
    loadDueItems(),
  ]);

  const activeIds = new Set(tenants.map((tenant) => tenant._id.toString()));
  const visiblePayments = onlyTenants(payments, activeIds);
  const visibleExpenses = onlyTenants(expenses, activeIds);

  const grid = buildYearGrid({ year, tenants, payments: visiblePayments });
  const rows = grid.rows.map((row) => {
    const cell = row.months[month - 1];
    return {
      tenantId: row.tenantId,
      name: row.name,
      address: row.address,
      paymentDay: row.paymentDay,
      archived: false,
      expected: cell.inside ? cell.expected : 0,
      paid: cell.paid,
      remaining: cell.inside ? cell.remaining : 0,
      status: cell.status,
      dueDate: cell.dueDate,
      lastDate: cell.lastDate,
      isDeferred: cell.isDeferred,
      defermentNote: cell.defermentNote || '',
      inside: cell.inside,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  const nameById = new Map(tenants.map((tenant) => [tenant._id.toString(), tenant.name]));
  const expected = rows.reduce((sum, row) => sum + row.expected, 0);
  const received = visiblePayments.reduce((sum, item) => sum + item.amount, 0);
  const expense = visibleExpenses.reduce((sum, item) => sum + item.amount, 0);

  return {
    scope: 'month',
    month,
    year,
    label: formatMonthYear(month, year),
    rows,
    payments: visiblePayments.map((item) => ({
      id: item._id.toString(),
      tenantId: item.tenant.toString(),
      tenantName: nameById.get(item.tenant.toString()) || 'Bilinmiyor',
      amount: item.amount,
      date: item.date ? item.date.toISOString() : null,
      note: item.note || '',
      source: item.source || 'web',
    })),
    expenses: visibleExpenses.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      category: item.category,
      categoryLabel: categoryLabel(item.category),
      amount: item.amount,
      date: item.date ? item.date.toISOString() : null,
      tenantName: item.tenant?.name || '',
      note: item.note || '',
      recurrenceId: item.recurrence ? item.recurrence.toString() : '',
      paid: item.paid !== false,
    })),
    byCategory: buildCategoryBreakdown(visibleExpenses),
    dues: buildDuesPeriod({ month, year, recurrences: dueItems, expenses: visibleExpenses }),
    bus: await busService.monthReport({ month, year }),
    totals: {
      expected,
      received,
      outstanding: Math.max(expected - received, 0),
      expense,
      net: received - expense,
      rate: expected ? Math.min(Math.round((received / expected) * 100), 100) : 0,
      tenantCount: rows.length,
      paidCount: rows.filter((row) => row.status === 'paid').length,
      partialCount: rows.filter((row) => row.status === 'partial').length,
      overdueCount: rows.filter((row) => row.status === 'overdue').length,
    },
  };
}

async function annualReport(year) {
  const rangeStart = new Date(year, 0, 1);
  const rangeEnd = new Date(year + 1, 0, 1);

  const [tenants, payments, expenses, dueItems, dueExpenses] = await Promise.all([
    Tenant.find({ isActive: true }).sort({ name: 1 }),
    Payment.find({ date: { $gte: rangeStart, $lt: rangeEnd } }),
    Expense.find({ date: { $gte: rangeStart, $lt: rangeEnd } }),
    loadDueItems(),
    Expense.find({ year, category: 'aidat', recurrence: { $ne: null } }),
  ]);

  const activeIds = new Set(tenants.map((tenant) => tenant._id.toString()));
  const visiblePayments = onlyTenants(payments, activeIds);
  const visibleExpenses = onlyTenants(expenses, activeIds);
  const dueIds = new Set(dueItems.map((item) => item._id.toString()));
  const visibleDueExpenses = dueExpenses.filter((item) => dueIds.has(item.recurrence.toString()));

  return {
    ...buildAnnual({ year, tenants, payments: visiblePayments, expenses: visibleExpenses }),
    dues: buildDuesYearGrid({ year, recurrences: dueItems, expenses: visibleDueExpenses }),
  };
}

async function rangeReport(monthCount, { startDate, endDate } = {}) {
  const selectedRange = parseDateRange(startDate, endDate);
  const months = selectedRange
    ? monthKeysBetween(selectedRange.start, selectedRange.end)
    : monthKeys(monthCount);
  const first = months[0];
  const rangeStart = selectedRange
    ? selectedRange.start
    : new Date(first.year, first.month - 1, 1);
  const dateFilter = selectedRange
    ? { date: { $gte: selectedRange.start, $lt: selectedRange.endExclusive } }
    : { date: { $gte: rangeStart } };

  const [tenants, payments, expenses] = await Promise.all([
    Tenant.find({ isActive: true }).sort({ name: 1 }),
    Payment.find(dateFilter),
    Expense.find(dateFilter),
  ]);
  const activeIds = new Set(tenants.map((tenant) => tenant._id.toString()));
  const visiblePayments = onlyTenants(payments, activeIds);
  const visibleExpenses = onlyTenants(expenses, activeIds);

  const series = buildSeries({ months, tenants, payments: visiblePayments, expenses: visibleExpenses });
  const totals = series.reduce(
    (acc, item) => ({
      expected: acc.expected + item.expected,
      received: acc.received + item.received,
      expense: acc.expense + item.expense,
      net: acc.net + item.net,
    }),
    { expected: 0, received: 0, expense: 0, net: 0 }
  );
  const best = series.reduce((top, item) => (item.received > (top?.received ?? -1) ? item : top), null);

  return {
    months: months.length,
    startDate: selectedRange?.startKey || null,
    endDate: selectedRange?.endKey || null,
    series,
    byTenant: buildTenantBreakdown({ months, tenants, payments: visiblePayments }),
    byCategory: buildCategoryBreakdown(visibleExpenses),
    agenda: buildAgenda(tenants),
    totals: {
      ...totals,
      rate: totals.expected ? Math.min(Math.round((totals.received / totals.expected) * 100), 100) : 0,
      averageMonthly: series.length ? Math.round(totals.received / series.length) : 0,
      bestMonth: best ? { label: best.label, received: best.received } : null,
      deposits: tenants.reduce((sum, tenant) => sum + (tenant.deposit || 0), 0),
      annualProjection: tenants.reduce((sum, tenant) => sum + tenant.rentAmount, 0) * 12,
    },
  };
}

/* Genel rapor: kira, gider ve otobüs hattı tek seride. İki iş kolunun
   raporu ayrı ayrı da alınabiliyor; bu görünüm ikisini üst üste koyar. */
async function combinedReport(monthCount = 12) {
  const [kira, otobus] = await Promise.all([
    rangeReport(monthCount),
    busService.rangeReport(monthCount),
  ]);

  const otobusAy = new Map(otobus.series.map((item) => [item.year + '-' + item.month, item]));

  const series = kira.series.map((item) => {
    const bus = otobusAy.get(item.year + '-' + item.month) || { gross: 0, net: 0, expense: 0, days: 0 };
    return {
      month: item.month,
      year: item.year,
      label: item.label,
      short: item.short,
      rentExpected: item.expected,
      rentReceived: item.received,
      expense: item.expense,
      busGross: bus.gross,
      busExpense: bus.expense,
      busNet: bus.net,
      busDays: bus.days,
      net: Math.round((item.received - item.expense + bus.net) * 100) / 100,
    };
  });

  const totals = series.reduce(
    (acc, item) => ({
      rentExpected: acc.rentExpected + item.rentExpected,
      rentReceived: acc.rentReceived + item.rentReceived,
      expense: acc.expense + item.expense,
      busGross: acc.busGross + item.busGross,
      busExpense: acc.busExpense + item.busExpense,
      busNet: acc.busNet + item.busNet,
      busDays: acc.busDays + item.busDays,
      net: acc.net + item.net,
    }),
    { rentExpected: 0, rentReceived: 0, expense: 0, busGross: 0, busExpense: 0, busNet: 0, busDays: 0, net: 0 }
  );

  const best = series.reduce((top, item) => (item.net > (top?.net ?? -Infinity) ? item : top), null);

  return {
    scope: 'combined',
    months: monthCount,
    series,
    byTenant: kira.byTenant,
    byCategory: kira.byCategory,
    totals: {
      ...totals,
      income: Math.round((totals.rentReceived + totals.busGross) * 100) / 100,
      rentRate: totals.rentExpected
        ? Math.min(Math.round((totals.rentReceived / totals.rentExpected) * 100), 100)
        : 0,
      busMargin: totals.busGross ? Math.round((totals.busNet / totals.busGross) * 100) : 0,
      averageMonthly: series.length ? Math.round(totals.net / series.length) : 0,
      bestMonth: best ? { label: best.label, net: best.net } : null,
    },
  };
}

function round2(value) {
  return Math.round((value || 0) * 100) / 100;
}

function dateKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

/* Ay sonu bütün rapor: kira, aidat, giderler, gider notları, otobüs hattı
   ve gündem tek nesnede. Hesaplar yeniden yazılmaz; ay raporu, otobüs ve
   aidat servisleri olduğu gibi çağrılır, burada yalnız birleştirilir.
   Net, genel raporun "birleşik net"iyle aynı tanımdır:
   kira tahsilatı + otobüs kalanı − gider (aidat kayıtları dahil).
   Otobüs giderleri kalandan zaten düşülmüştür, ikinci kez sayılmaz.
   Gider notları defteri bilerek nete karışmaz; ayrı toplam olarak durur. */
async function fullMonthReport(month, year, { reference = now().toDate() } = {}) {
  const today = new Date(reference);
  today.setHours(0, 0, 0, 0);

  // Son 6 ayın eğilimi rapor ayında biter; geçmiş bir ay istendiğinde de.
  const trendStart = new Date(year, month - 6, 1);
  const trendEnd = new Date(year, month, 0);
  const trendRange = { start: dateKey(trendStart), end: dateKey(trendEnd) };

  const [base, tenants, ledger, recurrences, todos, kiraTrend, otobusTrend] = await Promise.all([
    monthReport(month, year),
    Tenant.find({ isActive: true }).sort({ name: 1 }),
    LedgerEntry.find({ month, year }).sort({ day: 1, createdAt: 1 }),
    Recurrence.find({ category: { $ne: 'aidat' } }).sort({ dayOfMonth: 1, title: 1 }).populate('tenant', 'name isActive'),
    Todo.find({ done: false, dueAt: { $lt: new Date(today.getTime() + 31 * 86400000) } }).sort({ dueAt: 1 }).limit(40),
    rangeReport(6, { startDate: trendRange.start, endDate: trendRange.end }),
    busService.periodReport(trendRange),
  ]);

  /* Giderler ikiye ayrılır: aidat tablosunda görünen kayıtlar bir kez orada,
     kalanı gider bölümünde. Toplam yine ay raporunun gider toplamıdır. */
  const dueExpenseIds = new Set(base.dues.rows.map((row) => row.expenseId).filter(Boolean));
  const dueExpenses = base.expenses.filter((item) => dueExpenseIds.has(item.id));
  const otherExpenses = base.expenses.filter((item) => !dueExpenseIds.has(item.id));
  const dueExpenseTotal = round2(dueExpenses.reduce((sum, item) => sum + item.amount, 0));
  const otherExpenseTotal = round2(otherExpenses.reduce((sum, item) => sum + item.amount, 0));

  const categories = new Map();
  for (const item of otherExpenses) {
    const group = categories.get(item.category) || {
      category: item.category,
      label: item.categoryLabel,
      items: [],
      total: 0,
      unpaid: 0,
    };
    group.items.push(item);
    group.total = round2(group.total + item.amount);
    if (!item.paid) group.unpaid = round2(group.unpaid + item.amount);
    categories.set(item.category, group);
  }
  const byCategory = Array.from(categories.values()).sort((a, b) => b.total - a.total);

  // Aidat dışı düzenli kalemler: ay içinde kaydı düştü mü, ödendi mi.
  const expenseByRecurrence = new Map(
    base.expenses.filter((item) => item.recurrenceId).map((item) => [item.recurrenceId, item])
  );
  const recurring = withoutArchivedTenants(recurrences)
    .filter((item) => expenseByRecurrence.has(item._id.toString()) ||
      (item.isActive !== false && coversPeriod(item, month, year)))
    .map((item) => {
      const expense = expenseByRecurrence.get(item._id.toString()) || null;
      return {
        id: item._id.toString(),
        title: item.title,
        category: item.category,
        categoryLabel: categoryLabel(item.category),
        dayOfMonth: item.dayOfMonth,
        tenantName: item.tenant?.name || '',
        amount: expense ? expense.amount : item.amount,
        recorded: Boolean(expense),
        paid: Boolean(expense?.paid),
        status: expense ? (expense.paid ? 'paid' : 'unpaid') : 'planned',
      };
    });

  const deferments = tenants
    .map((tenant) => {
      const deferment = getTenantDeferment(tenant, month, year);
      if (!deferment) return null;
      return {
        tenantId: tenant._id.toString(),
        tenantName: tenant.name,
        originalDate: dueDateForDay(tenant.paymentDay, month, year).toISOString(),
        dueDate: new Date(deferment.dueDate).toISOString(),
        note: deferment.note || '',
      };
    })
    .filter(Boolean);

  const ledgerRows = ledger.map((item) => ({
    id: item._id.toString(),
    title: item.title,
    amount: item.amount,
    day: item.day,
    date: new Date(item.year, item.month - 1, item.day, 12).toISOString(),
    note: item.note || '',
  }));
  const ledgerTotal = round2(ledgerRows.reduce((sum, item) => sum + item.amount, 0));

  // Gündem bugünden ileriye bakar: rapor geçmiş bir ay için alınsa bile.
  const agendaItems = buildAgenda(tenants, today);
  const agenda = {
    contracts: agendaItems.filter((item) => item.type === 'contract' && item.days >= 0 && item.days <= 90),
    increases: agendaItems.filter((item) => item.type === 'increase'),
    todos: todos.map((item) => {
      const dueAt = new Date(item.dueAt);
      const day = new Date(dueAt);
      day.setHours(0, 0, 0, 0);
      return {
        id: item._id.toString(),
        title: item.title,
        note: item.note || '',
        dueAt: dueAt.toISOString(),
        days: Math.round((day - today) / 86400000),
      };
    }),
  };

  const bus = base.bus;
  const rentReceived = base.totals.received;
  const income = round2(rentReceived + bus.totals.net);
  const expense = round2(base.totals.expense);
  const net = round2(income - expense);

  const otobusAy = new Map(otobusTrend.series.map((item) => [item.year + '-' + item.month, item]));
  const trend = kiraTrend.series.map((item) => {
    const otobus = otobusAy.get(item.year + '-' + item.month) || { net: 0, gross: 0, days: 0 };
    return {
      month: item.month,
      year: item.year,
      label: item.label,
      short: item.short,
      expected: item.expected,
      received: item.received,
      expense: item.expense,
      busGross: otobus.gross,
      busNet: otobus.net,
      busDays: otobus.days,
      net: round2(item.received + otobus.net - item.expense),
    };
  });
  const hasTrend = trend.some((item) => item.received || item.expense || item.busDays);

  return {
    scope: 'full',
    month,
    year,
    label: base.label,
    generatedAt: new Date(reference).toISOString(),
    rent: {
      rows: base.rows,
      payments: base.payments,
      deferments,
      totals: base.totals,
    },
    dues: { ...base.dues, recordedTotal: dueExpenseTotal },
    expenses: {
      rows: otherExpenses,
      byCategory,
      recurring,
      totals: {
        total: otherExpenseTotal,
        paid: round2(otherExpenses.filter((item) => item.paid).reduce((sum, item) => sum + item.amount, 0)),
        unpaid: round2(otherExpenses.filter((item) => !item.paid).reduce((sum, item) => sum + item.amount, 0)),
        count: otherExpenses.length,
        recurringCount: recurring.length,
        recurringOpen: recurring.filter((item) => item.status !== 'paid').length,
      },
    },
    ledger: { rows: ledgerRows, total: ledgerTotal, count: ledgerRows.length },
    bus,
    agenda,
    trend: hasTrend ? trend : [],
    totals: {
      rentExpected: base.totals.expected,
      rentReceived,
      rentOutstanding: base.totals.outstanding,
      rentRate: base.totals.rate,
      busGross: bus.totals.gross,
      busExpense: round2(bus.totals.expense),
      busNet: bus.totals.net,
      busDays: bus.totals.days,
      income,
      expense,
      expenseOther: otherExpenseTotal,
      expenseDues: dueExpenseTotal,
      ledger: ledgerTotal,
      net,
    },
  };
}

module.exports = { annualReport, combinedReport, fullMonthReport, monthReport, rangeReport };
