const { Markup } = require('telegraf');
const Tenant = require('../models/tenant');
const Payment = require('../models/payment');
const { formatCurrency, formatDate, formatMonthYear, currentMonth } = require('../utils/format');
const { sendHtmlMail } = require('../utils/mailer');
const { buildReportHtml } = require('../utils/emailTemplate');
const { buildPaymentsByTenant, getMonthlyStatuses } = require('../utils/rentSchedule');
const { sendOwnerNotification } = require('../services/notificationService');
const { getSettings } = require('../services/settings');
const { SESSION_DAYS, panelPassword } = require('../utils/webAuth');
const { backRow, cb, homeRow, mainMenu, panelUrl, render } = require('../utils/menu');

function mailFailureText(result) {
  if (result.reason === 'no_recipients') {
    return 'Mail gönderilemedi: alıcı tanımlı değil. Web panelinden Ayarlar > E-posta raporları bölümüne adres ekleyin.';
  }
  if (result.reason === 'not_configured') {
    return 'Mail gönderilemedi: EMAIL_USER / EMAIL_PASS yapılandırılmamış.';
  }
  return 'Mail gönderilemedi: ' + (result.error || 'bilinmeyen hata');
}

const WELCOME = [
  '🏠 Vedat Gayrimenkul',
  '',
  'Kira takibinin tamamı burada. Aşağıdaki düğmelere dokunun,',
  'komut yazmanıza gerek yok.',
].join('\n');

const HELP = [
  '❓ Nasıl çalışır',
  '',
  '🧾 Ödeme tablosu',
  'Yılın 12 ayı kutucuk olarak durur. Bir aya dokununca o ayın kirası',
  'ödendi sayılır ve tutar otomatik yazılır; tekrar dokununca kalkar.',
  'Aynı kutucuklar web panelinde de işaretlidir.',
  '',
  '🚌 Otobüs hattı',
  'Gün gün hasılat ve gider. Kâğıttaki satırı tek mesajda girebilirsiniz:',
  '/gun 7 9050 2700 2000 300 → toplam, mazot, yövmiye, denekçi.',
  'Kalan kendiliğinden hesaplanır, ay sonu raporu PDF olarak gelir.',
  '',
  '🏢 Aidat takibi',
  'Apartman ve site aidatı da aynı mantıkla 12 kutucuk. İşaretlediğiniz ay',
  'gider kaydına dönüşür; giderlere, takvime ve raporlara işlenir.',
  '',
  '📄 Rapor / PDF',
  'Sene sene, ay ay ya da bir senenin tek ayı için PDF isteyebilirsiniz.',
  'Kira tahsilatı ve aidat durumu aynı raporda yer alır.',
  '',
  '🔔 Bildirimler',
  'Ödeme gününden bir gün önce "yarın ödemesi var" mesajı gelir.',
  'Vade geçtikten 3 gün sonra hâlâ ödenmediyse uyarı düşer;',
  'eksik yatırıldıysa ne kadar eksik olduğu yazılır.',
  '',
  '⌨️ Komut yazmayı sevenler için',
  '/menu · /odemetablosu · /aidat · /otobus · /gun · /raporlar · /durum',
  '/kiracilar · /giderler · /bildirimler · /webpanel',
].join('\n');

