const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');
const { formatCurrency, formatDate, formatMonthYear, now } = require('./format');

/* Panel paleti, kâğıt için biraz koyultulmuş: ekranda cam olan yüzeyler
   burada düz dolgu. Baskıda saydamlık okunurluğu düşürür. */
const C = {
  ink: '#0c1220',
  ink2: '#4a5771',
  ink3: '#5d6a82',
  line: '#dfe4ee',
  lineSoft: '#eef1f7',
  panel: '#f5f7fb',
  white: '#ffffff',
  accent: '#2b54d4',
  accentSoft: '#eaeffc',
  ok: '#0f7a55',
  okSoft: '#e2f2eb',
  warn: '#a2660f',
  warnSoft: '#faf0dd',
  bad: '#bd3a2c',
  badSoft: '#fae8e6',
  calm: '#3d5a80',
  calmSoft: '#eaeff6',
  mark: '#ffcf9b',
};

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
const FONTS = {
  regular: path.join(FONT_DIR, 'Inter-400.ttf'),
  semi: path.join(FONT_DIR, 'Inter-600.ttf'),
  bold: path.join(FONT_DIR, 'Inter-700.ttf'),
};

function registerFonts(doc) {
  doc.registerFont('body', fs.readFileSync(FONTS.regular));
  doc.registerFont('semi', fs.readFileSync(FONTS.semi));
  doc.registerFont('bold', fs.readFileSync(FONTS.bold));
  doc.font('body');
}

/* Marka işareti vektör olarak çizilir: her ölçekte keskin kalır,
   PNG gömmeye gerek yok. */
function drawMark(doc, x, y, size) {
  const s = size / 512;
  doc.save();
  doc.translate(x, y).scale(s);
  doc.roundedRect(0, 0, 512, 512, 118).fill(C.accent);
  doc.lineCap('round').strokeColor(C.white);
  doc.lineWidth(54).moveTo(152, 150).lineTo(256, 366).stroke();
  doc.lineWidth(42).moveTo(256, 366).lineTo(360, 132).stroke();
  doc.circle(360, 132, 21).fill(C.mark);
  doc.restore();
}

function header(doc, { title, subtitle, meta }) {
  const width = doc.page.width;
  const left = doc.page.margins.left;
  const right = width - doc.page.margins.right;
  const band = 112;

  // Panelin ortam zeminiyle aynı fikir: mürekkep zemin, solda kobalt ışık.
  doc.save();
  const wash = doc.linearGradient(0, 0, width, band);
  wash.stop(0, '#16224a').stop(0.52, '#0c1220').stop(1, '#1d2f6b');
  doc.rect(0, 0, width, band).fill(wash);
  doc.rect(0, band - 3, width, 3).fill(C.accent);
  doc.restore();

  const markSize = 54;
  const markTop = 26;
  drawMark(doc, left, markTop, markSize);

  const textX = left + markSize + 16;

  doc.fillColor(C.white).font('bold').fontSize(18)
    .text('Vedat Gayrimenkul', textX, markTop + 2, { lineBreak: false });

  doc.fillColor('#93a8e8').font('semi').fontSize(9)
    .text(title.toLocaleUpperCase('tr-TR'), textX, markTop + 26, {
      characterSpacing: 1.4,
      lineBreak: false,
    });

  doc.fillColor('#b9c6e6').font('body').fontSize(9.5)
    .text(subtitle, textX, markTop + 42, {
      width: right - textX - 150,
      lineBreak: false,
      ellipsis: true,
    });

  doc.fillColor('#7f92c4').font('body').fontSize(8.5)
    .text(meta || formatDate(now().toDate()), right - 150, markTop + 42, {
      width: 150,
      align: 'right',
      lineBreak: false,
    });

  doc.fillColor(C.ink);
  doc.y = band + 22;
}

function footer(doc, pageNumber) {
  const y = doc.page.height - 42;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  // Alt boşluk sıfırlanmazsa pdfkit altbilgiyi "taşma" sayıp boş bir sayfa açar.
  const bottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.6).strokeColor(C.line).stroke();
  doc.font('body').fontSize(8).fillColor(C.ink3);
  doc.text('Vedat Gayrimenkul paneli · ' + formatDate(now().toDate()), left, y + 8, { lineBreak: false });
  doc.text('Sayfa ' + pageNumber, left, y + 8, {
    width: right - left,
    align: 'right',
    lineBreak: false,
  });

  doc.page.margins.bottom = bottomMargin;
}

function statCards(doc, cards) {
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const gap = 10;
  const cardWidth = (usable - gap * (cards.length - 1)) / cards.length;
  const top = doc.y;
  const height = 58;

  // Kart sayısı arttıkça tutar sığmayıp etiketin üstüne biniyordu; punto
  // kutuya göre küçülür, sığmıyorsa da hiç taşmaz.
  const pad = cardWidth < 100 ? 10 : 13;
  const inner = cardWidth - pad * 2;
  // tnum glifleri ölçümden bir tık geniş basıyor; %6 pay bırakılır.
  const fits = inner * 0.94;
  let valueSize = 15;
  doc.font('bold');
  while (valueSize > 8 && cards.some((card) => doc.fontSize(valueSize).widthOfString(String(card.value)) > fits)) {
    valueSize -= 0.5;
  }

  cards.forEach((card, index) => {
    const x = left + index * (cardWidth + gap);
    doc.roundedRect(x, top, cardWidth, height, 12).fillAndStroke(card.bg || C.panel, C.line);
    doc.fillColor(card.fg || C.ink).font('bold').fontSize(valueSize)
      .text(card.value, x + pad, top + 14 + (15 - valueSize) / 2, {
        width: inner,
        lineBreak: false,
        ellipsis: true,
        features: ['tnum'],
      });
    doc.fillColor(C.ink3).font('semi').fontSize(cardWidth < 100 ? 6.8 : 7.5)
      .text(card.label.toLocaleUpperCase('tr-TR'), x + pad, top + 38, {
        width: inner,
        characterSpacing: cardWidth < 100 ? 0.3 : 0.7,
        lineBreak: false,
        ellipsis: true,
      });
  });

  doc.fillColor(C.ink);
  doc.y = top + height + 18;
}

function sectionTitle(doc, text, hint) {
  doc.font('bold').fontSize(11.5).fillColor(C.ink).text(text, doc.page.margins.left, doc.y);
  if (hint) {
    doc.font('body').fontSize(8.5).fillColor(C.ink3).text(hint, doc.page.margins.left, doc.y + 1);
  }
  doc.moveDown(0.5);
  doc.fillColor(C.ink);
}

/* Tablo yardımı: sütun genişlikleri oran olarak verilir. */
function table(doc, { columns, rows, rowHeight = 20, onNewPage, singleLine = false }) {
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const totalWeight = columns.reduce((sum, column) => sum + column.weight, 0);
  const widths = columns.map((column) => (column.weight / totalWeight) * usable);

  function drawHead() {
    const top = doc.y;
    doc.roundedRect(left, top, usable, 22, 6).fill(C.panel);
    let x = left;
    columns.forEach((column, index) => {
      const pad = column.tight ? 2 : 8;
      doc.fillColor(C.ink3).font('semi').fontSize(column.tight ? 6.8 : 7.5)
        .text(column.label.toLocaleUpperCase('tr-TR'), x + pad, top + (column.tight ? 8 : 7.5), {
          width: widths[index] - pad * 2,
          align: column.align || 'left',
          characterSpacing: column.tight ? 0 : 0.6,
          lineBreak: false,
        });
      x += widths[index];
    });
    doc.y = top + 22;
    doc.fillColor(C.ink);
  }

  drawHead();

  rows.forEach((row) => {
    // Grup başlığı satırı sayfa dibinde tek başına kalmasın: altındaki satırla gider.
    const needed = row.keepWithNext ? rowHeight * 2 : rowHeight;
    if (doc.y + needed > doc.page.height - 54) {
      doc.addPage();
      onNewPage?.(doc);
      drawHead();
    }

    const top = doc.y;
    let x = left;
    columns.forEach((column, index) => {
      const cell = row[index];
      const value = typeof cell === 'object' && cell !== null ? cell : { text: cell };
      const pad = column.tight ? 2 : 8;
      if (value.bg) {
        doc.roundedRect(x + 3, top + 2, widths[index] - 6, rowHeight - 5, 4).fill(value.bg);
      }
      doc.fillColor(value.color || C.ink)
        .font(value.font || 'body')
        .fontSize(value.size || 8.5)
        .text(String(value.text ?? ''), x + pad, top + rowHeight / 2 - 4.5, {
          width: widths[index] - pad * 2,
          align: column.align || 'left',
          lineBreak: false,
          ellipsis: true,
          features: ['tnum'],
          // Uzun ad ya da not alt satıra taşıp komşu satırın üstüne binmesin.
          ...(singleLine ? { height: (value.size || 8.5) * 1.25 } : {}),
        });
      x += widths[index];
    });

    doc.moveTo(left, top + rowHeight).lineTo(left + usable, top + rowHeight)
      .lineWidth(0.5).strokeColor(C.lineSoft).stroke();
    doc.y = top + rowHeight;
  });

  doc.fillColor(C.ink);
  doc.y += 12;
}

