const { currentMonth } = require('./format');
const { TRASH_DAYS } = require('../services/tenantTrash');

function parsePeriod(query = {}) {
  const fallback = currentMonth();
  const month = Number(query.month);
  const year = Number(query.year);

  if (Number.isInteger(month) && month >= 1 && month <= 12 &&
      Number.isInteger(year) && year >= 2000 && year <= 2100) {
    return { month, year };
  }

  return fallback;
}

function isoDate(value) {
  return value ? new Date(value).toISOString() : null;
}

function serializeTenant(tenant) {
  return {
    id: tenant._id.toString(),
    name: tenant.name,
    address: tenant.address,
    rentAmount: tenant.rentAmount,
    paymentDay: tenant.paymentDay,
    phone: tenant.phone || '',
    email: tenant.email || '',
    contractStart: isoDate(tenant.contractStart),
    contractEnd: isoDate(tenant.contractEnd),
    deposit: tenant.deposit || 0,
    increaseRate: tenant.increaseRate || 0,
    notes: tenant.notes || '',
    rentHistory: (tenant.rentHistory || [])
      .map((item) => ({
        amount: item.amount,
        previousAmount: item.previousAmount || 0,
        effectiveFrom: isoDate(item.effectiveFrom),
        note: item.note || '',
      }))
      .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom)),
    isActive: tenant.isActive,
    deletedAt: isoDate(tenant.deletedAt),
    purgeAt: tenant.deletedAt
      ? new Date(new Date(tenant.deletedAt).getTime() + TRASH_DAYS * 86400000).toISOString()
      : null,
    createdAt: isoDate(tenant.createdAt),
  };
}

function serializeExpense(expense) {
  return {
    id: expense._id.toString(),
    title: expense.title,
    category: expense.category,
    amount: expense.amount,
    date: isoDate(expense.date),
    month: expense.month,
    year: expense.year,
    tenantId: expense.tenant?._id?.toString() || expense.tenant?.toString() || '',
    tenantName: expense.tenant?.name || '',
    note: expense.note || '',
    paid: expense.paid !== false,
    paidAt: isoDate(expense.paidAt),
    recurrenceId: expense.recurrence?.toString() || '',
    createdAt: isoDate(expense.createdAt),
  };
}

function serializeStatus(item) {
  return {
    tenant: serializeTenant(item.tenant),
    totalPaid: item.totalPaid,
    expected: item.expected,
    remaining: item.remaining,
    lastDate: isoDate(item.lastDate),
    paid: item.paid,
    partial: item.partial,
    dueDate: isoDate(item.dueDate),
    isDeferred: item.isDeferred,
    defermentNote: item.defermentNote,
    daysUntilDue: item.daysUntilDue,
    daysOverdue: item.daysOverdue,
    status: item.status,
  };
}

function serializePayment(payment) {
  return {
    id: payment._id.toString(),
    tenantId: payment.tenant?._id?.toString() || payment.tenant?.toString(),
    tenantName: payment.tenant?.name || '',
    amount: payment.amount,
    date: isoDate(payment.date),
    month: payment.month,
    year: payment.year,
    note: payment.note || '',
    createdAt: isoDate(payment.createdAt),
  };
}

module.exports = { parsePeriod, serializeExpense, serializeTenant, serializeStatus, serializePayment };
