const { Schema, model, models } = require('mongoose');

/* Yapılacaklar defteri. Kira, gider ya da kiracıyla bağı yok; takvimdeki
   bir güne düşülen hatırlatma. Saati olduğu için geri sayım buna kurulur. */
const todoSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  note: { type: String, default: '', trim: true, maxlength: 600 },
  dueAt: { type: Date, required: true, index: true },
  done: { type: Boolean, default: false, index: true },
  doneAt: { type: Date, default: null },
}, { timestamps: true });

// Sıcak yenilemede model ikinci kez derlenmesin.
module.exports = models.Todo || model('Todo', todoSchema);