function trendBars(doc, series) {
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const height = 84;
  const top = doc.y;
  const max = Math.max(1, ...series.map((item) => Math.max(item.expected, item.received, item.expense)));
  const slot = usable / series.length;

  series.forEach((item, index) => {
    const x = left + index * slot;
    const expectedHeight = (item.expected / max) * height;
    const receivedHeight = (item.received / max) * height;
    const expenseHeight = (item.expense / max) * height;

    doc.rect(x + slot * 0.14, top + height - expectedHeight, slot * 0.72, expectedHeight).fill(C.calmSoft);
    doc.rect(x + slot * 0.2, top + height - receivedHeight, slot * 0.34, receivedHeight).fill(C.accent);
    doc.rect(x + slot * 0.6, top + height - expenseHeight, slot * 0.2, expenseHeight).fill(C.warn);

    doc.fillColor(C.ink3).font('semi').fontSize(6.8)
      .text(item.short, x, top + height + 5, { width: slot, align: 'center', lineBreak: false });
  });

  doc.moveTo(left, top + height).lineTo(left + usable, top + height)
    .lineWidth(0.6).strokeColor(C.line).stroke();

  doc.fillColor(C.ink);
  doc.y = top + height + 16;

  doc.font('body').fontSize(7.5).fillColor(C.ink3);
  const legend = [['Beklenen', C.calmSoft, C.calm], ['Tahsilat', C.accent, null], ['Gider', C.warn, null]];
  let lx = left;
  legend.forEach(([label, color, stroke]) => {
    doc.circle(lx + 3, doc.y + 3, 3.2);
    if (stroke) doc.lineWidth(0.7).fillAndStroke(color, stroke);
    else doc.fill(color);
    doc.fillColor(C.ink3).text(label, lx + 11, doc.y, { lineBreak: false });
    lx += 62;
  });
  doc.y += 14;
  doc.fillColor(C.ink);
}

const CELL_STYLE = {
  paid: { bg: C.okSoft, color: C.ok, text: 'Ö' },
  partial: { bg: C.warnSoft, color: C.warn, text: 'E' },
  unpaid: { bg: C.badSoft, color: C.bad, text: '·' },
  future: { bg: C.lineSoft, color: C.ink3, text: '' },
  outside: { bg: null, color: C.ink3, text: '–' },
};

const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];


const STATUS_STYLE = {
  paid: { label: 'Ödendi', color: C.ok, bg: C.okSoft },
  partial: { label: 'Eksik', color: C.warn, bg: C.warnSoft },
  overdue: { label: 'Gecikti', color: C.bad, bg: C.badSoft },
  upcoming: { label: 'Yaklaşıyor', color: C.calm, bg: C.calmSoft },
  pending: { label: 'Ödenecek', color: C.ink2, bg: null },
  future: { label: 'Sırada', color: C.ink3, bg: null },
  outside: { label: 'Kiracı değil', color: C.ink3, bg: null },
  archived: { label: 'Arşiv', color: C.ink3, bg: C.lineSoft },
};

/* Aylık dönem raporu · A4 dikey. Bir ayın defteri: kim ödedi, kim kaldı,
   o ay ne harcandı. Telegram'dan tek dokunuşla istenen rapor budur. */
function buildMonthReportPdf(report) {
  const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
  registerFonts(doc);

  header(doc, {
    title: 'Dönem raporu',
    subtitle: report.label + ' · ' + report.totals.tenantCount + ' kiracı',
    meta: formatDate(now().toDate()),
  });

  statCards(doc, [
    { label: 'Beklenen', value: formatCurrency(report.totals.expected), fg: C.ink },
    { label: 'Tahsil edilen', value: formatCurrency(report.totals.received), fg: C.accent, bg: C.accentSoft },
    { label: 'Açık bakiye', value: formatCurrency(report.totals.outstanding), fg: C.bad, bg: C.badSoft },
    { label: 'Gider', value: formatCurrency(report.totals.expense), fg: C.warn, bg: C.warnSoft },
    { label: 'Net gelir', value: formatCurrency(report.totals.net), fg: C.ok, bg: C.okSoft },
  ]);

  sectionTitle(
    doc,
    'Kiracı durumu',
    report.totals.paidCount + ' ödendi · ' + report.totals.partialCount + ' eksik · ' +
      report.totals.overdueCount + ' geciken · %' + report.totals.rate + ' tahsilat'
  );
  table(doc, {
    columns: [
      { label: 'Kiracı', weight: 2.6 },
      { label: 'Beklenen', weight: 1.5, align: 'right' },
      { label: 'Ödenen', weight: 1.5, align: 'right' },
      { label: 'Kalan', weight: 1.4, align: 'right' },
      { label: 'Son ödeme', weight: 1.5, align: 'right' },
      { label: 'Durum', weight: 1.4, align: 'center' },
    ],
    rows: report.rows.map((row) => {
      const style = STATUS_STYLE[row.status] || STATUS_STYLE.pending;
      return [
        { text: row.name + (row.archived ? ' (arşiv)' : ''), font: 'semi' },
        formatCurrency(row.expected),
        { text: formatCurrency(row.paid), color: row.paid ? C.accent : C.ink3, font: 'semi' },
        { text: formatCurrency(row.remaining), color: row.remaining > 0 ? C.bad : C.ink3 },
        { text: formatDate(row.dueDate) + (row.isDeferred ? ' *' : ''), color: C.ink2, size: 8 },
        { text: style.label, bg: style.bg, color: style.color, font: 'semi', size: 7.8 },
      ];
    }),
    onNewPage: (d) => header(d, { title: 'Dönem raporu', subtitle: report.label + ' · kiracı durumu (devam)' }),
  });

  if (report.rows.some((row) => row.isDeferred)) {
    doc.font('body').fontSize(7.5).fillColor(C.ink3)
      .text('* son ödeme tarihi ertelendi', doc.page.margins.left, doc.y);
    doc.moveDown(1);
  }

  sectionTitle(doc, 'Tahsilat hareketleri', report.payments.length + ' kayıt');
  if (report.payments.length) {
    table(doc, {
      columns: [
        { label: 'Tarih', weight: 1.5 },
        { label: 'Kiracı', weight: 3 },
        { label: 'Not', weight: 2.6 },
        { label: 'Tutar', weight: 1.6, align: 'right' },
      ],
      rows: report.payments.map((item) => [
        { text: formatDate(item.date), color: C.ink2 },
        { text: item.tenantName, font: 'semi' },
        { text: item.note || (item.source === 'telegram' ? 'Telegram' : 'Panel'), color: C.ink3, size: 8 },
        { text: formatCurrency(item.amount), color: C.accent, font: 'semi' },
      ]),
      onNewPage: (d) => header(d, { title: 'Dönem raporu', subtitle: report.label + ' · tahsilat (devam)' }),
    });
  } else {
    doc.font('body').fontSize(9).fillColor(C.ink3)
      .text('Bu dönemde tahsilat kaydı yok.', doc.page.margins.left, doc.y);
    doc.moveDown(1.4);
  }

  const dues = report.dues;
  if (dues && dues.rows.length) {
    sectionTitle(
      doc,
      'Aidat takibi',
      dues.totals.paidCount + '/' + dues.totals.dueCount + ' ödendi · ' +
        formatCurrency(dues.totals.settled) + ' / ' + formatCurrency(dues.totals.expected) +
        (dues.totals.overdueCount ? ' · ' + dues.totals.overdueCount + ' geciken' : '')
    );
    table(doc, {
      columns: [
        { label: 'Daire', weight: 1.4 },
        { label: 'Aidat kalemi', weight: 2.4 },
        { label: 'İlgili kiracı', weight: 1.8 },
        { label: 'Son ödeme', weight: 1.4, align: 'right' },
        { label: 'Tutar', weight: 1.4, align: 'right' },
        { label: 'Durum', weight: 1.3, align: 'center' },
      ],
      rows: dues.rows.map((row) => {
        const style = STATUS_STYLE[row.status] || STATUS_STYLE.pending;
        return [
          { text: row.unit || '—', font: 'semi' },
          { text: row.title, color: C.ink2 },
          { text: row.tenantName || 'Genel', color: C.ink3 },
          { text: formatDate(row.dueDate), color: C.ink2, size: 8 },
          { text: formatCurrency(row.amount), color: row.paid ? C.ok : C.warn, font: 'semi' },
          { text: row.paid ? 'Ödendi' : style.label, bg: row.paid ? C.okSoft : style.bg, color: row.paid ? C.ok : style.color, font: 'semi', size: 7.8 },
        ];
      }),
      onNewPage: (d) => header(d, { title: 'Dönem raporu', subtitle: report.label + ' · aidat (devam)' }),
    });
  }

  if (report.expenses.length) {
    sectionTitle(doc, 'Giderler', formatCurrency(report.totals.expense) + ' toplam');
    table(doc, {
      columns: [
        { label: 'Tarih', weight: 1.5 },
        { label: 'Kalem', weight: 3 },
        { label: 'Kategori', weight: 2 },
        { label: 'Tutar', weight: 1.6, align: 'right' },
      ],
      rows: report.expenses.map((item) => [
        { text: formatDate(item.date), color: C.ink2 },
        { text: item.title, font: 'semi' },
        { text: item.categoryLabel, color: C.ink3 },
        { text: formatCurrency(item.amount), color: C.warn, font: 'semi' },
      ]),
      onNewPage: (d) => header(d, { title: 'Dönem raporu', subtitle: report.label + ' · giderler (devam)' }),
    });
  }

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    footer(doc, index + 1);
  }

  return doc;
}


/* Otobüs hattı · ay sonu raporu. Kâğıttaki kalemlerin gün gün dökümü ve
   ay toplamı: Toplam − (Mazot + Yövmiye + Denekçi + Diğer) = Kalan. */
