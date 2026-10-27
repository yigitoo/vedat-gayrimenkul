const dayjs = require('dayjs');
const { formatCurrency, formatDate, formatMonthYear, now } = require('./format');
const { getMonthlyStatuses } = require('./rentSchedule');

/* Vedat Gayrimenkul e-posta raporu.
   Panelle aynı palet, ama posta istemcileri için: tablo düzeni, satır içi
   stil, sabit hex renk. backdrop-filter, color-mix, flex ve grid yok;
   Outlook ve Gmail bunların hiçbirini güvenilir biçimde çizmez.
   Cam yüzeyin karşılığı burada yumuşak degrade ve ince kenar. */

const C = {
  ink: '#0c1220',
  ink2: '#4a5771',
  ink3: '#5d6a82',
  line: '#e4e8f0',
  lineSoft: '#eef1f7',
  page: '#eceff6',
  card: '#ffffff',
  panel: '#f7f9fc',
  accent: '#2b54d4',
  accentSoft: '#edf1fd',
  ok: '#0f7a55',
  okSoft: '#e4f4ee',
  warn: '#a2660f',
  warnSoft: '#fbf1e0',
  bad: '#bd3a2c',
  badSoft: '#fbe9e7',
  calm: '#3d5a80',
  calmSoft: '#ebeff6',
};

const FONT = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toneOf(item) {
  if (item.paid) return { label: 'Ödendi', fg: C.ok, bg: C.okSoft };
  if (item.partial) return { label: 'Eksik', fg: C.warn, bg: C.warnSoft };
  if (item.daysUntilDue < 0) return { label: 'Gecikti', fg: C.bad, bg: C.badSoft };
  if (item.daysUntilDue <= 7) return { label: 'Yaklaşıyor', fg: C.calm, bg: C.calmSoft };
  return { label: 'Ödenecek', fg: C.ink2, bg: C.panel };
}

function badge(item) {
  const tone = toneOf(item);
  return `<span style="display:inline-block;background:${tone.bg};color:${tone.fg};padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:700;letter-spacing:-.005em;white-space:nowrap;">${tone.label}</span>`;
}

function sameMonth(date, month, year) {
  const value = dayjs(date);
  return value.month() + 1 === month && value.year() === year;
}

/* Ölçüt kartı: rakam büyük, etiket küçük, sayılar tabular */
function statCard({ value, label, fg, bg, border }) {
  return `
    <td class="stat-cell" width="25%" style="padding:5px;vertical-align:top;">
      <div style="background:${bg};border:1px solid ${border};border-radius:16px;padding:14px 14px 13px;">
        <div style="color:${fg};font-size:20px;font-weight:700;letter-spacing:-.03em;line-height:1.1;font-variant-numeric:tabular-nums;">${value}</div>
        <div style="color:${C.ink3};font-size:10.5px;font-weight:600;margin-top:6px;letter-spacing:.07em;text-transform:uppercase;">${label}</div>
      </div>
    </td>`;
}

