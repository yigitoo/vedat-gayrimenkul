const Tenant = require('../models/tenant');
const Payment = require('../models/payment');
const CpiRate = require('../models/cpiRate');
const { now, formatMonthYear } = require('../utils/format');
const { buildYearGrid } = require('../utils/reports');
const { seedCpiRates, refreshCpiRates } = require('./cpi');
const { notifyRentIncreased, notifyRentIncreaseDue } = require('./notificationService');

/* TÜFE'ye göre yıllık kira artış önerisi. Saklanmaz, her istekte hesaplanır:
   kira yılı dönümü yaklaşmış (30 gün) ya da yakın zamanda geçmiş (60 gün),
   o dönüm için zam girilmemiş ve "şimdilik geç" denmemişse öneri çıkar. */

const DAY_MS = 86400000;
const DUE_BEFORE_DAYS = 30;
const DUE_AFTER_DAYS = 60;
// Dönümden biraz önce girilen zam da o yılın zammı sayılır.
const RAISED_GRACE_DAYS = 15;
const FIVE_YEARS = 5;

/* Tarihleri İstanbul gününe indir: karşılaştırmalar gün üzerinden, saat
   dilimi kaymasın. Dönen sayı UTC gece yarısı (gün anahtarı). */
function dayKey(date) {
  const d = new Date(new Date(date).getTime() + 3 * 3600000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function todayKey(reference = now()) {
  return Date.UTC(reference.year(), reference.month(), reference.date());
}

// 29 Şubat'ta başlayan sözleşme artık olmayan yılda 28 Şubat'a düşer.
function addYears(key, years) {
  const d = new Date(key);
  const year = d.getUTCFullYear() + years;
  const month = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay));
}

function isoDay(key) {
  return new Date(key).toISOString().slice(0, 10);
}

/* Kira yılının başlangıcı: sözleşme başlangıcı girildiyse o; girilmediyse
   tabloda ilk işaretlenen kutunun (ilk ödemenin dönemi) ayının 1'i. Hiç
   ödeme yoksa ilk kira kaydının tarihi. */
function tenancyStart(tenant, firstPaid = null) {
  if (tenant.contractStart) return tenant.contractStart;
  if (firstPaid) return new Date(Date.UTC(firstPaid.year, firstPaid.month - 1, 1, 9));
  const first = (tenant.rentHistory || [])
    .map((item) => item.effectiveFrom)
    .filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b))[0];
  return first || null;
}

// Yasal tavanı aşmamak için aşağı yuvarlanır (10 TL'ye).
function floorTo10(value) {
  return Math.floor(value / 10) * 10;
}

/* Bu kiracının içinde bulunduğu kira yılının dönümü: yaklaşan ya da son
   60 gün içinde geçmiş olan. Uzaklık burada sınırlanmaz; öneri, dönüme 30
   gün kaldıysa ya da o kira yılının 12 kutusu dolduysa çıkar. */
function dueAnniversary(tenant, today, firstPaid = null) {
  const start = tenancyStart(tenant, firstPaid);
  if (!start) return null;
  const startKey = dayKey(start);
  for (let years = 1; years <= 60; years += 1) {
    const key = addYears(startKey, years);
    const diff = Math.round((key - today) / DAY_MS);
    if (diff >= -DUE_AFTER_DAYS) return { key, years, daysUntil: diff, startKey };
  }
  return null;
}

function alreadyRaised(tenant, anniversaryKey) {
  const limit = anniversaryKey - RAISED_GRACE_DAYS * DAY_MS;
  // İlk kayıt ve tutar düzeltmesi (previousAmount 0) zam sayılmaz.
  return (tenant.rentHistory || []).some((item) =>
    item.effectiveFrom && Number(item.previousAmount) > 0 && dayKey(item.effectiveFrom) >= limit);
}

function isDismissed(tenant, anniversaryKey) {
  return (tenant.raiseDismissedFor || []).some((date) => dayKey(date) === anniversaryKey);
}

/* Dönümden önceki ayın TÜFE verisi esas (TBK 344). Henüz açıklanmadıysa
   eldeki son oran "geçici" olarak kullanılır. */
function pickRate(rates, anniversaryKey) {
  const d = new Date(anniversaryKey);
  const targetIndex = d.getUTCFullYear() * 12 + d.getUTCMonth() - 1;
  const target = { year: Math.floor(targetIndex / 12), month: (targetIndex % 12) + 1 };
  const exact = rates.find((row) => row.year === target.year && row.month === target.month);
  if (exact) return { row: exact, provisional: false, target };
  const older = rates.find((row) => row.year * 12 + row.month - 1 <= targetIndex) || rates[0] || null;
  return older ? { row: older, provisional: true, target } : null;
}

