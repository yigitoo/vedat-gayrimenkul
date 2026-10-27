const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../db');
const { requireWebAuth } = require('../utils/webAuth');
const { latestRate, listRates, seedCpiRates, setManualRate } = require('../services/cpi');
const { applySuggestion, dismissSuggestion, getSuggestions } = require('../services/rentIncreases');

/* TÜFE'ye göre yıllık kira artışı: oran tablosu ve vadesi gelen öneriler.
   GET liste; POST apply/dismiss; PUT oranı elle girer ya da düzeltir. */

async function overview() {
  await seedCpiRates();
  const [rates, latest, suggestions] = await Promise.all([listRates(24), latestRate(), getSuggestions()]);
  return {
    rates,
    latest: latest ? { year: latest.year, month: latest.month, rate: latest.rate, source: latest.source } : null,
    suggestions,
  };
}

function requireTenantId(value) {
  const id = String(value || '').trim();
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error('Geçersiz kiracı kimliği.');
    error.status = 400;
    throw error;
  }
  return id;
}

module.exports = async (req, res) => {
  if (!['GET', 'POST', 'PUT'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireWebAuth(req, res)) return;

  try {
    if (mongoose.connection.readyState !== 1) await connectDB();

    if (req.method === 'GET') {
      return res.status(200).json(await overview());
    }

    const body = req.body || {};

    if (req.method === 'PUT') {
      const rate = await setManualRate(body);
      return res.status(200).json({ rate, ...(await overview()) });
    }

    const action = String(body.action || req.query.action || '');
    if (action === 'apply') {
      const tenantId = requireTenantId(body.tenantId);
      const result = await applySuggestion({ tenantId, amount: body.amount, effectiveFrom: body.effectiveFrom });
      return res.status(200).json({ ...result, ...(await overview()) });
    }
    if (action === 'dismiss') {
      const tenantId = requireTenantId(body.tenantId);
      const result = await dismissSuggestion({ tenantId, anniversary: body.anniversary });
      return res.status(200).json({ ...result, ...(await overview()) });
    }
    return res.status(400).json({ error: 'Geçersiz işlem. apply ya da dismiss olmalı.' });
  } catch (error) {
    console.error('Rent increases API error:', error);
    const status = error.status || (/olmalı|geçersiz|Geçersiz|olamaz|aynı/.test(error.message || '') ? 400 : 500);
    return res.status(status).json({ error: error.message || 'Kira artışı işlemi başarısız.' });
  }
};
