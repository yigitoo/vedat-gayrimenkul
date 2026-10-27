const crypto = require('crypto');

const DEFAULT_PASSWORD = 'vedat0934';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'ka_session';
const TOKEN_PREFIX = 'ka1';

function panelPassword() {
  const configured = String(
    process.env.PANEL_PASSWORD || process.env.WEB_APP_PASSWORD || ''
  ).trim();
  return configured || DEFAULT_PASSWORD;
}

// Sunucusuz ortamda her örnek aynı anahtarı üretmeli; rastgele bir sır
// kullanılırsa oturumlar bir sonraki lambda'da geçersiz olur.
function sessionSecret() {
  const explicit = String(process.env.SESSION_SECRET || '').trim();
  return crypto
    .createHash('sha256')
    .update('kira-akis|v1|' + (explicit || panelPassword()))
    .digest();
}

function b64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function digestEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const right = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(left, right);
}

function sign(body) {
  return b64url(crypto.createHmac('sha256', sessionSecret()).update(body).digest());
}

function createSession(days = SESSION_DAYS) {
  const expiresAt = Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000;
  const body = b64url(JSON.stringify({ v: 1, exp: expiresAt }));
  return { token: TOKEN_PREFIX + '.' + body + '.' + sign(body), expiresAt };
}

function verifySession(token) {
  if (typeof token !== 'string' || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  if (!digestEqual(sign(parts[1]), parts[2])) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  return payload;
}

const DEFAULT_OTP_EMAIL = 'vedatugur100@gmail.com';

function otpEmail() {
  return String(process.env.OTP_EMAIL || '').trim() || DEFAULT_OTP_EMAIL;
}

function createOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Kod, kaydın kimliğine bağlanarak imzalanır; bir kaydın özeti başka bir
// kayıtta geçerli olmaz.
function hashOtp(challengeId, code) {
  return b64url(
    crypto
      .createHmac('sha256', sessionSecret())
      .update('otp|' + challengeId + '|' + String(code ?? '').trim())
      .digest()
  );
}

function checkOtp(challengeId, code, codeHash) {
  return digestEqual(hashOtp(challengeId, code), codeHash);
}

function checkPassword(candidate) {
  const value = String(candidate ?? '').trim();
  if (!value) return false;
  return digestEqual(value, panelPassword());
}

function readCookie(req, name) {
  const raw = req.headers?.cookie;
  if (!raw) return '';
  for (const chunk of raw.split(';')) {
    const index = chunk.indexOf('=');
    if (index === -1) continue;
    if (chunk.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(chunk.slice(index + 1).trim());
  }
  return '';
}

function getRequestToken(req) {
  const bearer = req.headers?.authorization;
  if (typeof bearer === 'string' && bearer.startsWith('Bearer ')) return bearer.slice(7).trim();
  const header = String(req.headers?.['x-app-token'] || '').trim();
  if (header) return header;
  return readCookie(req, COOKIE_NAME);
}

function isSecureContext() {
  return Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
}

function sessionCookie(token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const parts = [
    COOKIE_NAME + '=' + encodeURIComponent(token),
    'Path=/',
    'Max-Age=' + maxAge,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isSecureContext()) parts.push('Secure');
  return parts.join('; ');
}

function clearedCookie() {
  const parts = [COOKIE_NAME + '=', 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (isSecureContext()) parts.push('Secure');
  return parts.join('; ');
}

function requireWebAuth(req, res) {
  const credential = getRequestToken(req);
  // Şifre tek başına anahtar sayılmaz: e-posta kodu olmadan oturum yok.
  if (verifySession(credential)) return true;

  res.status(401).json({ error: 'Oturum geçersiz veya süresi dolmuş.' });
  return false;
}

module.exports = {
  COOKIE_NAME,
  SESSION_DAYS,
  SESSION_MS,
  checkOtp,
  checkPassword,
  clearedCookie,
  createOtpCode,
  createSession,
  getRequestToken,
  hashOtp,
  otpEmail,
  panelPassword,
  requireWebAuth,
  sessionCookie,
  verifySession,
};
