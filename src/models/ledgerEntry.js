const { Schema, model, models } = require('mongoose');

/* Not defteri gideri. Net gelire, aidata ya da kiracıya karışmaz; yalnız
   "ne zaman neye ne harcadım" sorusunun cevabı. Gün/ay/yıl ayrı tutulur,
   böylece saat dilimi kayması bir kaydı yan güne atamaz. */
const ledgerEntrySchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  amount: { type: Number, required: true, min: 0 },
  day: { type: Number, required: true, min: 1, max: 31 },
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },
  note: { type: String, default: '', trim: true, maxlength: 240 },
}, { timestamps: true });

ledgerEntrySchema.index({ year: 1, month: 1, day: 1 });

// Sıcak yenilemede model ikinci kez derlenmesin.
module.exports = models.LedgerEntry || model('LedgerEntry', ledgerEntrySchema);