/* Biten kira yılının 12 ayı: dönüm ayından bir yıl öncesinden başlayarak.
   Ödendi bilgisi ödeme tablosunun (buildYearGrid) hücre durumundan gelir. */
function rentYearMonths(anniversaryKey) {
  const d = new Date(anniversaryKey);
  const first = (d.getUTCFullYear() - 1) * 12 + d.getUTCMonth();
  return Array.from({ length: 12 }, (unused, index) => ({
    year: Math.floor((first + index) / 12),
    month: ((first + index) % 12) + 1,
  }));
}

async function paidMonthsFor(items) {
  const years = new Set();
  for (const item of items) rentYearMonths(item.anniversary.key).forEach((m) => years.add(m.year));
  const tenants = items.map((item) => item.tenant);
  const ids = tenants.map((tenant) => tenant._id);
  const status = new Map();
  for (const year of years) {
    const payments = await Payment.find({ tenant: { $in: ids }, year }).select('tenant amount month year date').lean();
    const grid = buildYearGrid({ year, tenants, payments });
    for (const row of grid.rows) {
      for (const cell of row.months) status.set(row.tenantId + ':' + year + ':' + cell.month, cell.status === 'paid');
    }
  }
  return (tenant, anniversaryKey) => rentYearMonths(anniversaryKey)
    .filter((m) => status.get(tenant._id.toString() + ':' + m.year + ':' + m.month)).length;
}

function buildSuggestion(tenant, anniversary, picked, paidMonths) {
  const currentRent = tenant.rentAmount;
  const rate = picked ? picked.row.rate : null;
  const exactCap = rate === null ? null : currentRent * (1 + rate / 100);
  const suggestion = {
    tenantId: tenant._id.toString(),
    name: tenant.name,
    address: tenant.address,
    currentRent,
    anniversary: isoDay(anniversary.key),
    daysUntil: anniversary.daysUntil,
    rate,
    rateYear: picked ? picked.row.year : null,
    rateMonth: picked ? picked.row.month : null,
    rateLabel: picked ? formatMonthYear(picked.row.month, picked.row.year) : '',
    rateIsProvisional: picked ? picked.provisional : true,
    expectedRateYear: picked ? picked.target.year : null,
    expectedRateMonth: picked ? picked.target.month : null,
    suggestedRent: exactCap === null ? null : floorTo10(exactCap),
    maxLegalRent: exactCap === null ? null : Math.floor(exactCap),
    allPaid: paidMonths === 12,
    paidMonths,
    fiveYearNote: anniversary.years >= FIVE_YEARS,
    yearsOfTenancy: anniversary.years,
  };
  const contractRate = Number(tenant.increaseRate) || 0;
  if (contractRate > 0 && rate !== null && contractRate < rate) {
    suggestion.contractRate = contractRate;
    suggestion.contractRateRent = floorTo10(currentRent * (1 + contractRate / 100));
  }
  return suggestion;
}

