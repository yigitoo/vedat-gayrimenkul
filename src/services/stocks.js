/* Ağırlıklı ortalama maliyet: alımlar tarih sırasıyla maliyete eklenir,
   satış lotu düşer ama ortalamayı değiştirmez (satılan lotlar ortalamadan
   çıkar). Lot sıfıra inerse ortalama da sıfırlanır; sonraki alım yeni
   ortalama başlatır. */
function summarize(trades = []) {
  const sorted = [...trades].sort((a, b) =>
    new Date(a.date) - new Date(b.date) || new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  let lots = 0;
  let cost = 0;
  let bought = 0;
  let sold = 0;
  for (const trade of sorted) {
    const qty = Number(trade.lots) || 0;
    if (trade.side === 'buy') {
      lots += qty;
      cost += qty * (Number(trade.price) || 0);
      bought += qty;
    } else {
      const out = Math.min(qty, lots);
      const avg = lots > 0 ? cost / lots : 0;
      lots -= out;
      cost -= out * avg;
      sold += out;
    }
    if (lots <= 1e-9) {
      lots = 0;
      cost = 0;
    }
  }
  const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
  return {
    lots: round(lots, 4),
    averagePrice: lots > 0 ? round(cost / lots, 4) : 0,
    totalCost: round(cost, 2),
    bought: round(bought, 4),
    sold: round(sold, 4),
  };
}

module.exports = { summarize };

/* ---------- Güncel fiyat ----------
   Kaynak: Yahoo Finance grafik verisi (anahtarsız, herkese açık). BIST
   kağıdı ".IS" ekiyle (THYAO.IS), ABD kağıdı olduğu gibi aranır. Her sabah
   cron önceki kapanışı çeker; panelde "Fiyatları güncelle" anında çeker.
   Çekilemeyen kağıt eski fiyatında kalır, hata satırı not düşülür; fiyat
   elle de girilebilir. */
const US_TICKERS = new Set(['AAPL', 'AMZN', 'GOOGL', 'GOOG', 'META', 'MSFT', 'NFLX', 'NVDA', 'TSLA', 'AMD', 'INTC', 'KO', 'PEP', 'DIS', 'BABA', 'SPY', 'QQQ']);
// Vercel işlev süresini aşmasın diye kısa tutulur; istekler paralel gider.
const FETCH_TIMEOUT_MS = 7000;

function quoteSymbolFor(stock) {
  if (stock.quoteSymbol) return stock.quoteSymbol;
  const symbol = String(stock.symbol || '').toUpperCase();
  if (US_TICKERS.has(symbol) || symbol.includes('.')) return symbol;
  return symbol + '.IS';
}

async function fetchQuote(quoteSymbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(quoteSymbol) + '?range=5d&interval=1d';
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) throw new Error(data?.chart?.error?.description || 'Fiyat bulunamadı');
  let price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) {
    const closes = (result.indicators?.quote?.[0]?.close || []).filter((value) => Number.isFinite(value));
    price = closes[closes.length - 1];
  }
  if (!Number.isFinite(price) || price <= 0) throw new Error('Fiyat bulunamadı');
  const at = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : new Date();
  return { price: Math.round(price * 10000) / 10000, at, currency: meta.currency || '' };
}

async function refreshStockPrices({ onlyHeld = false } = {}) {
  const Stock = require('../models/stock');
  const stocks = await Stock.find({});
  const updated = [];
  const failed = [];
  await Promise.all(stocks.map(async (stock) => {
    if (onlyHeld && summarize(stock.trades).lots <= 0) return;
    const quoteSymbol = quoteSymbolFor(stock);
    try {
      const quote = await fetchQuote(quoteSymbol);
      stock.lastPrice = quote.price;
      stock.lastPriceAt = quote.at;
      stock.priceSource = 'yahoo';
      stock.priceError = '';
      updated.push(stock.symbol);
    } catch (error) {
      stock.priceError = (quoteSymbol + ': ' + (error.message || 'hata')).slice(0, 160);
      failed.push(stock.symbol);
    }
    await stock.save();
  }));
  return { updated, failed };
}

module.exports.quoteSymbolFor = quoteSymbolFor;
module.exports.fetchQuote = fetchQuote;
module.exports.refreshStockPrices = refreshStockPrices;
