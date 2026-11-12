"use client";

import { useCallback, useEffect, useState } from "react";
import { ChartBar, Minus, PencilSimple, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import { SheetFrame } from "./Sheets";
import { askConfirm } from "./Feedback";
import { apiRequest, formatCurrency, formatDate, isPrivate, toDateInput } from "../lib/client";
import { TICKER_DOMAINS, logoSources } from "../lib/stockLogos";

/* Hisse fiyatı kuruşlu yazılır (45,32 TL); kira tutarlarından farklı olarak
   iki ondalık gösterilir. Gizlilik modunda tutar maskelenir. */
function formatPrice(value) {
  if (isPrivate()) return "•••• TL";
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0) + " TL";
}

function formatLots(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 4 }).format(value || 0);
}

// "1.234,56" → 1234.56 · "12,5" → 12.5 · "12.5" → 12.5
function parseNumber(text) {
  const raw = String(text ?? "").trim().replace(/\s/g, "");
  if (!raw) return NaN;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : NaN;
}

function StockLogo({ stock, size = "md" }) {
  const sources = logoSources(stock);
  const key = sources.join("|");
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [key]);
  const src = sources[index];
  return (
    <span className={"stock-logo is-" + size} aria-hidden="true">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setIndex((value) => value + 1)}
          onLoad={(event) => {
            // Simge servisleri bilinmeyen sitede 16 px'lik boş küre döndürür; onu say düşmüş.
            if (index > 0 && event.currentTarget.naturalWidth > 0 && event.currentTarget.naturalWidth < 24) {
              setIndex((value) => value + 1);
            }
          }}
        />
      ) : (
        <span className="stock-logo-letters">{stock.symbol.slice(0, 2)}</span>
      )}
    </span>
  );
}

