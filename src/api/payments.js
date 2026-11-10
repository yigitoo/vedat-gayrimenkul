const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../db');
const Tenant = require('../models/tenant');
const Payment = require('../models/payment');
const { requireWebAuth } = require('../utils/webAuth');
const { parsePeriod, serializePayment } = require('../utils/api');
const { now } = require('../utils/format');
const { requireMoney } = require('../utils/money');
const { notifyPaymentDeleted, notifyPaymentRecorded } = require('../services/notificationService');
const { clearPeriod, loadTodayList, loadYearGrid, markPeriodPaid, setPeriodAmount } = require('../services/payments');

function parsePaymentInput(body = {}) {
  const amount = requireMoney(body.amount, 'payment');

  const date = body.date ? new Date(body.date) : now().toDate();
  if (Number.isNaN(date.getTime())) throw new Error('Geçersiz ödeme tarihi.');

  const period = parsePeriod({
    month: body.month,
    year: body.year,
  });

  return {
    amount,
    date,
    month: period.month,
    year: period.year,
    note: String(body.note || '').trim().slice(0, 240),
    source: 'web',
  };
}

function parseYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : now().year();
}

module.exports = async (req, res) => {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireWebAuth(req, res)) return;

  try {
    if (mongoose.connection.readyState !== 1) await connectDB();

    if (req.method === 'GET') {
      // Yıl çizelgesi: kiracı × 12 ay kutucukları tek istekte gelir.
      if (String(req.query.scope || '') === 'year') {
        return res.status(200).json(await loadYearGrid(parseYear(req.query.year)));
      }
      // Bugün tahsil edilecekler ve gecikenler.
      if (String(req.query.scope || '') === 'today') {
        return res.status(200).json(await loadTodayList());
      }

      const filter = {};
      if (req.query.tenantId && mongoose.isValidObjectId(req.query.tenantId)) {
        filter.tenant = req.query.tenantId;
      }
      const payments = await Payment.find(filter)
        .sort({ date: -1 })
        .limit(60)
        .populate('tenant', 'name');
      return res.status(200).json({ payments: payments.map(serializePayment) });
    }

    if (req.method === 'DELETE') {
      // Dönem kutucuğu kaldırıldı: o aya ait bütün kayıtlar birlikte silinir.
      const tenantId = String(req.query.tenantId || req.body?.tenantId || '').trim();
      if (tenantId) {
        if (!mongoose.isValidObjectId(tenantId)) {
          return res.status(400).json({ error: 'Geçersiz kiracı.' });
        }
        const month = Number(req.query.month ?? req.body?.month);
        const year = Number(req.query.year ?? req.body?.year);
        if (!Number.isInteger(month) || month < 1 || month > 12 ||
            !Number.isInteger(year) || year < 2000 || year > 2100) {
          return res.status(400).json({ error: 'Geçersiz dönem.' });
        }
        const result = await clearPeriod({ tenantId, month, year, source: 'web' });
        return res.status(200).json({
          cleared: result.removed,
          amount: result.amount,
          month: result.month,
          year: result.year,
        });
      }

      const id = String(req.query.id || req.body?.id || '').trim();
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ error: 'Geçersiz ödeme kimliği.' });
      }
      const payment = await Payment.findById(id).populate('tenant', 'name');
      if (!payment) return res.status(404).json({ error: 'Ödeme bulunamadı.' });

      const snapshot = serializePayment(payment);
      await payment.deleteOne();
      const notification = await notifyPaymentDeleted(snapshot);
      return res.status(200).json({ payment: snapshot, notification });
    }

    const tenantId = String(req.body?.tenantId || req.body?.tenant || '').trim();
    if (!mongoose.isValidObjectId(tenantId)) {
      return res.status(400).json({ error: 'Geçersiz kiracı.' });
    }

    // Ay düzenlendi: dönemin tutarı doğrudan yazılır.
    if (req.body?.setAmount !== undefined) {
      const period = parsePeriod({ month: req.body.month, year: req.body.year });
      const amount = String(req.body.setAmount).trim() === ''
        ? 0
        : requireMoney(req.body.setAmount, 'payment');
      const result = await setPeriodAmount({
        tenantId,
        ...period,
        amount,
        source: 'web',
        note: String(req.body.note || '').trim().slice(0, 240),
      });
      return res.status(200).json({
        action: result.action,
        amount: result.payment?.amount ?? 0,
        replaced: result.replaced ?? result.removed ?? 0,
        ...period,
      });
    }

    // Kutucuk işaretlendi: tutar dönemin açığından hesaplanır.
    if (req.body?.fill) {
      const period = parsePeriod({ month: req.body.month, year: req.body.year });
      const result = await markPeriodPaid({
        tenantId,
        ...period,
        source: 'web',
        note: String(req.body.note || '').trim().slice(0, 240),
      });
      if (result.skipped) {
        return res.status(200).json({ skipped: true, reason: result.reason, ...period });
      }
      const populated = await result.payment.populate('tenant', 'name');
      return res.status(201).json({
        payment: serializePayment(populated),
        totalPaid: result.totalPaid,
        expected: result.expected,
        notification: result.notification,
      });
    }

    const tenant = await Tenant.findOne({ _id: tenantId, isActive: true });
    if (!tenant) return res.status(404).json({ error: 'Aktif kiracı bulunamadı.' });

    const payment = await Payment.create({
      tenant: tenant._id,
      ...parsePaymentInput(req.body),
    });
    const notification = await notifyPaymentRecorded(payment, tenant, { source: 'web' });
    const populated = await payment.populate('tenant', 'name');

    return res.status(201).json({
      payment: serializePayment(populated),
      notification,
    });
  } catch (error) {
    console.error('Payments API error:', error);
    const status = error.name === 'ValidationError' || error.message?.includes('olmalı') || error.message?.includes('Geçersiz') || error.message?.includes('bulunamadı')
      ? 400
      : 500;
    return res.status(status).json({ error: error.message || 'Ödeme işlemi başarısız.' });
  }
};
