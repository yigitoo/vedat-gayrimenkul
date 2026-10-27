const { Schema, model, models } = require('mongoose');

const CATEGORIES = ['aidat', 'tamir', 'vergi', 'sigorta', 'komisyon', 'fatura', 'diger'];

const expenseSchema = new Schema({
  title: { type: String, required: true, trim: true },
  category: { type: String, enum: CATEGORIES, default: 'diger', index: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },
  tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  recurrence: { type: Schema.Types.ObjectId, ref: 'Recurrence', default: null, index: true },
  note: { type: String, default: '', trim: true },

  /* Elle girilen gider zaten ödenmiş sayılır. Düzenli kalemler günü gelince
     yükümlülük olarak düşer; ödendiği işaretlenene kadar açık kalır. */
  paid: { type: Boolean, default: true, index: true },
  paidAt: { type: Date, default: null },
}, { timestamps: true });

expenseSchema.index({ year: 1, month: 1 });
// Aynı düzenli kalem bir dönemde iki kez işlenmesin
expenseSchema.index(
  { recurrence: 1, year: 1, month: 1 },
  { unique: true, partialFilterExpression: { recurrence: { $type: 'objectId' } } }
);

// Sıcak yenilemede model ikinci kez derlenmesin.
module.exports = models.Expense || model('Expense', expenseSchema);
module.exports.CATEGORIES = CATEGORIES;
