"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alarm,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Circle,
  NotePencil,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { apiRequest, formatDate, periodLabel } from "../lib/client";

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const DAY_MS = 86400000;

function sameDay(date, year, month, day) {
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
}

function timeLabel(value) {
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function dateTimeLabel(value) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/* Kalan süreyi gün/saat/dakika/saniye olarak böler. Süre geçtiyse aynı
   parçalar geçen süreyi anlatır; yön ayrıca döner. */
function splitDuration(ms) {
  const abs = Math.abs(ms);
  return {
    past: ms < 0,
    days: Math.floor(abs / DAY_MS),
    hours: Math.floor((abs % DAY_MS) / 3600000),
    minutes: Math.floor((abs % 3600000) / 60000),
    seconds: Math.floor((abs % 60000) / 1000),
  };
}

function shortDuration(ms) {
  const part = splitDuration(ms);
  if (part.days) return part.days + "g " + part.hours + "s";
  if (part.hours) return part.hours + "s " + part.minutes + "dk";
  return part.minutes + "dk";
}

/* Akan saat: halka, birimin dolu kısmını gösterir. Saniye halkası her
   saniye ilerler; gün halkası en fazla 30 güne göre ölçeklenir. */
function Ring({ value, max, label, tone = "accent", size = 76 }) {
  const stroke = size > 60 ? 6 : 4;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div className={"cd-ring tone-" + tone} style={{ width: size, height: size }}>
      <svg viewBox={"0 0 " + size + " " + size} aria-hidden="true">
        <circle className="cd-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <circle
          className="cd-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - ratio)}
        />
      </svg>
      <span className="cd-ring-copy">
        <strong className="num">{String(value).padStart(2, "0")}</strong>
        {label ? <small>{label}</small> : null}
      </span>
    </div>
  );
}

function Countdown({ todo, now, onOpen }) {
  const diff = new Date(todo.dueAt).getTime() - now;
  const part = splitDuration(diff);
  const tone = part.past ? "bad" : part.days === 0 ? "warn" : "accent";
  return (
    <article className="countdown glass glass--panel">
      <div className="countdown-head">
        <span className={"countdown-mark tone-" + tone}><Alarm weight="fill" /></span>
        <div>
          <p className="eyebrow">{part.past ? "Süresi geçti" : "Sıradaki hatırlatma"}</p>
          <button type="button" className="countdown-title" onClick={() => onOpen(todo)}>
            {todo.title}
          </button>
          <small>{dateTimeLabel(todo.dueAt)}</small>
        </div>
      </div>
      <div className="countdown-rings" role="timer" aria-label={todo.title + " için kalan süre"}>
        <Ring value={part.days} max={Math.max(30, part.days)} label="Gün" tone={tone} />
        <Ring value={part.hours} max={24} label="Saat" tone={tone} />
        <Ring value={part.minutes} max={60} label="Dakika" tone={tone} />
        <Ring value={part.seconds} max={60} label="Saniye" tone={tone} />
      </div>
      {todo.note ? <p className="countdown-note">{todo.note}</p> : null}
    </article>
  );
}