/* ---------- Kağıt ekle / düzenle ---------- */
function StockFormSheet({ stock, token, onClose, onSaved }) {
  const editing = Boolean(stock);
  const [form, setForm] = useState({
    symbol: stock?.symbol || "",
    name: stock?.name || "",
    logoUrl: stock?.logoUrl || "",
    website: stock?.website || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = {
    symbol: (form.symbol || "?").toLocaleUpperCase("tr-TR"),
    logoUrl: form.logoUrl.trim(),
    website: form.website.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0],
  };
  const knownDomain = TICKER_DOMAINS[preview.symbol];

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = editing
        ? await apiRequest("/api/stocks?id=" + stock.id, {
            method: "PATCH",
            body: JSON.stringify({ name: form.name, logoUrl: form.logoUrl, website: form.website }),
          }, token)
        : await apiRequest("/api/stocks", { method: "POST", body: JSON.stringify(form) }, token);
      onSaved(result.stock, editing ? result.stock.symbol + " güncellendi." : result.stock.symbol + " eklendi.");
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return (
    <SheetFrame eyebrow="Borsa" title={editing ? stock.symbol + " · düzenle" : "Kağıt ekle"} size="compact" onClose={onClose}>
      <form className="sheet-form" onSubmit={submit}>
        <div className="stock-form-preview">
          <StockLogo stock={preview} size="lg" />
          <small className="field-hint">
            {preview.logoUrl
              ? "Yapıştırdığın logo kullanılıyor."
              : preview.website
                ? preview.website + " adresinden logo çekiliyor."
                : knownDomain
                  ? "Logo otomatik bulundu (" + knownDomain + ")."
                  : "Logo için şirketin web adresini yaz."}
          </small>
        </div>
        {editing ? null : (
          <div className="field">
            <label htmlFor="stock-symbol">Kağıt kodu</label>
            <input
              id="stock-symbol"
              value={form.symbol}
              onChange={(event) => setForm({ ...form, symbol: event.target.value.toLocaleUpperCase("tr-TR") })}
              placeholder="THYAO"
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={12}
              required
              autoFocus
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="stock-name">Şirket adı</label>
          <input
            id="stock-name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Türk Hava Yolları"
            maxLength={80}
          />
        </div>
        <div className="field">
          <label htmlFor="stock-website">Şirketin web adresi {knownDomain ? "(isteğe bağlı)" : ""}</label>
          <input
            id="stock-website"
            inputMode="url"
            autoCapitalize="none"
            value={form.website}
            onChange={(event) => setForm({ ...form, website: event.target.value })}
            placeholder={knownDomain || "ör. sirket.com.tr"}
          />
        </div>
        <div className="field">
          <label htmlFor="stock-logo">Logo görseli bağlantısı (isteğe bağlı)</label>
          <input
            id="stock-logo"
            type="url"
            inputMode="url"
            value={form.logoUrl}
            onChange={(event) => setForm({ ...form, logoUrl: event.target.value })}
            placeholder="https://…/logo.png"
          />
          <p className="field-hint">Otomatik logo beğenmezsen görselin bağlantısını yapıştır; bu öncelikli kullanılır.</p>
        </div>
        {error ? (
          <p className="form-error" role="alert"><WarningCircle weight="fill" />{error}</p>
        ) : null}
        <div className="sheet-actions">
          <button className="btn btn-quiet" type="button" onClick={onClose} disabled={busy}>Vazgeç</button>
          <button className={"btn btn-primary" + (busy ? " is-busy" : "")} type="submit" disabled={busy}>
            {editing ? "Kaydet" : "Ekle"}
          </button>
        </div>
      </form>
    </SheetFrame>
  );
}

/* ---------- Alım (+) / satış (−) ---------- */
function TradeSheet({ stock, side, token, onClose, onSaved }) {
  const buying = side === "buy";
  const [lots, setLots] = useState("1");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(toDateInput(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const lotValue = parseNumber(lots);
  const priceValue = parseNumber(price);
  const lotsValid = Number.isFinite(lotValue) && lotValue > 0 && (buying || lotValue <= stock.lots + 1e-9);
  const priceValid = buying ? Number.isFinite(priceValue) && priceValue > 0 : !price.trim() || Number.isFinite(priceValue);
  const valid = lotsValid && priceValid;

  // Alımdan sonra yeni ortalama (önizleme)
  const nextLots = buying ? stock.lots + (lotsValid ? lotValue : 0) : stock.lots - (lotsValid ? lotValue : 0);
  const nextAverage = buying && valid && nextLots > 0
    ? (stock.totalCost + lotValue * priceValue) / nextLots
    : stock.averagePrice;

  function step(delta) {
    const current = Number.isFinite(lotValue) ? lotValue : 0;
    const next = Math.max(1, Math.round(current) + delta);
    setLots(String(buying ? next : Math.min(next, Math.floor(stock.lots) || next)));
  }

  async function submit(event) {
    event.preventDefault();
    if (!valid) {
      setError(!lotsValid ? (buying ? "Lot adedini yaz." : "En fazla " + formatLots(stock.lots) + " lot düşebilirsin.") : "Alış fiyatını yaz.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest(
        "/api/stocks?id=" + stock.id + "&action=trade",
        { method: "POST", body: JSON.stringify({ side, lots: lotValue, price: price.trim() ? priceValue : "", date }) },
        token
      );
      onSaved(
        result.stock,
        stock.symbol + " · " + formatLots(lotValue) + " lot " + (buying ? "eklendi" : "düşüldü") + "."
      );
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return (
    <SheetFrame eyebrow={stock.symbol} title={buying ? "Alım ekle" : "Lot düş (satış)"} size="compact" onClose={onClose}>
      <form className="sheet-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="trade-lots">{buying ? "Aldığın lot" : "Sattığın lot"}</label>
          <div className="stock-stepper">
            <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Bir lot azalt">
              <Minus weight="bold" />
            </button>
            <input
              id="trade-lots"
              className="num"
              inputMode="decimal"
              value={lots}
              onChange={(event) => setLots(event.target.value)}
              autoFocus
            />
            <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Bir lot artır">
              <Plus weight="bold" />
            </button>
          </div>
          {buying ? null : <p className="field-hint">Elinde {formatLots(stock.lots)} lot var.</p>}
        </div>
        <div className="field">
          <label htmlFor="trade-price">{buying ? "Lot başı alış fiyatı (TL)" : "Satış fiyatı (isteğe bağlı)"}</label>
          <input
            id="trade-price"
            className="num"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="ör. 312,50"
            required={buying}
          />
        </div>
        <div className="field">
          <label htmlFor="trade-date">Tarih</label>
          <input id="trade-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>

        <div className="stock-preview">
          <div>
            <span>Lot</span>
            <strong className="num">{formatLots(stock.lots)} → {formatLots(Math.max(nextLots, 0))}</strong>
          </div>
          <div>
            <span>Ortalama</span>
            <strong className="num">{formatPrice(stock.averagePrice)} → {formatPrice(nextLots > 0 ? nextAverage : 0)}</strong>
          </div>
          {buying && valid ? (
            <div>
              <span>Bu alım</span>
              <strong className="num">{formatPrice(lotValue * priceValue)}</strong>
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="form-error" role="alert"><WarningCircle weight="fill" />{error}</p>
        ) : null}
        <div className="sheet-actions">
          <button className="btn btn-quiet" type="button" onClick={onClose} disabled={busy}>Vazgeç</button>
          <button className={"btn " + (buying ? "btn-primary" : "btn-glass") + (busy ? " is-busy" : "")} type="submit" disabled={busy || !valid}>
            {buying ? <Plus weight="bold" /> : <Minus weight="bold" />}
            {buying ? "Alımı ekle" : "Lot düş"}
          </button>
        </div>
      </form>
    </SheetFrame>
  );
}

/* ---------- Kağıt dosyası: işlem geçmişi ---------- */
function StockDetailSheet({ stock, token, onClose, onSaved, onEdit, onDeleted }) {
  const [busy, setBusy] = useState("");

  async function removeTrade(trade) {
    const ok = await askConfirm({
      title: "Bu satır silinsin mi?",
      message: formatDate(trade.date) + " · " + formatLots(trade.lots) + " lot " + (trade.side === "buy" ? "alım" : "satış") + ". Lot ve ortalama yeniden hesaplanır.",
      confirmLabel: "Sil",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(trade.id);
    try {
      const result = await apiRequest("/api/stocks?id=" + stock.id + "&tradeId=" + trade.id, { method: "DELETE" }, token);
      onSaved(result.stock, "Satır silindi.", true);
    } catch (error) {
      onSaved(null, error.message, true, "bad");
    } finally {
      setBusy("");
    }
  }

  async function removeStock() {
    const ok = await askConfirm({
      title: stock.symbol + " silinsin mi?",
      message: "Kağıt ve " + stock.trades.length + " alım/satış satırı kalıcı olarak silinir.",
      confirmLabel: "Sil",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("stock");
    try {
      await apiRequest("/api/stocks?id=" + stock.id, { method: "DELETE" }, token);
      onDeleted(stock);
    } catch (error) {
      onSaved(null, error.message, true, "bad");
      setBusy("");
    }
  }

  return (
    <SheetFrame eyebrow="Borsa" title={stock.symbol + (stock.name ? " · " + stock.name : "")} onClose={onClose}>
      <div className="sheet-form">
        <div className="stock-preview">
          <div><span>Lot</span><strong className="num">{formatLots(stock.lots)}</strong></div>
          <div><span>Ortalama</span><strong className="num">{formatPrice(stock.averagePrice)}</strong></div>
          <div><span>Maliyet</span><strong className="num">{formatCurrency(stock.totalCost)}</strong></div>
        </div>
        {stock.trades.length ? (
          <ul className="stock-trades">
            {stock.trades.map((trade) => (
              <li key={trade.id}>
                <span className={"pill " + (trade.side === "buy" ? "pill-ok" : "pill-calm")}>
                  {trade.side === "buy" ? <Plus weight="bold" /> : <Minus weight="bold" />}
                  {trade.side === "buy" ? "Alım" : "Satış"}
                </span>
                <span className="stock-trade-copy">
                  <strong className="num">{formatLots(trade.lots)} lot{trade.price ? " × " + formatPrice(trade.price) : ""}</strong>
                  <small>{formatDate(trade.date)}</small>
                </span>
                <button
                  type="button"
                  className={"icon-btn" + (busy === trade.id ? " is-busy" : "")}
                  onClick={() => removeTrade(trade)}
                  disabled={Boolean(busy)}
                  aria-label={formatDate(trade.date) + " satırını sil"}
                  title="Sil"
                >
                  <Trash weight="bold" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Henüz alım yok. Kutudaki + ile ilk alımı ekle.</p>
        )}
        <div className="sheet-actions">
          <button className={"btn is-danger" + (busy === "stock" ? " is-busy" : "")} type="button" onClick={removeStock} disabled={Boolean(busy)}>
            <Trash weight="bold" />
            Kağıdı sil
          </button>
          <button className="btn btn-glass" type="button" onClick={() => onEdit(stock)} disabled={Boolean(busy)}>
            <PencilSimple weight="bold" />
            Ad / logo
          </button>
        </div>
      </div>
    </SheetFrame>
  );
}

/* ---------- Borsa ekranı ---------- */
export default function StocksView({ token, onFlash }) {
  const [stocks, setStocks] = useState(null);
  const [sheet, setSheet] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await apiRequest("/api/stocks", {}, token);
      setStocks(result.stocks || []);
    } catch (error) {
      setStocks((current) => current || []);
      onFlash("bad", error.message);
    }
  }, [token, onFlash]);

  useEffect(() => {
    load();
  }, [load]);

  function upsert(stock) {
    setStocks((current) => {
      const list = current || [];
      const exists = list.some((item) => item.id === stock.id);
      const next = exists ? list.map((item) => (item.id === stock.id ? stock : item)) : [...list, stock];
      return next.sort((a, b) => a.symbol.localeCompare(b.symbol, "tr"));
    });
  }

  function saved(stock, message, keepOpen = false, tone = "ok") {
    if (stock) upsert(stock);
    onFlash(tone, message);
    if (keepOpen && stock) setSheet((current) => (current?.type === "detail" ? { ...current, stock } : current));
    else if (!keepOpen) setSheet(null);
  }

  if (!stocks) {
    return (
      <div className="view" aria-busy="true">
        <div className="empty">
          <ChartBar weight="duotone" />
          <strong>Borsa defteri hazırlanıyor</strong>
          <span>Kağıtlar ve alımlar toplanıyor.</span>
        </div>
      </div>
    );
  }

  const totalCost = stocks.reduce((sum, item) => sum + item.totalCost, 0);
  const held = stocks.filter((item) => item.lots > 0).length;

  return (
    <div className="view stocks-view">
      <div className="view-bar">
        <p className="view-summary">
          {stocks.length} kağıt · {held} elde · toplam maliyet {formatCurrency(totalCost)}
        </p>
        <div className="view-actions">
          <button className="btn btn-primary btn-sm" type="button" onClick={() => setSheet({ type: "form" })}>
            <Plus weight="bold" />
            Kağıt ekle
          </button>
        </div>
      </div>

      {stocks.length ? (
        <div className="stock-grid">
          {stocks.map((stock, index) => (
            <article className="stock-card glass" key={stock.id} style={{ "--i": index }}>
              <button
                type="button"
                className="stock-head"
                onClick={() => setSheet({ type: "detail", stock })}
                aria-label={stock.symbol + " ayrıntıları"}
              >
                <StockLogo stock={stock} />
                <strong className="stock-symbol">{stock.symbol}</strong>
                {stock.name ? <span className="stock-name">{stock.name}</span> : null}
              </button>

              <div className="stock-lots" role="group" aria-label={stock.symbol + " lot"}>
                <button
                  type="button"
                  className="stock-step"
                  onClick={() => setSheet({ type: "trade", side: "sell", stock })}
                  disabled={stock.lots <= 0}
                  aria-label={stock.symbol + " lot düş"}
                >
                  <Minus weight="bold" />
                </button>
                <span className="stock-lot-count">
                  <strong className="num">{formatLots(stock.lots)}</strong>
                  <small>lot</small>
                </span>
                <button
                  type="button"
                  className="stock-step is-add"
                  onClick={() => setSheet({ type: "trade", side: "buy", stock })}
                  aria-label={stock.symbol + " alım ekle"}
                >
                  <Plus weight="bold" />
                </button>
              </div>

              <div className="stock-foot">
                <span>Ortalama</span>
                <strong className="num">{stock.lots > 0 ? formatPrice(stock.averagePrice) : "—"}</strong>
                <small className="num">{stock.lots > 0 ? "Maliyet " + formatCurrency(stock.totalCost) : "Elde lot yok"}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <ChartBar weight="duotone" />
          <strong>Henüz kağıt yok</strong>
          <span>Kağıt ekle, sonra + ile her alımda lot ve fiyatı gir; ortalama kendiliğinden hesaplanır.</span>
        </div>
      )}

      {sheet?.type === "form" ? (
        <StockFormSheet
          stock={sheet.stock}
          token={token}
          onClose={() => setSheet(null)}
          onSaved={(stock, message) => saved(stock, message)}
        />
      ) : null}
      {sheet?.type === "trade" ? (
        <TradeSheet
          stock={sheet.stock}
          side={sheet.side}
          token={token}
          onClose={() => setSheet(null)}
          onSaved={(stock, message) => saved(stock, message)}
        />
      ) : null}
      {sheet?.type === "detail" ? (
        <StockDetailSheet
          stock={sheet.stock}
          token={token}
          onClose={() => setSheet(null)}
          onSaved={saved}
          onEdit={(stock) => setSheet({ type: "form", stock })}
          onDeleted={(stock) => {
            setStocks((current) => (current || []).filter((item) => item.id !== stock.id));
            setSheet(null);
            onFlash("ok", stock.symbol + " silindi.");
          }}
        />
      ) : null}
    </div>
  );
}