/* İlerleme çubuğu: tablo hücreleriyle, çünkü div genişliği Outlook'ta kayar */
function progressBar(rate) {
  const filled = Math.max(0, Math.min(100, Math.round(rate)));
  const rest = 100 - filled;
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate;">
      <tr>
        <td style="padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border-radius:999px;overflow:hidden;background:${C.line};">
            <tr>
              ${filled ? `<td width="${filled}%" style="height:8px;line-height:8px;font-size:0;background:${C.accent};">&nbsp;</td>` : ''}
              ${rest ? `<td width="${rest}%" style="height:8px;line-height:8px;font-size:0;background:${C.line};">&nbsp;</td>` : ''}
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function buildCalendar(month, year, statuses) {
  const firstDay = dayjs().year(year).month(month - 1).date(1);
  const daysInMonth = firstDay.daysInMonth();
  const leadingDays = (firstDay.day() + 6) % 7;
  const today = now();
  const todayDay = today.month() + 1 === month && today.year() === year ? today.date() : 0;
  const eventMap = {};

  function mark(day, key) {
    if (!eventMap[day]) eventMap[day] = { paid: 0, upcoming: 0, pending: 0, overdue: 0 };
    eventMap[day][key] += 1;
  }

  for (const item of statuses) {
    if (item.paid && item.lastDate && sameMonth(item.lastDate, month, year)) {
      mark(dayjs(item.lastDate).date(), 'paid');
      continue;
    }
    if (!item.paid && sameMonth(item.dueDate, month, year)) {
      const day = dayjs(item.dueDate).date();
      if (item.daysUntilDue < 0) mark(day, 'overdue');
      else if (item.daysUntilDue <= 7) mark(day, 'upcoming');
      else mark(day, 'pending');
    }
  }

  const cells = [];
  for (let i = 0; i < leadingDays; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const header = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
    .map((day) => `<th style="padding:0 0 8px;color:${C.ink3};font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-align:center;">${day}</th>`)
    .join('');

  const dot = (color, count) =>
    `<span style="display:inline-block;margin:3px 3px 0 0;width:16px;height:16px;line-height:16px;background:${color};color:#ffffff;border-radius:999px;font-size:9.5px;font-weight:700;text-align:center;">${count}</span>`;

  const rows = weeks
    .map(
      (week) => `
    <tr>
      ${week
        .map((day) => {
          if (!day) {
            return `<td style="padding:3px;"><div style="height:58px;border:1px solid transparent;border-radius:12px;"></div></td>`;
          }
          const events = eventMap[day] || {};
          const isToday = day === todayDay;
          const chips = [
            events.paid ? dot(C.ok, events.paid) : '',
            events.upcoming ? dot(C.calm, events.upcoming) : '',
            events.pending ? dot(C.ink3, events.pending) : '',
            events.overdue ? dot(C.bad, events.overdue) : '',
          ].join('');
          return `
          <td style="padding:3px;vertical-align:top;">
            <div style="height:58px;background:${isToday ? C.accentSoft : C.card};border:1px solid ${isToday ? C.accent : C.line};border-radius:12px;padding:7px 8px;box-sizing:border-box;">
              <div style="font-size:11.5px;font-weight:700;color:${isToday ? C.accent : C.ink};font-variant-numeric:tabular-nums;letter-spacing:-.01em;">${day}</div>
              <div style="line-height:1;">${chips}</div>
            </div>
          </td>`;
        })
        .join('')}
    </tr>`
    )
    .join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate;border-spacing:0;">
      <thead><tr>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildRows(statuses) {
  if (!statuses.length) {
    return `<tr><td colspan="4" style="padding:26px 18px;text-align:center;color:${C.ink3};font-size:13px;">Bu dönemde kayıtlı kiracı yok.</td></tr>`;
  }

  return statuses
    .map((item, index) => {
      const deferred = item.isDeferred
        ? `<div style="color:${C.warn};font-size:11.5px;margin-top:4px;">Ertelendi${item.defermentNote ? ': ' + escapeHtml(item.defermentNote) : ''}</div>`
        : '';
      const lastPaid = item.lastDate
        ? `<div style="color:${C.ink3};font-size:11.5px;margin-top:4px;">Tahsilat: ${formatDate(item.lastDate)}</div>`
        : '';
      const border = index === statuses.length - 1 ? 'none' : '1px solid ' + C.lineSoft;

      return `
      <tr>
        <td class="stack-cell" style="padding:14px 18px;border-bottom:${border};vertical-align:top;">
          <div style="font-weight:700;color:${C.ink};font-size:14px;letter-spacing:-.015em;">${escapeHtml(item.tenant.name)}</div>
          <div style="color:${C.ink3};font-size:11.5px;margin-top:3px;">${escapeHtml(item.tenant.address)}</div>
        </td>
        <td class="stack-cell" style="padding:14px 18px;border-bottom:${border};vertical-align:top;color:${C.ink2};">
          <div style="font-weight:600;font-size:13px;font-variant-numeric:tabular-nums;">${formatDate(item.dueDate)}</div>
          ${deferred}
        </td>
        <td class="stack-cell amount-cell" style="padding:14px 18px;border-bottom:${border};vertical-align:top;text-align:right;">
          <div style="font-weight:700;color:${C.ink};font-size:14px;letter-spacing:-.02em;font-variant-numeric:tabular-nums;">${formatCurrency(item.expected)}</div>
          ${item.remaining > 0 ? `<div style="color:${C.warn};font-size:11.5px;margin-top:3px;font-variant-numeric:tabular-nums;">Kalan: ${formatCurrency(item.remaining)}</div>` : ''}
          ${lastPaid}
        </td>
        <td class="stack-cell status-cell" style="padding:14px 18px;border-bottom:${border};vertical-align:top;text-align:right;">${badge(item)}</td>
      </tr>`;
    })
    .join('');
}

function miniList(title, items, emptyText, accent) {
  const rows = items.length
    ? items
        .map(
          (item, index) => `
      <tr>
        <td style="padding:9px 0;border-bottom:${index === items.length - 1 ? 'none' : '1px solid ' + C.lineSoft};">
          <div style="font-size:12.5px;font-weight:700;color:${C.ink};letter-spacing:-.012em;">${escapeHtml(item.tenant.name)}</div>
          <div style="font-size:11.5px;color:${C.ink3};margin-top:2px;font-variant-numeric:tabular-nums;">${formatDate(item.dueDate)} · ${formatCurrency(item.paid ? item.totalPaid : item.remaining)}</div>
        </td>
      </tr>`
        )
        .join('')
    : `<tr><td style="padding:9px 0;color:${C.ink3};font-size:12px;">${emptyText}</td></tr>`;

  return `
    <td class="summary-column" width="33.33%" style="padding:0 5px;vertical-align:top;">
      <div style="border:1px solid ${C.line};border-radius:16px;padding:14px 16px;background:${C.card};">
        <div style="font-size:11px;font-weight:700;color:${accent};margin-bottom:4px;letter-spacing:.07em;text-transform:uppercase;">${title}</div>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>
      </div>
    </td>`;
}

function buildReportHtml({ month, year, tenants, paymentsByTenant, totalExpected, totalReceived }) {
  const statuses = getMonthlyStatuses(tenants, paymentsByTenant, month, year);
  const paidList = statuses.filter((item) => item.paid);
  const unpaidList = statuses.filter((item) => !item.paid);
  const overdueList = unpaidList.filter((item) => item.daysUntilDue < 0);
  const upcomingList = unpaidList.filter((item) => item.daysUntilDue >= 0 && item.daysUntilDue <= 7);
  const pendingList = unpaidList.filter((item) => item.daysUntilDue > 7);

  const collectionRate = totalExpected ? Math.min(Math.round((totalReceived / totalExpected) * 100), 100) : 0;
  const outstanding = Math.max(totalExpected - totalReceived, 0);
  const period = formatMonthYear(month, year);
  const generatedAt = formatDate(now().toDate());
  const panelUrl = process.env.PUBLIC_APP_URL || '';

  const headline = overdueList.length
    ? `${overdueList.length} kiracının ödemesi gecikti.`
    : upcomingList.length
      ? `${upcomingList.length} ödeme bu hafta içinde.`
      : outstanding > 0
        ? `Açık bakiye ${formatCurrency(outstanding)}.`
        : 'Bu dönemde açık bakiye kalmadı.';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Vedat Gayrimenkul · ${period}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
  <style>
    a { text-decoration: none; }
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; padding: 12px !important; }
      .header { padding: 26px 20px !important; }
      .pad { padding-left: 18px !important; padding-right: 18px !important; }
      .stat-cell, .summary-column {
        display: block !important; width: 100% !important;
        box-sizing: border-box !important; padding: 5px 0 !important;
      }
      .tenant-table thead { display: none !important; }
      .tenant-table tr { display: block !important; border-bottom: 1px solid ${C.line} !important; padding: 8px 0 !important; }
      .tenant-table td { display: block !important; border-bottom: 0 !important; padding: 4px 18px !important; text-align: left !important; }
      .amount-cell, .status-cell { text-align: left !important; }
      .cal-wrap { padding: 8px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};color:${C.ink};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${period} kira özeti · ${headline}</div>

  <div class="container" style="max-width:720px;margin:0 auto;padding:26px 16px 32px;">
    <div style="background:${C.card};border-radius:24px;overflow:hidden;border:1px solid ${C.line};box-shadow:0 22px 60px -30px rgba(12,18,32,.45);">

      <!-- Başlık -->
      <div class="header" style="background:${C.ink};background-image:linear-gradient(135deg,#16224a 0%,#0c1220 52%,#1d2f6b 100%);padding:32px 34px;">
        <div style="color:#93a8e8;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Vedat Gayrimenkul · aylık rapor</div>
        <h1 style="margin:10px 0 0;color:#ffffff;font-size:27px;line-height:1.1;font-weight:700;letter-spacing:-.03em;">${period}</h1>
        <p style="margin:10px 0 0;color:#c3cfef;font-size:13.5px;line-height:1.5;">${headline}</p>
        <p style="margin:14px 0 0;color:#8496c4;font-size:11.5px;">Oluşturma: ${generatedAt}</p>
      </div>

      <!-- Ölçütler -->
      <div class="pad" style="padding:22px 24px 18px;background:${C.panel};border-bottom:1px solid ${C.line};">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            ${statCard({ value: formatCurrency(totalReceived), label: 'Tahsil edilen', fg: C.ok, bg: C.okSoft, border: '#cbe8db' })}
            ${statCard({ value: formatCurrency(outstanding), label: 'Açık bakiye', fg: C.warn, bg: C.warnSoft, border: '#f0dcb6' })}
            ${statCard({ value: formatCurrency(totalExpected), label: 'Beklenen', fg: C.accent, bg: C.accentSoft, border: '#ccd8fa' })}
            ${statCard({ value: collectionRate + '%', label: 'Tahsilat', fg: C.ink, bg: C.card, border: C.line })}
          </tr>
        </table>
        <div style="margin-top:14px;">
          ${progressBar(collectionRate)}
          <div style="margin-top:8px;color:${C.ink3};font-size:11.5px;font-variant-numeric:tabular-nums;">
            ${paidList.length} / ${statuses.length} kiracı dönemi tamamladı
          </div>
        </div>
      </div>

      <!-- Takvim -->
      <div class="pad" style="padding:24px;">
        <h2 style="margin:0 0 4px;font-size:15px;font-weight:700;color:${C.ink};letter-spacing:-.02em;">Aylık takvim</h2>
        <p style="margin:0 0 14px;color:${C.ink3};font-size:12px;">Ödenen günler ve son ödeme tarihleri.</p>
        <div class="cal-wrap" style="border:1px solid ${C.line};border-radius:18px;padding:12px;background:${C.panel};">
          ${buildCalendar(month, year, statuses)}
        </div>
        <div style="margin-top:12px;color:${C.ink3};font-size:11.5px;line-height:1.9;">
          <span style="display:inline-block;width:9px;height:9px;border-radius:999px;background:${C.ok};margin-right:5px;"></span>Ödendi
          <span style="display:inline-block;width:9px;height:9px;border-radius:999px;background:${C.calm};margin:0 5px 0 14px;"></span>Yaklaşıyor
          <span style="display:inline-block;width:9px;height:9px;border-radius:999px;background:${C.ink3};margin:0 5px 0 14px;"></span>Ödenecek
          <span style="display:inline-block;width:9px;height:9px;border-radius:999px;background:${C.bad};margin:0 5px 0 14px;"></span>Gecikti
        </div>
      </div>

      <!-- Üç kısa liste -->
      <div class="pad" style="padding:0 19px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            ${miniList('Tamamlandı', paidList.slice(0, 5), 'Bu ay tahsilat yok.', C.ok)}
            ${miniList('Bu hafta', upcomingList.slice(0, 5), '7 gün içinde ödeme yok.', C.calm)}
            ${miniList('Bekleyen', [...overdueList, ...pendingList].slice(0, 5), 'Bekleyen ödeme yok.', C.bad)}
          </tr>
        </table>
      </div>

      <!-- Kiracı tablosu -->
      <div class="pad" style="padding:0 24px 26px;">
        <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:${C.ink};letter-spacing:-.02em;">Kiracı detayları</h2>
        <table class="tenant-table" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:18px;overflow:hidden;border-collapse:separate;border-spacing:0;background:${C.card};">
          <thead>
            <tr style="background:${C.panel};">
              <th style="padding:11px 18px;text-align:left;color:${C.ink3};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Kiracı</th>
              <th style="padding:11px 18px;text-align:left;color:${C.ink3};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Son ödeme</th>
              <th style="padding:11px 18px;text-align:right;color:${C.ink3};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Tutar</th>
              <th style="padding:11px 18px;text-align:right;color:${C.ink3};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Durum</th>
            </tr>
          </thead>
          <tbody>${buildRows(statuses)}</tbody>
        </table>
      </div>

      ${panelUrl ? `
      <!-- Panele geçiş -->
      <div class="pad" style="padding:0 24px 30px;">
        <table cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="background:${C.accent};border-radius:14px;">
              <a href="${escapeHtml(panelUrl)}" style="display:inline-block;padding:13px 24px;color:#ffffff;font-size:13.5px;font-weight:600;letter-spacing:-.008em;">Paneli aç</a>
            </td>
          </tr>
        </table>
      </div>` : ''}
    </div>

    <p style="text-align:center;padding:18px 12px 0;margin:0;color:${C.ink3};font-size:11.5px;line-height:1.6;">
      Vedat Gayrimenkul paneli tarafından otomatik oluşturuldu.<br>
      Telegram botu ve panel aynı kayıtlara bakar.
    </p>
  </div>
</body>
</html>`;
}

/* Aylık bütün rapor e-postası: kısa özet, ayrıntı ekteki PDF'te.
   Aynı palet ve kart dili; tablo düzeni posta istemcileri için. */
function partRow({ number, title, detail, amount, fg }, last) {
  const border = last ? 'none' : '1px solid ' + C.lineSoft;
  return `
      <tr>
        <td style="padding:12px 0 12px 18px;border-bottom:${border};width:34px;vertical-align:middle;">
          <span style="display:inline-block;width:26px;height:22px;line-height:22px;border-radius:7px;background:${C.accent};color:#ffffff;font-size:11px;font-weight:700;text-align:center;font-variant-numeric:tabular-nums;">${String(number).padStart(2, '0')}</span>
        </td>
        <td style="padding:12px 10px;border-bottom:${border};vertical-align:middle;">
          <div style="font-weight:700;color:${C.ink};font-size:13.5px;letter-spacing:-.015em;">${escapeHtml(title)}</div>
          <div style="color:${C.ink3};font-size:11.5px;margin-top:2px;">${escapeHtml(detail)}</div>
        </td>
        <td style="padding:12px 18px 12px 0;border-bottom:${border};vertical-align:middle;text-align:right;white-space:nowrap;">
          <span style="font-weight:700;color:${fg || C.ink};font-size:13.5px;letter-spacing:-.02em;font-variant-numeric:tabular-nums;">${amount}</span>
        </td>
      </tr>`;
}

function buildFullReportHtml(report, { fileName } = {}) {
  const t = report.totals;
  const rent = report.rent.totals;
  const dues = report.dues.totals;
  const bus = report.bus.totals;
  const period = report.label;
  const panelUrl = process.env.PUBLIC_APP_URL || '';
  const netPositive = t.net >= 0;

  const headline = [
    rent.paidCount + '/' + rent.tenantCount + ' kiracı ödedi',
    rent.overdueCount ? rent.overdueCount + ' geciken' : '',
    'net ' + formatCurrency(t.net),
  ].filter(Boolean).join(' · ') + '.';

  const parts = [
    {
      title: 'Kira',
      detail: formatCurrency(rent.received) + ' / ' + formatCurrency(rent.expected) + ' · %' + rent.rate + ' tahsilat',
      amount: formatCurrency(rent.received),
      fg: C.accent,
    },
    {
      title: 'Aidat',
      detail: dues.dueCount ? dues.paidCount + '/' + dues.dueCount + ' ödendi' + (dues.overdueCount ? ' · ' + dues.overdueCount + ' geciken' : '') : 'Bu ay kalem yok',
      amount: formatCurrency(t.expenseDues),
      fg: C.warn,
    },
    {
      title: 'Giderler',
      detail: report.expenses.totals.count ? report.expenses.totals.count + ' kalem · aidat hariç' : 'Bu ay kayıt yok',
      amount: formatCurrency(t.expenseOther),
      fg: C.warn,
    },
    {
      title: 'Gider notları',
      detail: report.ledger.count ? report.ledger.count + ' kayıt · nete dahil değil' : 'Bu ay kayıt yok',
      amount: formatCurrency(report.ledger.total),
      fg: C.ink2,
    },
    {
      title: 'Otobüs hattı',
      detail: bus.days ? bus.days + ' gün · hasılat ' + formatCurrency(bus.gross) : 'Bu ay kayıt yok',
      amount: formatCurrency(bus.net),
      fg: bus.net >= 0 ? C.ok : C.bad,
    },
    {
      title: 'Gündem',
      detail: [
        report.agenda.contracts.length + ' sözleşme bitişi',
        report.agenda.increases.length + ' kira artışı',
        report.agenda.todos.length + ' yapılacak',
      ].join(' · '),
      amount: '',
    },
  ];

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Vedat Gayrimenkul · ${escapeHtml(period)} bütün rapor</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
  <style>
    a { text-decoration: none; }
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; padding: 12px !important; }
      .header { padding: 26px 20px !important; }
      .pad { padding-left: 18px !important; padding-right: 18px !important; }
      .stat-cell { display: block !important; width: 100% !important; box-sizing: border-box !important; padding: 5px 0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};color:${C.ink};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(period)} bütün raporu · ${escapeHtml(headline)}</div>

  <div class="container" style="max-width:720px;margin:0 auto;padding:26px 16px 32px;">
    <div style="background:${C.card};border-radius:24px;overflow:hidden;border:1px solid ${C.line};box-shadow:0 22px 60px -30px rgba(12,18,32,.45);">

      <!-- Başlık -->
      <div class="header" style="background:${C.ink};background-image:linear-gradient(135deg,#16224a 0%,#0c1220 52%,#1d2f6b 100%);padding:32px 34px;">
        <div style="color:#93a8e8;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Vedat Gayrimenkul · aylık bütün rapor</div>
        <h1 style="margin:10px 0 0;color:#ffffff;font-size:27px;line-height:1.1;font-weight:700;letter-spacing:-.03em;">${escapeHtml(period)}</h1>
        <p style="margin:10px 0 0;color:#c3cfef;font-size:13.5px;line-height:1.5;">${escapeHtml(headline)}</p>
        <p style="margin:14px 0 0;color:#8496c4;font-size:11.5px;">Oluşturma: ${formatDate(report.generatedAt || now().toDate())}</p>
      </div>

      <!-- Ölçütler -->
      <div class="pad" style="padding:22px 24px 18px;background:${C.panel};border-bottom:1px solid ${C.line};">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            ${statCard({ value: formatCurrency(t.income), label: 'Toplam gelir', fg: C.accent, bg: C.accentSoft, border: '#ccd8fa' })}
            ${statCard({ value: formatCurrency(t.expense), label: 'Toplam gider', fg: C.warn, bg: C.warnSoft, border: '#f0dcb6' })}
            ${statCard({ value: formatCurrency(t.net), label: 'Net', fg: netPositive ? C.ok : C.bad, bg: netPositive ? C.okSoft : C.badSoft, border: netPositive ? '#cbe8db' : '#f3cfc9' })}
            ${statCard({ value: '%' + t.rentRate, label: 'Kira tahsilatı', fg: C.ink, bg: C.card, border: C.line })}
          </tr>
        </table>
        <div style="margin-top:14px;">
          ${progressBar(t.rentRate)}
          <div style="margin-top:8px;color:${C.ink3};font-size:11.5px;line-height:1.5;font-variant-numeric:tabular-nums;">
            Gelir = kira tahsilatı ${formatCurrency(t.rentReceived)} + otobüs kalanı ${formatCurrency(t.busNet)}
          </div>
        </div>
      </div>

      <!-- Bölümler -->
      <div class="pad" style="padding:24px 24px 8px;">
        <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:${C.ink};letter-spacing:-.02em;">Bölüm bölüm</h2>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${C.line};border-radius:18px;overflow:hidden;border-collapse:separate;border-spacing:0;background:${C.card};">
          ${parts.map((part, index) => partRow({ number: index + 1, ...part }, index === parts.length - 1)).join('')}
        </table>
      </div>

      <!-- Ek bilgisi -->
      <div class="pad" style="padding:16px 24px 26px;">
        <div style="border:1px dashed #ccd8fa;background:${C.accentSoft};border-radius:16px;padding:14px 18px;">
          <div style="font-size:13.5px;font-weight:700;color:${C.accent};letter-spacing:-.01em;">Ayrıntılı rapor ekte</div>
          <div style="font-size:12px;color:${C.ink2};margin-top:4px;line-height:1.5;">
            ${fileName ? escapeHtml(fileName) + ' · ' : ''}kiracı kiracı tahsilat, aidat, kategori kategori giderler, otobüs gün dökümü ve gündem.
          </div>
        </div>
      </div>

      ${panelUrl ? `
      <!-- Panele geçiş -->
      <div class="pad" style="padding:0 24px 30px;">
        <table cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="background:${C.accent};border-radius:14px;">
              <a href="${escapeHtml(panelUrl)}" style="display:inline-block;padding:13px 24px;color:#ffffff;font-size:13.5px;font-weight:600;letter-spacing:-.008em;">Paneli aç</a>
            </td>
          </tr>
        </table>
      </div>` : ''}
    </div>

    <p style="text-align:center;padding:18px 12px 0;margin:0;color:${C.ink3};font-size:11.5px;line-height:1.6;">
      Vedat Gayrimenkul paneli tarafından her ayın 1'inde otomatik gönderilir.<br>
      Gider notları defteri bilgi amaçlıdır, nete dahil edilmez.
    </p>
  </div>
</body>
</html>`;
}

module.exports = { buildFullReportHtml, buildReportHtml };