function buildBusMonthReportPdf(report) {
  const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
  registerFonts(doc);

  const t = report.totals;
  header(doc, {
    title: 'Otobüs hattı raporu',
    subtitle: report.label + ' · ' + t.days + ' gün işlendi',
    meta: formatDate(now().toDate()),
  });

  statCards(doc, [
    { label: 'Toplam hasılat', value: formatCurrency(t.gross), fg: C.accent, bg: C.accentSoft },
    { label: 'Mazot', value: formatCurrency(t.fuel), fg: C.warn, bg: C.warnSoft },
    { label: 'Yövmiye', value: formatCurrency(t.wage), fg: C.ink },
    { label: 'Denekçi', value: formatCurrency(t.fee), fg: C.ink },
    { label: 'Kalan', value: formatCurrency(t.net), fg: t.net >= 0 ? C.ok : C.bad, bg: t.net >= 0 ? C.okSoft : C.badSoft },
  ]);

  if (report.perBus.length > 1) {
    sectionTitle(doc, 'Araç bazında', 'Ayın toplamı');
    table(doc, {
      columns: [
        { label: 'Araç', weight: 2.4 },
        { label: 'Gün', weight: 0.8, align: 'right' },
        { label: 'Toplam', weight: 1.6, align: 'right' },
        { label: 'Mazot', weight: 1.4, align: 'right' },
        { label: 'Yövmiye', weight: 1.4, align: 'right' },
        { label: 'Denekçi', weight: 1.3, align: 'right' },
        { label: 'Kalan', weight: 1.6, align: 'right' },
      ],
      rows: report.perBus.map((bus) => [
        { text: (bus.number + ' numara' + (bus.label ? ' · ' + bus.label : '')).slice(0, 28), font: 'semi' },
        { text: bus.totals.days, color: C.ink3 },
        formatCurrency(bus.totals.gross),
        { text: formatCurrency(bus.totals.fuel), color: C.warn },
        formatCurrency(bus.totals.wage),
        formatCurrency(bus.totals.fee),
        { text: formatCurrency(bus.totals.net), color: bus.totals.net >= 0 ? C.ok : C.bad, font: 'semi' },
      ]),
      onNewPage: (d) => header(d, { title: 'Otobüs hattı raporu', subtitle: report.label + ' · araç bazında (devam)' }),
    });
  }

  sectionTitle(
    doc,
    'Gün gün döküm',
    t.missingDays ? t.missingDays + ' gün kayıtsız · ' + t.dayCount + ' günlük ay' : 'Ayın tamamı işlenmiş'
  );

  if (report.rows.length) {
    table(doc, {
      columns: [
        { label: 'Gün', weight: 0.9, align: 'right' },
        { label: 'Araç', weight: 1.05, align: 'center' },
        { label: 'Toplam', weight: 1.6, align: 'right' },
        { label: 'Mazot', weight: 1.4, align: 'right' },
        { label: 'Yövmiye', weight: 1.4, align: 'right' },
        { label: 'Denekçi', weight: 1.3, align: 'right' },
        { label: 'Diğer', weight: 1.2, align: 'right' },
        { label: 'Kalan', weight: 1.6, align: 'right' },
        { label: 'Not', weight: 2, tight: true },
      ],
      rows: report.rows.map((row) => [
        { text: row.day, font: 'semi' },
        { text: row.busNumber, color: C.ink3 },
        formatCurrency(row.gross),
        { text: row.fuel ? formatCurrency(row.fuel) : '—', color: row.fuel ? C.warn : C.ink3 },
        { text: row.wage ? formatCurrency(row.wage) : '—', color: row.wage ? C.ink : C.ink3 },
        { text: row.fee ? formatCurrency(row.fee) : '—', color: row.fee ? C.ink : C.ink3 },
        { text: row.other ? formatCurrency(row.other) : '—', color: row.other ? C.ink : C.ink3 },
        { text: formatCurrency(row.net), color: row.net >= 0 ? C.ok : C.bad, font: 'semi' },
        { text: row.note || row.otherNote || '', color: C.ink3, size: 7 },
      ]),
      onNewPage: (d) => header(d, { title: 'Otobüs hattı raporu', subtitle: report.label + ' · gün dökümü (devam)' }),
    });

    sectionTitle(doc, 'Ay toplamı');
    table(doc, {
      columns: [{ label: 'Kalem', weight: 3 }, { label: 'Tutar', weight: 2, align: 'right' }, { label: 'Payı', weight: 1.2, align: 'right' }],
      rows: [
        [{ text: 'Toplam hasılat', font: 'semi' }, { text: formatCurrency(t.gross), font: 'semi', color: C.accent }, '%100'],
        ['Mazot', { text: formatCurrency(t.fuel), color: C.warn }, '%' + (t.gross ? Math.round((t.fuel / t.gross) * 100) : 0)],
        ['Yövmiye', formatCurrency(t.wage), '%' + (t.gross ? Math.round((t.wage / t.gross) * 100) : 0)],
        ['Denekçi', formatCurrency(t.fee), '%' + (t.gross ? Math.round((t.fee / t.gross) * 100) : 0)],
        ['Diğer', formatCurrency(t.other), '%' + (t.gross ? Math.round((t.other / t.gross) * 100) : 0)],
        [
          { text: 'Kalan', font: 'bold' },
          { text: formatCurrency(t.net), font: 'bold', color: t.net >= 0 ? C.ok : C.bad },
          { text: '%' + t.margin, font: 'semi' },
        ],
      ],
    });

    doc.font('body').fontSize(8).fillColor(C.ink3).text(
      'Günlük ortalama hasılat ' + formatCurrency(t.averageGross) + ' · günlük ortalama kalan ' + formatCurrency(t.averageNet),
      doc.page.margins.left,
      doc.y
    );
    doc.moveDown(1);
  } else {
    doc.font('body').fontSize(9).fillColor(C.ink3)
      .text('Bu ay için kayıt girilmemiş.', doc.page.margins.left, doc.y);
    doc.moveDown(1.4);
  }

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    footer(doc, index + 1);
  }

  return doc;
}

/* Otobüs dönem raporu: 3/6/12 ay ya da takvimden seçilen özel aralık.
   Aylık seri, araç bazında toplam ve kalem kalem özet. */
function buildBusPeriodReportPdf(report) {
  const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
  registerFonts(doc);

  const t = report.totals;
  const title = 'Otobüs hattı dönem raporu';
  header(doc, {
    title,
    subtitle: report.label + ' · ' + t.days + ' gün işlendi',
    meta: formatDate(now().toDate()),
  });

  statCards(doc, [
    { label: 'Toplam hasılat', value: formatCurrency(t.gross), fg: C.accent, bg: C.accentSoft },
    { label: 'Mazot', value: formatCurrency(t.fuel), fg: C.warn, bg: C.warnSoft },
    { label: 'Toplam gider', value: formatCurrency(t.expense), fg: C.ink },
    { label: 'Aylık ort. kalan', value: formatCurrency(t.averageMonthly), fg: C.ink },
    { label: 'Kalan', value: formatCurrency(t.net), fg: t.net >= 0 ? C.ok : C.bad, bg: t.net >= 0 ? C.okSoft : C.badSoft },
  ]);

  sectionTitle(
    doc,
    'Aylara göre',
    [
      report.months + ' ay · ' + t.dayCount + ' günlük aralık',
      t.missingDays ? t.missingDays + ' gün kayıtsız' : '',
      t.bestMonth ? 'en iyi ay ' + t.bestMonth.label + ' (' + formatCurrency(t.bestMonth.net) + ')' : '',
    ].filter(Boolean).join(' · ')
  );
  table(doc, {
    columns: [
      { label: 'Dönem', weight: 2.2 },
      { label: 'Gün', weight: 0.8, align: 'right' },
      { label: 'Toplam', weight: 1.6, align: 'right' },
      { label: 'Mazot', weight: 1.4, align: 'right' },
      { label: 'Yövmiye', weight: 1.4, align: 'right' },
      { label: 'Denekçi', weight: 1.3, align: 'right' },
      { label: 'Diğer', weight: 1.2, align: 'right' },
      { label: 'Kalan', weight: 1.6, align: 'right' },
    ],
    rows: report.series.map((item) => [
      { text: item.label, font: 'semi' },
      { text: item.days || '—', color: C.ink3 },
      item.days ? formatCurrency(item.gross) : { text: '—', color: C.ink3 },
      { text: item.fuel ? formatCurrency(item.fuel) : '—', color: item.fuel ? C.warn : C.ink3 },
      { text: item.wage ? formatCurrency(item.wage) : '—', color: item.wage ? C.ink : C.ink3 },
      { text: item.fee ? formatCurrency(item.fee) : '—', color: item.fee ? C.ink : C.ink3 },
      { text: item.other ? formatCurrency(item.other) : '—', color: item.other ? C.ink : C.ink3 },
      item.days
        ? { text: formatCurrency(item.net), color: item.net >= 0 ? C.ok : C.bad, font: 'semi' }
        : { text: '—', color: C.ink3 },
    ]),
    onNewPage: (d) => header(d, { title, subtitle: report.label + ' · aylara göre (devam)' }),
  });

  if (report.perBus.length > 1) {
    sectionTitle(doc, 'Araç bazında', 'Dönem toplamı');
    table(doc, {
      columns: [
        { label: 'Araç', weight: 2.4 },
        { label: 'Gün', weight: 0.8, align: 'right' },
        { label: 'Toplam', weight: 1.6, align: 'right' },
        { label: 'Mazot', weight: 1.4, align: 'right' },
        { label: 'Yövmiye', weight: 1.4, align: 'right' },
        { label: 'Denekçi', weight: 1.3, align: 'right' },
        { label: 'Kalan', weight: 1.6, align: 'right' },
      ],
      rows: report.perBus.map((bus) => [
        { text: (bus.number + ' numara' + (bus.label ? ' · ' + bus.label : '')).slice(0, 28), font: 'semi' },
        { text: bus.totals.days, color: C.ink3 },
        formatCurrency(bus.totals.gross),
        { text: formatCurrency(bus.totals.fuel), color: C.warn },
        formatCurrency(bus.totals.wage),
        formatCurrency(bus.totals.fee),
        { text: formatCurrency(bus.totals.net), color: bus.totals.net >= 0 ? C.ok : C.bad, font: 'semi' },
      ]),
      onNewPage: (d) => header(d, { title, subtitle: report.label + ' · araç bazında (devam)' }),
    });
  }

  /* Özet tablosu bölünmez: son satırın ("Kalan") tek başına yeni sayfaya
     düşmesi raporu okunmaz kılıyordu. Sıfır kalemler de yer kaplamasın. */
  const kalemler = [
    ['Mazot', t.fuel, C.warn],
    ['Yövmiye', t.wage, C.ink],
    ['Denekçi', t.fee, C.ink],
    ['Diğer', t.other, C.ink],
  ].filter(([, value]) => value);
  const gereken = 44 + (kalemler.length + 3) * 20;
  if (doc.y + gereken > doc.page.height - doc.page.margins.bottom - 24) {
    doc.addPage();
  }

  sectionTitle(
    doc,
    'Dönem toplamı',
    'Günlük ort. hasılat ' + formatCurrency(t.averageGross) + ' · günlük ort. kalan ' + formatCurrency(t.averageNet)
  );
  const pay = (value) => '%' + (t.gross ? Math.round((value / t.gross) * 100) : 0);
  table(doc, {
    columns: [{ label: 'Kalem', weight: 3 }, { label: 'Tutar', weight: 2, align: 'right' }, { label: 'Payı', weight: 1.2, align: 'right' }],
    rows: [
      [{ text: 'Toplam hasılat', font: 'semi' }, { text: formatCurrency(t.gross), font: 'semi', color: C.accent }, '%100'],
      ...kalemler.map(([label, value, color]) => [label, { text: formatCurrency(value), color }, pay(value)]),
      [
        { text: 'Kalan', font: 'bold' },
        { text: formatCurrency(t.net), font: 'bold', color: t.net >= 0 ? C.ok : C.bad },
        { text: '%' + t.margin, font: 'semi' },
      ],
    ],
  });


  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    footer(doc, index + 1);
  }

  return doc;
}

