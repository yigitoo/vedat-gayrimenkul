const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../db');
const { requireWebAuth } = require('../utils/webAuth');
const Tenant = require('../models/tenant');
const {
  notifyRentIncreased,
  notifyTenantArchived,
  notifyTenantCreated,
  notifyTenantRestored,
  notifyTenantUpdated,
} = require('../services/notificationService');
const { serializeTenant } = require('../utils/api');
const { LIMITS, formatMoney, requireMoney } = require('../utils/money');

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

function optionalDate(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(label + ' geçersiz.');
  date.setHours(12, 0, 0, 0);
  return date;
}

function cleanTenantInput(body = {}) {
  const name = String(body.name || '').trim();
  const address = String(body.address || '').trim();
  const rentAmount = requireMoney(body.rentAmount, 'rent');
  const paymentDay = Number(body.paymentDay);

  if (!name || name.length > 120) throw new Error('Kiracı adı 1-120 karakter olmalı.');
  if (!address || address.length > 240) throw new Error('Adres 1-240 karakter olmalı.');
  if (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31) {
    throw new Error('Ödeme günü 1-31 arasında olmalı.');
  }

  const email = String(body.email || '').trim().slice(0, 120);
  if (email && !EMAIL_PATTERN.test(email)) throw new Error('Kiracı e-posta adresi geçersiz.');

  const increaseRate = Number(String(body.increaseRate ?? 0).replace(',', '.')) || 0;
  if (increaseRate < 0 || increaseRate > 200) throw new Error('Yıllık artış oranı 0-200 arasında olmalı.');

  const contractStart = optionalDate(body.contractStart, 'Sözleşme başlangıcı');
  const contractEnd = optionalDate(body.contractEnd, 'Sözleşme bitişi');
  if (contractStart && contractEnd && contractEnd < contractStart) {
    throw new Error('Sözleşme bitişi başlangıçtan önce olamaz.');
  }

  return {
    name,
    address,
    rentAmount,
    paymentDay,
    phone: String(body.phone || '').trim().slice(0, 32),
    email,
    deposit: requireMoney(body.deposit, 'deposit', { allowEmpty: true }),
    increaseRate,
    contractStart,
    contractEnd,
    notes: String(body.notes || '').trim().slice(0, 1000),
  };
}

/* Kira artışı: tutar doğrudan verilebilir ya da yüzdeden hesaplanır.
   Eski tutar rentHistory'de kalır, böylece geçmiş dönem raporları anlaşılır. */
function computeRaise(tenant, body) {
  const previousAmount = tenant.rentAmount;
  let amount;

  if (body.amount !== undefined && body.amount !== '') {
    amount = requireMoney(body.amount, 'rent');
  } else {
    const rate = Number(String(body.rate ?? tenant.increaseRate ?? 0).replace(',', '.'));
    if (!Number.isFinite(rate) || rate <= 0 || rate > 200) {
      throw new Error('Artış oranı 0-200 arasında olmalı.');
    }
    amount = Math.round(previousAmount * (1 + rate / 100));
    if (amount < LIMITS.rent.min) {
      throw new Error('Hesaplanan kira ' + formatMoney(amount) + ', alt sınır ' + formatMoney(LIMITS.rent.min) + '.');
    }
  }

  if (amount === previousAmount) throw new Error('Yeni kira tutarı eskisiyle aynı.');

  return {
    amount,
    previousAmount,
    effectiveFrom: optionalDate(body.effectiveFrom, 'Geçerlilik tarihi') || new Date(),
    note: String(body.note || '').trim().slice(0, 240),
  };
}

