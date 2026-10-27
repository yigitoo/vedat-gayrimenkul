const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../db');
const LoginOtp = require('../models/loginOtp');
const { isMailConfigured, sendHtmlMail } = require('../utils/mailer');
const { isTelegramConfigured, sendOwnerMessage } = require('../services/telegram');
const {
  SESSION_DAYS,
  checkOtp,
  checkPassword,
  clearedCookie,
  createOtpCode,
  createSession,
  getRequestToken,
  hashOtp,
  otpEmail,
  sessionCookie,
  verifySession,
} = require('../utils/webAuth');

const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
// Şifreyi bilen biri posta kutusunu kodla boğmasın.
const OTP_SEND_WINDOW_MINUTES = 15;
const OTP_SEND_LIMIT = 5;

function maskEmail(address) {
  const [user, domain] = String(address).split('@');
  if (!domain) return address;
  const visible = user.slice(0, 2);
  return visible + '•'.repeat(Math.max(1, user.length - visible.length)) + '@' + domain;
}

function otpHtml(code) {
  return (
    '<div style="font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;background:#eceff6;padding:32px 16px">' +
    '<div style="max-width:420px;margin:0 auto;background:#ffffff;border:1px solid #e4e8f0;border-radius:16px;padding:28px">' +
    '<p style="margin:0 0 6px;color:#4a5771;font-size:14px">Vedat Gayrimenkul paneli</p>' +
    '<h1 style="margin:0 0 18px;color:#0c1220;font-size:20px">Giriş kodunuz</h1>' +
    '<p style="margin:0 0 18px;font-size:34px;font-weight:700;letter-spacing:8px;color:#2b54d4">' + code + '</p>' +
    '<p style="margin:0;color:#4a5771;font-size:14px;line-height:1.5">Kod ' + OTP_MINUTES +
    ' dakika geçerlidir. Bu girişi siz başlatmadıysanız panel şifresini değiştirin.</p>' +
    '</div></div>'
  );
}

async function startChallenge(req, res) {
  const password = String(req.body?.password || '').trim();
  if (!password) {
    return res.status(400).json({ error: 'Şifre gerekli.' });
  }
  if (!checkPassword(password)) {
    return res.status(401).json({ error: 'Şifre hatalı.' });
  }
  if (!isMailConfigured() && !isTelegramConfigured()) {
    return res.status(503).json({ error: 'E-posta ve Telegram yapılandırılmamış, kod gönderilemiyor.' });
  }

  const since = new Date(Date.now() - OTP_SEND_WINDOW_MINUTES * 60 * 1000);
  const recent = await LoginOtp.countDocuments({ createdAt: { $gte: since } });
  if (recent >= OTP_SEND_LIMIT) {
    return res.status(429).json({ error: 'Çok fazla kod istendi. Birkaç dakika sonra tekrar deneyin.' });
  }

  const id = new mongoose.Types.ObjectId();
  const code = createOtpCode();
  const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000);
  await LoginOtp.create({ _id: id, codeHash: hashOtp(String(id), code), expiresAt });

  // Kod iki kanaldan birden gider: e-posta şifresi bozulsa bile Telegram
  // botu yedek olur, panel kilitlenmez. Biri ulaşırsa yeterli.
  const recipient = otpEmail();
  const [mail, telegram] = await Promise.all([
    isMailConfigured()
      ? sendHtmlMail('Panel giriş kodu: ' + code, otpHtml(code), [recipient])
      : { sent: false, reason: 'not_configured' },
    isTelegramConfigured()
      ? sendOwnerMessage('🔐 Panel giriş kodu: ' + code + '\n' + OTP_MINUTES + ' dakika geçerli. Bu girişi siz başlatmadıysanız şifreyi değiştirin.')
          .catch((error) => ({ sent: false, error: error.message }))
      : { sent: false, reason: 'not_configured' },
  ]);
  if (!mail.sent && !telegram.sent) {
    await LoginOtp.deleteOne({ _id: id });
    return res.status(502).json({ error: 'Giriş kodu gönderilemedi (e-posta ve Telegram). Tekrar deneyin.' });
  }

  const channels = [mail.sent ? maskEmail(recipient) : '', telegram.sent ? 'Telegram' : ''].filter(Boolean);
  return res.status(200).json({
    otpRequired: true,
    challengeId: String(id),
    sentTo: channels.join(' ve '),
    channels: { email: Boolean(mail.sent), telegram: Boolean(telegram.sent) },
    expiresAt: expiresAt.toISOString(),
  });
}

async function verifyChallenge(req, res) {
  const challengeId = String(req.body?.challengeId || '').trim();
  const code = String(req.body?.code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: '6 haneli kodu yazın.' });
  }

  const challenge = mongoose.isValidObjectId(challengeId)
    ? await LoginOtp.findById(challengeId)
    : null;
  if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
    if (challenge) await challenge.deleteOne();
    return res.status(410).json({ error: 'Kodun süresi doldu. Yeni kod isteyin.' });
  }

  if (!checkOtp(challengeId, code, challenge.codeHash)) {
    challenge.attempts += 1;
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      await challenge.deleteOne();
      return res.status(410).json({ error: 'Çok fazla hatalı deneme. Yeni kod isteyin.' });
    }
    await challenge.save();
    const left = OTP_MAX_ATTEMPTS - challenge.attempts;
    return res.status(401).json({ error: 'Kod hatalı. ' + left + ' deneme hakkı kaldı.' });
  }

  await challenge.deleteOne();
  const { token, expiresAt } = createSession(SESSION_DAYS);
  res.setHeader('Set-Cookie', sessionCookie(token, expiresAt));
  return res.status(200).json({
    token,
    expiresAt: new Date(expiresAt).toISOString(),
    days: SESSION_DAYS,
  });
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const session = verifySession(getRequestToken(req));
    return res.status(session ? 200 : 401).json(
      session
        ? { valid: true, expiresAt: new Date(session.exp).toISOString() }
        : { valid: false }
    );
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearedCookie());
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (mongoose.connection.readyState !== 1) await connectDB();
    if (req.body?.challengeId) return await verifyChallenge(req, res);
    return await startChallenge(req, res);
  } catch (error) {
    console.error('Oturum hatası:', error);
    return res.status(500).json({ error: 'Giriş tamamlanamadı.' });
  }
};