export default function TodosView({ token, onFlash }) {
  const [period, setPeriod] = useState(() => {
    const today = new Date();
    return { month: today.getMonth() + 1, year: today.getFullYear() };
  });
  const [selectedDay, setSelectedDay] = useState(() => new Date().getDate());
  const [todos, setTodos] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [form, setForm] = useState({ title: "", time: "09:00", note: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    const from = new Date(period.year, period.month - 1, 1);
    const to = new Date(period.year, period.month, 1);
    setLoading(true);
    try {
      const payload = await apiRequest(
        "/api/todos?from=" + encodeURIComponent(from.toISOString()) + "&to=" + encodeURIComponent(to.toISOString()),
        {},
        token
      );
      setTodos(payload.todos || []);
      setUpcoming(payload.upcoming || []);
    } catch (error) {
      onFlash("bad", error.message);
    } finally {
      setLoading(false);
    }
  }, [period.month, period.year, token, onFlash]);

  useEffect(() => {
    load();
  }, [load]);

  const cells = useMemo(() => {
    const leading = (new Date(period.year, period.month - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(period.year, period.month, 0).getDate();
    const total = Math.ceil((leading + daysInMonth) / 7) * 7;
    return Array.from({ length: total }, (_, index) => {
      const day = index - leading + 1;
      return day < 1 || day > daysInMonth ? null : day;
    });
  }, [period.month, period.year]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const todo of todos) {
      const day = new Date(todo.dueAt).getDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(todo);
    }
    return map;
  }, [todos]);

  const today = new Date(now);
  const todayDay = today.getFullYear() === period.year && today.getMonth() + 1 === period.month ? today.getDate() : 0;
  const selectedTodos = byDay.get(selectedDay) || [];
  const selectedDate = new Date(period.year, period.month - 1, selectedDay, 12);

  // Önce süresi geçmemiş en yakını; hepsi geçtiyse en son geçeni öne al.
  const ahead = upcoming.filter((todo) => new Date(todo.dueAt).getTime() >= now);
  const overdue = upcoming.filter((todo) => new Date(todo.dueAt).getTime() < now);
  const featured = ahead[0] || overdue[overdue.length - 1] || null;
  const queue = [...overdue, ...ahead].filter((todo) => todo !== featured).slice(0, 6);

  function shift(delta) {
    const date = new Date(period.year, period.month - 1 + delta, 1);
    setPeriod({ month: date.getMonth() + 1, year: date.getFullYear() });
    setSelectedDay(1);
  }

  function goToday() {
    const date = new Date();
    setPeriod({ month: date.getMonth() + 1, year: date.getFullYear() });
    setSelectedDay(date.getDate());
  }

  function openTodo(todo) {
    const date = new Date(todo.dueAt);
    setPeriod({ month: date.getMonth() + 1, year: date.getFullYear() });
    setSelectedDay(date.getDate());
  }

  async function submit(event) {
    event.preventDefault();
    const [hour, minute] = (form.time || "09:00").split(":").map(Number);
    const dueAt = new Date(period.year, period.month - 1, selectedDay, hour || 0, minute || 0);
    setSaving(true);
    try {
      await apiRequest(
        "/api/todos",
        { method: "POST", body: JSON.stringify({ title: form.title, note: form.note, dueAt: dueAt.toISOString() }) },
        token
      );
      setForm((current) => ({ ...current, title: "", note: "" }));
      onFlash("ok", "Not eklendi.");
      await load();
    } catch (error) {
      onFlash("bad", error.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(todo) {
    setPending(todo.id);
    try {
      await apiRequest("/api/todos?id=" + todo.id, { method: "PATCH", body: JSON.stringify({ done: !todo.done }) }, token);
      await load();
    } catch (error) {
      onFlash("bad", error.message);
    } finally {
      setPending("");
    }
  }

  async function remove(todo) {
    if (!window.confirm(todo.title + " notu silinsin mi?")) return;
    setPending(todo.id);
    try {
      await apiRequest("/api/todos?id=" + todo.id, { method: "DELETE" }, token);
      onFlash("ok", "Not silindi.");
      await load();
    } catch (error) {
      onFlash("bad", error.message);
    } finally {
      setPending("");
    }
  }

  return (
    <div className="view" data-busy={loading} aria-busy={loading}>
      {featured ? (
        <div className={"countdown-strip" + (queue.length ? " has-queue" : "")}>
          <Countdown todo={featured} now={now} onOpen={openTodo} />
          {queue.length ? (
            <div className="countdown-queue">
              {queue.map((todo) => {
                const diff = new Date(todo.dueAt).getTime() - now;
                const part = splitDuration(diff);
                const tone = part.past ? "bad" : part.days === 0 ? "warn" : "accent";
                return (
                  <button type="button" className="queue-item glass glass--chip" key={todo.id} onClick={() => openTodo(todo)}>
                    <Ring
                      value={part.days ? part.days : part.hours}
                      max={part.days ? Math.max(30, part.days) : 24}
                      label={part.days ? "gün" : "saat"}
                      tone={tone}
                      size={48}
                    />
                    <span className="queue-copy">
                      <strong>{todo.title}</strong>
                      <small>
                        {dateTimeLabel(todo.dueAt)} · {part.past ? shortDuration(diff) + " geçti" : shortDuration(diff) + " kaldı"}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="countdown glass glass--panel is-empty">
          <span className="countdown-mark tone-accent"><Alarm weight="duotone" /></span>
          <div>
            <p className="eyebrow">Geri sayım</p>
            <strong>Bekleyen not yok</strong>
            <small>Takvimden bir güne not ekleyince geri sayım burada başlar.</small>
          </div>
        </div>
      )}

      <div className="calendar glass glass--panel">
        <div className="cal-main">
          <div className="cal-toolbar">
            <div className="cal-nav">
              <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Önceki ay">
                <CaretLeft weight="bold" />
              </button>
              <strong>{periodLabel(period)}</strong>
              <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Sonraki ay">
                <CaretRight weight="bold" />
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={goToday}>Bugün</button>
            </div>
            <span className="pill pill-calm">{todos.filter((todo) => !todo.done).length} açık not</span>
          </div>

          <div className="cal-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="cal-grid" role="grid" aria-label={periodLabel(period) + " yapılacaklar"}>
            {cells.map((day, index) => {
              const dayTodos = day ? byDay.get(day) || [] : [];
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
                    <button
                      type="button"
                      className="cal-cell-hit"
                      onClick={() => setSelectedDay(day)}
                      aria-label={day + " " + periodLabel(period) + ", " + dayTodos.length + " not"}
                      aria-selected={day === selectedDay}
                    >
                      <span className="cal-day">{day}</span>
                      {dayTodos.slice(0, 3).map((todo) => {
                        const late = !todo.done && new Date(todo.dueAt).getTime() < now;
                        return (
                          <span
                            className={"cal-event tone-" + (todo.done ? "ok" : late ? "bad" : "accent") + (todo.done ? " is-done" : "")}
                            key={todo.id}
                          >
                            <i />
                            {todo.title}
                          </span>
                        );
                      })}
                      {dayTodos.length > 3 ? <span className="cal-more">+{dayTodos.length - 3}</span> : null}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="cal-detail" aria-live="polite">
          <div className="cal-detail-date">
            <p className="eyebrow">Seçili gün</p>
            <strong>{formatDate(selectedDate)}</strong>
            {selectedDay === todayDay ? <span className="pill pill-calm">Bugün</span> : null}
          </div>

          {selectedTodos.length ? (
            <div className="todo-list">
              {selectedTodos.map((todo) => {
                const late = !todo.done && new Date(todo.dueAt).getTime() < now;
                return (
                  <div className={"todo-item" + (todo.done ? " is-done" : "")} key={todo.id}>
                    <button
                      type="button"
                      className={"todo-check" + (pending === todo.id ? " is-busy" : "")}
                      onClick={() => toggle(todo)}
                      aria-label={todo.done ? "Yapılmadı olarak işaretle" : "Yapıldı olarak işaretle"}
                      aria-pressed={todo.done}
                    >
                      {todo.done ? <CheckCircle weight="fill" /> : <Circle weight="bold" />}
                    </button>
                    <div className="todo-body">
                      <strong>{todo.title}</strong>
                      <small className={late ? "tone-bad" : ""}>
                        {timeLabel(todo.dueAt)}
                        {todo.done ? " · yapıldı" : late ? " · süresi geçti" : " · " + shortDuration(new Date(todo.dueAt).getTime() - now) + " kaldı"}
                      </small>
                      {todo.note ? <span>{todo.note}</span> : null}
                    </div>
                    <button
                      className="icon-btn is-danger"
                      type="button"
                      onClick={() => remove(todo)}
                      aria-label={todo.title + " notunu sil"}
                    >
                      <Trash weight="bold" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty">
              <CalendarBlank weight="duotone" />
              <strong>Bu güne not yok</strong>
              <span>Aşağıdan yapılacak bir iş yazın.</span>
            </div>
          )}

          <form className="todo-form" onSubmit={submit}>
            <p className="strip-title">
              <NotePencil weight="bold" /> Bu güne not al
            </p>
            <div className="field">
              <label htmlFor="todo-title">Yapılacak</label>
              <input
                id="todo-title"
                value={form.title}
                onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                maxLength={160}
                placeholder="Örn. tapu dairesine git"
                autoComplete="off"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="todo-time">Saat</label>
              <input
                id="todo-time"
                type="time"
                value={form.time}
                onChange={(e) => setForm((current) => ({ ...current, time: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="todo-note">Not <span>(isteğe bağlı)</span></label>
              <textarea
                id="todo-note"
                rows={2}
                value={form.note}
                onChange={(e) => setForm((current) => ({ ...current, note: e.target.value }))}
                maxLength={600}
              />
            </div>
            <button className={"btn btn-primary btn-wide" + (saving ? " is-busy" : "")} type="submit">
              <Plus weight="bold" />
              Notu kaydet
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