/* Genel rapor: kira ve otobüs yan yana, altta birleşik net. */
function buildCombinedReportPdf(report) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 38, bufferPages: true });
  registerFonts(doc);

  const t = report.totals;
  header(doc, {
    title: 'Genel rapor',
    subtitle: 'Kira ve otobüs hattı · son ' + report.months + ' ay',
    meta: formatDate(now().toDate()),
  });

  statCards(doc, [
    { label: 'Toplam gelir', value: formatCurrency(t.income), fg: C.accent, bg: C.accentSoft },
    { label: 'Kira tahsilatı', value: formatCurrency(t.rentReceived), fg: C.ink },
    { label: 'Otobüs hasılatı', value: formatCurrency(t.busGross), fg: C.ink },
    { label: 'Gider', value: formatCurrency(t.expense + t.busExpense), fg: C.warn, bg: C.warnSoft },
    { label: 'Net', value: formatCurrency(t.net), fg: t.net >= 0 ? C.ok : C.bad, bg: t.net >= 0 ? C.okSoft : C.badSoft },
  ]);

  sectionTitle(doc, 'Aylara göre', 'Kira tahsilatı, otobüs kalanı ve birleşik net');
  table(doc, {
    columns: [
      { label: 'Dönem', weight: 2 },
      { label: 'Kira beklenen', weight: 1.6, align: 'right' },
      { label: 'Kira tahsilat', weight: 1.6, align: 'right' },
      { label: 'Gider', weight: 1.4, align: 'right' },
      { label: 'Otobüs hasılat', weight: 1.6, align: 'right' },
      { label: 'Otobüs kalan', weight: 1.6, align: 'right' },
      { label: 'Gün', weight: 0.8, align: 'right' },
      { label: 'Net', weight: 1.7, align: 'right' },
    ],
    rows: report.series.map((item) => [
      { text: item.label, font: 'semi' },
      formatCurrency(item.rentExpected),
      { text: formatCurrency(item.rentReceived), color: C.accent, font: 'semi' },
      { text: formatCurrency(item.expense), color: C.warn },
      formatCurrency(item.busGross),
      { text: formatCurrency(item.busNet), color: item.busNet >= 0 ? C.ok : C.bad },
      { text: item.busDays || '—', color: C.ink3 },
      { text: formatCurrency(item.net), font: 'bold', color: item.net >= 0 ? C.ink : C.bad },
    ]),
    onNewPage: (d) => header(d, { title: 'Genel rapor', subtitle: 'Aylara göre (devam)' }),
  });

  sectionTitle(doc, 'Özet');
  table(doc, {
    columns: [{ label: 'Kalem', weight: 3 }, { label: 'Tutar', weight: 2, align: 'right' }],
    rows: [
      ['Kira beklenen', formatCurrency(t.rentExpected)],
      [{ text: 'Kira tahsil edilen', font: 'semi' }, { text: formatCurrency(t.rentReceived), color: C.accent, font: 'semi' }],
      ['Kira tahsilat oranı', '%' + t.rentRate],
      ['Mülk gideri', { text: formatCurrency(t.expense), color: C.warn }],
      [{ text: 'Otobüs hasılatı', font: 'semi' }, { text: formatCurrency(t.busGross), font: 'semi' }],
      ['Otobüs gideri', { text: formatCurrency(t.busExpense), color: C.warn }],
      ['Otobüs kalanı', { text: formatCurrency(t.busNet), color: t.busNet >= 0 ? C.ok : C.bad }],
      ['Otobüs kâr marjı', '%' + t.busMargin],
      ['İşlenen gün', String(t.busDays)],
      [{ text: 'Birleşik net', font: 'bold' }, { text: formatCurrency(t.net), font: 'bold', color: t.net >= 0 ? C.ok : C.bad }],
      ['Aylık ortalama net', formatCurrency(t.averageMonthly)],
      t.bestMonth ? ['En iyi ay', t.bestMonth.label + ' · ' + formatCurrency(t.bestMonth.net)] : ['En iyi ay', '—'],
    ],
  });

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    footer(doc, index + 1);
  }

  return doc;
}

/* Dönem raporu (kayan aralık) · A4 dikey */
function buildRangeReportPdf(report) {
  const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
  registerFonts(doc);

  header(doc, {
    title: 'Dönem raporu',
    subtitle: report.series[0].label + ' - ' + report.series[report.series.length - 1].label,
    meta: 'Son ' + report.months + ' ay',
  });

  statCards(doc, [
    { label: 'Toplam tahsilat', value: formatCurrency(report.totals.received), fg: C.accent, bg: C.accentSoft },
    { label: 'Toplam gider', value: formatCurrency(report.totals.expense), fg: C.warn, bg: C.warnSoft },
    { label: 'Net gelir', value: formatCurrency(report.totals.net), fg: C.ok, bg: C.okSoft },
    { label: 'Tahsilat oranı', value: '%' + report.totals.rate, fg: C.ink },
  ]);

  sectionTitle(doc, 'Aylara göre tahsilat ve gider');
  trendBars(doc, report.series);

  sectionTitle(doc, 'Aylık döküm');
  table(doc, {
    columns: [
      { label: 'Dönem', weight: 2 },
      { label: 'Beklenen', weight: 1.6, align: 'right' },
      { label: 'Tahsilat', weight: 1.6, align: 'right' },
      { label: 'Gider', weight: 1.4, align: 'right' },
      { label: 'Net', weight: 1.6, align: 'right' },
      { label: 'Oran', weight: 1, align: 'right' },
    ],
    rows: report.series.map((item) => [
      { text: item.label, font: 'semi' },
      formatCurrency(item.expected),
      { text: formatCurrency(item.received), color: C.accent, font: 'semi' },
      { text: formatCurrency(item.expense), color: C.warn },
      { text: formatCurrency(item.net), font: 'semi' },
      '%' + item.rate,
    ]),
    onNewPage: (d) => header(d, { title: 'Dönem raporu', subtitle: 'Aylık döküm (devam)' }),
  });

  sectionTitle(doc, 'Kiracı bazında tahsilat');
  table(doc, {
    columns: [
      { label: 'Kiracı', weight: 3 },
      { label: 'Beklenen', weight: 1.6, align: 'right' },
      { label: 'Tahsil edilen', weight: 1.6, align: 'right' },
      { label: 'Açık', weight: 1.5, align: 'right' },
      { label: 'Oran', weight: 1, align: 'right' },
    ],
    rows: report.byTenant.map((item) => [
      { text: item.name, font: 'semi' },
      formatCurrency(item.expected),
      { text: formatCurrency(item.received), color: C.accent, font: 'semi' },
      { text: formatCurrency(item.outstanding), color: item.outstanding > 0 ? C.bad : C.ink3 },
      '%' + item.rate,
    ]),
    onNewPage: (d) => header(d, { title: 'Dönem raporu', subtitle: 'Kiracı bazında tahsilat (devam)' }),
  });

  if (report.byCategory.length) {
    sectionTitle(doc, 'Gider kırılımı');
    table(doc, {
      columns: [
        { label: 'Kategori', weight: 3 },
        { label: 'Tutar', weight: 2, align: 'right' },
      ],
      rows: report.byCategory.map((item) => [
        { text: item.label, font: 'semi' },
        { text: formatCurrency(item.total), color: C.warn },
      ]),
    });
  }

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    footer(doc, index + 1);
  }

  return doc;
}

