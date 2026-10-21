const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../db');
const LedgerEntry = require('../models/ledgerEntry');
const { requireWebAuth } = require('../utils/webAuth');
const { requireMoney } = require('../utils/money');

function serializeEntry(entry) {
  return {
    id: entry._id.toString(),
    title: entry.title,
    amount: entry.amount,
    day: entry.day,
    month: entry.month,
    year: entry.year,
    note: entry.note || '',
    createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : null,
  };
}

function parseYear(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Geçersiz yıl.');
  return year;
}

// "2026-10-22" gelir; Date'e çevirmeden bölünür ki UTC kayması olmasın.
function parseDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) throw new Error('Geçersiz gider tarihi.');
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(year, month - 1, day);
  if (check.getMonth() !== month - 1 || check.getDate() !== day) throw new Error('Geçersiz gider tarihi.');
  return { year: parseYear(year), month, day };
}

function parseEntryInput(body = {}) {
  const title = String(body.title || '').trim();
  if (!title || title.length > 120) throw new Error('Gider başlığı 1-120 karakter olmalı.');
  return {
    title,
    amount: requireMoney(body.amount, 'expense'),
    ...parseDay(body.date),
    note: String(body.note || '').trim().slice(0, 240),
  };
}

module.exports = async (req, res) => {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireWebAuth(req, res)) return;

  try {
    if (mongoose.connection.readyState !== 1) await connectDB();

    if (req.method === 'GET') {
      const year = parseYear(req.query.year);
      const entries = await LedgerEntry.find({ year }).sort({ month: -1, day: -1, createdAt: -1 });
      return res.status(200).json({ year, entries: entries.map(serializeEntry) });
    }

    if (req.method === 'POST') {
      const entry = await LedgerEntry.create(parseEntryInput(req.body));
      return res.status(201).json({ entry: serializeEntry(entry) });
    }

    const id = String(req.query.id || req.body?.id || '').trim();
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Geçersiz kayıt kimliği.' });
    const entry = await LedgerEntry.findById(id);
    if (!entry) return res.status(404).json({ error: 'Kayıt bulunamadı.' });

    if (req.method === 'DELETE') {
      await entry.deleteOne();
      return res.status(200).json({ entry: serializeEntry(entry) });
    }

    Object.assign(entry, parseEntryInput(req.body));
    await entry.save();
    return res.status(200).json({ entry: serializeEntry(entry) });
  } catch (error) {
    console.error('Ledger API error:', error);
    const status = /olmalı|Geçersiz/.test(error.message || '') ? 400 : 500;
    return res.status(status).json({ error: error.message || 'Gider notu işlemi başarısız.' });
  }
};
