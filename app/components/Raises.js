"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle, Info, Scales, TrendUp, WarningCircle } from "@phosphor-icons/react";
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

/* ---------- Onay penceresi ----------
   Üç seçenek, biri seçili gelir: TÜFE ile (yasal üst sınır), sözleşmedeki
   oran (daha düşükse) ya da elle tutar. Uygulanınca eski tutar kira
   geçmişinde kalır; "Şimdilik değil" bu kira yılı için öneriyi kapatır. */

export function RaiseSheet({ suggestion, token, onClose, onDone }) {
  const options = [
    { key: "cpi", label: "TÜFE ile", hint: rateLabel(suggestion), amount: suggestion.suggestedRent },
    suggestion.contractRateRent
      ? { key: "contract", label: "Sözleşme oranı", hint: "daha düşük", amount: suggestion.contractRateRent }
      : null,
    { key: "custom", label: "Elle tutar", hint: "kendin yaz", amount: null },
  ].filter(Boolean);

  const [choice, setChoice] = useState("cpi");
  const [custom, setCustom] = useState(String(suggestion.suggestedRent || ""));
  const [effectiveFrom, setEffectiveFrom] = useState(String(suggestion.anniversary || "").slice(0, 10));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const selected = options.find((item) => item.key === choice) || options[0];
  const amount = choice === "custom" ? parseMoney(custom) : selected.amount;
  const valid = Number.isFinite(amount) && amount > 0;
  const diff = valid ? amount - suggestion.currentRent : 0;
  const percent = valid && suggestion.currentRent ? (diff / suggestion.currentRent) * 100 : 0;
  const overCap = valid && suggestion.maxLegalRent && amount > suggestion.maxLegalRent;

  async function apply(event) {
    event.preventDefault();
    if (!valid) {
      setError("Geçerli bir tutar yazın.");
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
            effectiveFrom: effectiveFrom || suggestion.anniversary,
          }),
        },
        token
      );
      onDone(result, suggestion.name + " için yeni kira " + formatCurrency(amount) + " olarak kaydedildi.");
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
      onDone(result, suggestion.name + " için öneri bu kira yılı kapatıldı.");
    } catch (requestError) {
      setError(requestError.message);
      setBusy("");
    }
  }

  return (
    <SheetFrame eyebrow="Zam önerisi" title={suggestion.name} onClose={onClose}>
      <form className="sheet-form raise-sheet" onSubmit={apply}>
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
                +{formatCurrency(diff)} · %{percent.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
              </small>
            ) : null}
          </div>
        </div>

        <div className="raise-options" role="radiogroup" aria-label="Zam yöntemi">
          {options.map((item) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={choice === item.key}
              className={"raise-option" + (choice === item.key ? " is-active" : "")}
              onClick={() => setChoice(item.key)}
            >
              <strong>{item.label}</strong>
              <span>{item.amount ? formatCurrency(item.amount) : item.hint}</span>
              {item.amount ? <small>{item.hint}</small> : null}
            </button>
          ))}
        </div>

        {choice === "custom" ? (
          <MoneyField
            label="Yeni aylık kira"
            value={custom}
            onChange={setCustom}
            kind="rent"
            autoFocus
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
          <li>
            <Scales weight="bold" />
            <span>
              Konut kirasında artış, önceki kira yılının 12 aylık ortalama TÜFE değişimini aşamaz (TBK 344).
              Üst sınır: <strong className="num">{formatCurrency(suggestion.maxLegalRent || suggestion.suggestedRent)}</strong>
            </span>
          </li>
          {suggestion.rateIsProvisional ? (
            <li>
              <Info weight="bold" />
              <span>Kira yılının ait olduğu ayın oranı henüz açıklanmadı; en son açıklanan oran ({rateLabel(suggestion)}) kullanıldı.</span>
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

        <div className="sheet-actions">
          <button
            className={"btn btn-quiet" + (busy === "dismiss" ? " is-busy" : "")}
            type="button"
            onClick={dismiss}
            disabled={Boolean(busy)}
          >
            Şimdilik değil
          </button>
          <button
            className={"btn btn-primary" + (busy === "apply" ? " is-busy" : "")}
            type="submit"
            disabled={Boolean(busy) || !valid}
          >
            <CheckCircle weight="bold" />
            Onayla ve uygula
          </button>
        </div>
      </form>
    </SheetFrame>
  );
}