/* Yıllık rapor · A4 yatay, kiracı × ay tablosu */
function buildAnnualReportPdf(annual) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 38, bufferPages: true });
  registerFonts(doc);

  const title = annual.year + ' yıllık raporu';
  header(doc, {
    title,
    subtitle: annual.totals.tenantCount + ' kiracı · yıl içinde katılan ' + annual.totals.newTenants,
    meta: formatDate(now().toDate()),
  });

  statCards(doc, [
    { label: 'Beklenen', value: formatCurrency(annual.totals.expected), fg: C.ink },
    { label: 'Tahsil edilen', value: formatCurrency(annual.totals.received), fg: C.accent, bg: C.accentSoft },
    { label: 'Gider', value: formatCurrency(annual.totals.expense), fg: C.warn, bg: C.warnSoft },
    { label: 'Net gelir', value: formatCurrency(annual.totals.net), fg: C.ok, bg: C.okSoft },
    { label: 'Tahsilat oranı', value: '%' + annual.totals.rate, fg: C.ink },
  ]);

  sectionTitle(doc, 'Aylara göre', 'Beklenen, tahsil edilen ve gider');
  trendBars(doc, annual.series);

  sectionTitle(doc, 'Kiracı × ay', 'Ö ödendi · E eksik · · ödenmedi · – henüz kiracı değil');

  const monthColumns = MONTH_SHORT.map((label) => ({ label, weight: 0.66, align: 'center', tight: true }));
  table(doc, {
    rowHeight: 22,
    columns: [
      { label: 'Kiracı', weight: 3.1 },
      { label: 'Dahil olduğu ay', weight: 2.05, tight: true },
      ...monthColumns,
      { label: 'Tahsilat', weight: 1.6, align: 'right' },
      { label: 'Oran', weight: 0.95, align: 'right', tight: true },
    ],
    rows: annual.rows.map((row) => [
      { text: row.name, font: 'semi' },
      { text: row.startLabel, color: C.ink2, size: 7.8 },
      ...row.cells.map((cell) => {
        const style = CELL_STYLE[cell.state];
        return {
          text: cell.isStart ? '◆' : style.text,
          bg: cell.isStart ? C.accentSoft : style.bg,
          color: cell.isStart ? C.accent : style.color,
          font: 'semi',
          size: 8,
        };
      }),
      { text: formatCurrency(row.received), color: C.accent, font: 'semi' },
      '%' + row.rate,
    ]),
    onNewPage: (d) => header(d, { title, subtitle: 'Kiracı × ay (devam)' }),
  });

  doc.font('body').fontSize(7.5).fillColor(C.ink3)
    .text('◆ kiracının portföye katıldığı ay', doc.page.margins.left, doc.y);
  doc.moveDown(1);

  if (annual.dues?.rows.length) {
    sectionTitle(
      doc,
      'Aidat × ay',
      'Ö ödendi · · ödenmedi · – kapsam dışı · ' +
        formatCurrency(annual.dues.totals.settled) + ' / ' + formatCurrency(annual.dues.totals.expected)
    );
    table(doc, {
      rowHeight: 22,
      columns: [
        { label: 'Daire / kalem', weight: 3.1 },
        { label: 'İlgili kiracı', weight: 2.05, tight: true },
        ...MONTH_SHORT.map((label) => ({ label, weight: 0.66, align: 'center', tight: true })),
        { label: 'Ödenen', weight: 1.6, align: 'right' },
        { label: 'Oran', weight: 0.95, align: 'right', tight: true },
      ],
      rows: annual.dues.rows.map((row) => [
        { text: row.label, font: 'semi' },
        { text: row.tenantName || 'Genel', color: C.ink2, size: 7.8 },
        ...row.months.map((cell) => {
          const style = cell.paid
            ? { bg: C.okSoft, color: C.ok, text: 'Ö' }
            : !cell.covered
              ? { bg: null, color: C.ink3, text: '–' }
              : cell.status === 'overdue'
                ? { bg: C.badSoft, color: C.bad, text: '·' }
                : { bg: C.lineSoft, color: C.ink3, text: '' };
          return { text: style.text, bg: style.bg, color: style.color, font: 'semi', size: 8 };
        }),
        { text: formatCurrency(row.settled), color: C.ok, font: 'semi' },
        '%' + row.rate,
      ]),
      onNewPage: (d) => header(d, { title, subtitle: 'Aidat × ay (devam)' }),
    });
  }

  if (annual.byCategory.length) {
    sectionTitle(doc, 'Gider kırılımı');
    table(doc, {
      columns: [
        { label: 'Kategori', weight: 3 },
        { label: 'Tutar', weight: 2, align: 'right' },
      ],
      rows: annual.byCategory.map((item) => [
        { text: item.label, font: 'semi' },
        { text: formatCurrency(item.total), color: C.warn },
      ]),
    });
  }

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    footer(doc, index + 1);
  }

  return doc;
}

/* ------------------------------------------------------------------ */
/* Aylık bütün rapor · A4 dikey. Kapakta ayın özeti, ardından bölüm bölüm
   kira, aidat, giderler, gider notları, otobüs hattı ve gündem. Her bölüm
   kendi başlık bandı ve ara toplamlarıyla açılır. */

const FULL_TITLE = 'Aylık bütün rapor';
const PAGE_BOTTOM = 54;

function tone(value) {
  return value >= 0 ? { fg: C.ok, bg: C.okSoft } : { fg: C.bad, bg: C.badSoft };
}

function formatDateTime(date) {
  return dayjs(date).utcOffset(3).format('DD MMM YYYY · HH:mm');
}

function daysText(days) {
  if (days === 0) return 'bugün';
  if (days === 1) return 'yarın';
  if (days < 0) return Math.abs(days) + ' gün geçti';
  return days + ' gün';
}

/* Sayfada yer yoksa yeni sayfa aç; başlık bandı bölümün adını taşır. */
function ensureSpace(doc, needed, ctx) {
  if (doc.y + needed <= doc.page.height - PAGE_BOTTOM) return false;
  doc.addPage();
  header(doc, { title: FULL_TITLE, subtitle: ctx.label + ' · ' + ctx.part + ' (devam)' });
  return true;
}

function continueHeader(ctx, part) {
  return (d) => header(d, { title: FULL_TITLE, subtitle: ctx.label + ' · ' + part + ' (devam)' });
}

function emptyLine(doc, text) {
  doc.font('body').fontSize(9).fillColor(C.ink3)
    .text(text || 'Bu ay kayıt yok.', doc.page.margins.left, doc.y);
  doc.moveDown(1.4);
  doc.fillColor(C.ink);
}

