"use client";

import {
  Buildings,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Clock,
  DownloadSimple,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { downloadCsv, formatCurrency, formatDate, formatMoneyShort } from "../lib/client";

const MONTH_LONG = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/* Aidat kutucuğu sözleşme tarihine bakmaz: ödeme alındıysa yeşil,
   alınmadıysa işaretlenmedi olarak kalır. */
const CELL = {
  paid: { label: "Ödendi", glyph: CheckCircle },
  unmarked: { label: "İşaretlenmedi", glyph: Plus },
};

function cellState(cell) {
  return cell.paid ? "paid" : "unmarked";
}

function cellTitle(row, cell) {
  const period = MONTH_LONG[cell.month - 1];
  const state = CELL[cellState(cell)].label;
  const tail = cell.paid ? "Tutarı düzeltmek için dokunun." : "Ödendi olarak işaretlemek için dokunun.";
  return `${row.label} · ${period} · ${state} · ${formatCurrency(cell.amount)}. ${tail}`;
}

export default function DuesView({
  grid,
  busy,
  pending,
  onYear,
  onToggle,
  onCreate,
  onEdit,
  onToggleActive,
  onDelete,
}) {
  if (!grid) {
    return (
      <div className="view" aria-busy="true">
        <div className="empty">
          <Buildings weight="duotone" />
          <strong>Aidat tablosu hazırlanıyor</strong>
          <span>Yılın 12 ayı kalem kalem toplanıyor.</span>
        </div>
      </div>
    );
  }

  const totals = grid.totals;

  function exportCsv() {
    downloadCsv(
      "vedat-gayrimenkul-" + grid.year + "-aidat.csv",
      ["Daire", "Aidat kalemi", "İlgili kiracı", "Ayın günü", ...grid.monthLabels, "Beklenen", "Ödenen", "Açık", "Oran"],
      grid.rows.filter((row) => !row.archived).map((row) => [
        row.unit || "—",
        row.title,
        row.tenantName || "Genel",
        row.dayOfMonth,
        ...row.months.map((cell) => CELL[cellState(cell)].label),
        row.expected,
        row.settled,
        row.outstanding,
        row.rate + "%",
      ])
    );
  }

  return (
    <div className="view" data-busy={busy} aria-busy={busy}>
      <div className="view-bar">
        <p className="view-summary">
          {totals.dueCount} aidat kalemi · {totals.paidMonths} ay ödendi ·{" "}
          {formatCurrency(totals.settled)} / {formatCurrency(totals.expected)}
        </p>
        <div className="view-actions">
          <div className="period glass glass--chip">
            <button type="button" onClick={() => onYear(grid.year - 1)} aria-label="Önceki yıl">
              <CaretLeft weight="bold" />
            </button>
            <strong>{grid.year}</strong>
            <button type="button" onClick={() => onYear(grid.year + 1)} aria-label="Sonraki yıl">
              <CaretRight weight="bold" />
            </button>
          </div>
          <button className="btn btn-glass btn-sm" type="button" onClick={exportCsv}>
            <DownloadSimple weight="bold" />
            Dışa aktar
          </button>
          <button className="btn btn-primary btn-sm" type="button" onClick={onCreate}>
            <Plus weight="bold" />
            Aidat ekle
          </button>
        </div>
      </div>

      <div className="pg-legend" role="note">
        <span className="pg-key state-paid"><CheckCircle weight="fill" />Ödendi</span>
        <span className="pg-key state-pending"><Plus weight="bold" />İşaretlenmedi</span>
        <span className="pg-hint">
          Boş aya dokunun: ödendi işaretlenir ve gider kaydı oluşur. Dolu aya dokunun: tutarı düzeltin.
        </span>
      </div>

      {grid.rows.length ? (
        <div className="pg-list">
          {grid.rows.map((row, index) => (
            <article
              className={"pg-card glass" + (row.isActive ? "" : " is-muted")}
              key={row.dueId}
              style={{ "--i": index }}
            >
              <header className="pg-head">
                <div className="pg-who">
                  <span className="avatar"><Buildings weight="fill" /></span>
                  <span className="who-copy">
                    <strong>{row.label}</strong>
                    <span>
                      {[
                        row.unit ? row.title : null,
                        row.tenantName || "Genel gider",
                        "her ayın " + row.dayOfMonth + ". günü",
                        row.isActive ? null : "duraklatıldı",
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </div>

                <div className="pg-figures">
                  <div className="pg-money">
                    <strong className="num">{formatCurrency(row.settled)}</strong>
                    <span>{row.paidMonths}/12 ay · {formatCurrency(row.amount)} aylık</span>
                  </div>
                  <div className="pg-actions">
                    <button className="btn btn-quiet btn-sm" type="button" onClick={() => onEdit(row)}>
                      <PencilSimple weight="bold" />
                      Düzenle
                    </button>
                    <button
                      className="btn btn-quiet btn-sm"
                      type="button"
                      onClick={() => onToggleActive(row)}
                      aria-pressed={!row.isActive}
                    >
                      <Clock weight="bold" />
                      {row.isActive ? "Duraklat" : "Sürdür"}
                    </button>
                    <button className="btn btn-quiet btn-sm" type="button" onClick={() => onDelete(row)}>
                      <Trash weight="bold" />
                      Sil
                    </button>
                  </div>
                </div>
              </header>

              <div className="pg-track">
                <div className={"spark " + (row.rate >= 100 ? "tone-ok" : "tone-accent")}>
                  <i style={{ width: Math.min(row.rate, 100) + "%" }} />
                </div>
                <span className="pg-track-note">
                  %{row.rate} ödendi
                  {row.outstanding ? " · " + formatCurrency(row.outstanding) + " açık" : " · açık yok"}
                </span>
              </div>

              <div className="pg-months" role="group" aria-label={row.label + " · " + grid.year + " ayları"}>
                {row.months.map((cell) => {
                  const state = cellState(cell);
                  const info = CELL[state];
                  const Glyph = info.glyph;
                  const key = row.dueId + ":" + cell.month;
                  const isPending = pending === key;
                  return (
                    <button
                      key={cell.month}
                      type="button"
                      className={
                        "pg-cell state-" + state +
                        (isPending ? " is-pending" : "") +
                        (grid.currentMonth === cell.month ? " is-now" : "")
                      }
                      onClick={() => onToggle(row, cell)}
                      disabled={isPending}
                      aria-pressed={cell.paid}
                      aria-label={cellTitle(row, cell)}
                      title={cellTitle(row, cell)}
                    >
                      <span className="pg-cell-top">
                        <span className="pg-cell-month">{cell.label}</span>
                        <Glyph weight={cell.paid ? "fill" : "bold"} className="pg-cell-glyph" />
                      </span>
                      <span className="pg-cell-amount num">{formatMoneyShort(cell.amount)}</span>
                    </button>
                  );
                })}
              </div>

              {row.endDate ? (
                <p className="pg-note">
                  <Clock weight="fill" />
                  {formatDate(row.startDate)} – {formatDate(row.endDate)} arası geçerli
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Buildings weight="duotone" />
          <strong>Henüz aidat kalemi yok</strong>
          <span>
            Daire daire ekleyin: her daire için 12 kutucuk oluşur, işaretledikçe gider
            ve raporlara işlenir.
          </span>
        </div>
      )}

      <article className="glass strip-panel" aria-label={grid.year + " aidat toplamı"}>
        <p className="strip-title">{grid.year} aidat toplamı</p>
        <div className="strip">
          <div className="strip-item">
            <strong className="num">{formatCurrency(totals.settled)}</strong>
            <span>Ödenen</span>
            <small>%{totals.rate} oran</small>
          </div>
          <div className="strip-item">
            <strong className="num">{formatCurrency(totals.expected)}</strong>
            <span>Beklenen</span>
            <small>{totals.dueCount} kalem</small>
          </div>
          <div className="strip-item">
            <strong className="num">{formatCurrency(totals.outstanding)}</strong>
            <span>Açık aidat</span>
            <small>{totals.dueCount * 12 - totals.paidMonths} işaretlenmemiş ay</small>
          </div>
          <div className="strip-item">
            <strong className="num">{totals.paidMonths}</strong>
            <span>İşaretli ay</span>
            <small>{totals.dueCount * 12} kutucuk</small>
          </div>
        </div>
      </article>
    </div>
  );
}
