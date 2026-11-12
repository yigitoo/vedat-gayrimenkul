const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../db');
const Stock = require('../models/stock');
const { requireWebAuth } = require('../utils/webAuth');
const { summarize } = require('../services/stocks');

/* Borsa: kağıt listesi ve alım/satış satırları.
   GET liste · POST kağıt ekle · POST ?id&action=trade alım/satış ·
   PATCH ?id ad/logo · DELETE ?id kağıt · DELETE ?id&tradeId satır. */

function serializeStock(stock) {
  const trades = (stock.trades || [])
    .map((trade) => ({
      id: trade._id.toString(),
      side: trade.side,
      lots: trade.lots,
      price: trade.price || 0,
      date: new Date(trade.date).toISOString(),
      note: trade.note || '',
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return {
    id: stock._id.toString(),
    symbol: stock.symbol,
    name: stock.name || '',
    logoUrl: stock.logoUrl || '',
    website: stock.website || '',
    trades,
    ...summarize(stock.trades || []),
  };
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function parseNumber(value, label, { min = 0, allowZero = false } = {}) {
  const text = String(value ?? '').trim().replace(/\s/g, '');
  // "1.234,56" → 1234.56; "12,5" → 12.5; "12.5" → 12.5
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const number = Number(normalized);
  if (!text || !Number.isFinite(number) || number < min || (!allowZero && number === 0)) {
    throw badRequest(label + ' geçerli bir sayı olmalı.');
  }
  return number;
}

// "https://www.thy.com/tr" → "thy.com"
function parseWebsite(value) {
  const text = String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  if (!text) return '';
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(text) || text.length > 120) throw badRequest('Web adresi geçersiz (ör. thy.com).');
  return text;
}

function parseLogo(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (!/^https?:\/\/\S+$/i.test(url) && !/^data:image\//i.test(url)) throw badRequest('Logo adresi http(s) ile başlamalı.');
  if (url.length > 500) throw badRequest('Logo adresi çok uzun.');
  return url;
}

module.exports = async (req, res) => {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireWebAuth(req, res)) return;

  try {
    if (mongoose.connection.readyState !== 1) await connectDB();
    const body = req.body || {};

    if (req.method === 'GET') {
      const stocks = await Stock.find({}).sort({ symbol: 1 });
      return res.status(200).json({ stocks: stocks.map(serializeStock) });
    }

    const id = String(req.query.id || body.id || '').trim();

    if (req.method === 'POST' && !id) {
      const symbol = String(body.symbol || '').trim().toLocaleUpperCase('tr-TR');
      if (!/^[A-ZÇĞİÖŞÜ0-9.]{1,12}$/.test(symbol)) throw badRequest('Kağıt kodu 1-12 harf/rakam olmalı (ör. THYAO).');
      if (await Stock.exists({ symbol })) throw badRequest(symbol + ' zaten listede.');
      const stock = await Stock.create({
        symbol,
        name: String(body.name || '').trim().slice(0, 80),
        logoUrl: parseLogo(body.logoUrl),
        website: parseWebsite(body.website),
      });
      return res.status(201).json({ stock: serializeStock(stock) });
    }

    if (!mongoose.isValidObjectId(id)) throw badRequest('Geçersiz kağıt.');
    const stock = await Stock.findById(id);
    if (!stock) return res.status(404).json({ error: 'Kağıt bulunamadı.' });

    if (req.method === 'POST') {
      if (String(req.query.action || body.action || '') !== 'trade') throw badRequest('Geçersiz işlem.');
      const side = body.side === 'sell' ? 'sell' : 'buy';
      const lots = parseNumber(body.lots, 'Lot adedi');
      const price = side === 'buy'
        ? parseNumber(body.price, 'Alış fiyatı')
        : (String(body.price ?? '').trim() ? parseNumber(body.price, 'Satış fiyatı', { allowZero: true }) : 0);
      if (side === 'sell' && lots > summarize(stock.trades).lots + 1e-9) {
        throw badRequest('Elinde ' + summarize(stock.trades).lots + ' lot var; daha fazlası düşülemez.');
      }
      const date = body.date ? new Date(body.date) : new Date();
      if (Number.isNaN(date.getTime())) throw badRequest('Geçersiz tarih.');
      stock.trades.push({ side, lots, price, date, note: String(body.note || '').trim().slice(0, 160) });
      await stock.save();
      return res.status(201).json({ stock: serializeStock(stock) });
    }

    if (req.method === 'PATCH') {
      if (body.name !== undefined) stock.name = String(body.name || '').trim().slice(0, 80);
      if (body.logoUrl !== undefined) stock.logoUrl = parseLogo(body.logoUrl);
      if (body.website !== undefined) stock.website = parseWebsite(body.website);
      await stock.save();
      return res.status(200).json({ stock: serializeStock(stock) });
    }

    const tradeId = String(req.query.tradeId || body.tradeId || '').trim();
    if (tradeId) {
      const trade = stock.trades.id(tradeId);
      if (!trade) return res.status(404).json({ error: 'Satır bulunamadı.' });
      trade.deleteOne();
      await stock.save();
      return res.status(200).json({ stock: serializeStock(stock) });
    }
    await stock.deleteOne();
    return res.status(200).json({ deleted: id });
  } catch (error) {
    if (error.status !== 400) console.error('Stocks API error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'Borsa işlemi başarısız.' });
  }
};
