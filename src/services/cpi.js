const CpiRate = require('../models/cpiRate');
const { now } = require('../utils/format');

/* Kira artış oranı (TÜFE 12 aylık ortalamalara göre değişim, TBK 344).
   Satırlar TÜFE verisinin ayına göre tutulur: Eylül 2026 verisi 3 Ekim'de
   açıklanır, Ekim'de dolan kira yılına uygulanır.

   Tohum verisi iki kaynaktan karşılaştırıldı: mcthukuk.com tablosu (yayımlanan
   oran) ve TCMB'nin aylık/yıllık TÜFE tablosundan yeniden hesaplanan 12 aylık
   ortalama. Tüm aylar birebir tuttu; yalnız Temmuz 2025'te hesap 41,12 verdi
   (yuvarlama), yayımlanan değer 41,13. 2026 satırları ayrıca ersindogan.av.tr
   tablosuyla da aynı. Ocak–Haziran 2024 konutta geçici %25 sınırı vardı; oran
   burada yine TÜFE ortalaması olarak durur. */
const SEED_SOURCE = 'https://mcthukuk.com/tr/hesaplamalar/kira-artis-orani-hesaplama';
const SEED_RATES = [
  [2024, 1, 54.72], [2024, 2, 55.91], [2024, 3, 57.50], [2024, 4, 59.64],
  [2024, 5, 62.51], [2024, 6, 65.07], [2024, 7, 65.93], [2024, 8, 64.91],
  [2024, 9, 63.47], [2024, 10, 62.02], [2024, 11, 60.45], [2024, 12, 58.51],
  [2025, 1, 56.35], [2025, 2, 53.83], [2025, 3, 51.26], [2025, 4, 48.73],
  [2025, 5, 45.80], [2025, 6, 43.23], [2025, 7, 41.13], [2025, 8, 39.62],
  [2025, 9, 38.36], [2025, 10, 37.15], [2025, 11, 35.91], [2025, 12, 34.88],
  [2026, 1, 33.98], [2026, 2, 33.39], [2026, 3, 32.82], [2026, 4, 32.43],
  [2026, 5, 32.24], [2026, 6, 32.03], [2026, 7, 31.90], [2026, 8, 31.79],
  [2026, 9, 31.49],
];

const MONTHS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
const MONTH_PATTERN = '(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)';
const FETCH_TIMEOUT_MS = 10000;
const TCMB_URL = 'https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Enflasyon+Verileri/Tuketici+Fiyatlari';
const ERSIN_URL = 'https://ersindogan.av.tr/kira-artisi-hesaplama';
// Yayımlanan oranla TCMB'den hesaplanan arasında kabul edilen fark (yuvarlama payı).
const AGREE_TOLERANCE = 0.05;

let seeded = false;

function monthIndex(year, month) {
  return year * 12 + (month - 1);
}

