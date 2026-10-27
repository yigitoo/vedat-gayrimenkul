const { Schema, model, models } = require('mongoose');

/* Panel girişinin ikinci adımı. Kodun kendisi saklanmaz, yalnız imzalı
   özeti; süresi dolan kayıt TTL dizini ile kendiliğinden silinir. */
const loginOtpSchema = new Schema({
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

loginOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Sıcak yenilemede model ikinci kez derlenmesin.
module.exports = models.LoginOtp || model('LoginOtp', loginOtpSchema);