module.exports = async (req, res) => {
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireWebAuth(req, res)) return;

  try {
    if (mongoose.connection.readyState !== 1) await connectDB();

    if (req.method === 'GET') {
      const includeArchived = req.query.includeArchived === 'true';
      const includeDeleted = req.query.includeDeleted === 'true';
      const filter = includeDeleted
        ? { isActive: false, deletedAt: { $ne: null } }
        : includeArchived ? { deletedAt: null } : { isActive: true };
      const tenants = await Tenant.find(filter).sort(includeDeleted ? { deletedAt: -1 } : { name: 1 });
      return res.status(200).json({ tenants: tenants.map(serializeTenant) });
    }

    if (req.method === 'POST') {
      const input = cleanTenantInput(req.body);
      const tenant = await Tenant.create({
        ...input,
        isActive: true,
        rentHistory: [{
          amount: input.rentAmount,
          previousAmount: 0,
          effectiveFrom: input.contractStart || new Date(),
          note: 'İlk kayıt',
        }],
      });
      const notification = await notifyTenantCreated(tenant);
      return res.status(201).json({ tenant: serializeTenant(tenant), notification });
    }

    const id = String(req.query.id || req.body?.id || '').trim();
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Geçersiz kiracı kimliği.' });
    }

    const tenant = await Tenant.findById(id);
    if (!tenant) return res.status(404).json({ error: 'Kiracı bulunamadı.' });

    const action = String(req.query.action || '');

    if (req.method === 'PATCH' && action === 'restore') {
      tenant.isActive = true;
      tenant.deletedAt = null;
      await tenant.save();
      const notification = await notifyTenantRestored(tenant);
      return res.status(200).json({ tenant: serializeTenant(tenant), notification });
    }

    if (req.method === 'PATCH' && action === 'raise') {
      const raise = computeRaise(tenant, req.body || {});
      tenant.rentAmount = raise.amount;
      tenant.rentHistory.push(raise);
      await tenant.save();
      const notification = await notifyRentIncreased(tenant, raise);
      return res.status(200).json({ tenant: serializeTenant(tenant), notification });
    }

    // "Temelli sil" artık önce Silinenler'e taşır; kalıcı silme 15 gün sonra cron'da.
    if (req.method === 'DELETE' && action === 'purge') {
      if (tenant.isActive) {
        return res.status(400).json({ error: 'Aktif kiracı önce arşivlenmeli.' });
      }
      if (!tenant.deletedAt) {
        tenant.deletedAt = new Date();
        await tenant.save();
      }
      return res.status(200).json({ ok: true, id, tenant: serializeTenant(tenant) });
    }

    if (req.method === 'PATCH' && action === 'undelete') {
      tenant.deletedAt = null;
      await tenant.save();
      return res.status(200).json({ tenant: serializeTenant(tenant) });
    }

    if (req.method === 'DELETE') {
      tenant.isActive = false;
      await tenant.save();
      const notification = await notifyTenantArchived(tenant);
      return res.status(200).json({ tenant: serializeTenant(tenant), notification });
    }

    const updated = cleanTenantInput({ ...tenant.toObject(), ...req.body });
    const rentChanged = updated.rentAmount !== tenant.rentAmount;
    const previousAmount = tenant.rentAmount;
    /* İki farklı niyet var ve ayrı davranmaları gerekiyor:
       zam → bu tarihten itibaren geçerli, geçmiş dönemler eski tutarda kalır;
       düzeltme → tutar baştan beri buydu, geçmiş de bu tutara çekilir. */
    const rentMode = String(req.body?.rentMode || 'raise') === 'correction' ? 'correction' : 'raise';

    Object.assign(tenant, updated);

    if (rentChanged && rentMode === 'correction') {
      const start = tenant.contractStart ||
        (tenant.rentHistory || []).map((item) => item.effectiveFrom).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] ||
        tenant.createdAt ||
        new Date();
      tenant.rentHistory = [{
        amount: updated.rentAmount,
        previousAmount: 0,
        effectiveFrom: start,
        note: 'Tutar düzeltildi',
      }];
    } else if (rentChanged) {
      // Aynı gün içindeki tekrar düzenlemeler yeni satır açmasın, üzerine yazsın.
      const bugun = new Date().toDateString();
      const son = tenant.rentHistory[tenant.rentHistory.length - 1];
      const kayit = {
        amount: updated.rentAmount,
        previousAmount: son && new Date(son.effectiveFrom).toDateString() === bugun
          ? son.previousAmount
          : previousAmount,
        effectiveFrom: new Date(),
        note: 'Düzenleme ile güncellendi',
      };
      if (son && new Date(son.effectiveFrom).toDateString() === bugun) {
        tenant.rentHistory[tenant.rentHistory.length - 1] = kayit;
      } else {
        tenant.rentHistory.push(kayit);
      }
    }
    await tenant.save();
    const notification = await notifyTenantUpdated(tenant);
    return res.status(200).json({ tenant: serializeTenant(tenant), notification });
  } catch (error) {
    console.error('Tenants API error:', error);
    const status = error.name === 'ValidationError' || /olmalı|geçersiz|Geçersiz|olamaz|aynı/.test(error.message || '')
      ? 400
      : 500;
    return res.status(status).json({ error: error.message || 'Kiracı işlemi başarısız.' });
  }
};
