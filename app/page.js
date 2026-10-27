"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsClockwise,
  ArrowUpRight,
  BellRinging,
  Buildings,
  Bus,
  CalendarBlank,
  CalendarX,
  CaretLeft,
  CaretRight,
  ChartLineUp,
  CheckCircle,
  Clock,
  DownloadSimple,
  Envelope,
  GearSix,
  HandCoins,
  List,
  ListChecks,
  MagnifyingGlass,
  Notebook,
  Moon,
  Palette,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Pulse,
  Receipt,
  ShieldCheck,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  FilePdf,
  SignOut,
  SquaresFour,
  Sun,
  TrendUp,
  Trash,
  UserPlus,
  UsersThree,
  Wallet,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

import CalendarBoard from "./components/Calendar";
import BusBoard from "./components/BusBoard";
import { BusDaySheet, BusSheet } from "./components/BusSheets";
import DuesView from "./components/Dues";
import MonthSheet from "./components/MonthSheet";
import LedgerView from "./components/Ledger";
import TodosView from "./components/Todos";
import PaymentGrid from "./components/PaymentGrid";
import ReportsView from "./components/Reports";
import SettingsView from "./components/Settings";
import {
  DeferSheet,
  ExpenseSheet,
  PaymentSheet,
  RecurrenceSheet,
  RentDaySheet,
  TenantDetailSheet,
  TenantSheet,
} from "./components/Sheets";
import {
  apiRequest,
  clearSession,
  currentPeriod,
  downloadFile,
  formatCurrency,
  formatDate,
  formatShortDate,
  initials,
  loadSession,
  matchesSearch,
  monthName,
  normalizeSearch,
  periodLabel,
  ACCENTS,
  readAccent,
  readPrivacy,
  readTheme,
  saveSession,
  statusDetail,
  statusView,
  writeAccent,
  writePrivacy,
  writeTheme,
} from "./lib/client";
import { ConfirmHost, Toast, askConfirm } from "./components/Feedback";
import CommandPalette from "./components/CommandPalette";
import { RaiseSheet, RaiseSuggestions } from "./components/Raises";

const BRAND = "Vedat Gayrimenkul";

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/* Otobüs raporunun tarih aralığı. Hazır dönemler (3/6/12 ay) seçili ayda
   biter; o ay bu aysa bitiş bugündür, gelmemiş günler "kayıtsız" sayılmasın. */
function busRangeFor(span, period, custom) {
  if (span === "custom") return custom;
  if (typeof span !== "number" || !period.year) return { start: "", end: "" };
  const start = new Date(period.year, period.month - span, 1);
  const monthEnd = new Date(period.year, period.month, 0);
  const today = new Date();
  return { start: dateKey(start), end: dateKey(monthEnd > today ? today : monthEnd) };
}

const MONTH_LONG = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const VIEWS = [
  { id: "overview", label: "Özet", icon: SquaresFour, lead: "Dönemin tahsilat resmi ve sıradaki ödemeler.", primary: true, group: "Genel" },
  { id: "calendar", label: "Takvim", icon: CalendarBlank, lead: "Hangi gün kimden ne bekleniyor.", primary: true, group: "Genel" },
  { id: "payments", label: "Ödemeler", icon: Wallet, lead: "Yıl tablosu ve dönem defteri: kim ödedi, kim gecikti.", primary: true, group: "Kira" },
  { id: "tenants", label: "Kiracılar", icon: UsersThree, lead: "Sözleşmeler, kira tutarları ve zam önerileri.", primary: true, group: "Kira" },
  { id: "dues", label: "Aidat", icon: Buildings, lead: "Apartman ve site aidatı: hangi ay ödendi.", group: "Kira" },
  { id: "bus", label: "Otobüs", icon: Bus, lead: "Hat defteri: gün gün hasılat, mazot, yövmiye.", group: "İşletme" },
  { id: "ledger", label: "Gider notları", icon: Notebook, lead: "Her şeyden bağımsız harcamalar: gün gün, ay ay.", group: "İşletme" },
  { id: "todos", label: "Yapılacaklar", icon: ListChecks, lead: "Güne not düş, saatine kadar geri sayım işlesin.", group: "Planlama" },
  { id: "reports", label: "Raporlar", icon: ChartLineUp, lead: "Aylara yayılan tahsilat, gider ve aylık tam rapor.", group: "Planlama" },
  { id: "activity", label: "Akış", icon: Pulse, lead: "Son kayıtlar ve bildirim geçmişi.", group: "Planlama" },
];

const SETTINGS_VIEW = {
  id: "settings",
  label: "Ayarlar",
  icon: GearSix,
  lead: "Bildirimler, TÜFE oranları ve oturum.",
};

const ALL_VIEWS = [...VIEWS, SETTINGS_VIEW];
const PRIMARY_VIEWS = VIEWS.filter((item) => item.primary);
const MORE_VIEWS = [...VIEWS.filter((item) => !item.primary), SETTINGS_VIEW];
const NAV_GROUPS = VIEWS.reduce((groups, item) => {
  const last = groups[groups.length - 1];
  if (last && last.label === item.group) last.items.push(item);
  else groups.push({ label: item.group, items: [item] });
  return groups;
}, []);

/* Adres çubuğundaki ekran adı: geri tuşu ve paylaşılan bağlantı aynı yere döner. */
const SCREEN_SLUGS = {
  overview: "ozet",
  calendar: "takvim",
  payments: "odemeler",
  tenants: "kiracilar",
  dues: "aidat",
  bus: "otobus",
  ledger: "gidernotlari",
  todos: "yapilacaklar",
  reports: "raporlar",
  activity: "akis",
  settings: "ayarlar",
};
const TONE_ICON = { ok: CheckCircle, warn: Clock, bad: WarningCircle, calm: Clock };

/* ---------- Giriş ---------- */

function AuthGate({ onSubmit, onVerify, onReset, challenge, error, busy }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  return (
    <main className="auth">
      <section className="auth-card glass glass--panel" aria-labelledby="auth-title">
        <div className="auth-mark">
          <img src="/icons/vedat-mark.svg" alt="" width="40" height="40" />
          <strong>{BRAND}</strong>
        </div>

        <h1 id="auth-title">Kiranın akışı belli olsun.</h1>
        <p className="auth-copy">
          Kiracı, ödeme, gider ve bildirimleri tek merkezden takip edin. Telegram botu da
          aynı veriye bakar.
        </p>

        {challenge ? (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              onVerify(code.replace(/\s+/g, ""));
            }}
          >
            <div className="field">
              <label htmlFor="panel-code">E-posta kodu</label>
              <input
                id="panel-code"
                className="auth-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                autoFocus
                required
              />
              <p className="auth-note">
                <EnvelopeSimple weight="fill" />
                6 haneli kod gönderildi: {challenge.sentTo}. 10 dakika geçerli.
              </p>
            </div>

            {error ? (
              <p className="form-error" role="alert">
                <WarningCircle weight="fill" />
                {error}
              </p>
            ) : null}

            <button
              className={"btn btn-primary btn-wide" + (busy ? " is-busy" : "")}
              type="submit"
              disabled={busy || code.length !== 6}
            >
              Doğrula ve gir
            </button>

            <div className="auth-links">
              <button
                type="button"
                className="btn btn-quiet"
                disabled={busy}
                onClick={() => {
                  setCode("");
                  onSubmit(password.trim());
                }}
              >
                Yeni kod gönder
              </button>
              <button
                type="button"
                className="btn btn-quiet"
                disabled={busy}
                onClick={() => {
                  setCode("");
                  onReset();
                }}
              >
                Şifreye dön
              </button>
            </div>
          </form>
        ) : (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(password.trim());
            }}
          >
            <div className="field">
              <label htmlFor="panel-password">Panel şifresi</label>
              <input
                id="panel-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {error ? (
              <p className="form-error" role="alert">
                <WarningCircle weight="fill" />
                {error}
              </p>
            ) : null}

            <button className={"btn btn-primary btn-wide" + (busy ? " is-busy" : "")} type="submit" disabled={busy}>
              Kod gönder
            </button>

            <p className="auth-note">
              <ShieldCheck weight="fill" />
              Her girişte e-postana ve Telegram&apos;a tek kullanımlık kod gelir; oturum 30 gün açık kalır.
            </p>
          </form>
        )}
      </section>
    </main>
  );
}

/* ---------- Renk paleti ----------
   Üst şeritteki palet düğmesi küçük bir pencere açar: yedi yumuşak ton ve
   açık/koyu seçimi. Dışarı tıklayınca ya da Esc ile kapanır. */

