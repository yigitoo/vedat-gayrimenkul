const dayjs = require('dayjs');
const { now } = require('./format');

function normalizePaymentDay(day) {
  const value = Number(day);
  if (!Number.isInteger(value) || value < 1 || value > 31) return null;
  return value;
}

function dueDateForDay(paymentDay, month, year) {
  const start = dayjs().year(year).month(month - 1).date(1).hour(12).minute(0).second(0).millisecond(0);
  const safeDay = Math.min(normalizePaymentDay(paymentDay) || 1, start.daysInMonth());
  return start.date(safeDay).toDate();
}

function getTenantDeferment(tenant, month, year) {
  const deferments = tenant.deferments || [];
  return deferments
    .filter((d) => d.month === month && d.year === year)
    .sort((a, b) => new Date(b.createdAt || b.dueDate) - new Date(a.createdAt || a.dueDate))[0] || null;
}

function getTenantDueInfo(tenant, month, year) {
  const deferment = getTenantDeferment(tenant, month, year);
  if (deferment) {
    return {
      dueDate: deferment.dueDate,
      isDeferred: true,
      note: deferment.note || '',
    };
  }

  return {
    dueDate: dueDateForDay(tenant.paymentDay, month, year),
    isDeferred: false,
    note: '',
  };
}

/* O ay için geçerli kira. Kira geçmişi varsa aradan çekilir; yoksa güncel
   tutar kullanılır. Böylece zam sonrası eski aylar geriye dönük şişmez,
   ileri tarihli bir zam da (ör. kira yılı 1 Kasım'da doluyorsa) Ekim'i
   etkilemez: o ayda henüz geçerli kayıt yoksa ilk zammın eski tutarı alınır. */
function rentAtMonth(tenant, month, year) {
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);
  const history = (tenant.rentHistory || [])
    .filter((item) => item.effectiveFrom)
    .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
  const current = history.find((item) => new Date(item.effectiveFrom) <= endOfMonth);
  if (current) return current.amount;
  const first = history[history.length - 1];
  if (first && first.previousAmount > 0) return first.previousAmount;
  return tenant.rentAmount;
}

function buildPaymentsByTenant(payments) {
  const grouped = {};
  for (const payment of payments) {
    const tenantId = payment.tenant.toString();
    if (!grouped[tenantId]) grouped[tenantId] = [];
    grouped[tenantId].push(payment);
  }
  return grouped;
}

function getTenantPaymentStatus(tenant, payments, month, year, referenceDate = now()) {
  const tenantPayments = payments || [];
  const totalPaid = tenantPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const sortedPayments = [...tenantPayments].sort((a, b) => b.date - a.date);
  const lastDate = sortedPayments[0]?.date || null;
  const expected = rentAtMonth(tenant, month, year);
  const paid = totalPaid >= expected;
  const partial = totalPaid > 0 && totalPaid < expected;
  const dueInfo = getTenantDueInfo(tenant, month, year);
  const dueDay = dayjs(dueInfo.dueDate).startOf('day');
  const today = dayjs(referenceDate).startOf('day');
  const daysUntilDue = dueDay.diff(today, 'day');
  const daysOverdue = today.diff(dueDay, 'day');

  let status = 'pending';
  if (paid) status = 'paid';
  else if (partial) status = 'partial';
  else if (daysUntilDue < 0) status = 'overdue';
  else if (daysUntilDue <= 7) status = 'upcoming';

  return {
    tenant,
    totalPaid,
    expected,
    remaining: Math.max(expected - totalPaid, 0),
    lastDate,
    paid,
    partial,
    dueDate: dueInfo.dueDate,
    isDeferred: dueInfo.isDeferred,
    defermentNote: dueInfo.note,
    daysUntilDue,
    daysOverdue,
    status,
  };
}

function getMonthlyStatuses(tenants, paymentsByTenant, month, year, referenceDate = now()) {
  return tenants.map((tenant) => {
    const tenantId = tenant._id.toString();
    return getTenantPaymentStatus(tenant, paymentsByTenant[tenantId] || [], month, year, referenceDate);
  });
}

module.exports = {
  normalizePaymentDay,
  dueDateForDay,
  getTenantDeferment,
  getTenantDueInfo,
  buildPaymentsByTenant,
  getTenantPaymentStatus,
  getMonthlyStatuses,
  rentAtMonth,
};