function footNote(doc, text) {
  doc.font('body').fontSize(7.5).fillColor(C.ink3)
    .text(text, doc.page.margins.left, doc.y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
  doc.moveDown(1);
  doc.fillColor(C.ink);
}

/* Alt başlık + tablo başı + iki satır aynı sayfada kalsın: başlık yalnız kalmasın. */
function subSection(doc, ctx, title, hint) {
  ensureSpace(doc, 96, ctx);
  sectionTitle(doc, title, hint);
}

/* Büyük ölçüt kartları: üç sütun, etiket üstte, rakam iri. İsteğe bağlı
   alt satır ve oran çubuğu. Kapak sayfasının gövdesi. */
function bigCards(doc, cards, columns = 3) {
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const gap = 10;
  const width = (usable - gap * (columns - 1)) / columns;
  const height = 72;
  const inner = width - 28;

  for (let start = 0; start < cards.length; start += columns) {
    const row = cards.slice(start, start + columns);
    const top = doc.y;

    let valueSize = 21;
    doc.font('bold');
    while (valueSize > 11 && row.some((card) => doc.fontSize(valueSize).widthOfString(String(card.value)) > inner * 0.94)) {
      valueSize -= 0.5;
    }

    row.forEach((card, index) => {
      const x = left + index * (width + gap);
      doc.roundedRect(x, top, width, height, 14).fillAndStroke(card.bg || C.panel, card.border || C.line);
      doc.fillColor(card.labelColor || C.ink3).font('semi').fontSize(7.5)
        .text(card.label.toLocaleUpperCase('tr-TR'), x + 14, top + 13, {
          width: inner,
          characterSpacing: 0.8,
          lineBreak: false,
          ellipsis: true,
        });
      doc.fillColor(card.fg || C.ink).font('bold').fontSize(valueSize)
        .text(String(card.value), x + 14, top + 26 + (21 - valueSize) / 2, {
          width: inner,
          lineBreak: false,
          ellipsis: true,
          features: ['tnum'],
        });
      if (typeof card.rate === 'number') {
        const barTop = top + height - 15;
        const filled = Math.max(0, Math.min(100, card.rate)) / 100;
        doc.roundedRect(x + 14, barTop, inner, 5, 2.5).fill(C.line);
        if (filled > 0) doc.roundedRect(x + 14, barTop, Math.max(inner * filled, 5), 5, 2.5).fill(card.fg || C.accent);
      } else if (card.sub) {
        doc.fillColor(C.ink3).font('body').fontSize(7.8)
          .text(card.sub, x + 14, top + height - 17, { width: inner, lineBreak: false, ellipsis: true });
      }
    });

    doc.y = top + height + gap;
  }

  doc.y += 8;
  doc.fillColor(C.ink);
}

/* Bölüm bandı: mürekkep zemin, solda bölüm numarası, sağda kısa özet.
   Sayfanın dibine düşen bant yalnız kalmasın diye en az bir kart sırası
   ve tablo başı sığmalı. */
function partHeader(doc, ctx, { number, title, hint }) {
  ctx.part = title;
  if (doc.y > 150 && doc.y + 240 > doc.page.height - PAGE_BOTTOM) {
    doc.addPage();
    header(doc, { title: FULL_TITLE, subtitle: ctx.label + ' · ' + title });
  }
  doc.y += 4;

  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const top = doc.y;
  const height = 46;

  doc.save();
  const wash = doc.linearGradient(left, top, left + usable, top + height);
  wash.stop(0, '#16224a').stop(0.6, '#0c1220').stop(1, '#1d2f6b');
  doc.roundedRect(left, top, usable, height, 12).fill(wash);
  doc.restore();

  doc.roundedRect(left + 12, top + 11, 34, 24, 7).fill(C.accent);
  doc.fillColor(C.white).font('bold').fontSize(10.5)
    .text(String(number).padStart(2, '0'), left + 12, top + 17.5, { width: 34, align: 'center', lineBreak: false });

  doc.fillColor('#93a8e8').font('semi').fontSize(7)
    .text('BÖLÜM ' + number, left + 58, top + 10, { characterSpacing: 1.3, lineBreak: false });
  doc.fillColor(C.white).font('bold').fontSize(14)
    .text(title, left + 58, top + 20, { lineBreak: false });

  if (hint) {
    doc.fillColor('#b9c6e6').font('body').fontSize(8.5)
      .text(hint, left + usable * 0.45, top + 18.5, {
        width: usable * 0.55 - 16,
        align: 'right',
        lineBreak: false,
        ellipsis: true,
      });
  }

  doc.fillColor(C.ink);
  doc.y = top + height + 14;
}

/* Kapak grafiği: her ay için gelir sütunu (kira tahsilatı, üstünde
   otobüs kalanı) ve yanında gider sütunu; tepede ayın neti yazar. */
function netTrendBars(doc, series, current) {
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const height = 82;
  const top = doc.y + 12;
  const slot = usable / series.length;
  const max = Math.max(1, ...series.map((item) => Math.max(item.received + Math.max(item.busNet, 0), item.expense)));

  series.forEach((item, index) => {
    const x = left + index * slot;
    const isCurrent = item.month === current.month && item.year === current.year;
    const rentH = (item.received / max) * height;
    const busH = (Math.max(item.busNet, 0) / max) * height;
    const expenseH = (item.expense / max) * height;
    const barX = x + slot * 0.2;
    const barW = slot * 0.38;

    if (isCurrent) doc.roundedRect(x + 4, top - 14, slot - 8, height + 30, 8).fill(C.accentSoft);
    if (rentH) doc.rect(barX, top + height - rentH, barW, rentH).fill(C.accent);
    if (busH) doc.rect(barX, top + height - rentH - busH, barW, busH).fill(C.ok);
    if (expenseH) doc.rect(x + slot * 0.62, top + height - expenseH, slot * 0.14, expenseH).fill(C.warn);

    const peak = top + height - Math.max(rentH + busH, expenseH);
    doc.fillColor(item.net >= 0 ? C.ink : C.bad).font('bold').fontSize(7.2)
      .text(formatCurrency(item.net), x, Math.max(peak - 11, top - 11), {
        width: slot,
        align: 'center',
        lineBreak: false,
        features: ['tnum'],
      });
    doc.fillColor(isCurrent ? C.accent : C.ink3).font('semi').fontSize(7)
      .text(item.short + ' ' + String(item.year).slice(2), x, top + height + 5, { width: slot, align: 'center', lineBreak: false });
  });

  doc.moveTo(left, top + height).lineTo(left + usable, top + height)
    .lineWidth(0.6).strokeColor(C.line).stroke();

  doc.y = top + height + 22;
  doc.font('body').fontSize(7.5);
  let lx = left;
  [['Kira tahsilatı', C.accent], ['Otobüs kalanı', C.ok], ['Gider', C.warn]].forEach(([label, color]) => {
    doc.circle(lx + 3, doc.y + 3, 3.2).fill(color);
    doc.fillColor(C.ink3).text(label, lx + 11, doc.y, { lineBreak: false });
    lx += 80;
  });
  doc.y += 14;
  doc.fillColor(C.ink);
}

function fullCover(doc, report, ctx) {
  const t = report.totals;
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;

  doc.fillColor(C.ink3).font('semi').fontSize(8)
    .text('AYIN ÖZETİ', left, doc.y, { characterSpacing: 1.4 });
  doc.fillColor(C.ink).font('bold').fontSize(26)
    .text(report.label, left, doc.y + 2, { lineBreak: false });
  doc.y += 32;

  const headline = [
    report.rent.totals.paidCount + '/' + report.rent.totals.tenantCount + ' kiracı ödedi',
    report.rent.totals.overdueCount ? report.rent.totals.overdueCount + ' geciken' : '',
    t.busDays ? t.busDays + ' otobüs günü' : '',
    report.agenda.todos.length ? report.agenda.todos.length + ' açık yapılacak' : '',
  ].filter(Boolean).join(' · ');
  doc.fillColor(C.ink2).font('body').fontSize(10)
    .text(headline, left, doc.y, { width: usable, lineBreak: false, ellipsis: true });
  doc.y += 22;

  const netTone = tone(t.net);
  bigCards(doc, [
    { label: 'Toplam gelir', value: formatCurrency(t.income), fg: C.accent, bg: C.accentSoft, border: '#ccd8fa', sub: 'Kira tahsilatı + otobüs kalanı' },
    { label: 'Toplam gider', value: formatCurrency(t.expense), fg: C.warn, bg: C.warnSoft, border: '#f0dcb6', sub: 'Giderler ve aidat' },
    { label: 'Net', value: formatCurrency(t.net), fg: netTone.fg, bg: netTone.bg, border: t.net >= 0 ? '#cbe8db' : '#f3cfc9', sub: 'Gelir − gider' },
    { label: 'Kira tahsilatı', value: formatCurrency(t.rentReceived), fg: C.ink, sub: formatCurrency(t.rentExpected) + ' beklenen' },
    { label: 'Otobüs kalanı', value: formatCurrency(t.busNet), fg: t.busNet >= 0 ? C.ink : C.bad, sub: formatCurrency(t.busGross) + ' hasılat · ' + t.busDays + ' gün' },
    { label: 'Tahsilat oranı', value: '%' + t.rentRate, fg: C.accent, rate: t.rentRate },
  ]);

  sectionTitle(doc, 'Hesap özeti', 'Genel rapordaki birleşik net ile aynı hesap');
  const line = (label, value, options = {}) => [
    { text: label, font: options.bold ? 'bold' : options.semi ? 'semi' : 'body', color: options.muted ? C.ink2 : C.ink },
    { text: options.sign || '', color: C.ink3, font: 'semi' },
    { text: formatCurrency(value), font: options.bold ? 'bold' : options.semi ? 'semi' : 'body', color: options.color || C.ink },
  ];
  table(doc, {
    singleLine: true,
    rowHeight: 18,
    columns: [
      { label: 'Kalem', weight: 4.4 },
      { label: '', weight: 0.5, align: 'center' },
      { label: 'Tutar', weight: 2, align: 'right' },
    ],
    rows: [
      line('Kira tahsilatı', t.rentReceived, { semi: true, color: C.accent, sign: '+' }),
      line('Otobüs hasılatı', t.busGross, { muted: true }),
      line('Otobüs giderleri (mazot, yövmiye, denekçi, diğer)', t.busExpense, { muted: true, color: C.warn }),
      line('Otobüs kalanı', t.busNet, { semi: true, color: t.busNet >= 0 ? C.ok : C.bad, sign: '+' }),
      line('Giderler (aidat hariç)', t.expenseOther, { color: C.warn, sign: '−' }),
      line('Aidat ödemeleri', t.expenseDues, { color: C.warn, sign: '−' }),
      line('Toplam gider', t.expense, { semi: true, color: C.warn }),
      line('Net', t.net, { bold: true, color: netTone.fg, sign: '=' }),
    ],
  });
  footNote(
    doc,
    'Gider notları defteri (' + formatCurrency(t.ledger) + ') bilgi amaçlıdır, nete dahil edilmez. ' +
      'Otobüs giderleri kalandan düşülmüştür, ayrıca gider sayılmaz.'
  );

  if (report.trend.length) {
    ensureSpace(doc, 160, ctx);
    sectionTitle(doc, 'Son 6 ay', 'Çubuğun üstünde ayın neti: kira tahsilatı + otobüs kalanı − gider');
    netTrendBars(doc, report.trend, report);
  }
}

function fullRentPart(doc, report, ctx) {
  const rent = report.rent;
  const t = rent.totals;
  partHeader(doc, ctx, {
    number: ctx.next(),
    title: 'Kira',
    hint: t.paidCount + ' ödendi · ' + t.partialCount + ' eksik · ' + t.overdueCount + ' geciken',
  });

  statCards(doc, [
    { label: 'Beklenen', value: formatCurrency(t.expected), fg: C.ink },
    { label: 'Tahsil edilen', value: formatCurrency(t.received), fg: C.accent, bg: C.accentSoft },
    { label: 'Kalan', value: formatCurrency(t.outstanding), fg: t.outstanding ? C.bad : C.ink3, bg: t.outstanding ? C.badSoft : C.panel },
    { label: 'Tahsilat oranı', value: '%' + t.rate, fg: C.ink },
  ]);

  subSection(doc, ctx, 'Kiracı durumu', t.tenantCount + ' kiracı');
  if (rent.rows.length) {
    table(doc, {
      singleLine: true,
      columns: [
        { label: 'Kiracı', weight: 2.6 },
        { label: 'Beklenen', weight: 1.5, align: 'right' },
        { label: 'Ödenen', weight: 1.5, align: 'right' },
        { label: 'Kalan', weight: 1.4, align: 'right' },
        { label: 'Son ödeme', weight: 1.5, align: 'right' },
        { label: 'Durum', weight: 1.4, align: 'center' },
      ],
      rows: rent.rows.map((row) => {
        const style = STATUS_STYLE[row.status] || STATUS_STYLE.pending;
        return [
          { text: row.name, font: 'semi' },
          formatCurrency(row.expected),
          { text: formatCurrency(row.paid), color: row.paid ? C.accent : C.ink3, font: 'semi' },
          { text: formatCurrency(row.remaining), color: row.remaining > 0 ? C.bad : C.ink3 },
          { text: formatDate(row.dueDate) + (row.isDeferred ? ' *' : ''), color: C.ink2, size: 8 },
          { text: style.label, bg: style.bg, color: style.color, font: 'semi', size: 7.8 },
        ];
      }),
      onNewPage: continueHeader(ctx, 'Kira'),
    });
    if (rent.rows.some((row) => row.isDeferred)) footNote(doc, '* son ödeme tarihi ertelendi');
  } else {
    emptyLine(doc, 'Bu ay aktif kiracı yok.');
  }

  subSection(
    doc,
    ctx,
    'Tahsilat hareketleri',
    rent.payments.length ? rent.payments.length + ' kayıt · ' + formatCurrency(t.received) : ''
  );
  if (rent.payments.length) {
    table(doc, {
      singleLine: true,
      columns: [
        { label: 'Tarih', weight: 1.5 },
        { label: 'Kiracı', weight: 3 },
        { label: 'Not', weight: 2.6 },
        { label: 'Tutar', weight: 1.6, align: 'right' },
      ],
      rows: rent.payments.map((item) => [
        { text: formatDate(item.date), color: C.ink2 },
        { text: item.tenantName, font: 'semi' },
        { text: item.note || (item.source === 'telegram' ? 'Telegram' : 'Panel'), color: C.ink3, size: 8 },
        { text: formatCurrency(item.amount), color: C.accent, font: 'semi' },
      ]),
      onNewPage: continueHeader(ctx, 'Kira · tahsilat'),
    });
  } else {
    emptyLine(doc, 'Bu ay tahsilat kaydı yok.');
  }

  subSection(doc, ctx, 'Ertelemeler', rent.deferments.length ? rent.deferments.length + ' kiracı' : '');
  if (rent.deferments.length) {
    table(doc, {
      singleLine: true,
      columns: [
        { label: 'Kiracı', weight: 2.6 },
        { label: 'Asıl vade', weight: 1.5, align: 'right' },
        { label: 'Yeni vade', weight: 1.5, align: 'right' },
        { label: 'Not', weight: 3 },
      ],
      rows: rent.deferments.map((item) => [
        { text: item.tenantName, font: 'semi' },
        { text: formatDate(item.originalDate), color: C.ink3 },
        { text: formatDate(item.dueDate), color: C.warn, font: 'semi' },
        { text: item.note || '—', color: C.ink3, size: 8 },
      ]),
      onNewPage: continueHeader(ctx, 'Kira · ertelemeler'),
    });
  } else {
    emptyLine(doc, 'Bu ay erteleme yok.');
  }
}

function fullDuesPart(doc, report, ctx) {
  const dues = report.dues;
  const t = dues.totals;
  partHeader(doc, ctx, {
    number: ctx.next(),
    title: 'Aidat',
    hint: t.dueCount ? t.paidCount + '/' + t.dueCount + ' ödendi' + (t.overdueCount ? ' · ' + t.overdueCount + ' geciken' : '') : 'Kalem yok',
  });

  if (!dues.rows.length) {
    emptyLine(doc);
    return;
  }

  statCards(doc, [
    { label: 'Beklenen', value: formatCurrency(t.expected), fg: C.ink },
    { label: 'Ödenen', value: formatCurrency(t.settled), fg: C.ok, bg: C.okSoft },
    { label: 'Açık', value: formatCurrency(t.outstanding), fg: t.outstanding ? C.warn : C.ink3, bg: t.outstanding ? C.warnSoft : C.panel },
    { label: 'Ödeme oranı', value: '%' + t.rate, fg: C.ink },
  ]);

  subSection(doc, ctx, 'Daire daire', t.dueCount + ' kalem');
  table(doc, {
    singleLine: true,
    columns: [
      { label: 'Daire', weight: 1.4 },
      { label: 'Aidat kalemi', weight: 2.4 },
      { label: 'İlgili kiracı', weight: 1.8 },
      { label: 'Son ödeme', weight: 1.4, align: 'right' },
      { label: 'Tutar', weight: 1.4, align: 'right' },
      { label: 'Durum', weight: 1.3, align: 'center' },
    ],
    rows: dues.rows.map((row) => {
      const style = STATUS_STYLE[row.status] || STATUS_STYLE.pending;
      return [
        { text: row.unit || '—', font: 'semi' },
        { text: row.title, color: C.ink2 },
        { text: row.tenantName || 'Genel', color: C.ink3 },
        { text: formatDate(row.dueDate), color: C.ink2, size: 8 },
        { text: formatCurrency(row.amount), color: row.paid ? C.ok : C.warn, font: 'semi' },
        {
          text: row.paid ? 'Ödendi' : style.label,
          bg: row.paid ? C.okSoft : style.bg,
          color: row.paid ? C.ok : style.color,
          font: 'semi',
          size: 7.8,
        },
      ];
    }),
    onNewPage: continueHeader(ctx, 'Aidat'),
  });
  if (dues.recordedTotal !== t.settled) {
    footNote(doc, 'Gider olarak kaydedilen aidat: ' + formatCurrency(dues.recordedTotal) + ' (ödenmemiş yükümlülükler dahil).');
  }
}

const RECURRING_STYLE = {
  paid: { label: 'Ödendi', color: C.ok, bg: C.okSoft },
  unpaid: { label: 'Ödenmedi', color: C.bad, bg: C.badSoft },
  planned: { label: 'Planlı', color: C.calm, bg: C.calmSoft },
};

function fullExpensesPart(doc, report, ctx) {
  const expenses = report.expenses;
  const t = expenses.totals;
  partHeader(doc, ctx, {
    number: ctx.next(),
    title: 'Giderler',
    hint: t.count ? t.count + ' kalem · ' + expenses.byCategory.length + ' kategori' : 'Kayıt yok',
  });

  if (!expenses.rows.length && !expenses.recurring.length) {
    emptyLine(doc);
    return;
  }

  statCards(doc, [
    { label: 'Gider toplamı', value: formatCurrency(t.total), fg: C.warn, bg: C.warnSoft },
    { label: 'Ödenen', value: formatCurrency(t.paid), fg: C.ink },
    { label: 'Ödenmemiş', value: formatCurrency(t.unpaid), fg: t.unpaid ? C.bad : C.ink3, bg: t.unpaid ? C.badSoft : C.panel },
    { label: 'Düzenli · açık', value: t.recurringCount + ' · ' + t.recurringOpen, fg: C.ink },
  ]);

  if (expenses.rows.length) {
    subSection(doc, ctx, 'Kategoriye göre', expenses.byCategory.map((group) => group.label + ' ' + formatCurrency(group.total)).join(' · '));
    const rows = [];
    expenses.byCategory.forEach((group) => {
      rows.push(Object.assign([
        '',
        { text: group.label, font: 'bold', color: C.accent },
        { text: group.items.length + ' kalem' + (group.unpaid ? ' · ' + formatCurrency(group.unpaid) + ' ödenmedi' : ''), color: C.ink3, size: 7.8 },
        '',
        { text: formatCurrency(group.total), font: 'bold', color: C.warn, bg: C.warnSoft },
      ], { keepWithNext: true }));
      group.items.forEach((item) => {
        rows.push([
          { text: formatDate(item.date), color: C.ink2, size: 8 },
          { text: item.title, font: 'semi' },
          { text: [item.tenantName, item.note].filter(Boolean).join(' · ') || '—', color: C.ink3, size: 8 },
          item.paid
            ? { text: 'Ödendi', color: C.ok, size: 7.8, font: 'semi' }
            : { text: 'Ödenmedi', color: C.bad, bg: C.badSoft, size: 7.8, font: 'semi' },
          { text: formatCurrency(item.amount), color: C.ink },
        ]);
      });
    });
    table(doc, {
      singleLine: true,
      columns: [
        { label: 'Tarih', weight: 1.4 },
        { label: 'Kalem', weight: 2.6 },
        { label: 'Kiracı · not', weight: 2.2 },
        { label: 'Durum', weight: 1.1, align: 'center' },
        { label: 'Tutar', weight: 1.6, align: 'right' },
      ],
      rows,
      onNewPage: continueHeader(ctx, 'Giderler'),
    });
  }

  subSection(doc, ctx, 'Düzenli kalemler', expenses.recurring.length ? 'Aidat dışı, her ay tekrar eden' : '');
  if (expenses.recurring.length) {
    table(doc, {
      singleLine: true,
      columns: [
        { label: 'Kalem', weight: 2.8 },
        { label: 'Kategori', weight: 1.7 },
        { label: 'Gün', weight: 0.8, align: 'right' },
        { label: 'Tutar', weight: 1.5, align: 'right' },
        { label: 'Durum', weight: 1.3, align: 'center' },
      ],
      rows: expenses.recurring.map((item) => {
        const style = RECURRING_STYLE[item.status];
        return [
          { text: item.title + (item.tenantName ? ' · ' + item.tenantName : ''), font: 'semi' },
          { text: item.categoryLabel, color: C.ink3 },
          { text: item.dayOfMonth, color: C.ink2 },
          formatCurrency(item.amount),
          { text: style.label, color: style.color, bg: style.bg, font: 'semi', size: 7.8 },
        ];
      }),
      onNewPage: continueHeader(ctx, 'Giderler · düzenli'),
    });
  } else {
    emptyLine(doc, 'Bu ay düzenli kalem yok.');
  }
}

function fullLedgerPart(doc, report, ctx) {
  const ledger = report.ledger;
  partHeader(doc, ctx, {
    number: ctx.next(),
    title: 'Gider notları',
    hint: ledger.count ? ledger.count + ' kayıt · ' + formatCurrency(ledger.total) : 'Kayıt yok',
  });

  if (!ledger.rows.length) {
    emptyLine(doc);
    return;
  }

  const biggest = ledger.rows.reduce((top, item) => (item.amount > (top?.amount ?? -1) ? item : top), null);
  statCards(doc, [
    { label: 'Toplam', value: formatCurrency(ledger.total), fg: C.warn, bg: C.warnSoft },
    { label: 'Kayıt', value: String(ledger.count), fg: C.ink },
    { label: 'En büyük kalem', value: formatCurrency(biggest.amount), fg: C.ink },
  ]);

  table(doc, {
    singleLine: true,
    columns: [
      { label: 'Tarih', weight: 1.4 },
      { label: 'Başlık', weight: 3 },
      { label: 'Not', weight: 2.8 },
      { label: 'Tutar', weight: 1.6, align: 'right' },
    ],
    rows: [
      ...ledger.rows.map((item) => [
        { text: formatDate(item.date), color: C.ink2 },
        { text: item.title, font: 'semi' },
        { text: item.note || '—', color: C.ink3, size: 8 },
        { text: formatCurrency(item.amount), color: C.warn, font: 'semi' },
      ]),
      [{ text: 'Toplam', font: 'bold' }, '', '', { text: formatCurrency(ledger.total), font: 'bold', color: C.warn }],
    ],
    onNewPage: continueHeader(ctx, 'Gider notları'),
  });
  footNote(doc, 'Gider notları kişisel harcama defteridir; kira, aidat ve net hesabına girmez.');
}

function fullBusPart(doc, report, ctx) {
  const bus = report.bus;
  const t = bus.totals;
  partHeader(doc, ctx, {
    number: ctx.next(),
    title: 'Otobüs hattı',
    hint: t.days ? t.days + ' gün işlendi · %' + t.margin + ' kâr marjı' : 'Kayıt yok',
  });

  if (!bus.rows.length) {
    emptyLine(doc);
    return;
  }

  statCards(doc, [
    { label: 'Toplam', value: formatCurrency(t.gross), fg: C.accent, bg: C.accentSoft },
    { label: 'Mazot', value: formatCurrency(t.fuel), fg: C.warn, bg: C.warnSoft },
    { label: 'Yövmiye', value: formatCurrency(t.wage), fg: C.ink },
    { label: 'Denekçi', value: formatCurrency(t.fee), fg: C.ink },
    { label: 'Diğer', value: formatCurrency(t.other), fg: C.ink },
    { label: 'Kalan', value: formatCurrency(t.net), fg: tone(t.net).fg, bg: tone(t.net).bg },
  ]);

  subSection(doc, ctx, 'Araç bazında', bus.perBus.length + ' araç · ayın toplamı');
  table(doc, {
    singleLine: true,
    columns: [
      { label: 'Araç', weight: 2.6 },
      { label: 'Gün', weight: 0.7, align: 'right', tight: true },
      { label: 'Toplam', weight: 1.5, align: 'right' },
      { label: 'Mazot', weight: 1.35, align: 'right' },
      { label: 'Yövmiye', weight: 1.35, align: 'right' },
      { label: 'Denekçi', weight: 1.25, align: 'right' },
      { label: 'Diğer', weight: 1.15, align: 'right' },
      { label: 'Kalan', weight: 1.5, align: 'right' },
    ],
    rows: [
      ...bus.perBus.map((item) => [
        { text: item.number + ' numara' + (item.label ? ' · ' + item.label : ''), font: 'semi' },
        { text: item.totals.days, color: C.ink3 },
        formatCurrency(item.totals.gross),
        { text: formatCurrency(item.totals.fuel), color: C.warn },
        formatCurrency(item.totals.wage),
        formatCurrency(item.totals.fee),
        formatCurrency(item.totals.other),
        { text: formatCurrency(item.totals.net), color: item.totals.net >= 0 ? C.ok : C.bad, font: 'semi' },
      ]),
      [
        { text: 'Toplam', font: 'bold' },
        { text: t.days, color: C.ink3, font: 'semi' },
        { text: formatCurrency(t.gross), font: 'bold' },
        { text: formatCurrency(t.fuel), color: C.warn, font: 'semi' },
        { text: formatCurrency(t.wage), font: 'semi' },
        { text: formatCurrency(t.fee), font: 'semi' },
        { text: formatCurrency(t.other), font: 'semi' },
        { text: formatCurrency(t.net), color: tone(t.net).fg, font: 'bold' },
      ],
    ],
    onNewPage: continueHeader(ctx, 'Otobüs hattı'),
  });

  subSection(
    doc,
    ctx,
    'Gün gün döküm',
    (t.missingDays ? t.missingDays + ' gün kayıtsız · ' : '') +
      'günlük ort. hasılat ' + formatCurrency(t.averageGross) + ' · kalan ' + formatCurrency(t.averageNet)
  );
  table(doc, {
    singleLine: true,
    rowHeight: 19,
    columns: [
      { label: 'Gün', weight: 0.8, align: 'center', tight: true },
      { label: 'Araç', weight: 0.95, align: 'center', tight: true },
      { label: 'Toplam', weight: 1.6, align: 'right' },
      { label: 'Mazot', weight: 1.4, align: 'right' },
      { label: 'Yövmiye', weight: 1.4, align: 'right' },
      { label: 'Denekçi', weight: 1.3, align: 'right' },
      { label: 'Diğer', weight: 1.2, align: 'right' },
      { label: 'Kalan', weight: 1.6, align: 'right' },
      { label: 'Not', weight: 2, tight: true },
    ],
    rows: bus.rows.map((row) => [
      { text: row.day, font: 'semi' },
      { text: row.busNumber, color: C.ink3 },
      formatCurrency(row.gross),
      { text: row.fuel ? formatCurrency(row.fuel) : '—', color: row.fuel ? C.warn : C.ink3 },
      { text: row.wage ? formatCurrency(row.wage) : '—', color: row.wage ? C.ink : C.ink3 },
      { text: row.fee ? formatCurrency(row.fee) : '—', color: row.fee ? C.ink : C.ink3 },
      { text: row.other ? formatCurrency(row.other) : '—', color: row.other ? C.ink : C.ink3 },
      { text: formatCurrency(row.net), color: row.net >= 0 ? C.ok : C.bad, font: 'semi' },
      { text: row.note || row.otherNote || '', color: C.ink3, size: 7 },
    ]),
    onNewPage: continueHeader(ctx, 'Otobüs · gün dökümü'),
  });
}

function fullAgendaPart(doc, report, ctx) {
  const agenda = report.agenda;
  partHeader(doc, ctx, {
    number: ctx.next(),
    title: 'Gündem',
    hint: formatDate(report.generatedAt) + ' itibarıyla',
  });

  statCards(doc, [
    { label: 'Sözleşme bitişi · 90 gün', value: String(agenda.contracts.length), fg: agenda.contracts.length ? C.bad : C.ink3, bg: agenda.contracts.length ? C.badSoft : C.panel },
    { label: 'Kira artışı · 60 gün', value: String(agenda.increases.length), fg: agenda.increases.length ? C.calm : C.ink3, bg: agenda.increases.length ? C.calmSoft : C.panel },
    { label: 'Yapılacak · 30 gün', value: String(agenda.todos.length), fg: agenda.todos.length ? C.accent : C.ink3, bg: agenda.todos.length ? C.accentSoft : C.panel },
  ]);

  subSection(doc, ctx, 'Biten sözleşmeler', 'Önümüzdeki 90 gün');
  if (agenda.contracts.length) {
    table(doc, {
      singleLine: true,
      columns: [
        { label: 'Kiracı', weight: 3.2 },
        { label: 'Bitiş', weight: 1.8, align: 'right' },
        { label: 'Kalan', weight: 1.4, align: 'right' },
      ],
      rows: agenda.contracts.map((item) => [
        { text: item.name, font: 'semi' },
        { text: formatDate(item.date), color: C.ink2 },
        { text: daysText(item.days), color: item.days <= 30 ? C.bad : C.warn, font: 'semi', bg: item.days <= 30 ? C.badSoft : C.warnSoft },
      ]),
      onNewPage: continueHeader(ctx, 'Gündem'),
    });
  } else {
    emptyLine(doc, '90 gün içinde biten sözleşme yok.');
  }

  subSection(doc, ctx, 'Kira artış yıldönümleri', 'Önümüzdeki 60 gün');
  if (agenda.increases.length) {
    table(doc, {
      singleLine: true,
      columns: [
        { label: 'Kiracı', weight: 2.6 },
        { label: 'Tarih', weight: 1.5, align: 'right' },
        { label: 'Kalan', weight: 1.1, align: 'right' },
        { label: 'Mevcut kira', weight: 1.6, align: 'right' },
        { label: 'Önerilen', weight: 1.6, align: 'right' },
      ],
      rows: agenda.increases.map((item) => [
        { text: item.name, font: 'semi' },
        { text: formatDate(item.date), color: C.ink2 },
        { text: daysText(item.days), color: C.calm, font: 'semi' },
        formatCurrency(item.currentAmount),
        item.suggestedAmount
          ? { text: formatCurrency(item.suggestedAmount) + ' (%' + item.rate + ')', color: C.accent, font: 'semi' }
          : { text: '—', color: C.ink3 },
      ]),
      onNewPage: continueHeader(ctx, 'Gündem'),
    });
  } else {
    emptyLine(doc, '60 gün içinde artış yıldönümü yok.');
  }

  subSection(doc, ctx, 'Yapılacaklar', 'Açık olanlar · önümüzdeki 30 gün ve gecikenler');
  if (agenda.todos.length) {
    table(doc, {
      singleLine: true,
      columns: [
        { label: 'Tarih', weight: 2 },
        { label: 'Başlık', weight: 3 },
        { label: 'Not', weight: 2.6 },
        { label: 'Kalan', weight: 1.2, align: 'right' },
      ],
      rows: agenda.todos.map((item) => [
        { text: formatDateTime(item.dueAt), color: C.ink2, size: 8 },
        { text: item.title, font: 'semi' },
        { text: item.note || '—', color: C.ink3, size: 8 },
        { text: daysText(item.days), color: item.days < 0 ? C.bad : C.accent, font: 'semi', bg: item.days < 0 ? C.badSoft : null },
      ]),
      onNewPage: continueHeader(ctx, 'Gündem · yapılacaklar'),
    });
  } else {
    emptyLine(doc, 'Açık yapılacak yok.');
  }
}

function buildFullMonthReportPdf(report) {
  const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
  registerFonts(doc);

  let part = 0;
  const ctx = { label: report.label, part: 'Genel özet', next: () => (part += 1) };

  header(doc, {
    title: FULL_TITLE,
    subtitle: report.label + ' · kira, aidat, giderler, otobüs hattı ve gündem',
    meta: formatDate(report.generatedAt || now().toDate()),
  });

  fullCover(doc, report, ctx);

  // Bölümler kapaktan sonra temiz bir sayfada başlar.
  doc.addPage();
  header(doc, { title: FULL_TITLE, subtitle: report.label + ' · bölüm bölüm döküm' });

  fullRentPart(doc, report, ctx);
  fullDuesPart(doc, report, ctx);
  fullExpensesPart(doc, report, ctx);
  fullLedgerPart(doc, report, ctx);
  fullBusPart(doc, report, ctx);
  fullAgendaPart(doc, report, ctx);

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    footer(doc, index + 1);
  }

  return doc;
}

