"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowsClockwise,
  CalendarBlank,
  CalendarPlus,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Clock,
  Plus,
  Receipt,
  WarningCircle,
} from "@phosphor-icons/react";
import { dayWithSuffix, formatCurrency, formatDate, periodLabel, statusView } from "../lib/client";

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const TONE_ICON = { ok: CheckCircle, warn: Clock, bad: WarningCircle, calm: Clock };

function dayOf(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* Takvim üç kaynaktan beslenir: kira durumları, gerçekleşen giderler ve
   henüz gerçekleşmemiş düzenli kalemler. Hepsi aynı gün kutusunda toplanır.
   Aidat kalemleri burada gösterilmez; kendi sayfası (Aidat) var ve her ay
   tekrarlandığı için takvimi kalabalıklaştırıyordu. */
function buildEvents({ month, year, statuses, expenses, planned }) {
  const events = [];

  for (const item of statuses) {
    const source = item.paid ? item.lastDate : item.dueDate;
    const date = dayOf(source);
    if (!date || date.getMonth() + 1 !== month || date.getFullYear() !== year) continue;
    const view = statusView(item);
    events.push({
      kind: "rent",
      day: date.getDate(),
      tone: view.tone,
      label: view.label,
      title: item.tenant.name,
      amount: item.paid ? item.totalPaid : item.remaining,
      tenantId: item.tenant.id,
      paid: item.paid,
    });
  }

  for (const expense of expenses) {
    if (expense.category === "aidat") continue;
    const date = dayOf(expense.date);
    if (!date || date.getMonth() + 1 !== month || date.getFullYear() !== year) continue;
    events.push({
      kind: "expense",
      day: date.getDate(),
      tone: "warn",
      label: "Gider",
      title: expense.title,
      amount: expense.amount,
    });
  }

  for (const item of planned) {
    if (item.category === "aidat") continue;
    const date = dayOf(item.dueDate);
    if (!date || date.getMonth() + 1 !== month || date.getFullYear() !== year) continue;
    events.push({
      kind: "planned",
      day: date.getDate(),
      tone: "calm",
      label: "Planlı",
      title: item.title,
      amount: item.amount,
    });
  }

  return events.sort((a, b) => a.day - b.day);
}

function EventRow({ event }) {
  const Glyph = event.kind === "expense" ? Receipt
    : event.kind === "planned" ? ArrowsClockwise
      : TONE_ICON[event.tone] || Clock;
  return (
    <div className={"day-event" + (event.kind === "planned" ? " is-planned" : "")}>
      <span className={"day-event-mark tone-" + event.tone}><Glyph weight="fill" /></span>
      <div className="day-event-body">
        <strong>{event.title}</strong>
        <small>{event.label}</small>
      </div>
      <span className="day-event-amount num">{formatCurrency(event.amount)}</span>
    </div>
  );
}

export default function CalendarBoard({
  period,
  statuses,
  expenses = [],
  planned = [],
  onAddPayment,
  onAddExpense,
  onAddRecurrence,
  onSetRentDay,
  onShiftPeriod,
  onGoToday,
}) {
  const [selectedDay, setSelectedDay] = useState(1);
  const [mode, setMode] = useState("month");

  const events = useMemo(
    () => buildEvents({ month: period.month, year: period.year, statuses, expenses, planned }),
    [period.month, period.year, statuses, expenses, planned]
  );

  const cells = useMemo(() => {
    const leading = (new Date(period.year, period.month - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(period.year, period.month, 0).getDate();
    const total = Math.ceil((leading + daysInMonth) / 7) * 7;
    return Array.from({ length: total }, (_, index) => {
      const day = index - leading + 1;
      return day < 1 || day > daysInMonth ? null : day;
    });
  }, [period.month, period.year]);

  /* Yalnız dönem değişince seçim sıfırlanır. Bağımlılığa events girerse
     her veri tazelemesinde (ödeme işaretleme, yenileme) seçili gün başa
     dönüyordu; kullanıcı baktığı günü kaybediyordu. */
  useEffect(() => {
    const today = new Date();
    const isCurrent = today.getFullYear() === period.year && today.getMonth() + 1 === period.month;
    setSelectedDay(isCurrent ? today.getDate() : 1);
  }, [period.month, period.year]);

  const today = new Date();
  const todayDay =
    today.getFullYear() === period.year && today.getMonth() + 1 === period.month ? today.getDate() : 0;
  const selectedEvents = events.filter((event) => event.day === selectedDay);
  const selectedDate = new Date(period.year, period.month - 1, selectedDay, 12);

  const dayGroups = useMemo(() => {
    const map = new Map();
    for (const event of events) {
      if (!map.has(event.day)) map.set(event.day, []);
      map.get(event.day).push(event);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [events]);

  return (
    <div className="calendar glass glass--panel">
      <div className="cal-main">
        <div className="cal-toolbar">
          <div className="cal-nav">
            <button type="button" className="icon-btn" onClick={() => onShiftPeriod(-1)} aria-label="Önceki ay">
              <CaretLeft weight="bold" />
            </button>
            <strong>{periodLabel(period)}</strong>
            <button type="button" className="icon-btn" onClick={() => onShiftPeriod(1)} aria-label="Sonraki ay">
              <CaretRight weight="bold" />
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={onGoToday}>Bugün</button>
          </div>

          <div className="filters glass glass--chip" role="group" aria-label="Takvim görünümü">
            {[["month", "Ay"], ["agenda", "Ajanda"]].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={"filter" + (mode === key ? " is-active" : "")}
                onClick={() => setMode(key)}
                aria-pressed={mode === key}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "month" ? (
          <>
            <div className="cal-weekdays" aria-hidden="true">
              {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="cal-grid" role="grid" aria-label={periodLabel(period) + " takvimi"}>
              {cells.map((day, index) => {
                const dayEvents = day ? events.filter((event) => event.day === day) : [];
                return (
                  <div
                    key={String(day) + "-" + index}
                    className={
                      "cal-cell" +
                      (day ? "" : " is-empty") +
                      (day === selectedDay ? " is-selected" : "") +
                      (day && day === todayDay ? " is-today" : "")
                    }
                    role="gridcell"
                  >
                    {day ? (
                      <>
                        <button
                          type="button"
                          className="cal-cell-hit"
                          onClick={() => setSelectedDay(day)}
                          aria-label={day + " " + periodLabel(period) + ", " + dayEvents.length + " kayıt"}
                          aria-selected={day === selectedDay}
                        >
                          <span className="cal-day">{day}</span>
                          {dayEvents.slice(0, 3).map((event, eventIndex) => (
                            <span
                              className={"cal-event tone-" + event.tone + (event.kind === "planned" ? " is-planned" : "")}
                              key={event.title + eventIndex}
                            >
                              <i />
                              {event.title}
                            </span>
                          ))}
                          {dayEvents.length > 3 ? (
                            <span className="cal-more">+{dayEvents.length - 3}</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="cal-add"
                          onClick={() => {
                            setSelectedDay(day);
                            onAddPayment(new Date(period.year, period.month - 1, day, 12), null);
                          }}
                          aria-label={day + " gününe kayıt ekle"}
                          title="Bu güne kayıt ekle"
                        >
                          <Plus weight="bold" />
                        </button>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="agenda">
            {dayGroups.length ? (
              dayGroups.map(([day, items]) => (
                <div className="agenda-day" key={day}>
                  <button
                    type="button"
                    className={"agenda-date" + (day === todayDay ? " is-today" : "")}
                    onClick={() => {
                      setSelectedDay(day);
                      setMode("month");
                    }}
                  >
                    <strong className="num">{day}</strong>
                    <small>{WEEKDAYS[(new Date(period.year, period.month - 1, day).getDay() + 6) % 7]}</small>
                  </button>
                  <div className="agenda-events">
                    {items.map((event, index) => <EventRow event={event} key={event.title + index} />)}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty">
                <CalendarBlank weight="duotone" />
                <strong>Bu ayda kayıt yok</strong>
                <span>Ödeme, gider ya da düzenli kalem ekleyince burada sıralanır.</span>
              </div>
            )}
          </div>
        )}
      </div>

      <aside className="cal-detail" aria-live="polite">
        <div className="cal-detail-date">
          <p className="eyebrow">Seçili gün</p>
          <strong>{formatDate(selectedDate)}</strong>
          {selectedDay === todayDay ? <span className="pill pill-calm">Bugün</span> : null}
        </div>

        {selectedEvents.length ? (
          <div className="cal-detail-list">
            {selectedEvents.map((event, index) => (
              <div className="cal-detail-row" key={event.title + index}>
                <EventRow event={event} />
                {event.kind === "rent" && !event.paid ? (
                  <button
                    className="btn btn-glass btn-sm"
                    type="button"
                    onClick={() => onAddPayment(selectedDate, event.tenantId)}
                  >
                    Öde
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <CalendarBlank weight="duotone" />
            <strong>Bu güne kayıt yok</strong>
            <span>Aşağıdan bir kayıt ekleyebilirsiniz.</span>
          </div>
        )}

        <div className="cal-actions">
          <p className="strip-title">Bu güne ekle</p>
          <button className="btn btn-primary btn-wide" type="button" onClick={() => onAddPayment(selectedDate, null)}>
            <Plus weight="bold" />
            Ödeme kaydet
          </button>
          <button className="btn btn-glass btn-wide" type="button" onClick={() => onAddExpense(selectedDate)}>
            <Receipt weight="bold" />
            Gider ekle
          </button>
          <button className="btn btn-glass btn-wide" type="button" onClick={() => onAddRecurrence(selectedDay)}>
            <ArrowsClockwise weight="bold" />
            Her ayın {dayWithSuffix(selectedDay)} için düzenli gider
          </button>
          <button className="btn btn-quiet btn-wide" type="button" onClick={() => onSetRentDay(selectedDay)}>
            <CalendarPlus weight="bold" />
            Tahsilat gününü {selectedDay} yap
          </button>
        </div>

        <div className="cal-legend">
          <span className="tone-ok"><i className="legend-dot" />Ödendi</span>
          <span className="tone-calm"><i className="legend-dot" />Yaklaşan</span>
          <span className="tone-warn"><i className="legend-dot" />Gider</span>
          <span className="tone-bad"><i className="legend-dot" />Geciken</span>
        </div>
      </aside>
    </div>
  );
}
