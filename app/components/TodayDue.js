"use client";

import { CalendarCheck, CheckCircle, Clock, MagnifyingGlass, Plus, Receipt, UserPlus, WarningCircle } from "@phosphor-icons/react";
import { formatCurrency, formatDate, formatShortDate, initials, matchesSearch, normalizeSearch } from "../lib/client";
import { RaiseSuggestions } from "./Raises";

const MONTH_LONG = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function periodText(item) {
  return MONTH_LONG[item.month - 1] + " " + item.year;
}

function DueRow({ item, index, pending, onMark, onPay }) {
  const key = item.tenantId + ":" + item.year + ":" + item.month;
  const isLate = item.status === "overdue";
  const partial = item.paid > 0;
  return (
    <article className="row glass" style={{ "--i": index }}>
      <div className="who">
        <span className="avatar">{initials(item.name)}</span>
        <div className="who-copy">
          <strong>{item.name}</strong>
          <span>{item.address}</span>
        </div>
      </div>
      <div className="row-status">
        {isLate ? (
          <span className="pill pill-bad">
            <WarningCircle weight="fill" />
            {item.daysOverdue} gün gecikti
          </span>
        ) : item.status === "today" ? (
          <span className="pill pill-calm">
            <Clock weight="fill" />
            Son gün bugün
          </span>
        ) : item.status === "partial" ? (
          <span className="pill pill-warn">
            <WarningCircle weight="fill" />
            Eksik ödeme
          </span>
        ) : (
          <span className="pill pill-calm">
            <UserPlus weight="fill" />
            Bugün eklendi
          </span>
        )}
        <span>
          {periodText(item)}
          {item.status !== "today"
            ? " · son gün " + formatShortDate(item.dueDate, new Date(item.dueDate).getFullYear() !== new Date().getFullYear())
            : ""}
          {item.isDeferred ? " · ertelendi" : ""}
          {partial ? " · " + formatCurrency(item.paid) + " ödendi" : ""}
        </span>
      </div>
      <div className="row-actions">
        <button
          className={"btn btn-glass btn-sm" + (pending === key ? " is-busy" : "")}
          type="button"
          onClick={() => onMark(item)}
          disabled={pending === key}
          aria-label={item.name + " · " + periodText(item) + " ödendi olarak işaretle"}
        >
          <CheckCircle weight="bold" />
          Ödendi
        </button>
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          onClick={() => onPay(item)}
          aria-label={item.name + " · " + periodText(item) + " için tutar gir"}
        >
          <Receipt weight="bold" />
          Tutar gir
        </button>
      </div>
      <div className="row-money">
        <strong className={"num" + (isLate ? " tone-bad" : "")}>{formatCurrency(item.remaining)}</strong>
        <span>{partial ? "kalan" : "tahsil edilecek"}</span>
      </div>
    </article>
  );
}

/* Ödemeler › Günlük tahsilat: son günü bugün olanlar, eksik ödenenler ve
   bugün eklenen kiracılar alt alta; altında son günü geçmiş dönemler. Ay tam
   ödenince satır listeden düşer. Yıl tablosu olduğu gibi kalır. */
export default function TodayDue({ data, busy, pending, raises, onRaise, onMark, onPay, query = "" }) {
  if (!data) {
    return (
      <div className="view" aria-busy="true">
        <div className="empty">
          <Clock weight="duotone" />
          <strong>Günlük tahsilat hazırlanıyor</strong>
          <span>Bugünkü, eksik ve geciken dönemler toplanıyor.</span>
        </div>
      </div>
    );
  }

  const needle = normalizeSearch(query);
  const filter = (list) => list.filter((item) => matchesSearch(needle, item.name, item.address));
  const today = filter(data.today || []);
  const overdue = filter(data.overdue || []);
  const totals = data.totals || {};

  return (
    <div className="view payments-view today-view" data-busy={busy} aria-busy={busy}>
      <div className="view-bar">
        <p className="view-summary">
          {formatDate(data.date)} · {totals.todayCount || 0} tahsilat · {totals.overdueCount || 0} geciken
          {totals.paidToday ? " · bugün " + formatCurrency(totals.paidToday) + " alındı" : ""}
        </p>
        <div className="view-actions">
          <button className="btn btn-primary btn-sm" type="button" onClick={() => onPay(null)}>
            <Plus weight="bold" />
            Ödeme ekle
          </button>
        </div>
      </div>

      <RaiseSuggestions raises={raises} onOpen={onRaise} compact />

      <section className="today-section" aria-labelledby="today-due-title">
        <header className="today-head">
          <h2 id="today-due-title">
            <CalendarCheck weight="bold" />
            Günlük tahsilat
          </h2>
          <strong className="num">{formatCurrency(totals.todayAmount || 0)}</strong>
        </header>
        <div className="rows">
          {today.length ? (
            today.map((item, index) => (
              <DueRow
                key={item.tenantId + item.year + item.month}
                item={item}
                index={index}
                pending={pending}
                onMark={onMark}
                onPay={onPay}
              />
            ))
          ) : (
            <div className="empty">
              {needle ? <MagnifyingGlass weight="duotone" /> : <CheckCircle weight="duotone" />}
              <strong>{needle ? "Eşleşen tahsilat yok" : "Bugün tahsil edilecek kira yok"}</strong>
              <span>{needle ? "Aramayı temizleyip tekrar bak." : "Son günü bugün olan ya da eksik ödenen dönem yok."}</span>
            </div>
          )}
        </div>
      </section>

      <section className="today-section" aria-labelledby="today-late-title">
        <header className="today-head is-late">
          <h2 id="today-late-title">
            <WarningCircle weight="bold" />
            Gecikenler
          </h2>
          <strong className="num">{formatCurrency(totals.overdueAmount || 0)}</strong>
        </header>
        <div className="rows">
          {overdue.length ? (
            overdue.map((item, index) => (
              <DueRow
                key={item.tenantId + item.year + item.month}
                item={item}
                index={index}
                pending={pending}
                onMark={onMark}
                onPay={onPay}
              />
            ))
          ) : (
            <div className="empty">
              {needle ? <MagnifyingGlass weight="duotone" /> : <CheckCircle weight="duotone" />}
              <strong>{needle ? "Eşleşen gecikme yok" : "Geciken ödeme yok"}</strong>
              <span>{needle ? "Aramayı temizleyip tekrar bak." : "Son günü geçen her dönem tahsil edilmiş."}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
