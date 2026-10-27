const nodemailer = require('nodemailer');
const { getSettings } = require('../services/settings');

let transporter;

/* Taşıyıcı hazır mı. Alıcı listesi ayrı bir sorudur: hedefler artık
   ayarlardan gelir, ortam değişkeni yalnızca varsayılanı verir. */
function isMailConfigured() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function getTransporter() {
  if (!isMailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
}

async function resolveRecipients(recipients) {
  if (Array.isArray(recipients) && recipients.length) return recipients.filter(Boolean);
  if (typeof recipients === 'string' && recipients.trim()) return [recipients.trim()];
  const settings = await getSettings();
  return settings.emailRecipients;
}

/* Ek desteği: nodemailer biçiminde { filename, content, contentType } listesi.
   HTML ile birlikte düz metin de verilirse ikisi birden gider; HTML açmayan
   istemci boş ileti görmesin. */
async function deliver({ subject, text, html, recipients, attachments }) {
  const mailer = getTransporter();
  if (!mailer) return { sent: false, reason: 'not_configured' };

  const to = await resolveRecipients(recipients);
  if (!to.length) return { sent: false, reason: 'no_recipients' };

  try {
    await mailer.sendMail({
      from: '"Vedat Gayrimenkul" <' + process.env.EMAIL_USER + '>',
      to: to.join(', '),
      subject,
      ...(html ? { html } : { text }),
      ...(html && text ? { text } : {}),
      ...(Array.isArray(attachments) && attachments.length ? { attachments } : {}),
    });
    return { sent: true, recipients: to };
  } catch (error) {
    console.error('E-posta gönderilemedi:', error);
    // Gmail kullanıcı adı ya da uygulama şifresini reddetti: kod değil ayar sorunu.
    const reason = error.code === 'EAUTH' ? 'auth_failed' : 'email_error';
    return { sent: false, reason, error: error.message, recipients: to };
  }
}

function sendMail(subject, text, recipients) {
  return deliver({ subject, text, recipients });
}

/* Dördüncü parametre isteğe bağlı: { text, attachments }. Eski çağrılar
   olduğu gibi çalışır. */
function sendHtmlMail(subject, html, recipients, options = {}) {
  return deliver({ subject, html, recipients, text: options.text, attachments: options.attachments });
}

module.exports = { isMailConfigured, sendMail, sendHtmlMail };
