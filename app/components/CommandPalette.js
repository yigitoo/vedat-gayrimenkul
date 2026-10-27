"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CaretRight, Eye, EyeSlash, HandCoins, MagnifyingGlass, Moon, Sun, X } from "@phosphor-icons/react";
import { formatCurrency, initials, matchesSearch, normalizeSearch } from "../lib/client";

/* Her yerden açılan arama: ⌘K / Ctrl+K, "/" ya da menü düğmesi.
   Boşken hızlı işlemler ve bölümler görünür; yazınca kiracılar, bölümler,
   işlemler ve ayarlar tek listede süzülür, ok tuşlarıyla gezilir.
   Telefonda tam ekran, geniş ekranda ortada bir pencere. */

export default function CommandPalette({
  views,
  actions,
  tenants,
  current,
  privacy,
  theme,
  onClose,
  onGo,
  onAction,
  onOpenTenant,
  onPayTenant,
  onTogglePrivacy,
  onToggleTheme,
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const needle = normalizeSearch(query);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previous = document.activeElement;
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  const toggles = useMemo(
    () => [
      {
        id: "privacy",
        label: privacy ? "Tutarları göster" : "Tutarları gizle",
        hint: "Gizlilik modu",
        icon: privacy ? Eye : EyeSlash,
        keywords: "gizle göster gizlilik bakiye rakam",
        run: onTogglePrivacy,
      },
      {
        id: "theme",
        label: theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç",
        hint: "Görünüm",
        icon: theme === "dark" ? Sun : Moon,
        keywords: "tema koyu açık gece",
        run: onToggleTheme,
      },
    ],
    [privacy, theme, onTogglePrivacy, onToggleTheme]
  );

  /* Yazılınca tek sıralı liste: önce kiracılar (en sık aranan), sonra
     bölümler, işlemler ve ayarlar. Her satır bir "run" taşır. */
  const results = useMemo(() => {
    if (!needle) return [];
    const list = [];
    tenants
      .filter((tenant) => matchesSearch(needle, tenant.name, tenant.address, tenant.phone))
      .slice(0, 6)
      .forEach((tenant) => {
        list.push({
          key: "t-" + tenant.id,
          group: "Kiracılar",
          tenant,
          label: tenant.name,
          hint: tenant.address,
          run: () => onOpenTenant(tenant),
        });
      });
    views
      .filter((item) => matchesSearch(needle, item.label, item.lead))
      .forEach((item) => list.push({ key: "v-" + item.id, group: "Bölümler", icon: item.icon, label: item.label, hint: item.lead, run: () => onGo(item.id) }));
    actions
      .filter((item) => matchesSearch(needle, item.label, item.keywords))
      .forEach((item) => list.push({ key: "a-" + item.id, group: "İşlemler", icon: item.icon, label: item.label, run: () => onAction(item) }));
    toggles
      .filter((item) => matchesSearch(needle, item.label, item.keywords))
      .forEach((item) => list.push({ key: "s-" + item.id, group: "Ayarlar", icon: item.icon, label: item.label, hint: item.hint, run: item.run }));
    return list;
  }, [needle, tenants, views, actions, toggles, onOpenTenant, onGo, onAction]);

  useEffect(() => setCursor(0), [needle]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((value) => (value + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((value) => (value - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      results[cursor]?.run();
    }
  }

  let lastGroup = "";

  return (
    <div
      className="palette-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Ara ve git" onKeyDown={onKeyDown}>
        <div className="palette-search">
          <MagnifyingGlass weight="bold" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Kiracı, bölüm ya da işlem ara"
            aria-label="Ara"
            aria-controls="palette-results"
            aria-activedescendant={results[cursor] ? "palette-" + results[cursor].key : undefined}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd className="palette-kbd">Esc</kbd>
          <button className="icon-btn palette-close" type="button" onClick={onClose} aria-label="Kapat">
            <X weight="bold" />
          </button>
        </div>

        <div className="palette-body" ref={listRef}>
          {needle ? (
            results.length ? (
              <ul className="palette-list" id="palette-results" role="listbox" aria-label="Sonuçlar">
                {results.map((item, index) => {
                  const heading = item.group !== lastGroup ? item.group : "";
                  lastGroup = item.group;
                  const Glyph = item.icon;
                  const active = index === cursor;
                  return (
                    <li key={item.key} role="presentation">
                      {heading ? <p className="palette-group">{heading}</p> : null}
                      <div
                        id={"palette-" + item.key}
                        role="option"
                        aria-selected={active}
                        data-active={active}
                        className="palette-item"
                        onMouseMove={() => setCursor(index)}
                      >
                        <button type="button" className="palette-main" onClick={item.run}>
                          {item.tenant ? (
                            <span className="avatar avatar-sm">{initials(item.tenant.name)}</span>
                          ) : (
                            <span className="palette-mark"><Glyph weight="fill" /></span>
                          )}
                          <span className="palette-copy">
                            <strong>{item.label}</strong>
                            {item.hint ? <small>{item.hint}</small> : null}
                          </span>
                          {item.tenant ? (
                            <span className="palette-side num">{formatCurrency(item.tenant.rentAmount)}</span>
                          ) : null}
                        </button>
                        {item.tenant ? (
                          <button
                            type="button"
                            className="btn btn-glass btn-sm palette-pay"
                            onClick={() => onPayTenant(item.tenant.id)}
                          >
                            <HandCoins weight="bold" />
                            Ödeme
                          </button>
                        ) : (
                          <ArrowRight weight="bold" className="palette-go" aria-hidden="true" />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="empty">
                <MagnifyingGlass weight="duotone" />
                <strong>Sonuç yok</strong>
                <span>Başka bir kelimeyle deneyin.</span>
              </div>
            )
          ) : (
            <>
              <section>
                <p className="palette-group">Hızlı işlemler</p>
                <div className="actions-grid">
                  {actions.map((item) => {
                    const Glyph = item.icon;
                    return (
                      <button key={item.id} type="button" className="action-tile" onClick={() => onAction(item)}>
                        <span className="action-mark"><Glyph weight="fill" /></span>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <p className="palette-group">Bölümler</p>
                <div className="more-list">
                  {views.map((item) => {
                    const Glyph = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={"more-item" + (current === item.id ? " is-active" : "")}
                        onClick={() => onGo(item.id)}
                        aria-current={current === item.id ? "page" : undefined}
                      >
                        <span className="more-mark"><Glyph weight="fill" /></span>
                        <span className="more-copy">
                          <strong>{item.label}</strong>
                          <small>{item.lead}</small>
                        </span>
                        <CaretRight weight="bold" />
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <p className="palette-group">Görünüm</p>
                <div className="palette-toggles">
                  {toggles.map((item) => {
                    const Glyph = item.icon;
                    return (
                      <button key={item.id} type="button" className="palette-toggle" onClick={item.run}>
                        <Glyph weight="bold" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>

        <p className="palette-foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> gez</span>
          <span><kbd>↵</kbd> aç</span>
          <span><kbd>⌘</kbd><kbd>K</kbd> her yerden</span>
        </p>
      </div>
    </div>
  );
}
