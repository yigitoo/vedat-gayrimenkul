const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../db');
const Tenant = require('../models/tenant');
const Payment = require('../models/payment');
const Notification = require('../models/notification');
const { requireWebAuth } = require('../utils/webAuth');
const { parsePeriod, serializePayment, serializeStatus } = require('../utils/api');
const { formatMonthYear } = require('../utils/format');
const { buildPaymentsByTenant, getMonthlyStatuses } = require('../utils/rentSchedule');
const { isTelegramConfigured } = require('../services/telegram');
const { isMailConfigured } = require('../utils/mailer');
const { getSettings } = require('../services/settings');
const Expense = require('../models/expense');
const { serializeExpense } = require('../utils/api');
const { buildAgenda } = require('../utils/reports');
const { categoryLabel } = require('../utils/categories');
const { plannedFor } = require('../services/recurrence');
const Recurrence = require('../models/recurrence');
const { buildDuesPeriod } = require('../utils/dues');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireWebAuth(req, res)) return;

  try {
    if (mongoose.connection.readyState !== 1) await connectDB();

    const { month, year } = parsePeriod(req.query);
    const settings = await getSettings();
    const tenants = await Tenant.find({ isActive: true }).sort({ name: 1 });
    const archivedCount = await Tenant.countDocuments({ isActive: false, deletedAt: null });
    const payments = await Payment.find({ month, year }).sort({ date: -1 });
    const expenses = await Expense.find({ month, year }).sort({ date: -1 }).populate('tenant', 'name');
    const paymentsByTenant = buildPaymentsByTenant(payments);
    const statuses = getMonthlyStatuses(tenants, paymentsByTenant, month, year);
    const recentPayments = await Payment.find()
      .sort({ date: -1 })
      .limit(8)
      .populate('tenant', 'name');
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(12)
      .lean();

    const totalExpected = tenants.reduce((sum, tenant) => sum + tenant.rentAmount, 0);
    const totalReceived = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const paidCount = statuses.filter((item) => item.paid).length;
    const partialCount = statuses.filter((item) => item.partial).length;
    const overdueCount = statuses.filter((item) => item.status === 'overdue').length;
    const upcomingCount = statuses.filter((item) => item.status === 'upcoming').length;
    const collectionRate = totalExpected
      ? Math.min(Math.round((totalReceived / totalExpected) * 100), 100)
      : 0;
    const totalExpense = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const planned = await plannedFor(month, year);
    const dueItems = await Recurrence.find({ category: 'aidat' })
      .sort({ dayOfMonth: 1, title: 1 })
      .populate('tenant', 'name');
    const dues = buildDuesPeriod({ month, year, recurrences: dueItems, expenses });
    const agenda = buildAgenda(tenants);

    return res.status(200).json({
      period: {
        month,
        year,
        label: formatMonthYear(month, year),
      },
      metrics: {
        totalExpected,
        totalReceived,
        outstanding: Math.max(totalExpected - totalReceived, 0),
        collectionRate,
        tenantCount: tenants.length,
        paidCount,
        partialCount,
        overdueCount,
        upcomingCount,
        totalExpense,
        netIncome: totalReceived - totalExpense,
        dueExpected: dues.totals.expected,
        dueSettled: dues.totals.settled,
        dueOutstanding: dues.totals.outstanding,
        dueOverdueCount: dues.totals.overdueCount,
        deposits: tenants.reduce((sum, tenant) => sum + (tenant.deposit || 0), 0),
      },
      expenses: expenses.map(serializeExpense),
      dues,
      expenseCategories: Expense.CATEGORIES.map((value) => ({ value, label: categoryLabel(value) })),
      planned,
      agenda,
      statuses: statuses.map(serializeStatus),
      payments: payments.map(serializePayment),
      recentPayments: recentPayments.map(serializePayment),
      notifications: notifications.map((item) => ({
        id: item._id.toString(),
        type: item.type,
        title: item.title,
        message: item.message,
        channel: item.channel,
        status: item.status,
        error: item.error || '',
        sentAt: item.sentAt ? new Date(item.sentAt).toISOString() : null,
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      })),
      integrations: {
        telegram: isTelegramConfigured() && settings.telegramChatIds.length > 0,
        email: isMailConfigured() && settings.emailRecipients.length > 0,
        telegramTokenSet: isTelegramConfigured(),
        emailTransportSet: isMailConfigured(),
      },
      settings,
      archivedCount,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return res.status(500).json({ error: 'Panel verisi alınamadı.' });
  }
};
