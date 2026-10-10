const Tenant = require('../models/tenant');
const Payment = require('../models/payment');
const Expense = require('../models/expense');
const Recurrence = require('../models/recurrence');

/* Arşivden silinen kiracı önce "Silinenler"e düşer. Bu süre dolana kadar
   ödeme, gider ve aidat kayıtları yerinde kalır; geri getirilince hepsi döner. */
const TRASH_DAYS = 15;

async function purgeTenant(tenant) {
  const recurrenceIds = await Recurrence.distinct('_id', { tenant: tenant._id });
  const [payments, expenses, recurrences] = await Promise.all([
    Payment.deleteMany({ tenant: tenant._id }),
    Expense.deleteMany({
      $or: [
        { tenant: tenant._id },
        { recurrence: { $in: recurrenceIds } },
      ],
    }),
    Recurrence.deleteMany({ tenant: tenant._id }),
  ]);
  await Tenant.deleteOne({ _id: tenant._id, isActive: false });
  return {
    payments: payments.deletedCount,
    expenses: expenses.deletedCount,
    recurrences: recurrences.deletedCount,
  };
}

/* Günlük cron çağırır: süresi dolan silinmiş kiracıları kalıcı temizler. */
async function purgeExpiredTenants(reference = new Date()) {
  const cutoff = new Date(reference.getTime() - TRASH_DAYS * 86400000);
  const expired = await Tenant.find({ isActive: false, deletedAt: { $ne: null, $lte: cutoff } });
  const purged = [];
  for (const tenant of expired) {
    await purgeTenant(tenant);
    purged.push(tenant.name);
  }
  return { purged };
}

module.exports = { TRASH_DAYS, purgeExpiredTenants, purgeTenant };
