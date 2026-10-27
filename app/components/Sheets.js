"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  Envelope,
  Phone,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  apiRequest,
  formatCurrency,
  formatDate,
  parseMoney,
  periodLabel,
  toDateInput,
} from "../lib/client";
import MoneyField from "./MoneyField";
import { askConfirm } from "./Feedback";

function FormError({ message }) {
  if (!message) return null;
  return (
    <p className="form-error" role="alert">
      <WarningCircle weight="fill" />
      {message}
    </p>
  );
}

export function SheetFrame({ eyebrow, title, wide, size, onClose, children }) {
  const cardRef = useRef(null);
  const lastSubmit = useRef(0);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cardRef.current?.querySelector("input, select, textarea, button")?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !cardRef.current) return;
      const focusable = cardRef.current.querySelectorAll(
        'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={"sheet glass glass--panel" + (wide ? " sheet-wide" : "") + (size ? " sheet-" + size : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={cardRef}
        onSubmitCapture={(event) => {
          // Enter'a art arda basılınca aynı kayıt iki kez oluşmasın.
          const now = Date.now();
          if (now - lastSubmit.current < 900) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          lastSubmit.current = now;
        }}
      >
        <div className="sheet-head">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Pencereyi kapat">
            <X weight="bold" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Kiracı kaydı ---------- */

export function TenantSheet({ mode, tenant, token, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: tenant?.name || "",
    address: tenant?.address || "",
    rentAmount: tenant?.rentAmount || "",
    paymentDay: tenant?.paymentDay || 1,
    phone: tenant?.phone || "",
    email: tenant?.email || "",
    contractStart: toDateInput(tenant?.contractStart),
    contractEnd: toDateInput(tenant?.contractEnd),
    deposit: tenant?.deposit || "",
    increaseRate: tenant?.increaseRate || "",
    notes: tenant?.notes || "",
    rentMode: "raise",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /* Tutar değiştiyse niyeti sormak gerekiyor: zam mı, yanlış girilmiş bir
     tutarın düzeltmesi mi? İkisi geçmiş dönemleri farklı etkiliyor. */
  const yeniKira = parseMoney(form.rentAmount);
  const kiraDegisti =
    mode === "edit" && Number.isFinite(yeniKira) && yeniKira !== Number(tenant?.rentAmount);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const method = mode === "edit" ? "PATCH" : "POST";
      const url = mode === "edit" ? "/api/tenants?id=" + tenant.id : "/api/tenants";
      await apiRequest(url, { method, body: JSON.stringify(form) }, token);
      await onSaved(
        mode !== "edit"
          ? "Yeni kiracı eklendi."
          : kiraDegisti && form.rentMode === "correction"
            ? "Kira tutarı düzeltildi, geçmiş aylar da güncellendi."
            : kiraDegisti
              ? "Zam kaydedildi, bu aydan itibaren geçerli."
              : "Kiracı bilgileri güncellendi."
      );
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return (
    <SheetFrame
      eyebrow="Portföy kaydı"
      title={mode === "edit" ? "Kiracıyı düzenle" : "Yeni kiracı"}
      wide
      onClose={onClose}
    >
      <form className="sheet-form" onSubmit={submit}>
        <p className="form-section">Kimlik ve mülk</p>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="tenant-name">Kiracı adı</label>
            <input id="tenant-name" value={form.name} onChange={(e) => update("name", e.target.value)} maxLength={120} autoComplete="off" required />
          </div>
          <div className="field span-2">
            <label htmlFor="tenant-address">Mülk adresi</label>
            <input id="tenant-address" value={form.address} onChange={(e) => update("address", e.target.value)} maxLength={240} autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="tenant-phone">Telefon <span>(isteğe bağlı)</span></label>
            <input id="tenant-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} maxLength={32} placeholder="0555 000 00 00" />
          </div>
          <div className="field">
            <label htmlFor="tenant-email">E-posta <span>(isteğe bağlı)</span></label>
            <input id="tenant-email" type="email" inputMode="email" autoCapitalize="off" value={form.email} onChange={(e) => update("email", e.target.value)} maxLength={120} placeholder="ornek@posta.com" />
          </div>
        </div>

        <p className="form-section">Kira ve sözleşme</p>
        <div className="form-grid">
          <MoneyField
            id="tenant-rent"
            label="Aylık kira"
            kind="rent"
            required
            value={form.rentAmount}
            onChange={(v) => update("rentAmount", v)}
            hint="Binlik ayracı nokta: 45.000"
          />
          <div className="field">
            <label htmlFor="tenant-day">Ödeme günü</label>
            <input id="tenant-day" type="number" inputMode="numeric" min="1" max="31" value={form.paymentDay} onChange={(e) => update("paymentDay", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="tenant-start">Sözleşme başlangıcı</label>
            <input id="tenant-start" type="date" value={form.contractStart} onChange={(e) => update("contractStart", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tenant-end">Sözleşme bitişi</label>
            <input id="tenant-end" type="date" value={form.contractEnd} onChange={(e) => update("contractEnd", e.target.value)} />
          </div>
          <MoneyField
            id="tenant-deposit"
            label="Depozito"
            kind="deposit"
            optional
            value={form.deposit}
            onChange={(v) => update("deposit", v)}
          />
          <div className="field">
            <label htmlFor="tenant-rate">Yıllık artış oranı (%)</label>
            <input id="tenant-rate" type="number" inputMode="decimal" min="0" max="200" step="0.1" value={form.increaseRate} onChange={(e) => update("increaseRate", e.target.value)} placeholder="0" />
            <span className="field-hint">Zam zamanı geldiğinde önerilecek oran.</span>
          </div>
          {kiraDegisti ? (
            <div className="field span-2 rent-mode">
              <span className="rent-mode-title">
                Kira {formatCurrency(tenant.rentAmount)} → {formatCurrency(yeniKira)} olarak değişiyor
              </span>
              <label className={"rent-mode-option" + (form.rentMode === "raise" ? " is-active" : "")}>
                <input
                  type="radio"
                  name="rent-mode"
                  checked={form.rentMode === "raise"}
                  onChange={() => update("rentMode", "raise")}
                />
                <span>
                  <strong>Zam yapıldı</strong>
                  <small>Bugünden itibaren geçerli. Geçmiş aylar eski tutarıyla kalır.</small>
                </span>
              </label>
              <label className={"rent-mode-option" + (form.rentMode === "correction" ? " is-active" : "")}>
                <input
                  type="radio"
                  name="rent-mode"
                  checked={form.rentMode === "correction"}
                  onChange={() => update("rentMode", "correction")}
                />
                <span>
                  <strong>Yanlış girilmişti, düzeltiyorum</strong>
                  <small>Tutar baştan beri buydu. Kira geçmişi sıfırlanır, tüm aylar bu tutara çekilir.</small>
                </span>
              </label>
            </div>
          ) : null}
          <div className="field span-2">
            <label htmlFor="tenant-notes">Not <span>(isteğe bağlı)</span></label>
            <textarea id="tenant-notes" rows={3} value={form.notes} onChange={(e) => update("notes", e.target.value)} maxLength={1000} placeholder="Sözleşme maddesi, demirbaş, iletişim tercihi…" />
          </div>
        </div>

        <FormError message={error} />
        <div className="sheet-actions">
          <button className="btn btn-quiet" type="button" onClick={onClose}>Vazgeç</button>
          <button className={"btn btn-primary" + (busy ? " is-busy" : "")} type="submit">Kaydet</button>
        </div>
      </form>
    </SheetFrame>
  );
}

/* ---------- Ödeme ---------- */

export function PaymentSheet({ tenantId, tenants, period, date, token, onClose, onSaved }) {
  const selected = tenants.find((tenant) => tenant.id === tenantId) || tenants[0];
  const [form, setForm] = useState({
    tenantId: selected?.id || "",
    amount: selected?.rentAmount || "",
    date: date ? toDateInput(date) : toDateInput(new Date()),
    month: period.month,
    year: period.year,
    note: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function changeTenant(value) {
    const next = tenants.find((tenant) => tenant.id === value);
    setForm((current) => ({ ...current, tenantId: value, amount: next?.rentAmount || current.amount }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/payments", { method: "POST", body: JSON.stringify(form) }, token);
      await onSaved("Ödeme kaydedildi, bildirim gönderildi.");
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return (
    <SheetFrame eyebrow="Dönem kaydı" title="Ödeme ekle" onClose={onClose}>
      <form className="sheet-form" onSubmit={submit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="payment-tenant">Kiracı</label>
            <select id="payment-tenant" value={form.tenantId} onChange={(e) => changeTenant(e.target.value)} required>
              {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
          </div>
          <MoneyField
            id="payment-amount"
            label="Tutar"
            kind="payment"
            required
            value={form.amount}
            onChange={(v) => update("amount", v)}
          />
          <div className="field">
            <label htmlFor="payment-date">Ödeme tarihi</label>
            <input id="payment-date" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="payment-month">Dönem ayı</label>
            <input id="payment-month" type="number" inputMode="numeric" min="1" max="12" value={form.month} onChange={(e) => update("month", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="payment-year">Dönem yılı</label>
            <input id="payment-year" type="number" inputMode="numeric" min="2000" max="2100" value={form.year} onChange={(e) => update("year", e.target.value)} required />
          </div>
          <div className="field span-2">
            <label htmlFor="payment-note">Not <span>(isteğe bağlı)</span></label>
            <input id="payment-note" value={form.note} onChange={(e) => update("note", e.target.value)} maxLength={240} placeholder="Örn. EFT dekontu" />
          </div>
        </div>
        <FormError message={error} />
        <div className="sheet-actions">
          <button className="btn btn-quiet" type="button" onClick={onClose}>Vazgeç</button>
          <button className={"btn btn-primary" + (busy ? " is-busy" : "")} type="submit">Ödemeyi kaydet</button>
        </div>
      </form>
    </SheetFrame>
  );
}

/* ---------- Gider ---------- */

export function ExpenseSheet({ tenants, categories, period, date, token, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: "",
    category: "aidat",
    amount: "",
    date: date ? toDateInput(date) : toDateInput(new Date()),
    month: period.month,
    year: period.year,
    tenantId: "",
    note: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/expenses", { method: "POST", body: JSON.stringify(form) }, token);
      await onSaved("Gider kaydedildi.");
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return (
    <SheetFrame eyebrow="Gider defteri" title="Gider ekle" onClose={onClose}>
      <form className="sheet-form" onSubmit={submit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="expense-title">Başlık</label>
            <input id="expense-title" value={form.title} onChange={(e) => update("title", e.target.value)} maxLength={120} placeholder="Örn. kombi bakımı" autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="expense-category">Kategori</label>
            <select id="expense-category" value={form.category} onChange={(e) => update("category", e.target.value)}>
              {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="expense-amount">Tutar (TL)</label>
            <input id="expense-amount" type="text" inputMode="decimal" value={form.amount} onChange={(e) => update("amount", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="expense-date">Tarih</label>
            <input id="expense-date" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="expense-tenant">İlgili kiracı <span>(isteğe bağlı)</span></label>
            <select id="expense-tenant" value={form.tenantId} onChange={(e) => update("tenantId", e.target.value)}>
              <option value="">Genel gider</option>
              {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="expense-note">Not <span>(isteğe bağlı)</span></label>
            <input id="expense-note" value={form.note} onChange={(e) => update("note", e.target.value)} maxLength={240} placeholder="Fatura no, usta adı…" />
          </div>
        </div>
        <FormError message={error} />
        <div className="sheet-actions">
          <button className="btn btn-quiet" type="button" onClick={onClose}>Vazgeç</button>
          <button className={"btn btn-primary" + (busy ? " is-busy" : "")} type="submit">Gideri kaydet</button>
        </div>
      </form>
    </SheetFrame>
  );
}

/* ---------- Erteleme ---------- */

export function DeferSheet({ tenantId, tenants, period, token, onClose, onSaved }) {
  const selected = tenants.find((tenant) => tenant.id === tenantId) || tenants[0];
  const [form, setForm] = useState({
    tenantId: selected?.id || "",
    dueDate: toDateInput(new Date(Date.now() + 7 * 86400000)),
    month: period.month,
    year: period.year,
    note: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/deferments", { method: "POST", body: JSON.stringify(form) }, token);
      await onSaved("Son ödeme tarihi güncellendi.");
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return (
    <SheetFrame eyebrow="Takvim notu" title="Kira tarihini ertele" onClose={onClose}>
      <form className="sheet-form" onSubmit={submit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="defer-tenant">Kiracı</label>
            <select id="defer-tenant" value={form.tenantId} onChange={(e) => update("tenantId", e.target.value)} required>
              {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="defer-date">Yeni son ödeme tarihi</label>
            <input id="defer-date" type="date" value={form.dueDate} onChange={(e) => update("dueDate", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="defer-month">Dönem ayı</label>
            <input id="defer-month" type="number" inputMode="numeric" min="1" max="12" value={form.month} onChange={(e) => update("month", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="defer-year">Dönem yılı</label>
            <input id="defer-year" type="number" inputMode="numeric" min="2000" max="2100" value={form.year} onChange={(e) => update("year", e.target.value)} required />
          </div>
          <div className="field span-2">
            <label htmlFor="defer-note">Not <span>(isteğe bağlı)</span></label>
            <input id="defer-note" value={form.note} onChange={(e) => update("note", e.target.value)} maxLength={240} placeholder="Örn. yazılı mutabakat" />
          </div>
        </div>
        <FormError message={error} />
        <div className="sheet-actions">
          <button className="btn btn-quiet" type="button" onClick={onClose}>Vazgeç</button>
          <button className={"btn btn-primary" + (busy ? " is-busy" : "")} type="submit">Ertelemeyi kaydet</button>
        </div>
      </form>
    </SheetFrame>
  );
}

/* ---------- Kiracı dosyası ---------- */

function contractState(tenant) {
  if (!tenant.contractEnd) return null;
  const days = Math.round((new Date(tenant.contractEnd) - new Date()) / 86400000);
  if (days < 0) return { tone: "bad", text: Math.abs(days) + " gün önce bitti" };
  if (days <= 60) return { tone: "warn", text: days + " gün sonra bitiyor" };
  return { tone: "ok", text: days + " gün kaldı" };
}

export function TenantDetailSheet({ tenant, token, onClose, onChanged }) {
  const [tab, setTab] = useState("summary");
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState("");
  const [raise, setRaise] = useState({
    rate: tenant.increaseRate || "",
    amount: "",
    effectiveFrom: toDateInput(new Date()),
    note: "",
  });
  const [raising, setRaising] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest("/api/payments?tenantId=" + tenant.id, {}, token)
      .then((payload) => {
        if (!cancelled) setPayments(payload.payments || []);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(requestError.message);
        setPayments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tenant.id, token]);

  async function removePayment(payment) {
    const ok = await askConfirm({
      title: "Ödeme kaydı silinsin mi?",
      message: formatCurrency(payment.amount) + " tutarındaki kayıt silinir; bu dönemin durumu yeniden hesaplanır.",
      confirmLabel: "Sil",
      tone: "danger",
    });
    if (!ok) return;

    setRemoving(payment.id);
    setError("");
    try {
      await apiRequest("/api/payments?id=" + payment.id, { method: "DELETE" }, token);
      setPayments((current) => current.filter((item) => item.id !== payment.id));
      onChanged("Ödeme kaydı silindi.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRemoving("");
    }
  }

  async function applyRaise(event) {
    event.preventDefault();
    setRaising(true);
    setError("");
    try {
      await apiRequest(
        "/api/tenants?id=" + tenant.id + "&action=raise",
        { method: "PATCH", body: JSON.stringify(raise) },
        token
      );
      onChanged("Kira güncellendi.");
      onClose();
    } catch (requestError) {
      setError(requestError.message);
      setRaising(false);
    }
  }

  const total = (payments || []).reduce((sum, item) => sum + item.amount, 0);
  const state = contractState(tenant);
  const preview = raise.amount
    ? parseMoney(raise.amount) || 0
    : raise.rate
      ? Math.round(tenant.rentAmount * (1 + Number(String(raise.rate).replace(",", ".")) / 100))
      : 0;

  return (
    <SheetFrame eyebrow="Kiracı dosyası" title={tenant.name} wide onClose={onClose}>
      <div className="tabs" role="tablist">
        {[["summary", "Özet"], ["payments", "Ödemeler"], ["raise", "Kira artışı"]].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={"tab-btn" + (tab === key ? " is-active" : "")}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <FormError message={error} />

      {tab === "summary" ? (
        <div className="detail">
          <div className="detail-grid">
            <div><strong className="num">{formatCurrency(tenant.rentAmount)}</strong><span>aylık kira</span></div>
            <div><strong className="num">{formatCurrency(tenant.deposit)}</strong><span>depozito</span></div>
            <div><strong className="num">{tenant.paymentDay}</strong><span>ödeme günü</span></div>
            <div><strong className="num">{tenant.increaseRate ? "%" + tenant.increaseRate : "—"}</strong><span>yıllık artış</span></div>
          </div>

          <dl className="detail-list">
            <div>
              <dt>Adres</dt>
              <dd>{tenant.address}</dd>
            </div>
            <div>
              <dt>Sözleşme</dt>
              <dd>
                {tenant.contractStart ? formatDate(tenant.contractStart) : "—"}
                {" → "}
                {tenant.contractEnd ? formatDate(tenant.contractEnd) : "—"}
                {state ? <span className={"pill pill-" + state.tone}>{state.text}</span> : null}
              </dd>
            </div>
            {tenant.phone ? (
              <div>
                <dt>Telefon</dt>
                <dd><a className="detail-link" href={"tel:" + tenant.phone}><Phone weight="fill" />{tenant.phone}<ArrowUpRight weight="bold" /></a></dd>
              </div>
            ) : null}
            {tenant.email ? (
              <div>
                <dt>E-posta</dt>
                <dd><a className="detail-link" href={"mailto:" + tenant.email}><Envelope weight="fill" />{tenant.email}<ArrowUpRight weight="bold" /></a></dd>
              </div>
            ) : null}
            {tenant.notes ? (
              <div>
                <dt>Not</dt>
                <dd className="detail-note">{tenant.notes}</dd>
              </div>
            ) : null}
          </dl>

          <div>
            <p className="form-section">Kira geçmişi</p>
            {tenant.rentHistory?.length ? (
              <div className="history-list">
                {tenant.rentHistory.map((item, index) => (
                  <div className="history-item" key={item.effectiveFrom + index}>
                    <div className="history-body">
                      <strong className="num">{formatCurrency(item.amount)}</strong>
                      <span>
                        {formatDate(item.effectiveFrom)}
                        {item.previousAmount ? " · önce " + formatCurrency(item.previousAmount) : ""}
                        {item.note ? " · " + item.note : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="chips-empty">Kira değişikliği kaydı yok.</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === "payments" ? (
        <div className="history">
          <div className="history-summary">
            <div><strong className="num">{formatCurrency(total)}</strong><span>toplam tahsilat</span></div>
            <div><strong className="num">{payments ? payments.length : "—"}</strong><span>kayıt</span></div>
            <div><strong className="num">{formatCurrency(tenant.rentAmount)}</strong><span>aylık kira</span></div>
          </div>

          {payments === null ? (
            <p className="history-empty">Geçmiş yükleniyor…</p>
          ) : payments.length ? (
            <div className="history-list">
              {payments.map((payment) => (
                <div className="history-item" key={payment.id}>
                  <div className="history-body">
                    <strong className="num">{formatCurrency(payment.amount)}</strong>
                    <span>
                      {formatDate(payment.date)} · {periodLabel({ month: payment.month, year: payment.year })}
                      {payment.note ? " · " + payment.note : ""}
                    </span>
                  </div>
                  <button
                    className={"icon-btn is-danger" + (removing === payment.id ? " is-busy" : "")}
                    type="button"
                    onClick={() => removePayment(payment)}
                    aria-label="Bu ödeme kaydını sil"
                  >
                    <Trash weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="history-empty">Bu kiracı için kayıtlı ödeme yok.</p>
          )}
        </div>
      ) : null}

      {tab === "raise" ? (
        <form className="sheet-form" onSubmit={applyRaise}>
          <p className="setting-lead">
            Oran girin, tutar hesaplansın; ya da yeni tutarı doğrudan yazın. Eski tutar
            kira geçmişinde saklanır, geçmiş dönem raporları bozulmaz.
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="raise-rate">Artış oranı (%)</label>
              <input
                id="raise-rate"
                type="number"
                inputMode="decimal"
                min="0"
                max="200"
                step="0.1"
                value={raise.rate}
                onChange={(e) => setRaise({ ...raise, rate: e.target.value, amount: "" })}
              />
            </div>
            <MoneyField
              id="raise-amount"
              label="Yeni tutar"
              kind="rent"
              optional
              value={raise.amount}
              onChange={(v) => setRaise({ ...raise, amount: v })}
              hint={preview ? "Orandan hesaplanan: " + formatCurrency(preview) : "Boş bırakırsanız orandan hesaplanır"}
            />
            <div className="field">
              <label htmlFor="raise-date">Geçerlilik tarihi</label>
              <input id="raise-date" type="date" value={raise.effectiveFrom} onChange={(e) => setRaise({ ...raise, effectiveFrom: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="raise-note">Not <span>(isteğe bağlı)</span></label>
              <input id="raise-note" value={raise.note} onChange={(e) => setRaise({ ...raise, note: e.target.value })} maxLength={240} placeholder="TÜFE, mutabakat…" />
            </div>
          </div>

          {preview ? (
            <p className="raise-preview">
              <span>{formatCurrency(tenant.rentAmount)}</span>
              <ArrowUpRight weight="bold" />
              <strong className="num">{formatCurrency(preview)}</strong>
              <small>aylık fark {formatCurrency(preview - tenant.rentAmount)}</small>
            </p>
          ) : null}

          <div className="sheet-actions">
            <button className="btn btn-quiet" type="button" onClick={onClose}>Vazgeç</button>
            <button className={"btn btn-primary" + (raising ? " is-busy" : "")} type="submit" disabled={!preview}>
              Kirayı güncelle
            </button>
          </div>
        </form>
      ) : null}

      {tab !== "raise" ? (
        <div className="sheet-actions">
          <button className="btn btn-quiet" type="button" onClick={onClose}>Kapat</button>
        </div>
      ) : null}
    </SheetFrame>
  );
}

/* ---------- Düzenli gider ---------- */

export function RecurrenceSheet({
  tenants,
  categories,
  dayOfMonth,
  item,
  lockCategory,
  token,
  onClose,
  onSaved,
}) {
  const editing = Boolean(item?.id ?? item?.dueId);
  const editId = item?.id || item?.dueId || "";
  const [form, setForm] = useState({
    title: item?.title || "",
    unit: item?.unit || "",
    category: lockCategory || item?.category || "aidat",
    amount: item?.amount ?? "",
    dayOfMonth: item?.dayOfMonth || dayOfMonth || 1,
    tenantId: item?.tenantId || "",
    startDate: toDateInput(item?.startDate || new Date()),
    endDate: item?.endDate ? toDateInput(item.endDate) : "",
    note: item?.note || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isDue = (lockCategory || form.category) === "aidat";

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = JSON.stringify(lockCategory ? { ...form, category: lockCategory } : form);
      if (editing) {
        await apiRequest("/api/recurrences?id=" + editId, { method: "PUT", body }, token);
        await onSaved(isDue ? "Aidat kalemi güncellendi." : "Düzenli gider güncellendi.");
        return;
      }
      const result = await apiRequest("/api/recurrences", { method: "POST", body }, token);
      await onSaved(
        isDue
          ? "Aidat kalemi eklendi, 12 aylık kutucukları hazır."
          : result.materialized
            ? "Düzenli gider eklendi, bu ayki kayıt oluşturuldu."
            : "Düzenli gider eklendi, günü geldiğinde işlenecek."
      );
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return (
    <SheetFrame
      eyebrow="Her ay tekrar eder"
      title={isDue ? (editing ? "Aidat kalemini düzenle" : "Aidat kalemi") : "Düzenli gider"}
      onClose={onClose}
    >
      <form className="sheet-form" onSubmit={submit}>
        <p className="setting-lead">
          {isDue
            ? "Ayın belirlediğiniz gününde aidat yükümlülüğü doğar. Aidat sayfasındaki kutucuğa dokunduğunuzda ödendi işaretlenir ve gider kaydı oluşur."
            : "Ayın belirlediğiniz gününde otomatik gider kaydı oluşur. Takvimde günü gelene kadar planlı olarak görünür."}
        </p>
        <div className="form-grid">
          {lockCategory === "aidat" ? (
            <div className="field">
              <label htmlFor="rec-unit">Daire</label>
              <input id="rec-unit" value={form.unit} onChange={(e) => update("unit", e.target.value)} maxLength={60} placeholder="Örn. Daire 3" autoComplete="off" />
            </div>
          ) : null}
          <div className={"field" + (lockCategory === "aidat" ? "" : " span-2")}>
            <label htmlFor="rec-title">Başlık</label>
            <input id="rec-title" value={form.title} onChange={(e) => update("title", e.target.value)} maxLength={120} placeholder={lockCategory === "aidat" ? "Örn. Apartman aidatı" : "Örn. A Blok apartman aidatı"} autoComplete="off" required />
          </div>
          {lockCategory ? null : (
            <div className="field">
              <label htmlFor="rec-category">Kategori</label>
              <select id="rec-category" value={form.category} onChange={(e) => update("category", e.target.value)}>
                {categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          )}
          <MoneyField
            id="rec-amount"
            label="Tutar"
            kind={lockCategory === "aidat" || form.category === "aidat" ? "due" : "expense"}
            required
            value={form.amount}
            onChange={(v) => update("amount", v)}
          />
          <div className="field">
            <label htmlFor="rec-day">Ayın günü</label>
            <input id="rec-day" type="number" inputMode="numeric" min="1" max="31" value={form.dayOfMonth} onChange={(e) => update("dayOfMonth", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="rec-tenant">İlgili kiracı <span>(isteğe bağlı)</span></label>
            <select id="rec-tenant" value={form.tenantId} onChange={(e) => update("tenantId", e.target.value)}>
              <option value="">Genel gider</option>
              {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rec-start">Başlangıç</label>
            <input id="rec-start" type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="rec-end">Bitiş <span>(isteğe bağlı)</span></label>
            <input id="rec-end" type="date" value={form.endDate} onChange={(e) => update("endDate", e.target.value)} />
          </div>
          <div className="field span-2">
            <label htmlFor="rec-note">Not <span>(isteğe bağlı)</span></label>
            <input id="rec-note" value={form.note} onChange={(e) => update("note", e.target.value)} maxLength={240} />
          </div>
        </div>
        <FormError message={error} />
        <div className="sheet-actions">
          <button className="btn btn-quiet" type="button" onClick={onClose}>Vazgeç</button>
          <button className={"btn btn-primary" + (busy ? " is-busy" : "")} type="submit">Kaydet</button>
        </div>
      </form>
    </SheetFrame>
  );
}

/* ---------- Tahsilat günü ---------- */

export function RentDaySheet({ tenants, day, token, onClose, onSaved }) {
  const [tenantId, setTenantId] = useState(tenants[0]?.id || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = tenants.find((tenant) => tenant.id === tenantId);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest(
        "/api/tenants?id=" + tenantId,
        { method: "PATCH", body: JSON.stringify({ paymentDay: day }) },
        token
      );
      await onSaved("Tahsilat günü ayın " + day + ". günü olarak ayarlandı.");
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return (
    <SheetFrame eyebrow="Düzenli tahsilat" title={"Her ayın " + day + ". günü"} onClose={onClose}>
      <form className="sheet-form" onSubmit={submit}>
        <p className="setting-lead">
          Seçilen kiracının kirası her ay bu günde beklenir. Takvim, hatırlatmalar ve
          gecikme hesabı bu güne göre çalışır.
        </p>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="rentday-tenant">Kiracı</label>
            <select id="rentday-tenant" value={tenantId} onChange={(e) => setTenantId(e.target.value)} required>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} (şu an ayın {tenant.paymentDay}. günü)
                </option>
              ))}
            </select>
          </div>
        </div>
        {selected ? (
          <p className="raise-preview">
            <span>Ayın {selected.paymentDay}. günü</span>
            <ArrowUpRight weight="bold" />
            <strong className="num">Ayın {day}. günü</strong>
            <small>{formatCurrency(selected.rentAmount)} aylık kira</small>
          </p>
        ) : null}
        <FormError message={error} />
        <div className="sheet-actions">
          <button className="btn btn-quiet" type="button" onClick={onClose}>Vazgeç</button>
          <button className={"btn btn-primary" + (busy ? " is-busy" : "")} type="submit" disabled={!tenantId}>
            Kaydet
          </button>
        </div>
      </form>
    </SheetFrame>
  );
}