function AccentPicker({ accent, theme, onAccent, onTheme }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="accent-wrap" ref={wrapRef}>
      <button
        className={"icon-btn topbar-accent" + (open ? " is-active" : "")}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Renk paleti"
        title="Renk paleti"
      >
        <Palette weight="bold" />
      </button>
      {open ? (
        <div className="accent-pop" role="dialog" aria-label="Renk paleti">
          <p className="eyebrow">Renk paleti</p>
          <div className="accent-grid" role="radiogroup" aria-label="Vurgu rengi">
            {ACCENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={accent === item.id}
                className={"accent-swatch" + (accent === item.id ? " is-active" : "")}
                style={{ "--sw": item.swatch }}
                onClick={() => onAccent(item.id)}
              >
                <i />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="accent-row">
            <button
              className={"btn btn-sm " + (theme === "light" ? "btn-primary" : "btn-glass")}
              type="button"
              onClick={() => theme !== "light" && onTheme()}
            >
              <Sun weight="bold" />
              Açık
            </button>
            <button
              className={"btn btn-sm " + (theme === "dark" ? "btn-primary" : "btn-glass")}
              type="button"
              onClick={() => theme !== "dark" && onTheme()}
            >
              <Moon weight="bold" />
              Koyu
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Aylık bütün rapor ----------
   Bütün sekmeler tek PDF'te: kira, aidat, giderler, gider notları, otobüs
   ve gündem. Her ayın 1'inde geçen ayınki kendiliğinden e-postayla gelir;
   buradan istenen ay indirilir ya da hemen gönderilir. */

function FullReportCard({ token, onFlash, onAuthError }) {
  const [target, setTarget] = useState(() => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - 1);
    return { month: date.getMonth() + 1, year: date.getFullYear() };
  });
  const [busy, setBusy] = useState("");

  function shift(delta) {
    const date = new Date(target.year, target.month - 1 + delta, 1);
    setTarget({ month: date.getMonth() + 1, year: date.getFullYear() });
  }

  async function download() {
    setBusy("pdf");
    try {
      await downloadFile(
        "/api/reports?kind=full&month=" + target.month + "&year=" + target.year + "&format=pdf",
        token,
        "vedat-gayrimenkul-" + target.year + "-" + String(target.month).padStart(2, "0") + "-butun-rapor.pdf"
      );
      onFlash("ok", periodLabel(target) + " bütün raporu indirildi.");
    } catch (error) {
      if (error.status === 401) onAuthError();
      else onFlash("bad", error.message);
    } finally {
      setBusy("");
    }
  }

  async function email() {
    setBusy("mail");
    try {
      const result = await apiRequest(
        "/api/reports",
        { method: "POST", body: JSON.stringify({ kind: "full", action: "email", month: target.month, year: target.year }) },
        token
      );
      onFlash("ok", periodLabel(target) + " raporu " + (result.recipients || []).join(", ") + " adresine gönderildi.");
    } catch (error) {
      if (error.status === 401) onAuthError();
      else onFlash("bad", "E-posta gönderilemedi: " + error.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <article className="panel glass full-report">
      <div className="full-report-copy">
        <span className="raise-mark"><FilePdf weight="bold" /></span>
        <div>
          <p className="eyebrow">Aylık bütün rapor</p>
          <h2>Her şey tek PDF&apos;te</h2>
          <p className="muted">Kira, aidat, giderler, gider notları, otobüs ve gündem. Her ayın 1&apos;inde geçen ayınki e-postana gelir.</p>
        </div>
      </div>
      <div className="full-report-actions">
        <div className="period">
          <button type="button" onClick={() => shift(-1)} aria-label="Önceki ay"><CaretLeft weight="bold" /></button>
          <strong>{periodLabel(target)}</strong>
          <button type="button" onClick={() => shift(1)} aria-label="Sonraki ay"><CaretRight weight="bold" /></button>
        </div>
        <button className={"btn btn-glass" + (busy === "mail" ? " is-busy" : "")} type="button" onClick={email} disabled={Boolean(busy)}>
          <PaperPlaneTilt weight="bold" />
          E-postala
        </button>
        <button className={"btn btn-primary" + (busy === "pdf" ? " is-busy" : "")} type="button" onClick={download} disabled={Boolean(busy)}>
          <DownloadSimple weight="bold" />
          PDF indir
        </button>
      </div>
    </article>
  );
}

/* ---------- Ayın nabzı ----------
   Takvimin üstünde o ayın para resmi: beklenen, gelen, kalan, gider, net.
   Takvimde ay değişince bu şerit de o aya döner. */

function MonthPulse({ metrics, period }) {
  const rate = Math.min(Math.max(metrics.collectionRate || 0, 0), 100);
  const items = [
    { key: "expected", label: "Beklenen kira", value: metrics.totalExpected, meta: metrics.tenantCount + " kiracı" },
    { key: "received", label: "Tahsil edilen", value: metrics.totalReceived, meta: "%" + rate + " tamamlandı", tone: "ok" },
    {
      key: "outstanding",
      label: "Kalan",
      value: metrics.outstanding,
      meta: metrics.overdueCount ? metrics.overdueCount + " geciken" : metrics.upcomingCount + " yaklaşan",
      tone: metrics.overdueCount ? "bad" : "warn",
    },
    { key: "expense", label: "Gider", value: metrics.totalExpense, meta: "aidat dahil" },
    { key: "net", label: "Net", value: metrics.netIncome, meta: "tahsilat − gider", tone: metrics.netIncome >= 0 ? "accent" : "bad" },
  ];

  return (
    <section className="pulse" aria-label={periodLabel(period) + " özeti"}>
      <div className="pulse-grid">
        {items.map((item, index) => (
          <div className={"pulse-item" + (item.tone ? " tone-" + item.tone : "")} key={item.key} style={{ "--i": index }}>
            <span className="pulse-label">
              <i aria-hidden="true" />
              {item.label}
            </span>
            <strong className="num">{formatCurrency(item.value)}</strong>
            <small>{item.meta}</small>
          </div>
        ))}
      </div>
      <div className="pulse-bar" role="img" aria-label={"Tahsilat oranı yüzde " + rate}>
        <i style={{ width: rate + "%" }} />
      </div>
    </section>
  );
}

/* ---------- TÜFE oranları ----------
   Kira artış sınırı (12 aylık ortalama TÜFE) her ay kendiliğinden çekilir.
   Burada son aylar görünür; bir ay eksik ya da hatalıysa elle girilir. */

const CPI_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const CPI_SOURCE = { seed: "kayıtlı", web: "otomatik", manual: "elle" };

function CpiPanel({ raises, token, onSaved, onError }) {
  const rates = (raises?.rates || []).slice(0, 12);
  const latest = raises?.latest;
  const next = latest
    ? new Date(latest.year, latest.month, 1)
    : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const [form, setForm] = useState({ year: next.getFullYear(), month: next.getMonth() + 1, rate: "" });
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await apiRequest(
        "/api/rent-increases",
        { method: "PUT", body: JSON.stringify({ year: Number(form.year), month: Number(form.month), rate: form.rate }) },
        token
      );
      onSaved(result, CPI_MONTHS[form.month - 1] + " " + form.year + " oranı kaydedildi.");
      setForm((current) => ({ ...current, rate: "" }));
    } catch (error) {
      onError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="panel glass cpi-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Kira artış sınırı</p>
          <h2>TÜFE 12 aylık ortalama</h2>
        </div>
        {latest ? (
          <span className="raise-rate">
            %{Number(latest.rate).toLocaleString("tr-TR")}
            <small>{CPI_MONTHS[latest.month - 1]} {latest.year}</small>
          </span>
        ) : null}
      </div>
      <p className="muted cpi-copy">
        Oran her ayın 3&apos;ünde TÜİK açıklayınca kendiliğinden eklenir; kira yılı dolan kiracı için zam önerisi bu orandan hesaplanır.
      </p>
      {rates.length ? (
        <div className="cpi-grid">
          {rates.map((item) => (
            <div className="cpi-cell" key={item.year + "-" + item.month}>
              <span>{CPI_MONTHS[item.month - 1].slice(0, 3)} {String(item.year).slice(2)}</span>
              <strong className="num">%{Number(item.rate).toLocaleString("tr-TR")}</strong>
              <small className={"cpi-src is-" + item.source}>{CPI_SOURCE[item.source] || item.source}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="chips-empty">Oranlar yükleniyor…</p>
      )}
      <form className="cpi-form" onSubmit={save}>
        <div className="field">
          <label htmlFor="cpi-month">Ay</label>
          <select id="cpi-month" value={form.month} onChange={(event) => setForm({ ...form, month: Number(event.target.value) })}>
            {CPI_MONTHS.map((label, index) => (
              <option key={label} value={index + 1}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cpi-year">Yıl</label>
          <input id="cpi-year" type="number" inputMode="numeric" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="cpi-rate">Oran (%)</label>
          <input id="cpi-rate" type="text" inputMode="decimal" placeholder="31,49" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} required />
        </div>
        <button className={"btn btn-glass" + (saving ? " is-busy" : "")} type="submit" disabled={saving}>
          Elle kaydet
        </button>
      </form>
    </article>
  );
}

/* ---------- Küçük parçalar ---------- */

function StatusPill({ item }) {
  const view = statusView(item);
  const Glyph = TONE_ICON[view.tone] || Clock;
  return (
    <span className={"pill pill-" + view.tone}>
      <Glyph weight="fill" />
      {view.label}
    </span>
  );
}

function Tile({ index, accent, wide, icon: Glyph, label, value, unit, meta, rate, tone }) {
  return (
    <article
      className={"tile glass" + (accent ? " tile-accent" : "") + (wide ? " tile-wide" : "")}
      style={{ "--i": index }}
    >
      <div className="tile-head">
        <Glyph weight="duotone" />
        {label}
      </div>
      <div className={"tile-value num" + (tone ? " tone-" + tone : "")}>
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      {typeof rate === "number" ? (
        <div className="spark tone-accent">
          <i style={{ width: Math.min(Math.max(rate, 0), 100) + "%" }} />
        </div>
      ) : null}
      {meta ? <p className="tile-meta">{meta}</p> : null}
    </article>
  );
}

function Empty({ icon: Glyph, title, hint }) {
  return (
    <div className="empty">
      <Glyph weight="duotone" />
      <strong>{title}</strong>
      <span>{hint}</span>
    </div>
  );
}

/* ---------- Özet ---------- */

function OverviewView({ data, busy, raises, onRaise, onGoCalendar, onPay, onOpenTenant, onGoReports }) {
  const metrics = data.metrics;
  const statuses = data.statuses || [];
  const total = Math.max(metrics.tenantCount, 1);
  const attention = metrics.overdueCount + metrics.upcomingCount + metrics.partialCount;
  const due = statuses
    .filter((item) => !item.paid)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 5);
  const recent = (data.recentPayments || []).slice(0, 4);
  const agenda = (data.agenda || []).slice(0, 3);

  const breakdown = [
    ["Ödendi", metrics.paidCount, "ok"],
    ["Eksik", metrics.partialCount, "warn"],
    ["Geciken", metrics.overdueCount, "bad"],
    ["Yaklaşan", metrics.upcomingCount, "calm"],
  ];

  return (
    <div className="view" data-busy={busy} aria-busy={busy}>
      <div className="bento bento-4">
        <Tile
          index={0}
          accent
          wide
          icon={TrendUp}
          label="Tahsil edilen"
          value={formatCurrency(metrics.totalReceived)}
          unit={"/ " + formatCurrency(metrics.totalExpected)}
          rate={metrics.collectionRate}
          meta={metrics.collectionRate + "% tahsil edildi"}
        />
        <Tile
          index={1}
          icon={HandCoins}
          label="Açık bakiye"
          value={formatCurrency(metrics.outstanding)}
          meta={metrics.partialCount + " eksik, " + metrics.overdueCount + " geciken"}
        />
        <Tile
          index={2}
          icon={Receipt}
          label="Net gelir"
          value={formatCurrency(metrics.netIncome)}
          tone={metrics.netIncome >= 0 ? "" : "bad"}
          meta={formatCurrency(metrics.totalExpense) + " gider düşüldü"}
        />
      </div>

      <RaiseSuggestions raises={raises} onOpen={onRaise} />

      {agenda.length ? (
        <article className="glass alert-strip">
          <p className="strip-title">Gündem</p>
          <div className="alert-list">
            {agenda.map((item) => {
              const overdue = item.days < 0;
              const tone = overdue ? "bad" : item.days <= 30 ? "warn" : "calm";
              const Glyph = item.type === "contract" ? CalendarX : TrendUp;
              return (
                <button
                  type="button"
                  className="alert-item"
                  key={item.type + item.tenantId}
                  onClick={() => onOpenTenant(item.tenantId)}
                >
                  <span className={"feed-mark tone-" + tone}><Glyph weight="fill" /></span>
                  <div className="feed-body">
                    <strong>{item.name}</strong>
                    <span>
                      {item.type === "contract"
                        ? "Sözleşme " + (overdue ? "bitti" : "bitiyor")
                        : "Kira yılı doluyor"}
                      {" · "}
                      {formatDate(item.date)}
                    </span>
                  </div>
                  <ArrowUpRight weight="bold" className="feed-go" />
                </button>
              );
            })}
          </div>
        </article>
      ) : null}

      <div className="duo">
        <article className="panel glass">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Genel sağlık</p>
              <h2>Bu ayın resmi</h2>
            </div>
            <button className="btn btn-quiet btn-sm" type="button" onClick={onGoReports}>
              Raporlar
              <CaretRight weight="bold" />
            </button>
          </div>
          <div className="ring-row">
            <div className="ring" style={{ "--rate": metrics.collectionRate }}>
              <div>
                <strong className="num">{metrics.collectionRate}%</strong>
                <span>tahsilat</span>
              </div>
            </div>
            <div className="legend">
              {breakdown.map(([label, count, tone]) => (
                <div className="legend-row" key={label}>
                  <div className={"legend-top tone-" + tone}>
                    <i className="legend-dot" />
                    <span className="muted">{label}</span>
                    <strong className="num">{count}</strong>
                  </div>
                  <div className={"spark tone-" + tone}>
                    <i style={{ width: Math.min((count / total) * 100, 100) + "%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="panel glass">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Yakın gündem</p>
              <h2>Takvimde sıradaki</h2>
            </div>
            <button className="btn btn-quiet btn-sm" type="button" onClick={onGoCalendar}>
              Takvim
              <CaretRight weight="bold" />
            </button>
          </div>
          <div className="due-list">
            {due.length ? (
              due.map((item) => (
                <div className="due-item" key={item.tenant.id}>
                  <span className="day-chip">
                    <strong className="num">{item.dueDate ? new Date(item.dueDate).getDate() : "—"}</strong>
                    <small>{monthName(item.dueDate)}</small>
                  </span>
                  <div className="due-body">
                    <strong>{item.tenant.name}</strong>
                    <span>{statusDetail(item)}</span>
                  </div>
                  <span className="due-amount num">{formatCurrency(item.remaining)}</span>
                  <button
                    className="btn btn-glass btn-sm due-action"
                    type="button"
                    onClick={() => onPay(item.tenant.id)}
                  >
                    Öde
                  </button>
                </div>
              ))
            ) : (
              <Empty
                icon={CheckCircle}
                title="Bekleyen ödeme yok"
                hint="Bu dönemde geciken ya da yaklaşan bir tahsilat görünmüyor."
              />
            )}
          </div>
        </article>
      </div>

      <article className="glass strip-panel" aria-label="Son kaydedilen ödemeler">
        <p className="strip-title">Son kaydedilen ödemeler</p>
        {recent.length ? (
          <div className="strip">
            {recent.map((payment) => (
              <div className="strip-item" key={payment.id}>
                <strong className="num">{formatCurrency(payment.amount)}</strong>
                <span>{payment.tenantName || "Kiracı"}</span>
                <small>{formatDate(payment.date)}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="strip-empty">Henüz ödeme kaydı yok. İlk tahsilatı girdiğinizde burada görünür.</p>
        )}
      </article>
    </div>
  );
}

/* ---------- Ödemeler ---------- */

function PaymentsView({ data, busy, filter, onFilter, onPay, onDefer, onExport, exportBusy, query = "" }) {
  const statuses = data.statuses || [];
  const metrics = data.metrics;
  const needle = normalizeSearch(query);
  const filtered = statuses
    .filter((item) => (filter === "all" ? true : item.paid ? filter === "paid" : item.status === filter))
    .filter((item) => matchesSearch(needle, item.tenant.name, item.tenant.address));

  return (
    <div className="view payments-view" data-busy={busy} aria-busy={busy}>
      <div className="view-bar">
        <p className="view-summary">
          {needle ? filtered.length + " / " + metrics.tenantCount + " kiracı eşleşti" : metrics.tenantCount + " kiracı"}
          {" · "}
          {metrics.paidCount} tamamlandı · {metrics.overdueCount} geciken
        </p>
        <div className="view-actions">
          <div className="filters glass glass--chip" role="group" aria-label="Durum filtresi">
            {[["all", "Tümü"], ["overdue", "Geciken"], ["upcoming", "Yaklaşan"], ["paid", "Ödendi"]].map(
              ([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={"filter" + (filter === key ? " is-active" : "")}
                  onClick={() => onFilter(key)}
                  aria-pressed={filter === key}
                >
                  {label}
                </button>
              )
            )}
          </div>
          <button
            className={"btn btn-glass btn-sm" + (exportBusy === "month-excel" ? " is-busy" : "")}
            type="button"
            onClick={onExport}
            disabled={Boolean(exportBusy)}
          >
            <DownloadSimple weight="bold" />
            Excel indir
          </button>
          <button className="btn btn-primary btn-sm" type="button" onClick={() => onPay(null)}>
            <Plus weight="bold" />
            Ödeme ekle
          </button>
        </div>
      </div>

      <div className="rows">
        {filtered.length ? (
          filtered.map((item, index) => (
            <article className="row glass" key={item.tenant.id} style={{ "--i": index }}>
              <div className="who">
                <span className="avatar">{initials(item.tenant.name)}</span>
                <div className="who-copy">
                  <strong>{item.tenant.name}</strong>
                  <span>{item.tenant.address}</span>
                </div>
              </div>
              <div className="row-status">
                <StatusPill item={item} />
                <span>{statusDetail(item)}</span>
              </div>
              <div className="row-money">
                <strong className="num">{formatCurrency(item.paid ? item.totalPaid : item.remaining)}</strong>
                <span>{item.paid ? "tahsil edilen" : "kalan bakiye"}</span>
              </div>
              <div className="row-actions">
                {item.paid ? null : (
                  <>
                    <button className="btn btn-glass btn-sm" type="button" onClick={() => onPay(item.tenant.id)}>
                      <Receipt weight="bold" />
                      Öde
                    </button>
                    <button className="btn btn-quiet btn-sm" type="button" onClick={() => onDefer(item.tenant.id)}>
                      <Clock weight="bold" />
                      Ertele
                    </button>
                  </>
                )}
              </div>
            </article>
          ))
        ) : (
          <Empty
            icon={needle ? MagnifyingGlass : Wallet}
            title={needle ? "“" + query.trim() + "” ile eşleşen kiracı yok" : "Bu filtrede kayıt yok"}
            hint={
              needle
                ? "Adın yazılışını değiştirin ya da aramayı temizleyin."
                : "Başka bir durum seçin ya da yeni bir ödeme kaydedin."
            }
          />
        )}
      </div>
    </div>
  );
}

/* ---------- Kiracılar ---------- */

function TenantsView({
  tenants,
  archived,
  deleted,
  archivedCount,
  showArchived,
  archivedLoading,
  busy,
  query,
  onQuery,
  onToggleArchived,
  onCreate,
  onEdit,
  onArchive,
  onRestore,
  onDeleteArchived,
  onUndelete,
  onOpen,
  raises,
  onRaise,
}) {
  const normalize = (value) => value.toLocaleLowerCase("tr-TR");
  const needle = normalize(query.trim());
  const match = (tenant) =>
    !needle || normalize(tenant.name).includes(needle) || normalize(tenant.address).includes(needle);

  const visible = tenants.filter(match);
  const visibleArchived = showArchived ? archived.filter(match) : [];
  const visibleDeleted = showArchived ? deleted.filter(match) : [];
  const daysLeft = (tenant) =>
    Math.max(Math.ceil((new Date(tenant.purgeAt) - new Date()) / 86400000), 0);
  const monthlyTotal = tenants.reduce((sum, tenant) => sum + tenant.rentAmount, 0);
  const depositTotal = tenants.reduce((sum, tenant) => sum + (tenant.deposit || 0), 0);

  return (
    <div className="view" data-busy={busy} aria-busy={busy}>
      <div className="view-bar">
        <p className="view-summary">
          {showArchived ? (
            archivedCount + " arşivde kiracı · toplamlara girmez"
          ) : (
            <>
              {tenants.length} kiracı · {formatCurrency(monthlyTotal)} aylık
              {depositTotal ? " · " + formatCurrency(depositTotal) + " depozito" : ""}
            </>
          )}
        </p>
        <div className="view-actions">
          <div className="filters glass glass--chip" role="group" aria-label="Kiracı görünümü">
            <button
              type="button"
              className={"filter" + (showArchived ? "" : " is-active")}
              onClick={() => showArchived && onToggleArchived()}
              aria-pressed={!showArchived}
            >
              Aktif ({tenants.length})
            </button>
            <button
              type="button"
              className={"filter" + (showArchived ? " is-active" : "")}
              onClick={() => !showArchived && onToggleArchived()}
              aria-pressed={showArchived}
            >
              Arşiv ({archivedCount})
            </button>
          </div>
          <div className="search glass glass--chip">
            <MagnifyingGlass weight="bold" />
            <input
              type="search"
              value={query}
              placeholder="Kiracı ya da adres ara"
              aria-label="Kiracı ara"
              onChange={(event) => onQuery(event.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-sm" type="button" onClick={onCreate}>
            <Plus weight="bold" />
            Kiracı ekle
          </button>
        </div>
      </div>

      {showArchived ? null : <RaiseSuggestions raises={raises} onOpen={onRaise} compact />}

      {/* Arşiv ayrı görünüm: aktif liste ile aynı anda gösterilmez, karışmaz. */}
      {showArchived ? (
        <div className="archive-block">
          <div className="rows">
            {archivedLoading ? (
              <p className="chips-empty">Arşiv yükleniyor…</p>
            ) : visibleArchived.length ? (
              visibleArchived.map((tenant, index) => (
                <article className="row glass glass--quiet is-muted" key={tenant.id} style={{ "--i": index }}>
                  <div className="who">
                    <span className="avatar">{initials(tenant.name)}</span>
                    <div className="who-copy">
                      <strong>{tenant.name}</strong>
                      <span>{tenant.address}</span>
                    </div>
                  </div>
                  <div className="row-status">
                    <span className="pill pill-calm"><Archive weight="fill" />Arşivde</span>
                  </div>
                  <div className="row-money">
                    <strong className="num">{formatCurrency(tenant.rentAmount)}</strong>
                    <span>son kira</span>
                  </div>
                  <div className="row-actions">
                    <button className="btn btn-glass btn-sm" type="button" onClick={() => onRestore(tenant)}>
                      <ArrowCounterClockwise weight="bold" />
                      Geri al
                    </button>
                    <button
                      className="btn btn-quiet btn-sm is-danger"
                      type="button"
                      onClick={() => onDeleteArchived(tenant)}
                      aria-label={tenant.name + " kiracısını temelli sil"}
                    >
                      <Trash weight="bold" />
                      Sil
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="chips-empty">Arşivde kayıt yok.</p>
            )}
          </div>

          {/* Silinenler: 15 gün bekler, bu sürede arşive geri getirilebilir. */}
          {!archivedLoading && visibleDeleted.length ? (
            <>
              <h3 className="strip-title">Silinenler · 15 gün sonra kalıcı olarak gider</h3>
              <div className="rows">
                {visibleDeleted.map((tenant, index) => (
                  <article className="row glass glass--quiet is-muted" key={tenant.id} style={{ "--i": index }}>
                    <div className="who">
                      <span className="avatar">{initials(tenant.name)}</span>
                      <div className="who-copy">
                        <strong>{tenant.name}</strong>
                        <span>{tenant.address}</span>
                      </div>
                    </div>
                    <div className="row-status">
                      <span className="pill pill-calm">
                        <Trash weight="fill" />
                        {daysLeft(tenant) ? daysLeft(tenant) + " gün kaldı" : "Bugün silinecek"}
                      </span>
                    </div>
                    <div className="row-money">
                      <strong className="num">{formatCurrency(tenant.rentAmount)}</strong>
                      <span>son kira</span>
                    </div>
                    <div className="row-actions">
                      <button className="btn btn-glass btn-sm" type="button" onClick={() => onUndelete(tenant)}>
                        <ArrowCounterClockwise weight="bold" />
                        Arşive geri getir
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : (
      <div className="rows">
        {visible.length ? (
          visible.map((tenant, index) => {
            const endsIn = tenant.contractEnd
              ? Math.round((new Date(tenant.contractEnd) - new Date()) / 86400000)
              : null;
            return (
              <article className="row glass" key={tenant.id} style={{ "--i": index }}>
                <div className="who">
                  <span className="avatar">{initials(tenant.name)}</span>
                  <div className="who-copy">
                    <strong>{tenant.name}</strong>
                    <span>{tenant.address}</span>
                  </div>
                </div>
                <div className="row-status">
                  {endsIn !== null && endsIn <= 60 ? (
                    <span className={"pill pill-" + (endsIn < 0 ? "bad" : "warn")}>
                      <CalendarX weight="fill" />
                      {endsIn < 0 ? "Sözleşme bitti" : endsIn + " gün kaldı"}
                    </span>
                  ) : (
                    <span className="pill pill-calm">
                      <CalendarBlank weight="fill" />
                      Ayın {tenant.paymentDay}. günü
                    </span>
                  )}
                  <span>
                    {tenant.deposit ? formatCurrency(tenant.deposit) + " depozito" : "Depozito yok"}
                    {tenant.increaseRate ? " · %" + tenant.increaseRate + " artış" : ""}
                  </span>
                </div>
                <div className="row-money">
                  <strong className="num">{formatCurrency(tenant.rentAmount)}</strong>
                  <span>aylık kira</span>
                </div>
                <div className="row-actions">
                  <button className="btn btn-glass btn-sm" type="button" onClick={() => onOpen(tenant)}>
                    <ArrowUpRight weight="bold" />
                    Dosya
                  </button>
                  <button className="btn btn-quiet btn-sm" type="button" onClick={() => onEdit(tenant)}>
                    <PencilSimple weight="bold" />
                    Düzenle
                  </button>
                  <button className="btn btn-quiet btn-sm" type="button" onClick={() => onArchive(tenant)}>
                    <Archive weight="bold" />
                    Arşivle
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <Empty
            icon={Buildings}
            title={needle ? "Eşleşen kiracı yok" : "Henüz kiracı yok"}
            hint={
              needle
                ? "Aramayı temizleyin ya da başka bir ad deneyin."
                : "İlk kaydı ekleyin; takvim, rapor ve bildirimler kendiliğinden çalışır."
            }
          />
        )}
      </div>
      )}
    </div>
  );
}

/* ---------- Akış ---------- */

function ActivityView({ data, busy, onRun, running, onGoSettings }) {
  const payments = data.recentPayments || [];
  const notifications = data.notifications || [];

  return (
    <div className="view" data-busy={busy} aria-busy={busy}>
      <div className="view-bar">
        <p className="view-summary">
          {payments.length} ödeme kaydı · {notifications.length} bildirim
        </p>
        <div className="view-actions">
          <button className="btn btn-quiet btn-sm" type="button" onClick={onGoSettings}>
            <GearSix weight="bold" />
            Bildirim ayarları
          </button>
          <button
            className={"btn btn-glass btn-sm" + (running === "test" ? " is-busy" : "")}
            type="button"
            onClick={() => onRun("test")}
          >
            <PaperPlaneTilt weight="bold" />
            Telegram&apos;ı test et
          </button>
        </div>
      </div>

      <div className="duo duo-even">
        <article className="panel glass">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Defter</p>
              <h2>Son ödemeler</h2>
            </div>
          </div>
          <div className="feed">
            {payments.length ? (
              payments.map((payment) => (
                <div className="feed-item" key={payment.id}>
                  <span className="feed-mark tone-ok"><Wallet weight="fill" /></span>
                  <div className="feed-body">
                    <strong>{payment.tenantName || "Kiracı"}</strong>
                    <span>{formatDate(payment.date)} · {periodLabel({ month: payment.month, year: payment.year })}</span>
                  </div>
                  <span className="feed-side num">{formatCurrency(payment.amount)}</span>
                </div>
              ))
            ) : (
              <Empty icon={Receipt} title="Kayıt yok" hint="İlk ödeme girildiğinde burada listelenir." />
            )}
          </div>
        </article>

        <article className="panel glass">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Bildirim merkezi</p>
              <h2>Gönderim geçmişi</h2>
            </div>
          </div>
          <div className="feed">
            {notifications.length ? (
              notifications.slice(0, 8).map((item) => {
                const tone = item.status === "sent" ? "ok" : item.status === "failed" ? "bad" : "calm";
                const Glyph = TONE_ICON[tone];
                return (
                  <div className="feed-item" key={item.id}>
                    <span className={"feed-mark tone-" + tone}><Glyph weight="fill" /></span>
                    <div className="feed-body">
                      <strong>{item.title}</strong>
                      <span>
                        {item.status === "sent"
                          ? "Gönderildi"
                          : item.status === "failed"
                            ? item.error || "Gönderilemedi"
                            : "Bekliyor"}
                        {" · "}
                        {formatDate(item.createdAt)}
                      </span>
                    </div>
                    <span className="feed-tag">{item.channel}</span>
                  </div>
                );
              })
            ) : (
              <Empty icon={BellRinging} title="Bildirim yok" hint="Bot bir mesaj gönderdiğinde burada iz bırakır." />
            )}
          </div>
        </article>
      </div>
    </div>
  );
}

/* ---------- Sayfa ---------- */

export default function Page() {
  const [booted, setBooted] = useState(false);
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authChallenge, setAuthChallenge] = useState(null);

  const [period, setPeriod] = useState({ month: 0, year: 0 });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [view, setView] = useState("overview");
  const [filter, setFilter] = useState("all");
  const [paymentTab, setPaymentTab] = useState("grid");
  const [paymentQuery, setPaymentQuery] = useState("");
  const [gridYear, setGridYear] = useState(0);
  const [grid, setGrid] = useState(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridPending, setGridPending] = useState("");
  const [gridStamp, setGridStamp] = useState(0);
  const [duesYear, setDuesYear] = useState(0);
  const [dues, setDues] = useState(null);
  const [duesLoading, setDuesLoading] = useState(false);
  const [duesPending, setDuesPending] = useState("");
  const [duesStamp, setDuesStamp] = useState(0);
  const [busPeriod, setBusPeriod] = useState({ month: 0, year: 0 });
  const [busFilter, setBusFilter] = useState("");
  const [busData, setBusData] = useState(null);
  const [busLoading, setBusLoading] = useState(false);
  const [busStamp, setBusStamp] = useState(0);
  const [modal, setModal] = useState(null);
  const [flash, setFlash] = useState(null);
  const [theme, setTheme] = useState("light");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [running, setRunning] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [accent, setAccent] = useState("mavi");
  const [bootError, setBootError] = useState("");
  const [bootStamp, setBootStamp] = useState(0);
  const [raises, setRaises] = useState(null);
  const [raiseStamp, setRaiseStamp] = useState(0);

  const [tenantQuery, setTenantQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState([]);
  const [deleted, setDeleted] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  const [recurrences, setRecurrences] = useState([]);
  const [report, setReport] = useState(null);
  const [reportMonths, setReportMonths] = useState(12);
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMode, setReportMode] = useState("range");
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [annual, setAnnual] = useState(null);
  const [busReport, setBusReport] = useState(null);
  const [busSpan, setBusSpan] = useState("month");
  const [busRange, setBusRange] = useState({ start: "", end: "" });
  const [busPeriodReport, setBusPeriodReport] = useState(null);
  const [combined, setCombined] = useState(null);
  const [paymentExportBusy, setPaymentExportBusy] = useState("");
  const [downloading, setDownloading] = useState(false);

  const sentinelRef = useRef(null);
  const token = session?.token || "";

  useEffect(() => {
    setSession(loadSession());
    setPeriod(currentPeriod());
    setGridYear(currentPeriod().year);
    setDuesYear(currentPeriod().year);
    setBusPeriod(currentPeriod());
    setTheme(readTheme());
    setPrivacy(readPrivacy());
    setAccent(readAccent());
    setBooted(true);

    const params = new URLSearchParams(window.location.search);
    const screen = screenId(params.get("ekran"));
    if (screen && ALL_VIEWS.some((item) => item.id === screen)) setView(screen);
    // Ana ekran kısayolu: "Ödeme ekle" doğrudan ödeme penceresini açar.
    if (params.get("islem") === "odeme") setModal({ type: "payment" });
    window.history.replaceState({ view: screen && ALL_VIEWS.some((item) => item.id === screen) ? screen : "overview" }, "");

    const onPop = (event) => {
      const next = event.state?.view || screenId(new URLSearchParams(window.location.search).get("ekran")) || "overview";
      if (ALL_VIEWS.some((item) => item.id === next)) {
        setView(next);
        setMoreOpen(false);
        setModal(null);
      }
    };
    window.addEventListener("popstate", onPop);

    const onInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  /* Klavye: ⌘K / Ctrl+K ya da "/" aramayı açar, ⌘⇧H tutarları gizler. */
  useEffect(() => {
    function onKey(event) {
      const typing = event.target.closest?.("input, textarea, select, [contenteditable='true']");
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMoreOpen((open) => !open);
      } else if (mod && event.shiftKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        togglePrivacyRef.current();
      } else if (!typing && !mod && event.key === "/") {
        event.preventDefault();
        setMoreOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Kaydırma dinleyicisi yerine gözlemci: her karede iş yapmaz.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      rootMargin: "-8px 0px 0px 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [booted, session, data]);

  // Kendi verisini çeken ekranlar (yapılacaklar, gider notları) için sabit kimlikli bildirim.
  const notify = useCallback((tone, message) => setFlash({ tone, message }), []);

  const signOut = useCallback(async (message) => {
    clearSession();
    setSession(null);
    setData(null);
    setAuthError(message || "");
    try {
      await fetch("/api/session", { method: "DELETE", credentials: "same-origin" });
    } catch {
      /* çerez sunucuda temizlenemediyse yerel oturum yine de kapandı */
    }
  }, []);

  const fetchDashboard = useCallback(
    (nextPeriod, activeToken) =>
      apiRequest("/api/dashboard?month=" + nextPeriod.month + "&year=" + nextPeriod.year, {}, activeToken),
    []
  );

  useEffect(() => {
    if (!token || !period.year) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchDashboard(period, token)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setBootError("");
        setAuthError("");
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.status === 401) signOut("Oturum süresi doldu, tekrar giriş yapın.");
        else {
          setBootError(error.message || "Sunucuya ulaşılamadı.");
          setFlash({ tone: "bad", message: error.message });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, period.month, period.year, bootStamp, fetchDashboard, signOut]);

  // Zam önerileri: kira yılı dolan kiracılar için TÜFE'ye göre öneri.
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    apiRequest("/api/rent-increases", {}, token)
      .then((payload) => {
        if (!cancelled) setRaises(payload);
      })
      .catch(() => {
        if (!cancelled) setRaises(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, raiseStamp]);

  // Yıl çizelgesi yalnız ödeme ekranı açıkken ve o sekmede çekilir.
  useEffect(() => {
    if (view !== "payments" || paymentTab !== "grid" || !token || !gridYear) return undefined;
    let cancelled = false;
    setGridLoading(true);
    apiRequest("/api/payments?scope=year&year=" + gridYear, {}, token)
      .then((payload) => {
        if (!cancelled) setGrid(payload);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.status === 401) signOut("Oturum süresi doldu, tekrar giriş yapın.");
        else setFlash({ tone: "bad", message: error.message });
      })
      .finally(() => {
        if (!cancelled) setGridLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, paymentTab, gridYear, gridStamp, token, signOut]);

  // Aidat çizelgesi de yalnız kendi ekranında çekilir.
  useEffect(() => {
    if (view !== "dues" || !token || !duesYear) return undefined;
    let cancelled = false;
    setDuesLoading(true);
    apiRequest("/api/dues?year=" + duesYear, {}, token)
      .then((payload) => {
        if (!cancelled) setDues(payload);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.status === 401) signOut("Oturum süresi doldu, tekrar giriş yapın.");
        else setFlash({ tone: "bad", message: error.message });
      })
      .finally(() => {
        if (!cancelled) setDuesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, duesYear, duesStamp, token, signOut]);

  // Otobüs defteri de yalnız kendi ekranında çekilir.
  useEffect(() => {
    if (view !== "bus" || !token || !busPeriod.year) return undefined;
    let cancelled = false;
    setBusLoading(true);
    apiRequest(
      "/api/bus?month=" + busPeriod.month + "&year=" + busPeriod.year + (busFilter ? "&busId=" + busFilter : ""),
      {},
      token
    )
      .then((payload) => {
        if (!cancelled) setBusData(payload);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.status === 401) signOut("Oturum süresi doldu, tekrar giriş yapın.");
        else setFlash({ tone: "bad", message: error.message });
      })
      .finally(() => {
        if (!cancelled) setBusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, busPeriod.month, busPeriod.year, busFilter, busStamp, token, signOut]);
  useEffect(() => {
    if (view !== "reports" || !token) return undefined;
    const hasCustomRange = Boolean(reportStartDate || reportEndDate);
    if (reportMode === "range" && hasCustomRange && (!reportStartDate || !reportEndDate)) {
      setReportLoading(false);
      return undefined;
    }

    const customRangeQuery = reportMode === "range" && reportStartDate && reportEndDate
      ? "&start=" + encodeURIComponent(reportStartDate) + "&end=" + encodeURIComponent(reportEndDate)
      : "";
    const busWindow = busRangeFor(busSpan, busPeriod, busRange);
    const busByRange = reportMode === "bus" && busSpan !== "month";
    if (busByRange && (!busWindow.start || !busWindow.end)) {
      setReportLoading(false);
      return undefined;
    }
    const url = reportMode === "annual"
      ? "/api/reports?scope=annual&year=" + reportYear
      : busByRange
        ? "/api/reports?scope=bus-period&start=" + busWindow.start + "&end=" + busWindow.end
      : reportMode === "bus"
        ? "/api/reports?scope=bus&month=" + busPeriod.month + "&year=" + busPeriod.year
        : reportMode === "combined"
          ? "/api/reports?scope=combined&months=" + reportMonths
          : "/api/reports?months=" + reportMonths + customRangeQuery;

    let cancelled = false;
    setReportLoading(true);
    apiRequest(url, {}, token)
      .then((payload) => {
        if (cancelled) return;
        if (reportMode === "annual") setAnnual(payload);
        else if (busByRange) setBusPeriodReport(payload);
        else if (reportMode === "bus") setBusReport(payload);
        else if (reportMode === "combined") setCombined(payload);
        else setReport(payload);
      })
      .catch((error) => {
        if (!cancelled) setFlash({ tone: "bad", message: error.message });
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    view,
    reportMode,
    reportMonths,
    reportStartDate,
    reportEndDate,
    reportYear,
    busPeriod.month,
    busPeriod.year,
    busSpan,
    busRange.start,
    busRange.end,
    busStamp,
    token,
    data,
  ]);


  async function authenticate(password) {
    if (!password) {
      setAuthError("Şifreyi yazın.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const result = await apiRequest("/api/session", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setAuthChallenge({ id: result.challengeId, sentTo: result.sentTo });
    } catch (error) {
      setAuthError(error.status === 401 ? "Şifre hatalı." : error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function verifyCode(code) {
    if (!authChallenge) return;
    if (!/^\d{6}$/.test(code)) {
      setAuthError("6 haneli kodu yazın.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const result = await apiRequest("/api/session", {
        method: "POST",
        body: JSON.stringify({ challengeId: authChallenge.id, code }),
      });
      const next = { token: result.token, expiresAt: result.expiresAt };
      saveSession(next);
      setAuthChallenge(null);
      setPeriod(currentPeriod());
      setSession(next);
    } catch (error) {
      setAuthError(error.message);
      if (error.status === 410) setAuthChallenge(null);
    } finally {
      setAuthBusy(false);
    }
  }

  const reload = useCallback(async () => {
    if (!token || !period.year) return;
    setLoading(true);
    try {
      setData(await fetchDashboard(period, token));
    } catch (error) {
      if (error.status === 401) signOut("Oturum süresi doldu, tekrar giriş yapın.");
      else setFlash({ tone: "bad", message: error.message });
    } finally {
      setLoading(false);
    }
  }, [token, period, fetchDashboard, signOut]);

  function shiftPeriod(delta) {
    const date = new Date(period.year, period.month - 1 + delta, 1);
    setPeriod({ month: date.getMonth() + 1, year: date.getFullYear() });
  }

  function goTo(next) {
    setMoreOpen(false);
    if (next !== view) {
      const params = new URLSearchParams(window.location.search);
      params.delete("islem");
      params.set("ekran", SCREEN_SLUGS[next] || next);
      window.history.pushState({ view: next }, "", "?" + params.toString());
    }
    setView(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function handleSaved(message) {
    setModal(null);
    setFlash({ tone: "ok", message });
    setGridStamp((value) => value + 1);
    await reload();
  }

  async function loadArchived() {
    setArchivedLoading(true);
    try {
      const [payload, trash] = await Promise.all([
        apiRequest("/api/tenants?includeArchived=true", {}, token),
        apiRequest("/api/tenants?includeDeleted=true", {}, token),
      ]);
      setArchived((payload.tenants || []).filter((tenant) => !tenant.isActive));
      setDeleted(trash.tenants || []);
    } catch (error) {
      setFlash({ tone: "bad", message: error.message });
    } finally {
      setArchivedLoading(false);
    }
  }

  function toggleArchived() {
    const next = !showArchived;
    setShowArchived(next);
    if (next) loadArchived();
  }

  async function archiveTenant(tenant) {
    const ok = await askConfirm({
      title: tenant.name + " arşivlensin mi?",
      message: "Ödeme geçmişi korunur; kiracı toplamlara girmez. İstediğin zaman arşivden geri alabilirsin.",
      confirmLabel: "Arşivle",
    });
    if (!ok) return;
    try {
      await apiRequest("/api/tenants?id=" + tenant.id, { method: "DELETE" }, token);
      setFlash({ tone: "ok", message: "Kiracı arşivlendi." });
      if (showArchived) await loadArchived();
      await reload();
    } catch (error) {
      setFlash({ tone: "bad", message: error.message });
    }
  }

  async function restoreTenant(tenant) {
    try {
      await apiRequest("/api/tenants?id=" + tenant.id + "&action=restore", { method: "PATCH" }, token);
      setFlash({ tone: "ok", message: tenant.name + " arşivden çıkarıldı." });
      await loadArchived();
      await reload();
    } catch (error) {
      setFlash({ tone: "bad", message: error.message });
    }
  }

  async function deleteArchivedTenant(tenant) {
    const ok = await askConfirm({
      title: tenant.name + " silinsin mi?",
      message: "15 gün Silinenler'de bekler, bu sürede geri getirebilirsin. Sonra ödeme, gider ve aidat geçmişiyle birlikte kalıcı olarak silinir.",
      confirmLabel: "Sil",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await apiRequest(
        "/api/tenants?id=" + tenant.id + "&action=purge",
        { method: "DELETE" },
        token
      );
      setFlash({ tone: "ok", message: tenant.name + " Silinenler'e taşındı. 15 gün içinde geri getirebilirsin." });
      await loadArchived();
      await reload();
    } catch (error) {
      setFlash({ tone: "bad", message: error.message });
    }
  }

  async function undeleteTenant(tenant) {
    try {
      await apiRequest("/api/tenants?id=" + tenant.id + "&action=undelete", { method: "PATCH" }, token);
      setFlash({ tone: "ok", message: tenant.name + " arşive geri getirildi." });
      await loadArchived();
      await reload();
    } catch (error) {
      setFlash({ tone: "bad", message: error.message });
    }
  }

  async function runAction(action) {
    setRunning(action);
    const labels = {
      test: ["Telegram test mesajı gönderildi.", "Telegram mesajı gönderilemedi."],
      email: ["Rapor e-postası gönderildi.", "E-posta gönderilemedi."],
      daily: ["Günlük özet çalıştırıldı.", "Günlük özet gönderilmedi."],
      monthly: ["Aylık özet çalıştırıldı.", "Aylık özet gönderilmedi."],
    };
    try {
      const result = await apiRequest("/api/notifications", {
        method: "POST",
        body: JSON.stringify({ action }),
      }, token);
      const [ok, fail] = labels[action] || ["Tamamlandı.", "Gönderilemedi."];
      setFlash({
        tone: result.sent ? "ok" : "bad",
        message: result.sent ? ok : fail + reasonText(result),
      });
      await reload();
    } catch (error) {
      setFlash({ tone: "bad", message: error.message });
    } finally {
      setRunning("");
    }
  }

  async function saveSettings(input) {
    setSavingSettings(true);
    try {
      const result = await apiRequest("/api/settings", {
        method: "PUT",
        body: JSON.stringify(input),
      }, token);
      setData((current) => (current ? { ...current, settings: result.settings } : current));
      setFlash({ tone: "ok", message: "Bildirim hedefleri kaydedildi." });
      await reload();
    } catch (error) {
      setFlash({ tone: "bad", message: error.message });
    } finally {
      setSavingSettings(false);
    }
  }

  /* Kutucuk tıklaması: işaretliyse dönemin kayıtları silinir, değilse
     dönemin açığı kadar tek kayıt düşer. Tutarı kullanıcı yazmaz. */
  async function toggleGridCell(row, cell) {
    const key = row.tenantId + ":" + cell.month;
    const label = MONTH_LONG[cell.month - 1] + " " + grid.year;

    /* Kayıt varsa dokunuş düzeltme penceresini açar: yanlış girilen ay
       tutarıyla birlikte oradan düzelir. Boş aya dokunuş hızlı yoldur. */
    if (cell.paid > 0) {
      setModal({ type: "month", kind: "rent", row, cell, year: grid.year });
      return;
    }

    setGridPending(key);
    try {
      const result = await apiRequest(
        "/api/payments",
        {
          method: "POST",
          body: JSON.stringify({ tenantId: row.tenantId, month: cell.month, year: grid.year, fill: true }),
        },
        token
      );
      const paymentId = result.payment?.id;
      setFlash({
        tone: "ok",
        message: result.skipped
          ? label + " zaten ödenmiş görünüyor."
          : row.name + " · " + label + " ödendi.",
        action: result.skipped || !paymentId
          ? null
          : {
              label: "Geri al",
              run: async () => {
                try {
                  await apiRequest("/api/payments?id=" + paymentId, { method: "DELETE" }, token);
                  setGridStamp((value) => value + 1);
                  await reload();
                } catch (error) {
                  setFlash({ tone: "bad", message: error.message });
                }
              },
            },
      });
      setGridStamp((value) => value + 1);
      setRaiseStamp((value) => value + 1);
      await reload();
    } catch (error) {
      setFlash({ tone: "bad", message: error.message });
    } finally {
      setGridPending("");
    }
  }

  /* Aidat kutucuğu: işaretlenince o dönemin gider kaydı oluşur ve ödendi
     olur; kaldırılınca kayıt durur ama ödenmemiş sayılır — borç kaybolmasın. */
  async function toggleDueCell(row, cell) {
    const key = row.dueId + ":" + cell.month;
    const label = MONTH_LONG[cell.month - 1] + " " + dues.year;

    if (cell.paid) {
      setModal({ type: "month", kind: "due", row, cell, year: dues.year });
      return;
    }

    setDuesPending(key);
    try {
      const result = await apiRequest(
        "/api/dues",
        { method: "POST", body: JSON.stringify({ dueId: row.dueId, month: cell.month, year: dues.year }) },
        token
      );
      setFlash({
        tone: "ok",
        message: result.skipped
          ? label + " zaten ödenmiş görünüyor."
          : row.label + " · " + label + " · " + formatCurrency(result.amount) + " ödendi.",
      });
      setDuesStamp((value) => value + 1);
      await reload();
    } catch (error) {
      setFlash({ tone: "bad", message: error.message });
    } finally {
      setDuesPending("");
    }
  }

  async function toggleDueActive(row) {
    try {
      await apiRequest("/api/recurrences?id=" + row.dueId, { method: "PATCH" }, token);
      setFlash({ tone: "ok", message: row.title + (row.isActive ? " duraklatıldı." : " yeniden çalışıyor.") });
      setDuesStamp((value) => value + 1);
      await reload();
    } catch (error) {
      setFlash({ tone: "bad", message: error.message });
    }
  }

  async function deleteDue(row) {
    const ok = await askConfirm({
      title: row.title + " silinsin mi?",
      message: "Geçmiş aidat gider kayıtları durur; yalnız bu kalem takipten çıkar.",
      confirmLabel: "Sil",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await apiRequest("/api/recurrences?id=" + row.dueId, { method: "DELETE" }, token);
      setFlash({ tone: "ok", message: "Aidat kalemi silindi." });
      setDuesStamp((value) => value + 1);
      await reload();
    } catch (error) {
      setFlash({ tone: "bad", message: error.message });
    }
  }

  function shiftBusPeriod(delta) {
    const date = new Date(busPeriod.year, busPeriod.month - 1 + delta, 1);
    setBusPeriod({ month: date.getMonth() + 1, year: date.getFullYear() });
  }

  /* Güne dokunulunca o günün kaydı varsa düzenlemeye, yoksa yeni kayda açılır.
     Seçili araç varsa doğrudan onun kaydı gelir. */
  function openBusDay(day) {
    if (!busData) return;
    if (!busData.buses.length) {
      setModal({ type: "bus" });
      setFlash({ tone: "bad", message: "Önce bir araç ekleyin; kâğıttaki numara yeterli." });
      return;
    }
    const gun = busData.days.find((item) => item.day === day) || null;
    const kayit = gun?.entries.find((item) => !busFilter || item.busId === busFilter) || gun?.entries[0] || null;
    setModal({ type: "busday", day, entry: kayit });
  }

  function exportPayments() {
    return exportPaymentMonth(data.period.month, data.period.year);
  }

  async function exportPaymentMonth(month, year, format = "xlsx") {
    const pdf = format === "pdf";
    const busyKey = pdf ? "month-pdf" : "month-excel";
    const fileFormat = pdf ? "pdf" : "xlsx";
    const extension = pdf ? "pdf" : "xlsx";
    const monthLabel = MONTH_LONG[month - 1] + " " + year;
    setPaymentExportBusy(busyKey);
    try {
      await downloadFile(
        "/api/reports?scope=month&month=" + month + "&year=" + year + "&format=" + fileFormat,
        token,
        "vedat-gayrimenkul-" + year + "-" + String(month).padStart(2, "0") + "-aylik." + extension
      );
      setFlash({ tone: "ok", message: monthLabel + " " + (pdf ? "PDF" : "Excel") + " indirildi." });
    } catch (error) {
      if (error.status === 401) signOut("Oturum süresi doldu, tekrar giriş yapın.");
      else setFlash({ tone: "bad", message: error.message });
    } finally {
      setPaymentExportBusy("");
    }
  }

  async function exportPaymentYear(year, format) {
    const pdf = format === "pdf";
    const busyKey = pdf ? "year-pdf" : "year-excel";
    const fileFormat = pdf ? "pdf" : "xlsx";
    const extension = pdf ? "pdf" : "xlsx";
    setPaymentExportBusy(busyKey);
    try {
      await downloadFile(
        "/api/reports?scope=annual&year=" + year + "&format=" + fileFormat,
        token,
        "vedat-gayrimenkul-" + year + "-yillik." + extension
      );
      setFlash({ tone: "ok", message: year + " " + (pdf ? "PDF" : "Excel") + " indirildi." });
    } catch (error) {
      if (error.status === 401) signOut("Oturum süresi doldu, tekrar giriş yapın.");
      else setFlash({ tone: "bad", message: error.message });
    } finally {
      setPaymentExportBusy("");
    }
  }


  async function downloadReportPdf(kind) {
    setDownloading(true);
    try {
      const customRange = kind === "range" && reportStartDate && reportEndDate;
      let url;
      let fileName;

      if (kind === "annual") {
        url = "/api/reports?scope=annual&year=" + reportYear + "&format=pdf";
        fileName = "vedat-gayrimenkul-" + reportYear + "-yillik.pdf";
      } else if (kind === "bus" && busSpan !== "month") {
        const busWindow = busRangeFor(busSpan, busPeriod, busRange);
        url = "/api/reports?scope=bus-period&start=" + busWindow.start + "&end=" + busWindow.end + "&format=pdf";
        fileName = "otobus-hatti-" + busWindow.start + "-" + busWindow.end + ".pdf";
      } else if (kind === "bus") {
        url = "/api/reports?scope=bus&month=" + busPeriod.month + "&year=" + busPeriod.year + "&format=pdf";
        fileName = "otobus-hatti-" + busPeriod.year + "-" + String(busPeriod.month).padStart(2, "0") + ".pdf";
      } else if (kind === "combined") {
        url = "/api/reports?scope=combined&months=" + reportMonths + "&format=pdf";
        fileName = "genel-rapor-son-" + reportMonths + "-ay.pdf";
      } else if (customRange) {
        url =
          "/api/reports?start=" +
          encodeURIComponent(reportStartDate) +
          "&end=" +
          encodeURIComponent(reportEndDate) +
          "&format=pdf";
        fileName = "vedat-gayrimenkul-" + reportStartDate + "-" + reportEndDate + ".pdf";
      } else {
        url = "/api/reports?months=" + reportMonths + "&format=pdf";
        fileName = "vedat-gayrimenkul-son-" + reportMonths + "-ay.pdf";
      }

      await downloadFile(url, token, fileName);
      setFlash({ tone: "ok", message: "PDF indirildi." });
    } catch (error) {
      setFlash({ tone: "bad", message: error.message });
    } finally {
      setDownloading(false);
    }
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    writeTheme(next);
  }

  function togglePrivacy() {
    const next = !privacy;
    writePrivacy(next);
    setPrivacy(next);
    setFlash({ tone: "ok", message: next ? "Tutarlar gizlendi." : "Tutarlar görünüyor." });
  }
  const togglePrivacyRef = useRef(togglePrivacy);
  togglePrivacyRef.current = togglePrivacy;

  // Kiracıların katılım yılından bu yana geçen yıllar seçilebilir olsun.
  const reportYears = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const starts = (data?.statuses || [])
      .map((item) => item.tenant.contractStart || item.tenant.createdAt)
      .filter(Boolean)
      .map((value) => new Date(value).getFullYear());
    const earliest = starts.length ? Math.min(...starts, thisYear) : thisYear;
    const from = Math.max(earliest, thisYear - 5);
    return Array.from({ length: thisYear - from + 1 }, (_, index) => from + index).reverse();
  }, [data]);

  const tenants = useMemo(() => {
    const statuses = data?.statuses || [];
    return Array.from(new Map(statuses.map((item) => [item.tenant.id, item.tenant])).values());
  }, [data]);

  function openTenantById(tenantId) {
    const tenant = tenants.find((item) => item.id === tenantId);
    if (tenant) setModal({ type: "detail", tenant });
  }

  if (!booted) return <div className="ambient" />;

  if (!session) {
    return (
      <>
        <div className="ambient" />
        <AuthGate
          onSubmit={authenticate}
          onVerify={verifyCode}
          onReset={() => {
            setAuthChallenge(null);
            setAuthError("");
          }}
          challenge={authChallenge}
          error={authError}
          busy={authBusy}
        />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <div className="ambient" />
        <div className="boot">
          <img src="/icons/vedat-mark.svg" alt="" width="48" height="48" />
          {bootError ? (
            <div className="boot-error" role="alert">
              <strong>Panel açılamadı</strong>
              <span>{bootError}</span>
              <div className="boot-actions">
                <button className="btn btn-primary" type="button" onClick={() => setBootStamp((value) => value + 1)}>
                  <ArrowClockwise weight="bold" />
                  Tekrar dene
                </button>
                <button className="btn btn-quiet" type="button" onClick={() => signOut("")}>
                  Çıkış yap
                </button>
              </div>
            </div>
          ) : (
            <p>Panel hazırlanıyor</p>
          )}
        </div>
        {flash ? <Toast flash={flash} onClose={() => setFlash(null)} /> : null}
      </>
    );
  }

  const metrics = data.metrics;
  const active = ALL_VIEWS.find((item) => item.id === view) || VIEWS[0];
  // Takvimin kendi ay gezgini var; üstte ikincisi gösterilmez.
  const showPeriod = view === "overview" ||
    (view === "payments" && paymentTab === "period");
  const attention = metrics.overdueCount + metrics.partialCount;
  const raiseCount = raises?.suggestions?.length || 0;
  const sessionEnds = session.expiresAt ? formatShortDate(session.expiresAt, true) : "";
  const moreActive = MORE_VIEWS.some((item) => item.id === view);
  const anyLoading = loading || gridLoading || duesLoading || busLoading || reportLoading;
  const badgeFor = (id) => (id === "payments" ? attention : id === "tenants" ? raiseCount : 0);
  const PrivacyGlyph = privacy ? EyeSlash : Eye;

  return (
    <>
      <div className="ambient" />
      <div className={"loadbar" + (anyLoading ? " is-on" : "")} aria-hidden="true" />

      <div className="shell">
        <aside className="rail" aria-label="Ana menü">
          <div className="rail-brand">
            <img src="/icons/vedat-mark.svg" alt="" width="36" height="36" />
            <strong>{BRAND}</strong>
          </div>

          <button type="button" className="rail-search" onClick={() => setMoreOpen(true)} aria-label="Ara (⌘K)">
            <MagnifyingGlass weight="bold" />
            <span>Ara</span>
            <kbd>⌘K</kbd>
          </button>

          <nav className="rail-nav" aria-label="Bölümler">
            {NAV_GROUPS.map((group) => (
              <div className="rail-group" key={group.label}>
                <p className="rail-group-title">{group.label}</p>
                {group.items.map((item) => {
                  const Glyph = item.icon;
                  const badge = badgeFor(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={"rail-link" + (view === item.id ? " is-active" : "")}
                      onClick={() => goTo(item.id)}
                      aria-current={view === item.id ? "page" : undefined}
                      title={item.label}
                    >
                      <Glyph weight={view === item.id ? "fill" : "regular"} />
                      <span className="rail-label">{item.label}</span>
                      {badge ? (
                        <span className={"rail-count num" + (item.id === "tenants" ? " is-warn" : "")}>{badge}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="rail-foot">
            <button
              type="button"
              className={"rail-link rail-privacy" + (privacy ? " is-on" : "")}
              onClick={togglePrivacy}
              aria-pressed={privacy}
              title="Tutarları gizle (⌘⇧H)"
            >
              <PrivacyGlyph weight={privacy ? "fill" : "regular"} />
              <span className="rail-label">Tutarları gizle</span>
              <span className="switch" aria-hidden="true"><i /></span>
            </button>
            <button
              type="button"
              className={"rail-link" + (view === "settings" ? " is-active" : "")}
              onClick={() => goTo("settings")}
              aria-current={view === "settings" ? "page" : undefined}
              title="Ayarlar"
            >
              <GearSix weight={view === "settings" ? "fill" : "regular"} />
              <span className="rail-label">Ayarlar</span>
            </button>
            <button type="button" className="rail-link" onClick={() => signOut("")} title="Çıkış yap">
              <SignOut weight="regular" />
              <span className="rail-label">Çıkış<small>Oturum {sessionEnds}</small></span>
            </button>
          </div>
        </aside>

        <main className="main" id="main">
          <div ref={sentinelRef} aria-hidden="true" />

          <header className={"topbar" + (stuck ? " is-stuck" : "")}>
            <div className="topbar-title">
              <h1>{active.label}</h1>
              <span>{active.lead}</span>
            </div>

            <div className="topbar-actions">
              {showPeriod ? (
                <div className="period topbar-period">
                  <button type="button" onClick={() => shiftPeriod(-1)} aria-label="Önceki dönem">
                    <CaretLeft weight="bold" />
                  </button>
                  <strong>{periodLabel(data.period)}</strong>
                  <button type="button" onClick={() => shiftPeriod(1)} aria-label="Sonraki dönem">
                    <CaretRight weight="bold" />
                  </button>
                </div>
              ) : null}

              {installPrompt ? (
                <button
                  className="btn btn-glass btn-sm topbar-upload"
                  type="button"
                  onClick={async () => {
                    await installPrompt.prompt();
                    setInstallPrompt(null);
                  }}
                >
                  <DownloadSimple weight="bold" />
                  Yükle
                </button>
              ) : null}

              <button
                className="icon-btn topbar-search"
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-label="Ara"
              >
                <MagnifyingGlass weight="bold" />
              </button>
              <button
                className={"icon-btn topbar-privacy" + (privacy ? " is-active" : "")}
                type="button"
                onClick={togglePrivacy}
                aria-pressed={privacy}
                aria-label={privacy ? "Tutarları göster" : "Tutarları gizle"}
                title={privacy ? "Tutarları göster (⌘⇧H)" : "Tutarları gizle (⌘⇧H)"}
              >
                <PrivacyGlyph weight={privacy ? "fill" : "bold"} />
              </button>
              <AccentPicker
                accent={accent}
                theme={theme}
                onAccent={(next) => {
                  setAccent(next);
                  writeAccent(next);
                }}
                onTheme={toggleTheme}
              />
              <button
                className="icon-btn topbar-theme"
                type="button"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
                title={theme === "dark" ? "Açık tema" : "Koyu tema"}
              >
                {theme === "dark" ? <Sun weight="bold" /> : <Moon weight="bold" />}
              </button>
              <button className="icon-btn topbar-refresh" type="button" onClick={() => { reload(); setRaiseStamp((value) => value + 1); }} aria-label="Verileri yenile" title="Yenile">
                <ArrowClockwise weight="bold" />
              </button>
            </div>
          </header>

          <div className="screen" key={view + (privacy ? ":gizli" : "")}>
          {view === "overview" ? (
            <OverviewView
              data={data}
              busy={loading}
              raises={raises}
              onRaise={(suggestion) => setModal({ type: "raise", suggestion })}
              onGoCalendar={() => goTo("calendar")}
              onGoReports={() => goTo("reports")}
              onPay={(tenantId) => setModal({ type: "payment", tenantId })}
              onOpenTenant={openTenantById}
            />
          ) : null}

          {view === "calendar" ? (
            <div className="view" data-busy={loading} aria-busy={loading}>
              <MonthPulse metrics={data.metrics} period={data.period} />
              <CalendarBoard
                period={data.period}
                statuses={data.statuses || []}
                expenses={data.expenses || []}
                planned={data.planned || []}
                onAddPayment={(date, tenantId) => setModal({ type: "payment", tenantId, date })}
                onAddExpense={(date) => setModal({ type: "expense", date })}
                onAddRecurrence={(day) => setModal({ type: "recurrence", day })}
                onSetRentDay={(day) => setModal({ type: "rentday", day })}
                onShiftPeriod={shiftPeriod}
                onGoToday={() => setPeriod(currentPeriod())}
              />
            </div>
          ) : null}

          {view === "payments" ? (
            <>
              <div className="mode-switch">
                <div className="filters glass glass--chip" role="group" aria-label="Ödeme görünümü">
                  <button
                    type="button"
                    className={"filter" + (paymentTab === "grid" ? " is-active" : "")}
                    onClick={() => setPaymentTab("grid")}
                    aria-pressed={paymentTab === "grid"}
                  >
                    Yıl tablosu
                  </button>
                  <button
                    type="button"
                    className={"filter" + (paymentTab === "period" ? " is-active" : "")}
                    onClick={() => setPaymentTab("period")}
                    aria-pressed={paymentTab === "period"}
                  >
                    Dönem defteri
                  </button>
                </div>
                <div className="search glass glass--chip">
                  <MagnifyingGlass weight="bold" />
                  <input
                    type="search"
                    value={paymentQuery}
                    placeholder="Kiracı adı ara"
                    aria-label="Ödemelerde kiracı ara"
                    onChange={(event) => setPaymentQuery(event.target.value)}
                  />
                </div>
              </div>

              {paymentTab === "grid" ? (
                <PaymentGrid
                  grid={grid}
                  busy={gridLoading}
                  pending={gridPending}
                  onYear={setGridYear}
                  onToggle={toggleGridCell}
                  onOpenTenant={openTenantById}
                  onPay={(tenantId) => setModal({ type: "payment", tenantId })}
                  onDefer={(tenantId) => setModal({ type: "defer", tenantId })}
                  onExportMonth={exportPaymentMonth}
                  onExportYear={exportPaymentYear}
                  exportBusy={paymentExportBusy}
                  query={paymentQuery}
                />
              ) : (
                <PaymentsView
                  data={data}
                  busy={loading}
                  filter={filter}
                  onFilter={setFilter}
                  onPay={(tenantId) => setModal({ type: "payment", tenantId })}
                  onDefer={(tenantId) => setModal({ type: "defer", tenantId })}
                  onExport={exportPayments}
                  exportBusy={paymentExportBusy}
                  query={paymentQuery}
                />
              )}
            </>
          ) : null}

          {view === "dues" ? (
            <DuesView
              grid={dues}
              busy={duesLoading}
              pending={duesPending}
              onYear={setDuesYear}
              onToggle={toggleDueCell}
              onCreate={() => setModal({ type: "due" })}
              onEdit={(row) => setModal({ type: "due", item: row })}
              onToggleActive={toggleDueActive}
              onDelete={deleteDue}
            />
          ) : null}

          {view === "bus" ? (
            <BusBoard
              data={busData}
              busy={busLoading}
              onShiftPeriod={shiftBusPeriod}
              onGoToday={() => setBusPeriod(currentPeriod())}
              onSelectBus={setBusFilter}
              onOpenDay={openBusDay}
              onAddBus={() => setModal({ type: "bus" })}
              onEditBus={(bus) => setModal({ type: "bus", bus })}
            />
          ) : null}

          {view === "todos" ? <TodosView token={token} onFlash={notify} /> : null}

          {view === "ledger" ? <LedgerView token={token} onFlash={notify} /> : null}

          {view === "tenants" ? (
            <TenantsView
              tenants={tenants}
              archived={archived}
              deleted={deleted}
              archivedCount={data.archivedCount || 0}
              showArchived={showArchived}
              archivedLoading={archivedLoading}
              busy={loading}
              query={tenantQuery}
              onQuery={setTenantQuery}
              onToggleArchived={toggleArchived}
              onCreate={() => setModal({ type: "tenant", mode: "create" })}
              onEdit={(tenant) => setModal({ type: "tenant", mode: "edit", tenant })}
              onArchive={archiveTenant}
              onRestore={restoreTenant}
              onDeleteArchived={deleteArchivedTenant}
              onUndelete={undeleteTenant}
              onOpen={(tenant) => setModal({ type: "detail", tenant })}
              raises={raises}
              onRaise={(suggestion) => setModal({ type: "raise", suggestion })}
            />
          ) : null}

          {view === "reports" ? (
            <FullReportCard token={token} onFlash={notify} onAuthError={() => signOut("Oturum süresi doldu, tekrar giriş yapın.")} />
          ) : null}

          {view === "reports" ? (
            <ReportsView
              mode={reportMode}
              onMode={setReportMode}
              report={report}
              annual={annual}
              busReport={busReport}
              busPeriodReport={busPeriodReport}
              busSpan={busSpan}
              busRange={busRange}
              onBusSpan={setBusSpan}
              onBusRange={(range) => {
                setBusRange(range);
                setBusSpan("custom");
              }}
              combined={combined}
              busPeriod={busPeriod}
              onBusPeriod={shiftBusPeriod}
              months={reportMonths}
              startDate={reportStartDate}
              endDate={reportEndDate}
              year={reportYear}
              years={reportYears}
              busy={reportLoading}
              downloading={downloading}
              onRange={(value) => {
                setReportMonths(value);
                setReportStartDate("");
                setReportEndDate("");
              }}
              onStartDate={setReportStartDate}
              onEndDate={setReportEndDate}
              onClearRange={() => {
                setReportStartDate("");
                setReportEndDate("");
              }}
              onPdf={downloadReportPdf}
              onSelectMonth={(item) => {
                setPeriod({ month: item.month, year: item.year });
                goTo("payments");
              }}
              onOpenTenant={openTenantById}
            />
          ) : null}

          {view === "activity" ? (
            <ActivityView
              data={data}
              busy={loading}
              onRun={runAction}
              running={running}
              onGoSettings={() => goTo("settings")}
            />
          ) : null}

          {view === "settings" ? (
            <SettingsView
              data={data}
              busy={loading}
              saving={savingSettings}
              running={running}
              onSave={saveSettings}
              onRun={runAction}
            />
          ) : null}

          {view === "settings" ? (
            <CpiPanel
              raises={raises}
              token={token}
              onSaved={(result, message) => {
                setRaises((current) => ({ ...(current || {}), ...result }));
                setFlash({ tone: "ok", message });
              }}
              onError={(message) => setFlash({ tone: "bad", message })}
            />
          ) : null}

          {view === "settings" ? (
            <article className="panel glass session-card">
              <div>
                <p className="eyebrow">Oturum</p>
                <h2>Bu cihazda açık</h2>
                <p className="muted">Oturum {sessionEnds} tarihine kadar açık kalır. Her yeni girişte e-postana kod gelir.</p>
              </div>
              <button className="btn btn-glass" type="button" onClick={() => signOut("")}>
                <SignOut weight="bold" />
                Çıkış yap
              </button>
            </article>
          ) : null}
          </div>
        </main>
      </div>

      <nav className="tabbar" aria-label="Bölümler">
        {PRIMARY_VIEWS.map((item) => {
          const Glyph = item.icon;
          const badge = badgeFor(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={"tab" + (view === item.id ? " is-active" : "")}
              onClick={() => goTo(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <Glyph weight={view === item.id ? "fill" : "regular"} />
              {item.label}
              {badge ? <span className="tab-dot" aria-label={badge + " bekleyen"} /> : null}
            </button>
          );
        })}
        <button
          type="button"
          className={"tab" + (moreActive ? " is-active" : "")}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
        >
          <List weight="bold" />
          Menü
        </button>
      </nav>

      {moreOpen ? (
        <CommandPalette
          views={ALL_VIEWS}
          actions={QUICK_ACTIONS}
          tenants={tenants}
          current={view}
          privacy={privacy}
          theme={theme}
          onClose={() => setMoreOpen(false)}
          onGo={goTo}
          onAction={(next) => {
            setMoreOpen(false);
            if (next.view) goTo(next.view);
            if (next.modal) {
              setModal(next.modal.type === "recurrence" ? { ...next.modal, day: new Date().getDate() } : next.modal);
            }
          }}
          onOpenTenant={(tenant) => {
            setMoreOpen(false);
            setModal({ type: "detail", tenant });
          }}
          onPayTenant={(tenantId) => {
            setMoreOpen(false);
            setModal({ type: "payment", tenantId });
          }}
          onTogglePrivacy={() => {
            setMoreOpen(false);
            togglePrivacy();
          }}
          onToggleTheme={toggleTheme}
        />
      ) : null}

      {flash ? <Toast flash={flash} onClose={() => setFlash(null)} /> : null}
      <ConfirmHost />

      {modal?.type === "raise" ? (
        <RaiseSheet
          suggestion={modal.suggestion}
          token={token}
          onClose={() => setModal(null)}
          onDone={async (result, message) => {
            setModal(null);
            if (result) setRaises((current) => ({ ...(current || {}), ...result }));
            setRaiseStamp((value) => value + 1);
            setFlash({ tone: "ok", message });
            await reload();
          }}
        />
      ) : null}
      {modal?.type === "tenant" ? (
        <TenantSheet
          mode={modal.mode}
          tenant={modal.tenant}
          token={token}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      ) : null}
      {modal?.type === "detail" ? (
        <TenantDetailSheet
          tenant={modal.tenant}
          token={token}
          onClose={() => setModal(null)}
          onChanged={async (message) => {
            setFlash({ tone: "ok", message });
            await reload();
          }}
        />
      ) : null}
      {modal?.type === "payment" ? (
        <PaymentSheet
          tenantId={modal.tenantId}
          tenants={tenants}
          period={data.period}
          date={modal.date}
          token={token}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      ) : null}
      {modal?.type === "expense" ? (
        <ExpenseSheet
          tenants={tenants}
          categories={data.expenseCategories || []}
          period={data.period}
          date={modal.date}
          token={token}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      ) : null}
      {modal?.type === "busday" && busData ? (
        <BusDaySheet
          day={modal.day}
          entry={modal.entry}
          buses={busData.buses}
          busId={busFilter}
          month={busPeriod.month}
          year={busPeriod.year}
          token={token}
          onClose={() => setModal(null)}
          onSaved={async (message) => {
            setModal(null);
            setFlash({ tone: "ok", message });
            setBusStamp((value) => value + 1);
          }}
        />
      ) : null}
      {modal?.type === "bus" ? (
        <BusSheet
          bus={modal.bus}
          token={token}
          onClose={() => setModal(null)}
          onSaved={async (message) => {
            setModal(null);
            setFlash({ tone: "ok", message });
            setBusStamp((value) => value + 1);
          }}
        />
      ) : null}
      {modal?.type === "month" ? (
        <MonthSheet
          kind={modal.kind}
          row={modal.row}
          cell={modal.cell}
          year={modal.year}
          token={token}
          onClose={() => setModal(null)}
          onSaved={async (message) => {
            setModal(null);
            setFlash({ tone: "ok", message });
            setGridStamp((value) => value + 1);
            setDuesStamp((value) => value + 1);
            await reload();
          }}
        />
      ) : null}
      {modal?.type === "due" ? (
        <RecurrenceSheet
          tenants={tenants}
          categories={data.expenseCategories || []}
          item={modal.item}
          lockCategory="aidat"
          dayOfMonth={modal.item?.dayOfMonth || 1}
          token={token}
          onClose={() => setModal(null)}
          onSaved={async (message) => {
            setModal(null);
            setFlash({ tone: "ok", message });
            setDuesStamp((value) => value + 1);
            await reload();
          }}
        />
      ) : null}
      {modal?.type === "recurrence" ? (
        <RecurrenceSheet
          tenants={tenants}
          categories={data.expenseCategories || []}
          dayOfMonth={modal.day}
          token={token}
          onClose={() => setModal(null)}
          onSaved={async (message) => {
            setModal(null);
            setFlash({ tone: "ok", message });
            setRecurrences(await apiRequest("/api/recurrences", {}, token).then((p) => p.recurrences || []).catch(() => recurrences));
            await reload();
          }}
        />
      ) : null}
      {modal?.type === "rentday" ? (
        <RentDaySheet
          tenants={tenants}
          day={modal.day}
          token={token}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      ) : null}
      {modal?.type === "defer" ? (
        <DeferSheet
          tenantId={modal.tenantId}
          tenants={tenants}
          period={data.period}
          token={token}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}

/* ---------- Tüm işlemler ----------
   Mobil menü tam ekran açılır: üstte arama, hızlı işlemler ızgarası, altta
   bütün bölümler. Bir şey yapmak isteyen, hangi sayfada olduğunu bilmeden
   buradan başlar. */

const QUICK_ACTIONS = [
  { id: "payment", label: "Ödeme kaydet", icon: HandCoins, modal: { type: "payment" }, keywords: "kira tahsilat" },
  { id: "tenant", label: "Kiracı ekle", icon: UserPlus, modal: { type: "tenant", mode: "create" }, keywords: "sözleşme yeni" },
  { id: "todo", label: "Not al", icon: ListChecks, view: "todos", keywords: "yapılacak hatırlatma geri sayım" },
  { id: "ledger", label: "Gider notu", icon: Notebook, view: "ledger", keywords: "harcama masraf" },
  { id: "expense", label: "Gider ekle", icon: Receipt, modal: { type: "expense" }, keywords: "tamir vergi fatura" },
  { id: "recurrence", label: "Düzenli gider", icon: ArrowsClockwise, modal: { type: "recurrence" }, keywords: "her ay tekrar" },
  { id: "due", label: "Aidat kalemi", icon: Buildings, modal: { type: "due" }, keywords: "apartman site" },
  { id: "reports", label: "Rapor al", icon: ChartLineUp, view: "reports", keywords: "pdf excel indir" },
];


/* Ana ekran kısayolları Türkçe adlarla geliyor */
function screenId(value) {
  const map = {
    ozet: "overview",
    takvim: "calendar",
    odemeler: "payments",
    aidat: "dues",
    otobus: "bus",
    giderler: "ledger",
    yapilacaklar: "todos",
    notlar: "todos",
    gidernotlari: "ledger",
    kiracilar: "tenants",
    raporlar: "reports",
    akis: "activity",
    ayarlar: "settings",
  };
  return map[value] || value;
}

function reasonText(result) {
  if (result.reason === "no_recipients") return " Hedef tanımlı değil.";
  if (result.reason === "not_configured") return " Kanal yapılandırılmamış.";
  if (result.reason === "nothing_due") return " Gönderilecek bir şey yok.";
  if (result.reason === "not_month_start") return " Aylık özet yalnız ayın 1'inde çalışır.";
  if (result.reason === "already_delivered") return " Bu özet bugün zaten gönderilmiş.";
  return "";
}