function fileNameFor(kind, value, extra) {
  if (kind === 'annual') return 'vedat-gayrimenkul-' + value + '-yillik.pdf';
  if (kind === 'month') {
    return 'vedat-gayrimenkul-' + value + '-' + String(extra).padStart(2, '0') + '.pdf';
  }
  if (kind === 'bus') {
    return 'otobus-hatti-' + value + '-' + String(extra).padStart(2, '0') + '.pdf';
  }
  if (kind === 'full') {
    return 'vedat-gayrimenkul-' + value + '-' + String(extra).padStart(2, '0') + '-butun-rapor.pdf';
  }
  if (kind === 'bus-period') return 'otobus-hatti-' + value + '-' + extra + '.pdf';
  if (kind === 'combined') return 'genel-rapor-son-' + value + '-ay.pdf';
  return 'vedat-gayrimenkul-son-' + value + '-ay.pdf';
}

/* Telegram dosya olarak ister, HTTP akış olarak. Aynı belgeyi ikinciye
   çevirmek için buffer'a toplarız; doc.end() yalnız burada çağrılır. */
function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

module.exports = {
  buildAnnualReportPdf,
  buildBusMonthReportPdf,
  buildBusPeriodReportPdf,
  buildCombinedReportPdf,
  buildFullMonthReportPdf,
  buildMonthReportPdf,
  buildRangeReportPdf,
  fileNameFor,
  pdfToBuffer,
};
