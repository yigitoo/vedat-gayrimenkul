const { Schema, model, models } = require('mongoose');

/* Kayıt nereden geldi: panel mi bot mu, yoksa zamanlanmış iş mi.
   İki arayüz de aynı koleksiyona yazar; kaynak yalnız iz sürmek için. */
const SOURCES = ['web', 'telegram', 'system'];

const paymentSchema = new Schema({
  tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, required: true },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  note: { type: String, default: '' },
  source: { type: String, enum: SOURCES, default: 'web' },
}, { timestamps: true });

paymentSchema.index({ tenant: 1, year: 1, month: 1 });
paymentSchema.index({ year: 1, month: 1 });

// Sıcak yenilemede model ikinci kez derlenmesin.
module.exports = models.Payment || model('Payment', paymentSchema);
module.exports.SOURCES = SOURCES;
