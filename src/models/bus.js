const { Schema, model, models } = require('mongoose');

/* Şehir içi hat aracı. Kayıtlar araç numarasına bağlanır: "No = 7". */
const busSchema = new Schema({
  number: { type: String, required: true, trim: true, maxlength: 20 },
  label: { type: String, default: '', trim: true, maxlength: 120 },
  plate: { type: String, default: '', trim: true, maxlength: 20 },
  driver: { type: String, default: '', trim: true, maxlength: 120 },
  note: { type: String, default: '', trim: true, maxlength: 500 },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

busSchema.index({ number: 1 }, { unique: true });

// Sıcak yenilemede model ikinci kez derlenmesin.
module.exports = models.Bus || model('Bus', busSchema);
