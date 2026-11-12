const { Schema, model, models } = require('mongoose');

/* Borsa defteri: elde tutulan hisse kağıtları. Lot ve ortalama maliyet
   saklanmaz; her alım/satış ayrı satır olarak durur, değerler bunlardan
   hesaplanır (ağırlıklı ortalama maliyet). Kira verisiyle bağı yok. */
const tradeSchema = new Schema({
  side: { type: String, enum: ['buy', 'sell'], required: true },
  lots: { type: Number, required: true, min: 0.0001 },
  price: { type: Number, default: 0, min: 0 },
  date: { type: Date, required: true },
  note: { type: String, default: '', trim: true, maxlength: 160 },
}, { timestamps: true });

const stockSchema = new Schema({
  symbol: { type: String, required: true, trim: true, uppercase: true, maxlength: 12, unique: true },
  name: { type: String, default: '', trim: true, maxlength: 80 },
  logoUrl: { type: String, default: '', trim: true, maxlength: 500 },
  // Logo için şirketin web adresi (ör. thy.com); logoUrl boşsa buradan çekilir.
  website: { type: String, default: '', trim: true, lowercase: true, maxlength: 120 },
  trades: { type: [tradeSchema], default: [] },
}, { timestamps: true });

// Sıcak yenilemede model ikinci kez derlenmesin.
module.exports = models.Stock || model('Stock', stockSchema);
