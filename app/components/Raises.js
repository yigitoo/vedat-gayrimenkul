"use client";

import { useState } from "react";
import { Archive, ArrowRight, CheckCircle, Clock, Info, Scales, TrendUp, WarningCircle } from "@phosphor-icons/react";
import { SheetFrame } from "./Sheets";
import MoneyField from "./MoneyField";
import { apiRequest, formatCurrency, formatDate, isPrivate, parseMoney } from "../lib/client";

const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function rateText(rate) {
  return "%" + Number(rate || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

function rateLabel(item) {
  return rateText(item.rate) + " · " + MONTHS[(item.rateMonth || 1) - 1] + " " + item.rateYear;
}

function daysUntil(value) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function whenText(anniversary) {
  const days = daysUntil(anniversary);
  if (days > 1) return days + " gün sonra";
  if (days === 1) return "yarın";
  if (days === 0) return "bugün";
  return Math.abs(days) + " gün önce";
}

/* ---------- Öneri kartı ----------
   Kira yılı dolan (ya da 30 gün içinde dolacak) kiracılar burada toplanır.
   Her satır tek bir karar ister: incele, onayla. Kart, öneri yoksa hiç
   görünmez; ekranı boş yere kalabalıklaştırmaz. */

export function RaiseSuggestions({ raises, onOpen, compact = false }) {
  const list = raises?.suggestions || [];
  if (!list.length) return null;
  const latest = raises.latest;

  return (
    <article className={"raise-card" + (compact ? " is-compact" : "")} aria-label="Zam önerileri">
      <div className="raise-head">
        <span className="raise-mark"><TrendUp weight="bold" /></span>
        <div>
          <p className="eyebrow">Onayını bekleyen</p>
          <h2>{list.length === 1 ? "1 zam önerisi" : list.length + " zam önerisi"}</h2>
        </div>
        {latest ? (
          <span className="raise-rate" title="12 aylık ortalama TÜFE değişimi, yasal üst sınır">
            TÜFE {rateText(latest.rate)}
            <small>{MONTHS[latest.month - 1]} {latest.year}</small>
          </span>
        ) : null}
      </div>

      <ul className="raise-list">
        {list.map((item, index) => (
          <li key={item.tenantId + item.anniversary} style={{ "--i": index }}>
            <button type="button" className="raise-row" onClick={() => onOpen(item)}>
              <span className="raise-who">
                <strong>{item.name}</strong>
                <span>
                  Kira yılı {formatDate(item.anniversary)} · {whenText(item.anniversary)}
                </span>
              </span>
              {item.allPaid ? (
                <span className="pill pill-ok raise-paid">
                  <CheckCircle weight="fill" />
                  12/12 ödendi
                </span>
              ) : (
                <span className="pill pill-calm raise-paid">{item.paidMonths || 0}/12 ödendi</span>
              )}
              <span className="raise-amounts num">
                <s>{formatCurrency(item.currentRent)}</s>
                <ArrowRight weight="bold" />
                <strong>{formatCurrency(item.suggestedRent)}</strong>
              </span>
              <span className="raise-cta">İncele</span>
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ---------- Zam penceresi ----------
   Kira yılı (12 ay) dolunca ya da İncele'ye basınca açılır. Üç seçenek:
   - TÜFE tavsiyesi: o ayın Türkiye TÜFE oranına (12 aylık ortalama, TBK 344
     tavanı) göre hesaplanan fiyat,
   - Elle yeni fiyat: tutarı sen yazarsın,
   - Kiracı çıkıyor: kiracı arşive gider (geri alınabilir).
   Onaylanınca yeni kira geçerlilik tarihinden itibaren 12 aylık tabloya
   işlenir, eski tutar kira geçmişinde kalır. "Bekle" öneriyi beklemede
   bırakır. */

export function RaiseSheet({ suggestion, token, onClose, onDone }) {
  const hasCpi = suggestion.rate !== null && suggestion.rate !== undefined && suggestion.suggestedRent > 0;
  const [choice, setChoice] = useState(hasCpi ? "cpi" : "manual");
  const [amountInput, setAmountInput] = useState("");
  const [rateInput, setRateInput] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(String(suggestion.anniversary || "").slice(0, 10));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const isArchive = choice === "archive";
  const amount = choice === "cpi"
    ? suggestion.suggestedRent
    : choice === "manual" && amountInput.trim() ? parseMoney(amountInput) : NaN;
  const valid = Number.isFinite(amount) && amount > 0;
  const diff = valid ? amount - suggestion.currentRent : 0;
  const percent = valid && suggestion.currentRent ? (diff / suggestion.currentRent) * 100 : 0;
  const overCap = valid && suggestion.maxLegalRent && amount > suggestion.maxLegalRent;
  const finished = suggestion.daysUntil <= 0;
  const full = finished || suggestion.allPaid;

  async function apply(event) {
    event.preventDefault();
    if (isArchive) {
      await archive();
      return;
    }
    if (!valid) {
      setError("Yeni kira tutarını yaz.");
      return;
    }
    setBusy("apply");
    setError("");
    try {
      const rate = choice === "cpi" ? suggestion.rate : Math.round(percent * 10) / 10;
      const result = await apiRequest(
        "/api/rent-increases",
        {
          method: "POST",
          body: JSON.stringify({
            action: "apply",
            tenantId: suggestion.tenantId,
            amount,
            rate: choice === "cpi" || rate < 0 ? undefined : rate,
            effectiveFrom: effectiveFrom || suggestion.anniversary,
          }),
        },
        token
      );
      onDone(result, suggestion.name + " için yeni kira " + formatCurrency(amount) + " olarak 12 aylık tabloya işlendi.");
    } catch (requestError) {
      setError(requestError.message);
      setBusy("");
    }
  }

  async function archive() {
    setBusy("apply");
    setError("");
    try {
      await apiRequest("/api/tenants?id=" + suggestion.tenantId, { method: "DELETE" }, token);
      onDone(null, suggestion.name + " arşive gönderildi.", {
        label: "Geri al",
        run: () => apiRequest("/api/tenants?id=" + suggestion.tenantId + "&action=restore", { method: "PATCH" }, token),
      });
    } catch (requestError) {
      setError(requestError.message);
      setBusy("");
    }
  }

  async function dismiss() {
    setBusy("dismiss");
    setError("");
    try {
      const result = await apiRequest(
        "/api/rent-increases",
        {
          method: "POST",
          body: JSON.stringify({ action: "dismiss", tenantId: suggestion.tenantId, anniversary: suggestion.anniversary }),
        },
        token
      );
      onDone(result, suggestion.name + " için bu kira yılı zam yapılmayacak.");
    } catch (requestError) {
      setError(requestError.message);
      setBusy("");
    }
  }

  const options = [
    {
      key: "cpi",
      label: "TÜFE tavsiyesi",
      value: hasCpi ? formatCurrency(suggestion.suggestedRent) : "Oran yok",
      hint: hasCpi ? rateLabel(suggestion) + (suggestion.rateIsProvisional ? " · geçici" : "") : "Ayarlar'dan TÜFE oranını gir",
      disabled: !hasCpi,
    },
    { key: "manual", label: "Elle yeni fiyat", value: "Kendin yaz", hint: "anlaştığınız tutar" },
    { key: "archive", label: "Kiracı çıkıyor", value: "Arşive gönder", hint: "geçmiş korunur" },
  ];

  return (
    <SheetFrame eyebrow={full ? "12 ay doldu · kira artışı" : "Kira artışı"} title={suggestion.name} onClose={onClose}>
      <form className="sheet-form raise-sheet" onSubmit={apply}>
        <p className="raise-lead">
          {finished
            ? "Kira yılı " + formatDate(suggestion.anniversary) + " tarihinde doldu (" + (suggestion.paidMonths || 0) + "/12 ay ödendi)."
            : suggestion.allPaid
              ? "12 aylık tablo doldu (12/12 ay ödendi). Kira yılı " + formatDate(suggestion.anniversary) + " tarihinde yenileniyor."
              : "Kira yılı " + formatDate(suggestion.anniversary) + " tarihinde doluyor (" + whenText(suggestion.anniversary) + ")."}
          {" "}Zam yılda bir yapılır; onaylarsan sonraki 12 ay yeni tutarla işlenir.
        </p>

        <div className="raise-options" role="radiogroup" aria-label="Ne yapılsın">
          {options.map((item) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={choice === item.key}
              disabled={item.disabled}
              className={"raise-option" + (choice === item.key ? " is-active" : "") + (item.key === "archive" ? " is-archive" : "")}
              onClick={() => {
                setChoice(item.key);
                setError("");
              }}
            >
              <strong>{item.label}</strong>
              <span className="num">{item.value}</span>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>

        {isArchive ? (
          <p className="raise-archive-note">
            <Archive weight="bold" />
            {suggestion.name} arşive gider: ödeme geçmişi korunur, toplamlara ve listelere girmez. İstediğin zaman Kiracılar › Arşiv'den geri alabilirsin.
          </p>
        ) : (
          <>
            <div className="raise-compare">
              <div>
                <span>Şu anki kira</span>
                <strong className="num">{formatCurrency(suggestion.currentRent)}</strong>
              </div>
              <ArrowRight weight="bold" aria-hidden="true" />
              <div className="is-new">
                <span>Yeni kira</span>
                <strong className="num">{valid ? formatCurrency(amount) : "—"}</strong>
                {valid && !isPrivate() ? (
                  <small className="num">
                    {diff >= 0 ? "+" : "−"}{formatCurrency(Math.abs(diff))} · %{percent.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
                  </small>
                ) : null}
              </div>
            </div>

            {choice === "manual" ? (
              <div className="field">
                <label htmlFor="raise-rate">Zam oranı (%) · isteğe bağlı</label>
                <input
                  id="raise-rate"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={rateInput}
                  onChange={(event) => setRateInput(event.target.value)}
                  placeholder={hasCpi ? "TÜFE " + rateText(suggestion.rate).slice(1) : "Örnek: 25"}
                  autoFocus
                />
                {(() => {
                  const rate = Number(String(rateInput).replace("%", "").replace(",", ".").trim());
                  if (!rateInput.trim()) return <p className="field-hint">Oranı yazarsan yeni kira hesaplanır; tutarı yine sen yazarsın.</p>;
                  if (!Number.isFinite(rate) || rate < 0 || rate > 200) return <p className="field-hint tone-bad">Oran okunamadı. Örnek: 25 ya da 31,5</p>;
                  const calculated = Math.round(suggestion.currentRent * (1 + rate / 100));
                  return (
                    <p className="raise-calc">
                      <span>{rateText(rate)} ile hesaplanan: <strong className="num">{formatCurrency(calculated)}</strong></span>
                      <button className="btn btn-quiet btn-sm" type="button" onClick={() => setAmountInput(String(calculated))}>
                        Hesaplananı yaz
                      </button>
                    </p>
                  );
                })()}
              </div>
            ) : null}

            {choice === "manual" ? (
              <MoneyField
                id="raise-amount"
                label="Yeni aylık kira"
                hint={hasCpi ? "TÜFE tavsiyesi: " + formatCurrency(suggestion.suggestedRent) : "Kaydedilecek tutarı yaz."}
                value={amountInput}
                onChange={setAmountInput}
                kind="rent"
                required
              />
            ) : null}

            <div className="field">
              <label htmlFor="raise-from">Geçerlilik tarihi</label>
              <input
                id="raise-from"
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
            </div>

            <ul className="raise-notes">
              {hasCpi ? (
                <li>
                  <Scales weight="bold" />
                  <span>
                    Tavsiye, {MONTHS[(suggestion.rateMonth || 1) - 1]} {suggestion.rateYear} TÜFE 12 aylık ortalamasına (
                    {rateText(suggestion.rate)}) göre hesaplandı. Konut kirasında yasal üst sınır (TBK 344):{" "}
                    <strong className="num">{formatCurrency(suggestion.maxLegalRent || suggestion.suggestedRent)}</strong>
                  </span>
                </li>
              ) : null}
              {suggestion.rateIsProvisional && hasCpi ? (
                <li>
                  <Info weight="bold" />
                  <span>Kira yılının ait olduğu ayın oranı henüz açıklanmadı; en son açıklanan oran kullanıldı.</span>
                </li>
              ) : null}
              {suggestion.fiveYearNote ? (
                <li>
                  <Info weight="bold" />
                  <span>
                    Kiracılık {suggestion.yearsOfTenancy} yılı doldurdu: 5 yıldan sonra kira, emsal ve hakkaniyete göre
                    yeniden belirlenebilir (anlaşma ya da kira tespit davası).
                  </span>
                </li>
              ) : null}
              {overCap ? (
                <li className="is-warn">
                  <WarningCircle weight="fill" />
                  <span>Bu tutar TÜFE sınırını aşıyor. Konut kirası için aşan kısım hukuken geçersiz sayılabilir.</span>
                </li>
              ) : null}
            </ul>
          </>
        )}

        {error ? (
          <p className="form-error" role="alert">
            <WarningCircle weight="fill" />
            {error}
          </p>
        ) : null}

        {isArchive ? null : (
          <button
            className={"btn btn-quiet btn-sm raise-skip" + (busy === "dismiss" ? " is-busy" : "")}
            type="button"
            onClick={dismiss}
            disabled={Boolean(busy)}
          >
            Bu yıl zam yapma
          </button>
        )}

        <div className="sheet-actions">
          <button className="btn btn-glass" type="button" onClick={onClose} disabled={Boolean(busy)}>
            <Clock weight="bold" />
            Bekle
          </button>
          <button
            className={"btn " + (isArchive ? "btn-danger" : "btn-primary") + (busy === "apply" ? " is-busy" : "")}
            type="submit"
            disabled={Boolean(busy) || (!isArchive && !valid)}
          >
            {isArchive ? <Archive weight="bold" /> : <CheckCircle weight="bold" />}
            {isArchive ? "Arşive gönder" : "Onayla ve işle"}
          </button>
        </div>
      </form>
    </SheetFrame>
  );
}