module.exports = function registerStartCommands(bot) {
  async function showHome(ctx) {
    return render(ctx, WELCOME, mainMenu());
  }

  bot.start((ctx) => ctx.reply(WELCOME, mainMenu()));
  bot.command('menu', showHome);
  bot.command('yardim', (ctx) => ctx.reply(HELP, mainMenu()));
  bot.help((ctx) => ctx.reply(HELP, mainMenu()));

  bot.action('nav:home', async (ctx) => {
    await ctx.answerCbQuery();
    await showHome(ctx);
  });

  bot.action('nav:help', async (ctx) => {
    await ctx.answerCbQuery();
    await render(ctx, HELP, Markup.inlineKeyboard([homeRow()]));
  });

  /* ---------- Bu ayın durumu ---------- */

  async function statusText() {
    const { month, year } = currentMonth();
    const tenants = await Tenant.find({ isActive: true }).sort({ name: 1 });
    if (!tenants.length) return 'Kayıtlı kiracı yok. Web panelinden ya da /kiraciekle ile ekleyin.';

    const payments = await Payment.find({ month, year });
    const statuses = getMonthlyStatuses(tenants, buildPaymentsByTenant(payments), month, year);
    const paid = statuses.filter((item) => item.paid);
    const unpaid = statuses.filter((item) => !item.paid);
    const expected = tenants.reduce((sum, tenant) => sum + tenant.rentAmount, 0);
    const received = payments.reduce((sum, payment) => sum + payment.amount, 0);

    const lines = [
      '📊 ' + formatMonthYear(month, year),
      '',
      'Tahsil edilen: ' + formatCurrency(received) + ' / ' + formatCurrency(expected),
      'Açık bakiye: ' + formatCurrency(Math.max(expected - received, 0)),
      '',
    ];

    if (paid.length) {
      lines.push('✅ Ödendi (' + paid.length + '/' + tenants.length + ')');
      paid.forEach((item) => {
        lines.push('• ' + item.tenant.name + ' · ' + formatCurrency(item.totalPaid) +
          (item.lastDate ? ' · ' + formatDate(item.lastDate) : ''));
      });
      lines.push('');
    }

    if (unpaid.length) {
      lines.push('⏳ Bekleyen (' + unpaid.length + '/' + tenants.length + ')');
      unpaid.forEach((item) => {
        const detail = item.partial
          ? 'eksik ' + formatCurrency(item.totalPaid) + ' / ' + formatCurrency(item.expected)
          : item.daysUntilDue < 0
            ? item.daysOverdue + ' gün gecikti'
            : item.daysUntilDue === 0
              ? 'son gün bugün'
              : item.daysUntilDue + ' gün kaldı';
        lines.push('• ' + item.tenant.name + ' · ' + formatCurrency(item.remaining) + ' · ' + detail +
          (item.isDeferred ? ' · ertelendi' : ''));
      });
    } else {
      lines.push('🎉 Bu ay herkes ödedi.');
    }

    return lines.join('\n');
  }

  const statusKeyboard = () => Markup.inlineKeyboard([
    [cb('🧾 Ödeme tablosu', 'nav:grid'), cb('🏢 Aidat', 'nav:dues')],
    [cb('🗓 Takvim', 'menu_takvim'), cb('📄 Bu ayın PDF raporu', 'rep:current')],
    homeRow(),
  ]);

  async function showStatus(ctx) {
    return render(ctx, await statusText(), statusKeyboard());
  }

  bot.command('durum', showStatus);
  bot.action('nav:status', async (ctx) => {
    await ctx.answerCbQuery();
    try {
      await showStatus(ctx);
    } catch (error) {
      console.error('nav:status error:', error);
      await ctx.reply('Durum yüklenemedi: ' + error.message);
    }
  });

  /* ---------- Ayarlar ve panel ---------- */

  async function settingsText() {
    const url = panelUrl();
    const settings = await getSettings().catch(() => null);

    return [
      '⚙️ Ayarlar',
      '',
      '🌐 Web paneli',
      url ? url : 'Adres henüz ayarlanmadı (PUBLIC_APP_URL).',
      'Şifre: ' + panelPassword(),
      'Her girişte e-postaya tek kullanımlık kod gelir; oturum ' + SESSION_DAYS + ' gün açık kalır.',
      '',
      '🔔 Bildirim hedefleri',
      settings
        ? 'Telegram: ' + (settings.telegramChatIds.length ? settings.telegramChatIds.join(', ') : 'tanımlı değil')
        : 'Telegram: okunamadı',
      settings
        ? 'E-posta: ' + (settings.emailRecipients.length ? settings.emailRecipients.join(', ') : 'tanımlı değil')
        : 'E-posta: okunamadı',
      '',
      'Panel ve bot aynı kayıtlara bakar; hangisinden işlem yaparsanız',
      'diğerinde de aynı görünür.',
    ].join('\n');
  }

  function settingsKeyboard() {
    const url = panelUrl();
    const rows = [
      [cb('📨 Telegram testi', 'nav:testmsg'), cb('📧 Mail raporu', 'nav:mail')],
    ];
    if (url) rows.push([Markup.button.url('🌐 Paneli aç', url)]);
    rows.push(homeRow());
    return Markup.inlineKeyboard(rows);
  }

  async function showSettings(ctx) {
    return render(ctx, await settingsText(), settingsKeyboard());
  }

  bot.command('webpanel', showSettings);
  bot.command('ayarlar', showSettings);

  bot.action('nav:settings', async (ctx) => {
    await ctx.answerCbQuery();
    await showSettings(ctx);
  });

  bot.action('nav:testmsg', async (ctx) => {
    await ctx.answerCbQuery('Gönderiliyor…');
    const result = await sendOwnerNotification({
      type: 'connection_test',
      title: 'Telegram bağlantı testi',
      message: '🔎 Vedat Gayrimenkul Telegram bağlantı testi başarılı.',
      metadata: { source: 'telegram' },
    });
    await ctx.reply(
      result.sent ? 'Test mesajı gönderildi.' : 'Telegram yapılandırması eksik veya mesaj gönderilemedi.',
      Markup.inlineKeyboard([backRow('nav:settings')])
    );
  });

  bot.command('bildirimtest', async (ctx) => {
    const result = await sendOwnerNotification({
      type: 'connection_test',
      title: 'Telegram bağlantı testi',
      message: '🔎 Vedat Gayrimenkul Telegram bağlantı testi başarılı.',
      metadata: { source: 'telegram' },
    });
    await ctx.reply(result.sent ? 'Test mesajı gönderildi.' : 'Telegram yapılandırması eksik veya mesaj gönderilemedi.');
  });

  bot.action('nav:mail', async (ctx) => {
    await ctx.answerCbQuery('Mail hazırlanıyor…');
    try {
      const { month, year } = currentMonth();
      const tenants = await Tenant.find({ isActive: true }).sort({ name: 1 });
      if (!tenants.length) return ctx.reply('Kiracı bulunamadı.');

      const payments = await Payment.find({ month, year });
      const paymentsByTenant = buildPaymentsByTenant(payments);
      const totalExpected = tenants.reduce((sum, tenant) => sum + tenant.rentAmount, 0);
      const totalReceived = payments.reduce((sum, payment) => sum + payment.amount, 0);

      const html = buildReportHtml({ month, year, tenants, paymentsByTenant, totalExpected, totalReceived });
      const mail = await sendHtmlMail('Kira Raporu - ' + formatMonthYear(month, year), html);
      await ctx.reply(
        mail.sent ? 'Mail gönderildi: ' + mail.recipients.join(', ') : mailFailureText(mail),
        Markup.inlineKeyboard([backRow('nav:settings')])
      );
    } catch (error) {
      console.error('nav:mail error:', error);
      await ctx.reply('Mail gönderilemedi: ' + error.message);
    }
  });

  /* ---------- Sihirbaz kısayolları ---------- */

  bot.action('menu_kiraciekle', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.scene.enter('add_tenant_wizard');
  });

  bot.action('menu_odemeekle', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.scene.enter('add_payment_wizard');
  });

  bot.action('menu_kiraertele', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.scene.enter('defer_rent_wizard');
  });

  bot.action('menu_kiraciduzenle', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.scene.enter('edit_tenant_wizard');
  });

  bot.telegram.setMyCommands([
    { command: 'menu', description: 'Ana menü' },
    { command: 'odemetablosu', description: '12 aylık ödeme tablosu' },
    { command: 'aidat', description: '12 aylık aidat takibi' },
    { command: 'otobus', description: 'Otobüs hattı defteri' },
    { command: 'gun', description: 'Otobüs günü kaydet' },
    { command: 'durum', description: 'Bu ayın ödeme durumu' },
    { command: 'raporlar', description: 'PDF rapor merkezi' },
    { command: 'takvim', description: 'Aylık takvim' },
    { command: 'kiracilar', description: 'Kiracı listesi' },
    { command: 'giderler', description: 'Dönem giderleri' },
    { command: 'bildirimler', description: 'Bildirim kayıtları' },
    { command: 'webpanel', description: 'Panel adresi ve şifresi' },
    { command: 'yardim', description: 'Nasıl çalışır' },
  ]).catch((error) => console.error('setMyCommands error:', error.message));
};