function fromIndex(index) {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function monthNumber(name) {
  return MONTHS.indexOf(String(name).toLocaleLowerCase('tr')) + 1;
}

function serializeRate(row) {
  if (!row) return null;
  return {
    year: row.year,
    month: row.month,
    rate: row.rate,
    source: row.source,
    sourceUrl: row.sourceUrl || '',
    fetchedAt: row.fetchedAt ? new Date(row.fetchedAt).toISOString() : null,
  };
}

/* Tohum: yalnız eksik ayları ekler ($setOnInsert). Elle girilen ya da webden
   gelen değerin üstüne asla yazmaz; her çağrıda güvenle tekrar çalışır. */
async function seedCpiRates({ force = false } = {}) {
  if (seeded && !force) return { inserted: 0, cached: true };
  const result = await CpiRate.bulkWrite(SEED_RATES.map(([year, month, rate]) => ({
    updateOne: {
      filter: { year, month },
      update: { $setOnInsert: { year, month, rate, source: 'seed', sourceUrl: SEED_SOURCE, fetchedAt: new Date() } },
      upsert: true,
    },
  })), { ordered: false });
  seeded = true;
  return { inserted: result.upsertedCount || 0 };
}

async function listRates(limit = 24) {
  const rows = await CpiRate.find({}).sort({ year: -1, month: -1 }).limit(limit).lean();
  return rows.map(serializeRate);
}

async function latestRate() {
  return serializeRate(await CpiRate.findOne({}).sort({ year: -1, month: -1 }).lean());
}

/* Elle giriş/düzeltme: TÜİK açıkladı ama otomatik çekme tutmadıysa. */
async function setManualRate({ year, month, rate }) {
  const y = Number(year);
  const m = Number(month);
  const r = Number(String(rate ?? '').replace(',', '.'));
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new Error('Geçersiz yıl.');
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error('Geçersiz ay.');
  if (!Number.isFinite(r) || r < 0 || r > 150) throw new Error('Oran 0-150 arasında olmalı.');
  const row = await CpiRate.findOneAndUpdate(
    { year: y, month: m },
    { $set: { rate: Math.round(r * 100) / 100, source: 'manual', sourceUrl: '', fetchedAt: new Date() } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean();
  return serializeRate(row);
}

/* Bugün itibarıyla açıklanmış olması gereken en son TÜFE ayı. TÜİK her ayın
   3'ünde (10:00) bir önceki ayı açıklar; 3'ünden önce iki ay geriye bakılır. */
function expectedLatestMonth(reference = now()) {
  const back = reference.date() >= 3 ? 1 : 2;
  return fromIndex(monthIndex(reference.year(), reference.month() + 1) - back);
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ');
}

function parseTrNumber(value) {
  return Number(String(value).replace(/\./g, '').replace(',', '.'));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; VedatGayrimenkul/1.0; +kira-artis)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'tr-TR,tr;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.text();
}

/* Kaynak 1 — mcthukuk.com tablosu: satır "Eylül 2026 %31,49 %31,49 ..."
   biçiminde; ilk yüzde TÜFE 12 aylık ortalaması, ay TÜFE veri ayı. */
function parseMcthukuk(html) {
  const text = htmlToText(html);
  const pattern = new RegExp(MONTH_PATTERN + ' (20\\d{2}) %\\s?(\\d{1,3},\\d{1,2})', 'g');
  const rows = new Map();
  for (const match of text.matchAll(pattern)) {
    const month = monthNumber(match[1]);
    const year = Number(match[2]);
    const key = monthIndex(year, month);
    if (!rows.has(key)) rows.set(key, { year, month, rate: parseTrNumber(match[3]) });
  }
  return [...rows.values()];
}

/* Kaynak 2 — ersindogan.av.tr tablosu: "Ekim 2026 Eylül 2026 %31,49"
   (yenileme ayı, TÜFE veri ayı, oran). Biz veri ayını alırız. */
function parseErsinDogan(html) {
  const text = htmlToText(html);
  const pattern = new RegExp(MONTH_PATTERN + ' (20\\d{2}) ' + MONTH_PATTERN + ' (20\\d{2}) %\\s?(\\d{1,3},\\d{1,2})', 'g');
  const rows = new Map();
  for (const match of text.matchAll(pattern)) {
    const renewal = monthIndex(Number(match[2]), monthNumber(match[1]));
    const month = monthNumber(match[3]);
    const year = Number(match[4]);
    const key = monthIndex(year, month);
    // Tablo dışı cümleleri ele: veri ayı yenileme ayından tam bir önce olmalı.
    if (renewal - key !== 1) continue;
    if (!rows.has(key)) rows.set(key, { year, month, rate: parseTrNumber(match[5]) });
  }
  return [...rows.values()];
}

/* Kaynak 3 — TCMB tüketici fiyatları tablosu (resmî): "09-2026 29.73 1.84"
   yani ay, yıllık % ve aylık %. 12 aylık ortalama değişim buradan hesaplanır:
   son 12 ayın endeksleri aylık değişimle zincirlenir, bir yıl önceki endeksler
   yıllık değişimle bulunur; oran = ort(son 12) / ort(önceki 12) - 1. */
function parseTcmb(html) {
  const text = htmlToText(html);
  const series = [];
  for (const match of text.matchAll(/(\d{2})-(20\d{2}) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)) {
    const month = Number(match[1]);
    const year = Number(match[2]);
    if (month < 1 || month > 12) continue;
    series.push({ key: monthIndex(year, month), year, month, annual: Number(match[3]), monthly: Number(match[4]) });
  }
  const byKey = new Map(series.map((row) => [row.key, row]));
  const rows = [];
  for (const row of byKey.values()) {
    let level = 1;
    let recent = 0;
    let previous = 0;
    let complete = true;
    for (let k = 0; k < 12; k += 1) {
      const item = byKey.get(row.key - k);
      if (!item) { complete = false; break; }
      recent += level;
      previous += level / (1 + item.annual / 100);
      level /= 1 + item.monthly / 100;
    }
    if (!complete) continue;
    rows.push({ year: row.year, month: row.month, rate: Math.round((recent / previous - 1) * 10000) / 100 });
  }
  return rows;
}

const SOURCES = [
  { id: 'mcthukuk', url: SEED_SOURCE, parse: parseMcthukuk, published: true },
  { id: 'ersindogan', url: ERSIN_URL, parse: parseErsinDogan, published: true },
  { id: 'tcmb', url: TCMB_URL, parse: parseTcmb, published: false },
];

function saneRate(rate) {
  return Number.isFinite(rate) && rate > 0 && rate < 150;
}

/* Bir ay için kaynakların değerlerinden birini seç. Yayımlanan oran tercih
   edilir; TCMB hesabı varsa onunla tutmalı (yuvarlama payı içinde). İki
   yayımlanan kaynak kendi aralarında tutuyorsa o değer alınır; aksi hâlde
   resmî TCMB hesabı esas. */
function pickValue(candidates) {
  const official = candidates.find((item) => item.source === 'tcmb');
  const published = candidates.filter((item) => item.source !== 'tcmb');
  if (!official) {
    if (published.length > 1 && Math.abs(published[0].rate - published[1].rate) > AGREE_TOLERANCE) return null;
    return published[0] || null;
  }
  const agreeing = published.find((item) => Math.abs(item.rate - official.rate) <= AGREE_TOLERANCE);
  if (agreeing) return agreeing;
  if (published.length > 1 && Math.abs(published[0].rate - published[1].rate) <= AGREE_TOLERANCE) return published[0];
  return official;
}

/* Günlük cron'dan çağrılır, ucuz olsun diye: beklenen son ay zaten varsa ya da
   ayın 3'ü gelmemişse hiç ağa çıkmaz. Eksik aylar (en çok 12) doldurulur;
   var olan satıra (tohum, web, elle) asla dokunmaz. Hata fırlatmaz. */
async function refreshCpiRates({ reference = now(), force = false } = {}) {
  try {
    await seedCpiRates();
    const expected = expectedLatestMonth(reference);
    const expectedKey = monthIndex(expected.year, expected.month);
    const latest = await CpiRate.findOne({}).sort({ year: -1, month: -1 }).lean();
    const latestKey = latest ? monthIndex(latest.year, latest.month) : expectedKey - 12;

    if (latestKey >= expectedKey) {
      return { updated: false, reason: 'up_to_date', expected };
    }
    if (!force && reference.date() < 3) {
      return { updated: false, reason: 'not_announced_yet', expected };
    }

    const wanted = [];
    for (let key = Math.max(latestKey + 1, expectedKey - 11); key <= expectedKey; key += 1) wanted.push(key);

    const results = await Promise.allSettled(SOURCES.map(async (source) => {
      const rows = source.parse(await fetchText(source.url));
      return { source, rows };
    }));

    const errors = [];
    const candidates = new Map();
    results.forEach((result, index) => {
      const source = SOURCES[index];
      if (result.status !== 'fulfilled') {
        errors.push(source.id + ': ' + (result.reason?.message || 'hata'));
        return;
      }
      if (!result.value.rows.length) errors.push(source.id + ': tablo bulunamadı');
      for (const row of result.value.rows) {
        const key = monthIndex(row.year, row.month);
        if (!wanted.includes(key) || !saneRate(row.rate)) continue;
        const list = candidates.get(key) || [];
        list.push({ ...row, source: source.id, url: source.url });
        candidates.set(key, list);
      }
    });

    const inserted = [];
    for (const key of wanted) {
      const pick = pickValue(candidates.get(key) || []);
      if (!pick) continue;
      // $setOnInsert: arada elle girilmiş bir değer varsa üstüne yazılmaz.
      const write = await CpiRate.updateOne(
        { year: pick.year, month: pick.month },
        { $setOnInsert: { year: pick.year, month: pick.month, rate: pick.rate, source: 'web', sourceUrl: pick.url, fetchedAt: new Date() } },
        { upsert: true }
      );
      if (write.upsertedCount) inserted.push({ year: pick.year, month: pick.month, rate: pick.rate, from: pick.source });
    }

    if (!inserted.length) {
      return {
        updated: false,
        reason: candidates.size ? 'no_agreeing_value' : 'not_published_yet',
        expected,
        errors,
      };
    }
    return { updated: true, inserted, expected, errors };
  } catch (error) {
    console.error('TÜFE oranı güncellenemedi:', error);
    return { updated: false, reason: 'error', error: error.message };
  }
}

module.exports = {
  SEED_RATES,
  expectedLatestMonth,
  latestRate,
  listRates,
  parseErsinDogan,
  parseMcthukuk,
  parseTcmb,
  refreshCpiRates,
  seedCpiRates,
  serializeRate,
  setManualRate,
};