async function getSuggestions({ reference = now(), tenantId = null } = {}) {
  await seedCpiRates();
  const today = todayKey(reference);
  const filter = { isActive: true, deletedAt: null };
  if (tenantId) filter._id = tenantId;
  const [tenants, rates] = await Promise.all([
    Tenant.find(filter).sort({ name: 1 }),
    CpiRate.find({}).sort({ year: -1, month: -1 }).lean(),
  ]);

  // Sözleşme başlangıcı olmayanlar için ilk işaretlenen kutu (ilk ödeme dönemi).
  const firstPaid = new Map();
  const noContract = tenants.filter((tenant) => !tenant.contractStart).map((tenant) => tenant._id);
  if (noContract.length) {
    const rows = await Payment.aggregate([
      { $match: { tenant: { $in: noContract }, amount: { $gt: 0 } } },
      { $group: { _id: '$tenant', first: { $min: { $add: [{ $multiply: ['$year', 12] }, { $subtract: ['$month', 1] }] } } } },
    ]);
    for (const row of rows) {
      firstPaid.set(row._id.toString(), { year: Math.floor(row.first / 12), month: (row.first % 12) + 1 });
    }
  }

  const due = [];
  for (const tenant of tenants) {
    const anniversary = dueAnniversary(tenant, today, firstPaid.get(tenant._id.toString()) || null);
    if (!anniversary) continue;
    if (alreadyRaised(tenant, anniversary.key)) continue;
    if (isDismissed(tenant, anniversary.key)) continue;
    due.push({ tenant, anniversary });
  }
  if (!due.length) return [];

  const countPaid = await paidMonthsFor(due);
  return due
    .map(({ tenant, anniversary }) => buildSuggestion(
      tenant,
      anniversary,
      pickRate(rates, anniversary.key),
      countPaid(tenant, anniversary.key)
    ))
    // 30 günden uzak dönüm yalnız o kira yılının 12 kutusu dolduysa sorulur.
    .filter((item) => item.daysUntil <= DUE_BEFORE_DAYS || item.allPaid)
    .sort((a, b) => a.anniversary.localeCompare(b.anniversary) || a.name.localeCompare(b.name, 'tr'));
}

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/* Öneriyi onayla: tenants.js'teki computeRaise ile aynı zam kaydı düşer. */
async function applySuggestion({ tenantId, amount, effectiveFrom, rate }, { reference = now() } = {}) {
  // tenants.js tembel yüklenir; API yönlendiricisi de böyle çalışıyor.
  const { computeRaise } = require('../api/tenants');
  const [suggestion] = await getSuggestions({ reference, tenantId });
  if (!suggestion) throw requestError('Bu kiracı için bekleyen bir artış önerisi yok.', 404);

  /* Oranı kullanıcı yazar (yıllık zam oranı); yazmazsa kayıtlı TÜFE oranı
     yalnız not için kullanılır. Tutar her durumda kullanıcıdan gelir; TÜFE
     önerisine düşmek yalnız eski istemciler için. */
  const userRate = rate === undefined || rate === null || String(rate).trim() === ''
    ? null
    : Number(String(rate).replace(',', '.'));
  if (userRate !== null && (!Number.isFinite(userRate) || userRate < 0 || userRate > 200)) {
    throw requestError('Zam oranı 0 ile 200 arasında olmalı.');
  }

  const value = amount === undefined || amount === null || amount === '' ? suggestion.suggestedRent : amount;
  const numeric = Number(String(value).replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(numeric) || numeric <= 0) throw requestError('Yeni kira tutarı sıfırdan büyük olmalı.');

  const tenant = await Tenant.findById(tenantId);
  const note = userRate !== null
    ? 'Yıllık artış %' + String(userRate).replace('.', ',')
    : suggestion.rate !== null
      ? 'TÜFE %' + String(suggestion.rate).replace('.', ',') + ' (' + suggestion.rateLabel + ') ile yıllık artış'
      : 'Yıllık artış';
  let raise;
  try {
    raise = computeRaise(tenant, {
      amount: value,
      effectiveFrom: effectiveFrom || suggestion.anniversary,
      note,
    });
  } catch (error) {
    throw requestError(error.message);
  }

  tenant.rentAmount = raise.amount;
  tenant.rentHistory.push(raise);
  await tenant.save();
  const notification = await notifyRentIncreased(tenant, raise);

  const warning = suggestion.maxLegalRent && raise.amount > suggestion.maxLegalRent
    ? 'Yeni kira TÜFE tavanını (' + new Intl.NumberFormat('tr-TR').format(suggestion.maxLegalRent) + ' TL) aşıyor.'
    : null;
  return { applied: { tenantId, amount: raise.amount, previousAmount: raise.previousAmount, effectiveFrom: raise.effectiveFrom.toISOString() }, warning, notification };
}

async function dismissSuggestion({ tenantId, anniversary }) {
  const date = new Date(anniversary);
  if (!anniversary || Number.isNaN(date.getTime())) throw requestError('Geçersiz dönüm tarihi.');
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw requestError('Kiracı bulunamadı.', 404);
  // "YYYY-AA-GG" UTC gece yarısı gelir; İstanbul gününe denk gelsin diye öğlene al.
  const key = /^\d{4}-\d{2}-\d{2}$/.test(String(anniversary))
    ? Date.UTC(...String(anniversary).split('-').map((part, index) => Number(part) - (index === 1 ? 1 : 0)))
    : dayKey(date);
  if (!isDismissed(tenant, key)) {
    tenant.raiseDismissedFor.push(new Date(key + 9 * 3600000));
    await tenant.save();
  }
  return { dismissed: { tenantId, anniversary: isoDay(key) } };
}

/* Cron kancası: oranı tazele, yeni vadesi gelen önerileri bir kez bildir.
   Bildirim anahtarı kiracı + dönüm; aynı dönüm için ikinci mesaj gitmez. */
async function runRentIncreaseCheck({ reference = now() } = {}) {
  try {
    const cpi = await refreshCpiRates({ reference });
    const suggestions = await getSuggestions({ reference });
    const notified = [];
    for (const suggestion of suggestions) {
      if (suggestion.rate === null) continue;
      const result = await notifyRentIncreaseDue(suggestion);
      if (result.sent || result.email?.sent) notified.push(suggestion.name);
    }
    return { cpi, due: suggestions.length, notified };
  } catch (error) {
    console.error('Kira artış kontrolü başarısız:', error);
    return { error: error.message };
  }
}

module.exports = {
  applySuggestion,
  dismissSuggestion,
  getSuggestions,
  runRentIncreaseCheck,
};
