"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Clock,
  DownloadSimple,
  FilePdf,
  MagnifyingGlass,
  Minus,
  Plus,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  formatCurrency,
  formatDate,
  formatMoneyShort,
  initials,
  matchesSearch,
  normalizeSearch,
} from "../lib/client";

const MONTH_LONG = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/* Kutucuk durumları. Renk tek başına anlam taşımaz: her hücrede simge ve
   ekran okuyucuya giden tam cümle de var. */
const CELL = {
  paid: { label: "Ödendi", glyph: CheckCircle },
  partial: { label: "Eksik ödeme", glyph: WarningCircle },
  overdue: { label: "Gecikti", glyph: WarningCircle },
  upcoming: { label: "Yaklaşıyor", glyph: Clock },
  pending: { label: "Ödenecek", glyph: Plus },
  future: { label: "Sırada", glyph: Plus },
  outside: { label: "Sözleşme öncesi", glyph: Minus },
};

function cellTitle(row, cell) {
  const period = MONTH_LONG[cell.month - 1];
  const state = CELL[cell.status]?.label || "Ödenecek";
  const money = cell.status === "paid" || cell.status === "partial"
    ? formatCurrency(cell.paid) + " tahsil edildi"
    : formatCurrency(cell.expected) + " bekleniyor";
  const tail = cell.paid > 0 ? "Tutarı düzeltmek için dokunun." : "Ödendi olarak işaretlemek için dokunun.";
  return `${row.name} · ${period} · ${state} · ${money}. ${tail}`;
}

