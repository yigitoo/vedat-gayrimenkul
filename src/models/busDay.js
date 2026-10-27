const { Schema, model, models } = require('mongoose');

/* Bir aracın bir günü. Elde tutulan kâğıttaki kalemlerin birebir karşılığı:
   Toplam − (Mazot + Yövmiye + Denekçi + Diğer) = Kalan.
   Kalan hesaplanıp saklanır; aylık rapor tek sorguda toplasın diye. */
const busDaySchema = new Schema({
  bus: { type: Schema.Types.ObjectId, ref: 'Bus', required: true, index: true },
  date: { type: Date, required: true },
  day: { type: Number, required: true, min: 1, max: 31 },
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },

  gross: { type: Number, required: true, min: 0, default: 0 },
  fuel: { type: Number, min: 0, default: 0 },
  wage: { type: Number, min: 0, default: 0 },
  fee: { type: Number, min: 0, default: 0 },
  other: { type: Number, min: 0, default: 0 },

  otherNote: { type: String, default: '', trim: true, maxlength: 120 },
  note: { type: String, default: '', trim: true, maxlength: 240 },
  net: { type: Number, default: 0 },
  source: { type: String, enum: ['web', 'telegram', 'system'], default: 'web' },
}, { timestamps: true });

// Bir araç için bir günde tek kayıt; aynı gün iki kez yazılmasın.
busDaySchema.index({ bus: 1, year: 1, month: 1, day: 1 }, { unique: true });
busDaySchema.index({ year: 1, month: 1 });

busDaySchema.pre('validate', function hesapla() {
  const gider = (this.fuel || 0) + (this.wage || 0) + (this.fee || 0) + (this.other || 0);
  this.net = Math.round(((this.gross || 0) - gider) * 100) / 100;
});

// Sıcak yenilemede model ikinci kez derlenmesin.
module.exports = models.BusDay || model('BusDay', busDaySchema);
module.exports.EXPENSE_FIELDS = ['fuel', 'wage', 'fee', 'other'];
module.exports.LABELS = { gross: 'Toplam', fuel: 'Mazot', wage: 'Yövmiye', fee: 'Denekçi', other: 'Diğer', net: 'Kalan' };
