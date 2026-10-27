"use client";

const SESSION_KEY = "kira-akis-session";
const THEME_KEY = "kira-akis-theme";

export function loadSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* özel pencerede depolama kapalı olabilir; oturum yalnız çerezle sürer */
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* yoksay */
  }
}

export function readTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* yoksay */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function writeTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* yoksay */
  }
}

export async function apiRequest(url, options = {}, token = "") {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-app-token": token } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "İşlem tamamlanamadı.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

/* Para okuma/yazma tek yerde: panel, API ve bot aynı kuralı kullanır. */
import { formatMoneyShort as formatMoneyShortRaw } from "../../src/utils/money";
export { LIMITS, parseMoney, roundMoney } from "../../src/utils/money";

/* Gizlilik modu: ekrana bakan biri tutarları görmesin. Bütün tutarlar bu
   dosyadaki biçimlendiricilerden geçtiği için bayrak tek yerde tutulur;
   sayfa bayrak değişince yeniden çizilir. Girdi alanları etkilenmez. */
const PRIVACY_KEY = "kira-akis-privacy";
const MASK = "••••";
let privacy = false;

export function readPrivacy() {
  try {
    privacy = window.localStorage.getItem(PRIVACY_KEY) === "on";
  } catch {
    privacy = false;
  }
  document.documentElement.dataset.privacy = privacy ? "on" : "off";
  return privacy;
}

export function writePrivacy(next) {
  privacy = Boolean(next);
  document.documentElement.dataset.privacy = privacy ? "on" : "off";
  try {
    window.localStorage.setItem(PRIVACY_KEY, privacy ? "on" : "off");
  } catch {
    /* yoksay */
  }
}

export function isPrivate() {
  return privacy;
}

export function formatMoneyShort(value) {
  return privacy ? MASK : formatMoneyShortRaw(value);
}

const currency = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

export function formatCurrency(value) {
  if (privacy) return MASK + " TL";
  return currency.format(Number(value || 0)) + " TL";
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function formatShortDate(value, withYear = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(date);
}

export function monthName(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(date);
}

export function periodLabel(period) {
  if (!period?.month || !period?.year) return "—";
  return new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(
    new Date(period.year, period.month - 1, 1)
  );
}

export function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function initials(name = "") {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toLocaleUpperCase("tr-TR") || "KA"
  );
}

export function currentPeriod() {
  const date = new Date();
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

// Durum rengi tek başına anlam taşımaz: her zaman etiket ve simgeyle birlikte.
export function statusView(item) {
  if (item.paid) return { key: "paid", tone: "ok", label: "Ödendi" };
  if (item.partial) return { key: "partial", tone: "warn", label: "Eksik ödeme" };
  if (item.status === "overdue") return { key: "overdue", tone: "bad", label: "Gecikti" };
  if (item.status === "upcoming") return { key: "upcoming", tone: "calm", label: "Yaklaşıyor" };
  return { key: "pending", tone: "calm", label: "Ödenecek" };
}

export function statusDetail(item) {
  if (item.paid) return item.lastDate ? formatDate(item.lastDate) + " tarihinde tahsil edildi" : "Dönem tamamlandı";
  if (item.daysOverdue > 0) return item.daysOverdue + " gün gecikti";
  if (item.daysUntilDue === 0) return "Son gün bugün";
  if (item.daysUntilDue > 0) return item.daysUntilDue + " gün kaldı";
  return "Son ödeme " + formatDate(item.dueDate);
}

/* Türkçe Excel noktalı virgülle ayrılmış CSV bekler; BOM olmadan da
   ğ/ş/İ bozulur. İkisi de bilinçli. */
export function downloadCsv(filename, headers, rows) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[";\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* PDF'i jetonla çekip indirir: düz bağlantı yetki başlığını taşımaz. */
export async function downloadFile(url, token, fallbackName) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: token ? { "x-app-token": token } : {},
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error || "Dosya hazırlanamadı.");
    error.status = response.status;
    throw error;
  }

  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = match ? match[1] : fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

/* Arama tek kurala bağlı: Türkçe küçültme olmadan "İzzet" yazan kutu
   "izzet" kaydını bulamıyor. */
export function normalizeSearch(value = "") {
  return String(value).toLocaleLowerCase("tr-TR").trim();
}

export function matchesSearch(needle, ...fields) {
  if (!needle) return true;
  return fields.some((field) => normalizeSearch(field).includes(needle));
}

/* Ayın günü için iyelik eki: "1'i", "6'sı", "10'u", "20'si". Ek, sayının
   okunuşundaki son ünlüye uyar. */
const DAY_SUFFIX = { 1: "'i", 2: "'si", 3: "'ü", 4: "'ü", 5: "'i", 6: "'sı", 7: "'si", 8: "'i", 9: "'u" };
const TENS_SUFFIX = { 1: "'u", 2: "'si", 3: "'u" };

export function dayWithSuffix(day) {
  const value = Number(day) || 0;
  const ones = value % 10;
  return value + (ones ? DAY_SUFFIX[ones] : TENS_SUFFIX[Math.floor(value / 10)] || "'i");
}

/* Renk paleti: yalnız vurgu rengi ve zeminin hafif tonu değişir; durum
   renkleri (ödendi, gecikti) her palette aynı kalır ki anlam kaymasın. */
const ACCENT_KEY = "kira-akis-accent";
export const ACCENTS = [
  { id: "mavi", label: "Mavi", swatch: "#2b54d4" },
  { id: "adacayi", label: "Adaçayı", swatch: "#4f7a63" },
  { id: "lavanta", label: "Lavanta", swatch: "#6b5fb5" },
  { id: "okyanus", label: "Okyanus", swatch: "#1f7a8c" },
  { id: "seftali", label: "Şeftali", swatch: "#b8653d" },
  { id: "gul", label: "Gül", swatch: "#b0506d" },
  { id: "grafit", label: "Grafit", swatch: "#3d4655" },
];

export function readAccent() {
  let value = "mavi";
  try {
    value = window.localStorage.getItem(ACCENT_KEY) || "mavi";
  } catch {
    /* yoksay */
  }
  if (!ACCENTS.some((item) => item.id === value)) value = "mavi";
  document.documentElement.dataset.accent = value;
  return value;
}

export function writeAccent(value) {
  document.documentElement.dataset.accent = value;
  try {
    window.localStorage.setItem(ACCENT_KEY, value);
  } catch {
    /* yoksay */
  }
}
