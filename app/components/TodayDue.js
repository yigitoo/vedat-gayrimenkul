"use client";

import { CalendarCheck, CheckCircle, Clock, MagnifyingGlass, Plus, Receipt, WarningCircle } from "@phosphor-icons/react";
import { formatCurrency, formatDate, initials, matchesSearch, normalizeSearch } from "../lib/client";
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
        ) : (
          <span className="pill pill-calm">
            <Clock weight="fill" />
            Son gün bugün
          </span>
        )}
        <span>
          {periodText(item)}
          {isLate ? " · son gün " + formatDate(item.dueDate) : ""}
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

/* Ödemeler › Bugün: takvimde bugünün tarihine düşen tahsilatlar alt alta,
   altında da son günü geçmiş dönemler. Yıl tablosu olduğu gibi kalır;
   burası yalnız "bugün kimden ne alacağım" sorusunu cevaplar. */
export default function TodayDue({ data, busy, pending, raises, onRaise, onMark, onPay, query = "" }) {
  if (!data) {
    return (
      <div className="view" aria-busy="true">
        <div className="empty">
          <Clock weight="duotone" />
          <strong>Bugünün listesi hazırlanıyor</strong>
          <span>Son günü bugün olan ve geciken dönemler toplanıyor.</span>
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
          {formatDate(data.date)} · {totals.todayCount || 0} tahsilat bugün · {totals.overdueCount || 0} geciken
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
            Bugün tahsil edilecekler
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
              <strong>{needle ? "Eşleşen tahsilat yok" : "Bugün son günü olan kira yok"}</strong>
              <span>{needle ? "Aramayı temizleyip tekrar bak." : "Yaklaşanları yıl tablosunda görebilirsin."}</span>
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
