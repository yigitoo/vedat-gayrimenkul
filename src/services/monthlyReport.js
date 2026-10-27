const crypto = require('crypto');
const Notification = require('../models/notification');
const { formatCurrency, formatMonthYear, now } = require('../utils/format');
const { isMailConfigured, sendHtmlMail } = require('../utils/mailer');
const { claimNotification } = require('./notificationService');

/* Aylık bütün rapor e-postası. Her ayın 1'inde (İstanbul saatiyle) geçen
   ayın raporu PDF eki olarak tek adrese gider. Panelden istenen ay için
   elle de gönderilebilir. Ağır bağımlılıklar (pdfkit, rapor verisi)
   yalnız gönderim anında yüklenir; cron'un diğer işleri bunları açmaz. */

const DEFAULT_RECIPIENT = 'vedatugur100@gmail.com';
const TYPE = 'full_monthly_report';

function reportRecipient() {
  return (process.env.REPORT_EMAIL || '').trim() || DEFAULT_RECIPIENT;
}

function periodKey(month, year) {
  return year + '-' + String(month).padStart(2, '0');
}

/* Bir önceki ay: Ocak'ta geçen yılın Aralık'ı. */
function previousPeriod(reference = now()) {
  const month = reference.month() + 1;
  const year = reference.year();
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

function summaryText(report) {
  const t = report.totals;
  return [
    'Vedat Gayrimenkul · ' + report.label + ' bütün raporu',
    '',
    'Toplam gelir: ' + formatCurrency(t.income) + ' (kira ' + formatCurrency(t.rentReceived) + ' + otobüs kalanı ' + formatCurrency(t.busNet) + ')',
    'Toplam gider: ' + formatCurrency(t.expense),
    'Net: ' + formatCurrency(t.net),
    'Kira tahsilatı: %' + t.rentRate,
    'Gider notları (nete dahil değil): ' + formatCurrency(t.ledger),
    '',
    'Ayrıntılı rapor ekteki PDF dosyasında.',
  ].join('\n');
}

/* Rapor verisi, PDF ve e-posta gövdesi tek seferde. İndirme uç noktası
   da önizleme için aynı parçaları kullanabilir. */
async function buildFullReportMail(month, year) {
  const { fullMonthReport } = require('./reportData');
  const { buildFullMonthReportPdf, fileNameFor, pdfToBuffer } = require('../utils/pdfReport');
  const { buildFullReportHtml } = require('../utils/emailTemplate');

  const report = await fullMonthReport(month, year);
  const fileName = fileNameFor('full', year, month);
  const pdf = await pdfToBuffer(buildFullMonthReportPdf(report));
  const t = report.totals;

  return {
    report,
    fileName,
    pdf,
    subject: 'Vedat Gayrimenkul · ' + report.label + ' bütün raporu · net ' + formatCurrency(t.net),
    html: buildFullReportHtml(report, { fileName }),
    text: summaryText(report),
  };
}

async function deliverFullReport(month, year, recipient) {
  const mail = await buildFullReportMail(month, year);
  const result = await sendHtmlMail(mail.subject, mail.html, [recipient], {
    text: mail.text,
    attachments: [{ filename: mail.fileName, content: mail.pdf, contentType: 'application/pdf' }],
  });
  return { ...result, month, year, label: mail.report.label, fileName: mail.fileName, message: mail.text };
}

async function markDelivery(key, result) {
  try {
    await Notification.updateOne(
      { key },
      {
        $set: {
          status: result.sent ? 'sent' : 'failed',
          error: result.sent ? '' : (result.error || result.reason || 'E-posta gönderilemedi.'),
          sentAt: result.sent ? new Date() : null,
        },
      }
    );
  } catch (error) {
    console.error('Rapor bildirim durumu güncellenemedi:', error);
  }
}

/* Elle gönderim: panelden "şimdi gönder". Tekrar engeli yok, ama her
   gönderim bildirim defterine düşer. */
async function sendFullMonthReport({ month, year, recipient = reportRecipient(), source = 'web' } = {}) {
  if (!isMailConfigured()) return { sent: false, reason: 'not_configured', month, year };

  const key = 'full-monthly-report:manual:' + periodKey(month, year) + ':' + crypto.randomUUID();
  await claimNotification(key, {
    type: TYPE,
    title: formatMonthYear(month, year) + ' bütün raporu',
    message: formatMonthYear(month, year) + ' bütün raporu e-postayla gönderiliyor.',
    channel: 'email',
    metadata: { month, year, source, manual: true },
  }, recipient);

  let result;
  try {
    result = await deliverFullReport(month, year, recipient);
  } catch (error) {
    console.error('Aylık bütün rapor hazırlanamadı:', error);
    result = { sent: false, reason: 'report_error', error: error.message, month, year };
  }
  await markDelivery(key, result);
  const { message, ...rest } = result;
  return { ...rest, key };
}

/* Cron: ayın 1'inde geçen ayın raporu, ay başına bir kez. Anahtar
   "full-monthly-report:YYYY-AA" ikinci gönderimi engeller. 1'indeki deneme
   başarısız olursa (Gmail hatası vb.) kayıt "failed" kalır ve 2'si, 3'ü
   yeniden denenir; gönderilmiş rapor bir daha gitmez. */
const RETRY_DAYS = 3;

async function runFullMonthlyReport(reference = now()) {
  if (reference.date() > RETRY_DAYS) return { sent: false, reason: 'not_month_start' };
  if (!isMailConfigured()) return { sent: false, reason: 'not_configured' };

  const { month, year } = previousPeriod(reference);
  const recipient = reportRecipient();
  const key = 'full-monthly-report:' + periodKey(month, year);

  let claimed;
  try {
    claimed = await claimNotification(key, {
      type: TYPE,
      title: formatMonthYear(month, year) + ' bütün raporu',
      message: formatMonthYear(month, year) + ' bütün raporu e-postayla gönderiliyor.',
      channel: 'email',
      metadata: { month, year, source: 'system' },
    }, recipient);
  } catch (error) {
    console.error('Rapor bildirim kaydı oluşturulamadı:', error);
    return { sent: false, reason: 'notification_log_error', error: error.message, month, year };
  }
  if (!claimed) return { sent: false, skipped: true, reason: 'already_delivered', key, month, year };

  let result;
  try {
    result = await deliverFullReport(month, year, recipient);
  } catch (error) {
    console.error('Aylık bütün rapor hazırlanamadı:', error);
    result = { sent: false, reason: 'report_error', error: error.message, month, year };
  }
  await markDelivery(key, result);
  const { message, ...rest } = result;
  return { ...rest, key };
}

module.exports = {
  buildFullReportMail,
  previousPeriod,
  reportRecipient,
  runFullMonthlyReport,
  sendFullMonthReport,
};
