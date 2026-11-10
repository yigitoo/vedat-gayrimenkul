"use client";

import { useState } from "react";
import { ArrowRight, Calculator, CheckCircle, Clock, Info, Scales, TrendUp, WarningCircle } from "@phosphor-icons/react";
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
   Kira yılı (12 ay) dolunca, yılda bir kez açılır. Önce yıllık zam oranı sorulur; oran
   yazılınca yeni kira anında hesaplanır, ama kaydedilecek tutarı sen
   girersin ("Hesaplananı yaz" yalnız kolaylık). "Bekle" pencereyi kapatır,
   öneri beklemede kalır; tutar yazılıp kaydedilince yeni kira geçerlilik
   tarihinden itibaren 12 aylık tabloya işlenir, eski tutar geçmişte kalır. */

function parseRate(value) {
  const text = String(value ?? "").trim().replace("%", "").replace(",", ".");
  if (!text) return NaN;
  const rate = Number(text);
  return Number.isFinite(rate) && rate >= 0 && rate <= 200 ? rate : NaN;
}

export function RaiseSheet({ suggestion, token, onClose, onDone }) {
  const [rateInput, setRateInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(String(suggestion.anniversary || "").slice(0, 10));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const rate = parseRate(rateInput);
  const rateValid = Number.isFinite(rate);
  const rateTouched = rateInput.trim() !== "";
  const calculated = rateValid ? Math.round(suggestion.currentRent * (1 + rate / 100)) : null;

  const amount = amountInput.trim() ? parseMoney(amountInput) : NaN;
  const valid = Number.isFinite(amount) && amount > 0;
  const diff = valid ? amount - suggestion.currentRent : 0;
  const percent = valid && suggestion.currentRent ? (diff / suggestion.currentRent) * 100 : 0;
  const overCap = valid && suggestion.maxLegalRent && amount > suggestion.maxLegalRent;
  const finished = suggestion.daysUntil <= 0;

  async function apply(event) {
    event.preventDefault();
    if (rateTouched && !rateValid) {
      setError("Zam oranını 0 ile 200 arasında yaz. Örnek: 35,5");
      return;
    }
    if (!valid) {
      setError("Yeni kira tutarını yaz.");
      return;
    }
    setBusy("apply");
    setError("");
    try {
      const result = await apiRequest(
        "/api/rent-increases",
        {
          method: "POST",
          body: JSON.stringify({
            action: "apply",
            tenantId: suggestion.tenantId,
            amount,
            rate: rateValid ? rate : undefined,
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

  return (
    <SheetFrame eyebrow={finished ? "12 ay doldu · kira artışı" : "Kira artışı"} title={suggestion.name} onClose={onClose}>
      <form className="sheet-form raise-sheet" onSubmit={apply}>
        <p className="raise-lead">
          {finished
            ? "Kira yılı " + formatDate(suggestion.anniversary) + " tarihinde doldu (" + (suggestion.paidMonths || 0) + "/12 ay ödendi). Zam yılda bir yapılır: yeni kirayı girersen sonraki 12 ay bu tutarla işlenir."
            : "Kira yılı " + formatDate(suggestion.anniversary) + " tarihinde doluyor (" + whenText(suggestion.anniversary) + ")."}
        </p>

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

        <div className="field">
          <label htmlFor="raise-rate">Yıllık zam oranı (%)</label>
          <input
            id="raise-rate"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={rateInput}
            onChange={(event) => setRateInput(event.target.value)}
            placeholder={suggestion.rate !== null && suggestion.rate !== undefined ? "TÜFE " + rateText(suggestion.rate).slice(1) : "Örnek: 35,5"}
            aria-describedby="raise-rate-hint"
            autoFocus
          />
          <p className="raise-calc" id="raise-rate-hint" aria-live="polite">
            {rateTouched && !rateValid ? (
              <span className="tone-bad"><WarningCircle weight="fill" />Oran okunamadı. Örnek: 35,5</span>
            ) : calculated !== null ? (
              <>
                <span>
                  <Calculator weight="bold" />
                  {rateText(rate)} ile hesaplanan: <strong className="num">{formatCurrency(calculated)}</strong>
                </span>
                <button
                  className="btn btn-quiet btn-sm"
                  type="button"
                  onClick={() => setAmountInput(String(calculated))}
                >
                  Hesaplananı yaz
                </button>
              </>
            ) : (
              <span>
                Yıllık oranı yaz, yeni kira anında hesaplansın.
                {suggestion.rate !== null && suggestion.rate !== undefined ? " Son TÜFE: " + rateLabel(suggestion) + "." : ""}
              </span>
            )}
          </p>
        </div>

        <MoneyField
          id="raise-amount"
          label="Yeni aylık kira"
          hint="Kaydedilecek tutarı sen yaz."
          value={amountInput}
          onChange={setAmountInput}
          kind="rent"
          required
        />

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
          {suggestion.maxLegalRent ? (
            <li>
              <Scales weight="bold" />
              <span>
                Konut kirasında artış, önceki kira yılının 12 aylık ortalama TÜFE değişimini aşamaz (TBK 344).
                Üst sınır: <strong className="num">{formatCurrency(suggestion.maxLegalRent)}</strong>
              </span>
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

        {error ? (
          <p className="form-error" role="alert">
            <WarningCircle weight="fill" />
            {error}
          </p>
        ) : null}

        <button
          className={"btn btn-quiet btn-sm raise-skip" + (busy === "dismiss" ? " is-busy" : "")}
          type="button"
          onClick={dismiss}
          disabled={Boolean(busy)}
        >
          Bu yıl zam yapma
        </button>

        <div className="sheet-actions">
          <button className="btn btn-glass" type="button" onClick={onClose} disabled={Boolean(busy)}>
            <Clock weight="bold" />
            Bekle
          </button>
          <button
            className={"btn btn-primary" + (busy === "apply" ? " is-busy" : "")}
            type="submit"
            disabled={Boolean(busy) || !valid || (rateTouched && !rateValid)}
          >
            <CheckCircle weight="bold" />
            Kaydet ve işle
          </button>
        </div>
      </form>
    </SheetFrame>
  );
}
