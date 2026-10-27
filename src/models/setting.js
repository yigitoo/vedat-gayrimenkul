const { Schema, model, models } = require('mongoose');

/* Uygulama ayarları tek bir belgede durur (key: 'app').
   Liste boşsa ortam değişkenindeki değer geçerlidir; bu yüzden alanı
   temizlemek "varsayılana dön" anlamına gelir. */
const settingSchema = new Schema({
  key: { type: String, required: true, unique: true, default: 'app' },
  emailRecipients: { type: [String], default: [] },
  telegramChatIds: { type: [String], default: [] },
}, { timestamps: true });

// Sıcak yenilemede model ikinci kez derlenmesin.
module.exports = models.Setting || model('Setting', settingSchema);
