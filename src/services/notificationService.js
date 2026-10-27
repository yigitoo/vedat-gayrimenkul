const crypto = require('crypto');
const Tenant = require('../models/tenant');
const Payment = require('../models/payment');
const Notification = require('../models/notification');
const Expense = require('../models/expense');
const Recurrence = require('../models/recurrence');
const { formatCurrency, formatDate, formatMonthYear, currentMonth, now } = require('../utils/format');
const { buildPaymentsByTenant, getMonthlyStatuses } = require('../utils/rentSchedule');
const { buildReportHtml } = require('../utils/emailTemplate');
const { rentAtMonth } = require('../utils/reports');
const { buildDuesPeriod } = require('../utils/dues');
const { categoryLabel } = require('../utils/categories');
const { isMailConfigured, sendHtmlMail } = require('../utils/mailer');
const { sendOwnerMessage, isTelegramConfigured } = require('./telegram');
const { getSettings } = require('./settings');

async function claimNotification(key, data, recipient = '') {
  if (!key) return true;

  const existing = await Notification.findOne({ key }).lean();
  if (existing?.status === 'sent' || existing?.status === 'pending') return false;
  if (existing) await Notification.deleteOne({ _id: existing._id });

  try {
    await Notification.create({
      key,
      ...data,
      status: 'pending',
      recipient,
    });
    return true;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

async function sendOwnerNotification({ key, type, title, message, metadata = {} }) {
  const notificationKey = key || 'event:' + crypto.randomUUID();
  let claimed;
  try {
    const { telegramChatIds } = await getSettings();
    claimed = await claimNotification(
      notificationKey,
      { type, title, message, metadata },
      telegramChatIds.join(', ')
    );
  } catch (error) {
    console.error('Bildirim kaydı oluşturulamadı:', error);
    return { sent: false, reason: 'notification_log_error', error: error.message };
  }
  if (!claimed) return { sent: false, skipped: true, reason: 'already_delivered' };

  const result = await sendOwnerMessage(message);
  try {
    await Notification.updateOne(
      { key: notificationKey },
      {
        $set: {
          status: result.sent ? 'sent' : 'failed',
          error: result.sent ? '' : (result.error || result.reason || 'Telegram yapılandırılmamış.'),
          sentAt: result.sent ? new Date() : null,
        },
      }
    );
  } catch (error) {
    console.error('Bildirim durumu güncellenemedi:', error);
  }

  return { ...result, key: notificationKey };
}

const SOURCE_LABEL = {
  web: 'web panelinden',
  telegram: 'Telegram botundan',
  system: 'zamanlanmış işten',
};

function sourceLine(source) {
  const label = SOURCE_LABEL[source];
  return label ? 'Kaynak: ' + label : '';
}

async function notifyPaymentRecorded(payment, tenant, options = {}) {
  const source = options.source || payment.source || 'web';
  const payments = await Payment.find({
    tenant: payment.tenant,
    month: payment.month,
    year: payment.year,
  });
  const totalPaid = payments.reduce((sum, item) => sum + item.amount, 0);
  const expected = rentAtMonth(tenant, payment.month, payment.year);
  const isComplete = expected > 0 && totalPaid >= expected;
  const message = [
    isComplete ? '✅ Kira dönemi tamamlandı' : '🧾 Ödeme kaydedildi',
    '',
    'Kiracı: ' + tenant.name,
    'Tutar: ' + formatCurrency(payment.amount),
    'Dönem: ' + formatMonthYear(payment.month, payment.year),
    'Toplam: ' + formatCurrency(totalPaid) + ' / ' + formatCurrency(expected),
    isComplete ? 'Durum: Tamamlandı' : 'Kalan: ' + formatCurrency(Math.max(expected - totalPaid, 0)),
    sourceLine(source),
  ].filter(Boolean).join('\n');

  return sendOwnerNotification({
    type: 'payment_recorded',
    title: isComplete ? 'Kira dönemi tamamlandı' : 'Ödeme kaydedildi',
    message,
    metadata: {
      tenantId: tenant._id.toString(),
      paymentId: payment._id.toString(),
      month: payment.month,
      year: payment.year,
      source,
    },
  });
}

/* Bir dönemin kutucuğu kaldırıldı: o aya ait kayıtların hepsi silindi. */
function notifyPeriodCleared(tenant, { month, year, amount, count, source }) {
  return sendOwnerNotification({
    type: 'period_cleared',
    title: 'Dönem işareti kaldırıldı',
    message: [
      '↩️ Ödeme işareti kaldırıldı',
      '',
      'Kiracı: ' + tenant.name,
      'Dönem: ' + formatMonthYear(month, year),
      'Silinen: ' + formatCurrency(amount) + (count > 1 ? ' (' + count + ' kayıt)' : ''),
      sourceLine(source),
    ].filter(Boolean).join('\n'),
    metadata: { tenantId: tenant._id.toString(), month, year, source },
  });
}

function tenantSnapshot(tenant) {
  return tenant.name + ' · ' + formatCurrency(tenant.rentAmount) + ' · her ayın ' + tenant.paymentDay + '. günü';
}

function notifyTenantCreated(tenant) {
  return sendOwnerNotification({
    type: 'tenant_created',
    title: 'Yeni kiracı eklendi',
    message: '👤 Yeni kiracı eklendi\n\n' + tenantSnapshot(tenant) + '\n' + tenant.address,
    metadata: { tenantId: tenant._id.toString() },
  });
}

function notifyTenantUpdated(tenant) {
  return sendOwnerNotification({
    type: 'tenant_updated',
    title: 'Kiracı güncellendi',
    message: '✏️ Kiracı güncellendi\n\n' + tenantSnapshot(tenant) + '\n' + tenant.address,
    metadata: { tenantId: tenant._id.toString() },
  });
}

function notifyPaymentDeleted(payment) {
  return sendOwnerNotification({
    type: 'payment_deleted',
    title: 'Ödeme kaydı silindi',
    message: [
      '🗑 Ödeme kaydı silindi',
      '',
      'Kiracı: ' + (payment.tenantName || 'Bilinmiyor'),
      'Tutar: ' + formatCurrency(payment.amount),
      'Dönem: ' + formatMonthYear(payment.month, payment.year),
      'Ödeme tarihi: ' + formatDate(payment.date),
    ].join('\n'),
    metadata: { paymentId: payment.id, tenantId: payment.tenantId },
  });
}


/* Aidat kutucuğu · panel ve bot aynı mesajı düşürür. */
function notifyDueSettled(due, { month, year, amount, source }) {
  return sendOwnerNotification({
    type: 'due_settled',
    title: 'Aidat ödendi',
    message: [
      '🏢 Aidat ödendi olarak işaretlendi',
      '',
      due.title,
      'Dönem: ' + formatMonthYear(month, year),
      'Tutar: ' + formatCurrency(amount),
      sourceLine(source),
    ].filter(Boolean).join('\n'),
    metadata: { dueId: due._id.toString(), month, year, source },
  });
}

function notifyDueReopened(due, { month, year, amount, source }) {
  return sendOwnerNotification({
    type: 'due_reopened',
    title: 'Aidat işareti kaldırıldı',
    message: [
      '↩️ Aidat yeniden açık',
      '',
      due.title,
      'Dönem: ' + formatMonthYear(month, year),
      'Tutar: ' + formatCurrency(amount),
      sourceLine(source),
    ].filter(Boolean).join('\n'),
    metadata: { dueId: due._id.toString(), month, year, source },
  });
}

function notifyExpenseRecorded(expense) {
  return sendOwnerNotification({
    type: 'expense_recorded',
    title: 'Gider kaydedildi',
    message: [
      '📉 Gider kaydedildi',
      '',
      expense.title,
      'Kategori: ' + categoryLabel(expense.category),
      'Tutar: ' + formatCurrency(expense.amount),
      'Tarih: ' + formatDate(expense.date),
      expense.tenantName ? 'Kiracı: ' + expense.tenantName : '',
    ].filter(Boolean).join('\n'),
    metadata: { expenseId: expense.id },
  });
}

function notifyExpenseDeleted(expense) {
  return sendOwnerNotification({
    type: 'expense_deleted',
    title: 'Gider kaydı silindi',
    message: '🗑 Gider kaydı silindi\n\n' + expense.title + '\n' + formatCurrency(expense.amount),
    metadata: { expenseId: expense.id },
  });
}

function notifyRentIncreased(tenant, raise) {
  const diff = raise.amount - raise.previousAmount;
  const percent = raise.previousAmount
    ? Math.round((diff / raise.previousAmount) * 1000) / 10
    : 0;
  return sendOwnerNotification({
    type: 'rent_increased',
    title: 'Kira güncellendi',
    message: [
      '📈 Kira güncellendi',
      '',
      'Kiracı: ' + tenant.name,
      'Eski: ' + formatCurrency(raise.previousAmount),
      'Yeni: ' + formatCurrency(raise.amount),
      'Fark: ' + formatCurrency(diff) + (percent ? ' (%' + percent + ')' : ''),
      'Geçerlilik: ' + formatDate(raise.effectiveFrom),
      raise.note ? 'Not: ' + raise.note : '',
    ].filter(Boolean).join('\n'),
    metadata: { tenantId: tenant._id.toString() },
  });
}

function notifyTenantRestored(tenant) {
  return sendOwnerNotification({
    type: 'tenant_restored',
    title: 'Kiracı arşivden çıkarıldı',
    message: '♻️ Kiracı arşivden çıkarıldı\n\n' + tenantSnapshot(tenant) + '\n' + tenant.address,
    metadata: { tenantId: tenant._id.toString() },
  });
}

function notifyTenantArchived(tenant) {
  return sendOwnerNotification({
    type: 'tenant_archived',
    title: 'Kiracı arşivlendi',
    message: '🗂 Kiracı arşivlendi\n\n' + tenant.name + '\nÖdeme geçmişi korunuyor.',
    metadata: { tenantId: tenant._id.toString() },
  });
}

function notifyRentDeferred(tenant, { month, year, dueDate, note }) {
  return sendOwnerNotification({
    type: 'rent_deferred',
    title: 'Kira tarihi ertelendi',
    message: [
      '⏳ Kira tarihi ertelendi',
      '',
      'Kiracı: ' + tenant.name,
      'Dönem: ' + formatMonthYear(month, year),
      'Yeni son ödeme: ' + formatDate(dueDate),
      note ? 'Not: ' + note : '',
    ].filter(Boolean).join('\n'),
    metadata: { tenantId: tenant._id.toString(), month, year },
  });
}

async function currentPeriodData() {
  const { month, year } = currentMonth();
  const tenants = await Tenant.find({ isActive: true }).sort({ name: 1 });
  const payments = await Payment.find({ month, year });
  const paymentsByTenant = buildPaymentsByTenant(payments);
  const statuses = getMonthlyStatuses(tenants, paymentsByTenant, month, year);
  return { month, year, tenants, payments, paymentsByTenant, statuses };
}

function digestSubject(data) {
  const totalExpected = data.tenants.reduce((sum, tenant) => sum + tenant.rentAmount, 0);
  const totalReceived = data.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const rate = totalExpected ? Math.min(Math.round((totalReceived / totalExpected) * 100), 100) : 0;
  const overdue = data.statuses.filter((item) => !item.paid && item.daysOverdue > 0).length;
  const tail = overdue ? overdue + ' geciken' : '%' + rate + ' tahsilat';
  return 'Vedat Gayrimenkul · ' + formatMonthYear(data.month, data.year) + ' · ' + tail;
}

async function sendDigestMail(subject, data, recipients) {
  if (!isMailConfigured()) return { sent: false, reason: 'not_configured' };
  try {
    const totalExpected = data.tenants.reduce((sum, tenant) => sum + tenant.rentAmount, 0);
    const totalReceived = data.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const html = buildReportHtml({
      month: data.month,
      year: data.year,
      tenants: data.tenants,
      paymentsByTenant: data.paymentsByTenant,
      totalExpected,
      totalReceived,
    });
    return await sendHtmlMail(subject, html, recipients);
  } catch (error) {
    console.error('Bildirim e-postası gönderilemedi:', error);
    return { sent: false, reason: 'email_error', error: error.message };
  }
}

/* Kiracı bazlı hatırlatmalar. Günlük özet toplu bakar, bu ikisi tek tek
   ve dönem başına yalnız bir kez: "yarın ödemesi var" ve gecikme uyarısı. */
function dueSoonDays() {
  const value = Number(process.env.DUE_REMINDER_DAYS);
  return Number.isInteger(value) && value >= 0 && value <= 15 ? value : 1;
}

function lateAfterDays() {
  const value = Number(process.env.LATE_REMINDER_DAYS);
  return Number.isInteger(value) && value >= 1 && value <= 60 ? value : 3;
}

function periodKey(month, year) {
  return year + '-' + String(month).padStart(2, '0');
}

function dueSoonMessage(item, month, year) {
  const when = item.daysUntilDue === 0 ? 'bugün' : item.daysUntilDue === 1 ? 'yarın' : item.daysUntilDue + ' gün içinde';
  return [
    '⏰ ' + (item.daysUntilDue === 1 ? 'Yarın kira ödemesi var' : 'Kira ödemesi yaklaşıyor'),
    '',
    item.tenant.name + ' ödemesi ' + when + ' yapılmalı.',
    'Tutar: ' + formatCurrency(item.remaining),
    'Son ödeme: ' + formatDate(item.dueDate) + (item.isDeferred ? ' (ertelendi)' : ''),
    'Dönem: ' + formatMonthYear(month, year),
  ].join('\n');
}

function lateMessage(item, month, year) {
  if (item.partial) {
    return [
      '⚠️ Ödeme eksik geldi',
      '',
      item.tenant.name + ' ödemesini eksik attı.',
      'Yatan: ' + formatCurrency(item.totalPaid) + ' / ' + formatCurrency(item.expected),
      'Kalan: ' + formatCurrency(item.remaining),
      'Dönem: ' + formatMonthYear(month, year),
      'Son ödeme: ' + formatDate(item.dueDate) + ' · ' + item.daysOverdue + ' gün gecikti',
    ].join('\n');
  }
  return [
    '🚨 Ödeme gelmedi',
    '',
    item.tenant.name + ' ödemesini atmadı.',
    'Tutar: ' + formatCurrency(item.expected),
    'Dönem: ' + formatMonthYear(month, year),
    'Son ödeme: ' + formatDate(item.dueDate) + ' · ' + item.daysOverdue + ' gün gecikti',
  ].join('\n');
}

/* Aidat kalemleri kiracıdan bağımsız uyarılır: kategorisi aidat olan
   düzenli giderler, o dönemde ödendi işareti almamışsa. */
async function duePeriodRows(month, year) {
  const [recurrences, expenses] = await Promise.all([
    Recurrence.find({ category: 'aidat' }).sort({ dayOfMonth: 1 }).populate('tenant', 'name'),
    Expense.find({ year, category: 'aidat', recurrence: { $ne: null } }),
  ]);
  return buildDuesPeriod({ month, year, recurrences, expenses }).rows;
}

async function runDueReminders() {
  const data = await currentPeriodData();
  if (!data.tenants.length) return { sent: false, reason: 'no_tenants' };

  const soonLimit = dueSoonDays();
  const lateLimit = lateAfterDays();
  const key = periodKey(data.month, data.year);
  const soon = [];
  const late = [];

  for (const item of data.statuses) {
    if (item.paid) continue;
    const tenantId = item.tenant._id.toString();

    if (item.daysUntilDue >= 0 && item.daysUntilDue <= soonLimit) {
      const result = await sendOwnerNotification({
        key: 'due:soon:' + tenantId + ':' + key,
        type: 'due_soon',
        title: item.tenant.name + ' · yaklaşan ödeme',
        message: dueSoonMessage(item, data.month, data.year),
        metadata: { tenantId, month: data.month, year: data.year, daysUntilDue: item.daysUntilDue },
      });
      if (result.sent) soon.push(item.tenant.name);
    }

    if (item.daysOverdue >= lateLimit) {
      const result = await sendOwnerNotification({
        key: 'due:late:' + tenantId + ':' + key,
        type: item.partial ? 'payment_short' : 'payment_missing',
        title: item.tenant.name + (item.partial ? ' · eksik ödeme' : ' · ödeme gelmedi'),
        message: lateMessage(item, data.month, data.year),
        metadata: { tenantId, month: data.month, year: data.year, daysOverdue: item.daysOverdue },
      });
      if (result.sent) late.push(item.tenant.name);
    }
  }

  const dues = [];
  for (const row of await duePeriodRows(data.month, data.year)) {
    if (row.paid) continue;
    const suffix = ':' + row.dueId + ':' + key;

    if (row.daysUntilDue >= 0 && row.daysUntilDue <= soonLimit) {
      const when = row.daysUntilDue === 0 ? 'bugün' : row.daysUntilDue === 1 ? 'yarın' : row.daysUntilDue + ' gün içinde';
      const result = await sendOwnerNotification({
        key: 'aidat:soon' + suffix,
        type: 'due_soon_fee',
        title: row.title + ' · yaklaşan aidat',
        message: [
          '🏢 Aidat ödemesi ' + when,
          '',
          row.title + (row.tenantName ? ' · ' + row.tenantName : ''),
          'Tutar: ' + formatCurrency(row.amount),
          'Son ödeme: ' + formatDate(row.dueDate),
          'Dönem: ' + formatMonthYear(data.month, data.year),
        ].join('\n'),
        metadata: { dueId: row.dueId, month: data.month, year: data.year },
      });
      if (result.sent) dues.push(row.title);
    }

    if (row.daysOverdue >= lateLimit) {
      const result = await sendOwnerNotification({
        key: 'aidat:late' + suffix,
        type: 'due_missing_fee',
        title: row.title + ' · aidat ödenmedi',
        message: [
          '🚨 Aidat ödenmedi',
          '',
          row.title + (row.tenantName ? ' · ' + row.tenantName : ''),
          'Tutar: ' + formatCurrency(row.amount),
          'Dönem: ' + formatMonthYear(data.month, data.year),
          'Son ödeme: ' + formatDate(row.dueDate) + ' · ' + row.daysOverdue + ' gün gecikti',
        ].join('\n'),
        metadata: { dueId: row.dueId, month: data.month, year: data.year },
      });
      if (result.sent) dues.push(row.title);
    }
  }

  return {
    sent: soon.length + late.length + dues.length > 0,
    reason: soon.length + late.length + dues.length ? undefined : 'nothing_due',
    month: data.month,
    year: data.year,
    soon,
    late,
    dues,
  };
}

async function runDailyReminder() {
  const data = await currentPeriodData();
  const urgent = data.statuses.filter((item) =>
    !item.paid && (item.daysOverdue > 0 || (item.daysUntilDue >= 0 && item.daysUntilDue <= 3))
  );
  if (!urgent.length) return { sent: false, reason: 'nothing_due', month: data.month, year: data.year };

  const overdue = urgent.filter((item) => item.daysOverdue > 0);
  const upcoming = urgent.filter((item) => item.daysOverdue <= 0);
  const lines = ['🔔 Kira takip özeti · ' + formatMonthYear(data.month, data.year), ''];
  if (overdue.length) {
    lines.push('Geciken');
    overdue.forEach((item) => {
      lines.push('• ' + item.tenant.name + ' · ' + formatCurrency(item.remaining) + ' · ' + item.daysOverdue + ' gün gecikmiş');
    });
  }
  if (upcoming.length) {
    if (overdue.length) lines.push('');
    lines.push('Yaklaşan');
    upcoming.forEach((item) => {
      const dueText = item.daysUntilDue === 0 ? 'bugün' : item.daysUntilDue + ' gün içinde';
      lines.push('• ' + item.tenant.name + ' · ' + formatCurrency(item.remaining) + ' · ' + dueText + ' (' + formatDate(item.dueDate) + ')');
    });
  }

  const dayKey = now().format('YYYY-MM-DD');
  const notification = await sendOwnerNotification({
    key: 'digest:daily:' + dayKey,
    type: 'daily_digest',
    title: 'Günlük kira özeti',
    message: lines.join('\n'),
    metadata: { month: data.month, year: data.year, overdue: overdue.length, upcoming: upcoming.length },
  });
  const email = await sendDigestMail(digestSubject(data), data);
  return { ...notification, email, overdue: overdue.length, upcoming: upcoming.length };
}

async function runMonthlyReminder() {
  const today = now();
  if (today.date() !== 1) return { sent: false, reason: 'not_month_start' };

  const data = await currentPeriodData();
  if (!data.tenants.length) return { sent: false, reason: 'no_tenants' };

  const total = data.tenants.reduce((sum, tenant) => sum + tenant.rentAmount, 0);
  const lines = [
    '🗓 Yeni ay başladı · ' + formatMonthYear(data.month, data.year),
    '',
    'Beklenen toplam: ' + formatCurrency(total),
    '',
    ...data.tenants.map((tenant) =>
      '• ' + tenant.name + ' · ' + formatCurrency(tenant.rentAmount) + ' · ayın ' + tenant.paymentDay + '. günü'
    ),
  ];
  const notification = await sendOwnerNotification({
    key: 'digest:monthly:' + data.year + '-' + String(data.month).padStart(2, '0'),
    type: 'monthly_digest',
    title: 'Yeni ay özeti',
    message: lines.join('\n'),
    metadata: { month: data.month, year: data.year },
  });
  // Ay başı e-postası artık geçen ayın bütün raporudur (PDF ekli, bkz.
  // services/monthlyReport). Burada ikinci bir aylık posta gönderilmez.
  return { ...notification, email: { sent: false, skipped: true, reason: 'replaced_by_full_report' } };
}

async function sendReportMail(recipients) {
  const data = await currentPeriodData();
  return sendDigestMail(digestSubject(data), data, recipients);
}

module.exports = {
  claimNotification,
  isTelegramConfigured,
  sendReportMail,
  notifyDueReopened,
  notifyDueSettled,
  notifyExpenseDeleted,
  notifyExpenseRecorded,
  notifyPaymentDeleted,
  notifyPaymentRecorded,
  notifyPeriodCleared,
  notifyRentIncreased,
  notifyTenantCreated,
  notifyTenantRestored,
  notifyTenantUpdated,
  notifyTenantArchived,
  notifyRentDeferred,
  runDailyReminder,
  runDueReminders,
  runMonthlyReminder,
  sendOwnerNotification,
};

/* TÜFE kira artış önerisi: kira yılı dolmak üzere (ya da yeni doldu).
   Kiracı + dönüm başına bir kez Telegram, bir kez e-posta; anahtarlar ayrı,
   böylece biri başarısız olunca öteki tekrar gönderilmez. */
const MONTH_LOCATIVE = ['Ocak\'ta', 'Şubat\'ta', 'Mart\'ta', 'Nisan\'da', 'Mayıs\'ta', 'Haziran\'da',
  'Temmuz\'da', 'Ağustos\'ta', 'Eylül\'de', 'Ekim\'de', 'Kasım\'da', 'Aralık\'ta'];

async function notifyRentIncreaseDue(suggestion) {
  const [year, month, day] = String(suggestion.anniversary).split('-').map(Number);
  const when = day + ' ' + MONTH_LOCATIVE[month - 1];
  const verb = suggestion.daysUntil < 0 ? 'doldu' : 'doluyor';
  const rateText = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(suggestion.rate);
  const headline = suggestion.name + ' kira yılı ' + when + ' ' + verb + '. TÜFE %' + rateText +
    ' (' + suggestion.rateLabel + ') ile önerilen yeni kira ' + formatCurrency(suggestion.suggestedRent) + '. Panelden onaylayın.';
  const lines = [
    '📅 Kira artış zamanı',
    '',
    headline,
    '',
    'Mevcut kira: ' + formatCurrency(suggestion.currentRent),
    'Yasal tavan: ' + formatCurrency(suggestion.maxLegalRent),
    suggestion.contractRateRent ? 'Sözleşmedeki %' + suggestion.contractRate + ' ile: ' + formatCurrency(suggestion.contractRateRent) : '',
    suggestion.rateIsProvisional ? 'Not: ' + formatMonthYear(suggestion.expectedRateMonth, suggestion.expectedRateYear) + ' oranı henüz açıklanmadı, son açıklanan oran kullanıldı.' : '',
    suggestion.allPaid ? 'Biten kira yılının 12 ayı da ödendi.' : 'Biten kira yılında ödenen ay: ' + suggestion.paidMonths + '/12',
    suggestion.fiveYearNote ? 'Kiracılık 5 yılı doldurdu: kira hakkaniyete göre yeniden belirlenebilir (TBK 344/3).' : '',
  ].filter((line, index) => line || index === 1 || index === 3);
  const message = lines.join('\n');
  const keyTail = suggestion.tenantId + ':' + year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  const metadata = { tenantId: suggestion.tenantId, anniversary: suggestion.anniversary, rate: suggestion.rate };

  const telegram = await sendOwnerNotification({
    key: 'rent-raise:' + keyTail,
    type: 'rent_raise_due',
    title: suggestion.name + ' · kira artış zamanı',
    message,
    metadata,
  });

  let email = { sent: false, reason: 'not_configured' };
  if (isMailConfigured()) {
    const mailKey = 'rent-raise-mail:' + keyTail;
    let claimed = false;
    try {
      claimed = await claimNotification(mailKey, {
        type: 'rent_raise_due',
        title: suggestion.name + ' · kira artış zamanı',
        message,
        metadata,
        channel: 'email',
      });
    } catch (error) {
      console.error('E-posta bildirim kaydı oluşturulamadı:', error);
    }
    if (!claimed) {
      email = { sent: false, skipped: true, reason: 'already_delivered' };
    } else {
      const { sendMail } = require('../utils/mailer');
      email = await sendMail('Vedat Gayrimenkul · ' + suggestion.name + ' kira artış zamanı', message);
      await Notification.updateOne(
        { key: mailKey },
        { $set: { status: email.sent ? 'sent' : 'failed', error: email.sent ? '' : (email.error || email.reason || ''), sentAt: email.sent ? new Date() : null } }
      ).catch((error) => console.error('Bildirim durumu güncellenemedi:', error));
    }
  }

  return { ...telegram, email };
}

module.exports.notifyRentIncreaseDue = notifyRentIncreaseDue;