export default function PaymentGrid({
  grid,
  busy,
  pending,
  onYear,
  onToggle,
  onOpenTenant,
  onPay,
  onDefer,
  onExportMonth,
  onExportYear,
  exportBusy = "",
  query = "",
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState(1);

  useEffect(() => {
    if (grid) setExportMonth(grid.currentMonth || 1);
  }, [grid?.year, grid?.currentMonth]);

  if (!grid) {
    return (
      <div className="view" aria-busy="true">
        <div className="empty">
          <Clock weight="duotone" />
          <strong>Ödeme tablosu hazırlanıyor</strong>
          <span>Yılın 12 ayı kiracı kiracı toplanıyor.</span>
        </div>
      </div>
    );
  }

  const totals = grid.totals;
  const needle = normalizeSearch(query);
  const rows = grid.rows.filter((row) => matchesSearch(needle, row.name, row.address));

  return (
    <div className="view" data-busy={busy} aria-busy={busy}>
      <div className="view-bar">
        <p className="view-summary">
          {needle
            ? rows.length + " / " + totals.tenantCount + " kiracı eşleşti"
            : totals.tenantCount + " kiracı"}{" "}
          · {totals.paidMonths} ay işaretli · {formatCurrency(totals.received)} /{" "}
          {formatCurrency(totals.expected)}
        </p>
        <div className="view-actions pg-toolbar-actions">
          <div className="period glass glass--chip">
            <button type="button" onClick={() => onYear(grid.year - 1)} aria-label="Önceki yıl">
              <CaretLeft weight="bold" />
            </button>
            <strong>{grid.year}</strong>
            <button type="button" onClick={() => onYear(grid.year + 1)} aria-label="Sonraki yıl">
              <CaretRight weight="bold" />
            </button>
          </div>
          <button
            className={"btn btn-glass btn-sm pg-export-toggle" + (exportOpen ? " is-open" : "")}
            type="button"
            onClick={() => setExportOpen((value) => !value)}
            aria-expanded={exportOpen}
          >
            <DownloadSimple weight="bold" />
            Dışa aktar
          </button>
          <div className={"pg-exports" + (exportOpen ? " is-open" : "")}>
          <div className="pg-year-export" aria-label="Yıllık dışa aktarma">
            <button
              className={"btn btn-glass btn-sm" + (exportBusy === "year-excel" ? " is-busy" : "")}
              type="button"
              onClick={() => onExportYear(grid.year, "xlsx")}
              disabled={Boolean(exportBusy)}
              aria-label={grid.year + " Excel dışa aktar"}
            >
              <DownloadSimple weight="bold" />
              Yıl Excel
            </button>
            <button
              className={"btn btn-glass btn-sm" + (exportBusy === "year-pdf" ? " is-busy" : "")}
              type="button"
              onClick={() => onExportYear(grid.year, "pdf")}
              disabled={Boolean(exportBusy)}
              aria-label={grid.year + " PDF dışa aktar"}
            >
              <FilePdf weight="bold" />
              Yıl PDF
            </button>
          </div>
          <div className="pg-month-export" aria-label="Aylık dışa aktarma">
            <label className="pg-month-picker">
              <span className="sr-only">Dışa aktarılacak ay</span>
              <select
                value={exportMonth}
                onChange={(event) => setExportMonth(Number(event.target.value))}
                disabled={Boolean(exportBusy)}
                aria-label="Dışa aktarılacak ay"
              >
                {MONTH_LONG.map((label, index) => (
                  <option key={label} value={index + 1}>{label}</option>
                ))}
              </select>
            </label>
            <div className="pg-month-actions">
              <button
                className={"btn btn-glass btn-sm" + (exportBusy === "month-excel" ? " is-busy" : "")}
                type="button"
                onClick={() => onExportMonth(exportMonth, grid.year, "xlsx")}
                disabled={Boolean(exportBusy)}
                aria-label={MONTH_LONG[exportMonth - 1] + " " + grid.year + " Excel dışa aktar"}
              >
                <DownloadSimple weight="bold" />
                Ay Excel
              </button>
              <button
                className={"btn btn-glass btn-sm" + (exportBusy === "month-pdf" ? " is-busy" : "")}
                type="button"
                onClick={() => onExportMonth(exportMonth, grid.year, "pdf")}
                disabled={Boolean(exportBusy)}
                aria-label={MONTH_LONG[exportMonth - 1] + " " + grid.year + " PDF dışa aktar"}
              >
                <FilePdf weight="bold" />
                Ay PDF
              </button>
            </div>
          </div>
          </div>
          <button className="btn btn-primary btn-sm pg-add" type="button" onClick={() => onPay(null)}>
            <Plus weight="bold" />
            Ödeme ekle
          </button>
        </div>
</div>

      <div className="pg-legend" role="note">
        <span className="pg-key state-paid"><CheckCircle weight="fill" />Ödendi</span>
        <span className="pg-key state-partial"><WarningCircle weight="fill" />Eksik</span>
        <span className="pg-key state-overdue"><WarningCircle weight="fill" />Gecikti</span>
        <span className="pg-key state-pending"><Clock weight="fill" />Bekliyor</span>
        <span className="pg-hint">Boş aya dokunun: ödendi işaretlenir. Dolu aya dokunun: tutarı düzeltin.</span>
      </div>

      {rows.length ? (
        <div className="pg-list">
          {rows.map((row, index) => (
            <article className="pg-card glass" key={row.tenantId} style={{ "--i": index }}>
              <header className="pg-head">
                <button className="pg-who" type="button" onClick={() => onOpenTenant(row.tenantId)}>
                  <span className="avatar">{initials(row.name)}</span>
                  <span className="who-copy">
                    <strong>{row.name}</strong>
                    <span>{row.address}</span>
                  </span>
                  <ArrowUpRight weight="bold" className="pg-go" />
                </button>

                <div className="pg-figures">
                  <div className="pg-money">
                    <strong className="num">{formatCurrency(row.received)}</strong>
                    <span>
                      {row.paidMonths}/12 ay · {formatCurrency(row.rentAmount)} aylık
                    </span>
                  </div>
                  <div className="pg-actions">
                    <button className="btn btn-quiet btn-sm" type="button" onClick={() => onDefer(row.tenantId)}>
                      <Clock weight="bold" />
                      Ertele
                    </button>
                    <button className="btn btn-glass btn-sm" type="button" onClick={() => onPay(row.tenantId)}>
                      <Plus weight="bold" />
                      Tutar gir
                    </button>
                  </div>
                </div>
              </header>

              <div className="pg-track">
                <div className={"spark " + (row.rate >= 100 ? "tone-ok" : "tone-accent")}>
                  <i style={{ width: Math.min(row.rate, 100) + "%" }} />
                </div>
                <span className="pg-track-note">
                  %{row.rate} tahsilat
                  {row.outstanding ? " · " + formatCurrency(row.outstanding) + " açık" : " · açık yok"}
                </span>
              </div>

              <div className="pg-months" role="group" aria-label={row.name + " · " + grid.year + " ayları"}>
                {row.months.map((cell) => {
                  const info = CELL[cell.status] || CELL.pending;
                  const Glyph = info.glyph;
                  const key = row.tenantId + ":" + cell.month;
                  const isPending = pending === key;
                  const checked = cell.status === "paid";
                  return (
                    <button
                      key={cell.month}
                      type="button"
                      className={
                        "pg-cell state-" + cell.status +
                        (isPending ? " is-pending" : "") +
                        (grid.currentMonth === cell.month ? " is-now" : "")
                      }
                      onClick={() => onToggle(row, cell)}
                      disabled={isPending}
                      aria-pressed={checked}
                      aria-label={cellTitle(row, cell)}
                      title={cellTitle(row, cell)}
                    >
                      <span className="pg-cell-top">
                        <span className="pg-cell-month">{cell.label}</span>
                        <Glyph weight={checked ? "fill" : "bold"} className="pg-cell-glyph" />
                      </span>
                      <span className="pg-cell-amount num">
                        {formatMoneyShort(cell.paid > 0 ? cell.paid : cell.expected)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {row.months.some((cell) => cell.isDeferred) ? (
                <p className="pg-note">
                  <Clock weight="fill" />
                  Ertelenen dönem var:{" "}
                  {row.months
                    .filter((cell) => cell.isDeferred)
                    .map((cell) => MONTH_LONG[cell.month - 1] + " → " + formatDate(cell.dueDate))
                    .join(", ")}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : needle ? (
        <div className="empty">
          <MagnifyingGlass weight="duotone" />
          <strong>“{query.trim()}” ile eşleşen kiracı yok</strong>
          <span>Adın yazılışını değiştirin ya da aramayı temizleyin.</span>
        </div>
      ) : (
        <div className="empty">
          <Plus weight="duotone" />
          <strong>Henüz kiracı yok</strong>
          <span>İlk kiracıyı ekleyin; 12 aylık kutucuklar kendiliğinden oluşur.</span>
        </div>
      )}

      <article className="glass strip-panel" aria-label={grid.year + " toplamı"}>
        <p className="strip-title">
          {grid.year} toplamı{needle ? " · tüm kiracılar" : ""}
        </p>
        <div className="strip">
          <div className="strip-item">
            <strong className="num">{formatCurrency(totals.received)}</strong>
            <span>Tahsil edilen</span>
            <small>%{totals.rate} oran</small>
          </div>
          <div className="strip-item">
            <strong className="num">{formatCurrency(totals.expected)}</strong>
            <span>Beklenen</span>
            <small>{totals.tenantCount} kiracı</small>
          </div>
          <div className="strip-item">
            <strong className="num">{formatCurrency(totals.outstanding)}</strong>
            <span>Açık bakiye</span>
            <small>{totals.openMonths} dönem</small>
          </div>
          <div className="strip-item">
            <strong className="num">{totals.paidMonths}</strong>
            <span>İşaretli ay</span>
            <small>{totals.tenantCount * 12} kutucuk</small>
          </div>
        </div>
      </article>
    </div>
  );
}
