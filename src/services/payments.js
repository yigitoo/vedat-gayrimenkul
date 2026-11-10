const dayjs = require('dayjs');
const Tenant = require('../models/tenant');
const Payment = require('../models/payment');
const { now } = require('../utils/format');
const { rentAtMonth, buildYearGrid } = require('../utils/reports');
const { getTenantDueInfo } = require('../utils/rentSchedule');
const { notifyPaymentRecorded, notifyPeriodCleared } = require('./notificationService');

/* Panel ve bot aynı işlemi çağırsın diye kira dönemi işaretleme burada.
   İki arayüzden gelen kayıt tek yerde üretilir; yalnız "source" değişir. */

function normalizePeriod(month, year) {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error('Geçersiz ay.');
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new Error('Geçersiz yıl.');
  return { month: m, year: y };
}

/* Ödeme tarihi dönemin içinde kalmalı: takvim ve raporlar tarihe bakıyor.
   İçinde bulunduğumuz aysa bugün, değilse o dönemin son ödeme günü. */
function periodPaymentDate(tenant, month, year) {
  const today = now();
  if (today.year() === year && today.month() + 1 === month) return today.toDate();
  return new Date(getTenantDueInfo(tenant, month, year).dueDate);
}

async function findTenant(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Kiracı bulunamadı.');
  return tenant;
}

async function periodSummary(tenant, month, year) {
  const payments = await Payment.find({ tenant: tenant._id, month, year }).sort({ date: 1 });
  const totalPaid = payments.reduce((sum, item) => sum + item.amount, 0);
  const expected = rentAtMonth(tenant, month, year);
  return {
    payments,
    totalPaid,
    expected,
    remaining: Math.max(Math.round((expected - totalPaid) * 100) / 100, 0),
    paid: expected > 0 && totalPaid >= expected,
  };
}

/* Kutucuk işaretlendi: dönemin açığı kadar tek kayıt düşer. Tam ödenmişse
   yeni kayıt açılmaz, çift tıklama tutarı ikiye katlamasın. */
async function markPeriodPaid({ tenantId, month, year, source = 'web', note = '', amount = null }) {
  const period = normalizePeriod(month, year);
  const tenant = await findTenant(tenantId);
  const summary = await periodSummary(tenant, period.month, period.year);

  const requested = amount === null || amount === undefined ? summary.remaining : Number(amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    return { tenant, skipped: true, reason: 'already_paid', ...summary, ...period };
  }

  const payment = await Payment.create({
    tenant: tenant._id,
    amount: Math.round(requested * 100) / 100,
    date: periodPaymentDate(tenant, period.month, period.year),
    month: period.month,
    year: period.year,
    note,
    source,
  });

  const notification = await notifyPaymentRecorded(payment, tenant, { source });
  return {
    tenant,
    payment,
    notification,
    skipped: false,
    expected: summary.expected,
    totalPaid: summary.totalPaid + payment.amount,
    ...period,
  };
}

/* Kutucuk kaldırıldı: o döneme ait tüm kayıtlar silinir. */
async function clearPeriod({ tenantId, month, year, source = 'web' }) {
  const period = normalizePeriod(month, year);
  const tenant = await findTenant(tenantId);
  const existing = await Payment.find({ tenant: tenant._id, month: period.month, year: period.year });

  if (!existing.length) {
    return { tenant, removed: 0, amount: 0, skipped: true, reason: 'nothing_to_clear', ...period };
  }

  const amount = existing.reduce((sum, item) => sum + item.amount, 0);
  await Payment.deleteMany({ tenant: tenant._id, month: period.month, year: period.year });
  const notification = await notifyPeriodCleared(tenant, {
    month: period.month,
    year: period.year,
    amount,
    count: existing.length,
    source,
  });

  return { tenant, removed: existing.length, amount, notification, skipped: false, ...period };
}

/* Bir dönemin tutarını doğrudan yaz: yanlış girilen ay tek yerden düzelsin.
   Dönemin eski kayıtları silinir, yerine tek kayıt geçer. Tutar sıfırsa
   dönem tamamen temizlenir. */
async function setPeriodAmount({ tenantId, month, year, amount, source = 'web', note = '' }) {
  const period = normalizePeriod(month, year);
  const tutar = Math.round((Number(amount) || 0) * 100) / 100;
  if (tutar < 0) throw new Error('Tutar negatif olamaz.');
  if (tutar === 0) return { ...(await clearPeriod({ tenantId, ...period, source })), action: 'cleared' };

  const tenant = await findTenant(tenantId);
  const oncekiler = await Payment.find({ tenant: tenant._id, month: period.month, year: period.year });
  if (oncekiler.length) {
    await Payment.deleteMany({ tenant: tenant._id, month: period.month, year: period.year });
  }

  const payment = await Payment.create({
    tenant: tenant._id,
    amount: tutar,
    date: periodPaymentDate(tenant, period.month, period.year),
    month: period.month,
    year: period.year,
    note,
    source,
  });

  const notification = await notifyPaymentRecorded(payment, tenant, { source });
  return {
    tenant,
    payment,
    notification,
    action: 'set',
    replaced: oncekiler.length,
    expected: rentAtMonth(tenant, period.month, period.year),
    totalPaid: tutar,
    ...period,
  };
}

