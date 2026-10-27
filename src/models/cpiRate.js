const { Schema, model, models } = require('mongoose');

/* Kira artış oranı: TÜFE'nin 12 aylık ortalamalara göre değişimi (TBK 344).
   year/month TÜFE verisinin ait olduğu ay; Eylül 2026 verisi 3 Ekim'de
   açıklanır ve Ekim'de yenilenen kiralara uygulanır. */
const cpiRateSchema = new Schema({
  year: { type: Number, required: true, min: 2000, max: 2100 },
  month: { type: Number, required: true, min: 1, max: 12 },
  rate: { type: Number, required: true },
  source: { type: String, enum: ['seed', 'web', 'manual'], default: 'seed' },
  sourceUrl: { type: String, default: '', trim: true },
  fetchedAt: { type: Date, default: Date.now },
}, { timestamps: true });

cpiRateSchema.index({ year: 1, month: 1 }, { unique: true });

// Sıcak yenilemede model ikinci kez derlenmesin.
module.exports = models.CpiRate || model('CpiRate', cpiRateSchema);
