const { Schema, model, models } = require('mongoose');
const Expense = require('./expense');

/* Her ay tekrar eden kalem. Takvimde planlanmış olarak görünür; günü
   geldiğinde gerçek gider kaydına dönüşür. */
const recurrenceSchema = new Schema({
  title: { type: String, required: true, trim: true },
  // Aidat daire daire tutulur; boş bırakılırsa kalem genel sayılır.
  unit: { type: String, default: '', trim: true },
  category: { type: String, enum: Expense.CATEGORIES, default: 'aidat' },
  amount: { type: Number, required: true, min: 0 },
  dayOfMonth: { type: Number, required: true, min: 1, max: 31 },
  tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
  note: { type: String, default: '', trim: true },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, default: null },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

// Sıcak yenilemede model ikinci kez derlenmesin.
module.exports = models.Recurrence || model('Recurrence', recurrenceSchema);
