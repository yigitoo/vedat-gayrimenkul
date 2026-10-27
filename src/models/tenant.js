const { Schema, model, models } = require('mongoose');

const tenantSchema = new Schema({
  name: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  rentAmount: { type: Number, required: true, min: 0 },
  paymentDay: { type: Number, required: true, min: 1, max: 31, default: 1 },

  // Sözleşme ve iletişim
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true },
  contractStart: { type: Date, default: null },
  contractEnd: { type: Date, default: null },
  deposit: { type: Number, default: 0, min: 0 },
  increaseRate: { type: Number, default: 0, min: 0, max: 200 },
  notes: { type: String, default: '', trim: true },

  // Kira her değiştiğinde bir satır düşer; eski tutar kaybolmaz
  rentHistory: [{
    amount: { type: Number, required: true },
    previousAmount: { type: Number, default: 0 },
    effectiveFrom: { type: Date, required: true },
    note: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now },
  }],

  deferments: [{
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    note: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now },
  }],
  // TÜFE artış önerisi "şimdilik geç" denen kira yılı dönümleri; o yıl tekrar sorulmaz.
  raiseDismissedFor: { type: [Date], default: [] },
  isActive: { type: Boolean, default: true },
  // Arşivden silinen kiracı hemen yok olmaz: 15 gün "Silinenler"de bekler,
  // bu sürede geri getirilebilir, sonra günlük cron kalıcı olarak temizler.
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

// Sıcak yenilemede model ikinci kez derlenmesin.
module.exports = models.Tenant || model('Tenant', tenantSchema);
