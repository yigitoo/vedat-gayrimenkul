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