/* Tam ödenmişse işaret kalkar; eksikse dokunuş kalanı tamamlar. Kutucuk
   "ödendi" demek, o yüzden yarım kayıt tek dokunuşta tamamlanır. */
async function togglePeriod({ tenantId, month, year, source = 'web' }) {
  const period = normalizePeriod(month, year);
  const tenant = await findTenant(tenantId);
  const summary = await periodSummary(tenant, period.month, period.year);

  if (summary.paid) {
    const result = await clearPeriod({ tenantId, ...period, source });
    return { ...result, action: 'cleared' };
  }
  const result = await markPeriodPaid({ tenantId, ...period, source });
  return { ...result, action: 'marked' };
}

async function loadYearGrid(year) {
  const [tenants, payments] = await Promise.all([
    Tenant.find({ isActive: true }).sort({ name: 1 }),
    Payment.find({ year }),
  ]);
  return buildYearGrid({ year, tenants, payments });
}

/* Günlük tahsilat listesi. Üç tür dönem "bugün" bölümüne girer:
   - son günü bugün olan açık dönem,
   - eksik ödenmiş dönem (son günü gelmemiş olsa da),
   - bugün eklenen kiracının ilk açık dönemi.
   Son günü geçmiş, tam ödenmemiş dönemler "gecikenler"e düşer. Dönem tam
   ödenince iki listeden de kendiliğinden çıkar. Geçen yıldan kalan gecikme
   de görünsün diye bu yıl ile önceki yılın çizelgesi birlikte taranır. */
async function loadTodayList({ reference = now() } = {}) {
  const year = reference.year();
  const years = [year - 1, year];
  const [tenants, payments] = await Promise.all([
    Tenant.find({ isActive: true }).sort({ name: 1 }),
    Payment.find({ year: { $in: years } }),
  ]);

  const today = [];
  const overdue = [];
  let paidToday = 0;
  const todayIso = reference.format('YYYY-MM-DD');
  const dayOf = (value) => dayjs(value).utcOffset(3).format('YYYY-MM-DD');
  const addedToday = new Set(
    tenants.filter((tenant) => tenant.createdAt && dayOf(tenant.createdAt) === todayIso).map((t) => t._id.toString())
  );
  const newListed = new Set();

  for (const gridYear of years) {
    const grid = buildYearGrid({ year: gridYear, tenants, payments, reference: reference.toDate() });
    for (const row of grid.rows) {
      for (const cell of row.months) {
        if (!cell.inside || cell.expected <= 0) continue;
        if (cell.status === 'paid' || cell.remaining <= 0) continue;

        let kind = null;
        if (cell.daysUntilDue < 0) kind = 'overdue';
        else if (cell.daysUntilDue === 0) kind = 'today';
        else if (cell.paid > 0) kind = 'partial';
        else if (addedToday.has(row.tenantId) && !newListed.has(row.tenantId) && gridYear === year) kind = 'new';
        if (!kind) continue;
        if (addedToday.has(row.tenantId)) newListed.add(row.tenantId);

        const item = {
          tenantId: row.tenantId,
          name: row.name,
          address: row.address,
          month: cell.month,
          year: gridYear,
          expected: cell.expected,
          paid: cell.paid,
          remaining: cell.remaining,
          dueDate: cell.dueDate,
          isDeferred: cell.isDeferred,
          daysOverdue: Math.max(-cell.daysUntilDue, 0),
          daysUntilDue: cell.daysUntilDue,
          isNew: addedToday.has(row.tenantId),
          status: kind,
        };
        if (kind === 'overdue') overdue.push(item);
        else today.push(item);
      }
    }
  }

  // Bugün alınan: tarihi bugün olan tek tek kayıtlar (taksitler dahil).
  const activeIds = new Set(tenants.map((tenant) => tenant._id.toString()));
  for (const payment of payments) {
    if (!payment.date || !activeIds.has(payment.tenant.toString())) continue;
    if (dayOf(payment.date) === todayIso) paidToday += payment.amount;
  }

  const order = { today: 0, partial: 1, new: 2 };
  today.sort((a, b) => order[a.status] - order[b.status] ||
    a.daysUntilDue - b.daysUntilDue || a.name.localeCompare(b.name, 'tr'));
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue || a.name.localeCompare(b.name, 'tr'));
  const sum = (list) => list.reduce((total, item) => total + item.remaining, 0);

  return {
    date: reference.toDate().toISOString(),
    today,
    overdue,
    totals: {
      todayCount: today.length,
      todayAmount: sum(today),
      overdueCount: overdue.length,
      overdueAmount: sum(overdue),
      partialCount: [...today, ...overdue].filter((item) => item.paid > 0).length,
      newCount: today.filter((item) => item.status === 'new').length,
      paidToday,
    },
  };
}

module.exports = {
  clearPeriod,
  loadTodayList,
  loadYearGrid,
  markPeriodPaid,
  periodSummary,
  setPeriodAmount,
  togglePeriod,
};
