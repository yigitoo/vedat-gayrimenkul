"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, CheckCircle, WarningCircle, X } from "@phosphor-icons/react";
import { SheetFrame } from "./Sheets";

/* ---------- Onay penceresi ----------
   Tarayıcının kendi onay kutusu cam tasarımın dışında kalıyordu ve telefonda
   adres çubuğunun adını taşıyordu. askConfirm her yerden çağrılır, bir söz
   döner; pencere sayfada tek bir ConfirmHost tarafından çizilir. */

let openConfirm = null;

export function askConfirm(options) {
  if (!openConfirm) return Promise.resolve(window.confirm(options.message || options.title));
  return new Promise((resolve) => openConfirm({ ...options, resolve }));
}

export function ConfirmHost() {
  const [request, setRequest] = useState(null);

  useEffect(() => {
    openConfirm = setRequest;
    return () => {
      openConfirm = null;
    };
  }, []);

  if (!request) return null;

  function answer(value) {
    request.resolve(value);
    setRequest(null);
  }

  const danger = request.tone === "danger";
  return (
    <SheetFrame eyebrow={request.eyebrow || "Onay"} title={request.title} size="compact" onClose={() => answer(false)}>
      {request.message ? <p className="confirm-copy">{request.message}</p> : null}
      <div className="sheet-actions">
        <button className="btn btn-quiet" type="button" onClick={() => answer(false)}>
          {request.cancelLabel || "Vazgeç"}
        </button>
        <button
          className={"btn " + (danger ? "btn-danger" : "btn-primary")}
          type="button"
          onClick={() => answer(true)}
          autoFocus
        >
          {request.confirmLabel || "Onayla"}
        </button>
      </div>
    </SheetFrame>
  );
}

/* ---------- Bildirim ----------
   Kısa süre görünür; üstüne gelince ya da odaklanınca süre durur. Geri
   alınabilir işlemlerde "Geri al" düğmesi taşır ve biraz daha uzun kalır. */

export function Toast({ flash, onClose }) {
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const remaining = useRef(0);
  const started = useRef(0);

  useEffect(() => {
    remaining.current = flash.action ? 7000 : 4200;
  }, [flash]);

  useEffect(() => {
    if (paused) return undefined;
    started.current = Date.now();
    const timer = window.setTimeout(onClose, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(remaining.current - (Date.now() - started.current), 1200);
    };
  }, [paused, flash, onClose]);

  const Glyph = flash.tone === "ok" ? CheckCircle : WarningCircle;

  return (
    <div
      className={"toast is-" + flash.tone}
      role={flash.tone === "bad" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Glyph weight="fill" />
      <strong>{flash.message}</strong>
      {flash.action ? (
        <button
          className={"toast-action" + (busy ? " is-busy" : "")}
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await flash.action.run();
            } finally {
              setBusy(false);
              onClose();
            }
          }}
        >
          <ArrowCounterClockwise weight="bold" />
          {flash.action.label || "Geri al"}
        </button>
      ) : null}
      <button className="toast-close" type="button" onClick={onClose} aria-label="Bildirimi kapat">
        <X weight="bold" />
      </button>
    </div>
  );
}
