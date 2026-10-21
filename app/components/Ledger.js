"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  DownloadSimple,
  Notebook,
  PencilSimple,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import { BarList } from "./Charts";
import MoneyField from "./MoneyField";
import { apiRequest, downloadCsv, formatCurrency, toDateInput } from "../lib/client";

const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const WEEKDAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

function emptyForm(year, month) {
  const today = new Date();
  const sameMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  return {
    id: "",
    title: "",
    amount: "",
    date: toDateInput(sameMonth ? today : new Date(year, month - 1, 1)),
    note: "",
  };
}

function entryDate(entry) {
  return entry.day + " " + MONTHS[entry.month - 1] + " " + entry.year;
}

/* Gider notları: net gelire, aidata, kiracıya karışmayan serbest defter.
   Yıl tek seferde çekilir; ay listesi, gün raporu ve aylık tablo aynı
   veriden türetilir. */
export default function LedgerView({ token, onFlash }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(() => emptyForm(new Date().getFullYear(), new Date().getMonth() + 1));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState("");
  const [tab, setTab] = useState("list");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiRequest("/api/ledger?year=" + year, {}, token);
      setEntries(payload.entries || []);
    } catch (error) {
      onFlash("bad", error.message);
    } finally {
      setLoading(false);
    }
  }, [year, token, onFlash]);

  useEffect(() => {
    load();
  }, [load]);

  const monthEntries = useMemo(
    () => entries.filter((entry) => entry.month === month),
    [entries, month]
  );
  const monthTotal = monthEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const yearTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);

  const days = useMemo(() => {
    const map = new Map();
    for (const entry of monthEntries) {
      if (!map.has(entry.day)) map.set(entry.day, []);
      map.get(entry.day).push(entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, items]) => ({ day, items, total: items.reduce((sum, item) => sum + item.amount, 0) }));
  }, [monthEntries]);

  const months = useMemo(
    () =>
      MONTHS.map((label, index) => {
        const items = entries.filter((entry) => entry.month === index + 1);
        return {
          month: index + 1,
          label,
          count: items.length,
          total: items.reduce((sum, entry) => sum + entry.amount, 0),
          days: new Set(items.map((entry) => entry.day)).size,
          top: items.slice().sort((a, b) => b.amount - a.amount)[0] || null,
        };
      }),
    [entries]
  );
  const activeMonths = months.filter((item) => item.count).length;

  const bars = days
    .map((item) => ({
      key: String(item.day),
      label: item.day + " " + MONTHS[month - 1],
      value: item.total,
      display: formatCurrency(item.total),
      tone: "warn",
    }));

  function shiftMonth(delta) {
    const date = new Date(year, month - 1 + delta, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
    if (!form.id) setForm(emptyForm(date.getFullYear(), date.getMonth() + 1));
  }

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function edit(entry) {
    setForm({
      id: entry.id,
      title: entry.title,
      amount: String(entry.amount),
      date: toDateInput(new Date(entry.year, entry.month - 1, entry.day)),
      note: entry.note,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const body = JSON.stringify({ title: form.title, amount: form.amount, date: form.date, note: form.note });
      if (form.id) {
        await apiRequest("/api/ledger?id=" + form.id, { method: "PATCH", body }, token);
      } else {
        await apiRequest("/api/ledger", { method: "POST", body }, token);
      }
      onFlash("ok", form.id ? "Gider notu güncellendi." : "Gider notu kaydedildi.");
      const [savedYear, savedMonth] = form.date.split("-").map(Number);
      setForm(emptyForm(savedYear, savedMonth));
      if (savedYear !== year || savedMonth !== month) {
        setYear(savedYear);
        setMonth(savedMonth);
      } else {
        await load();
      }
    } catch (error) {
      onFlash("bad", error.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(entry) {
    if (!window.confirm(entry.title + " kaydı silinsin mi?")) return;
    setRemoving(entry.id);
    try {
      await apiRequest("/api/ledger?id=" + entry.id, { method: "DELETE" }, token);
      onFlash("ok", "Gider notu silindi.");
      if (form.id === entry.id) setForm(emptyForm(year, month));
      await load();
    } catch (error) {
      onFlash("bad", error.message);
    } finally {
      setRemoving("");
    }
  }

  function exportMonth() {
    const rows = monthEntries
      .slice()
      .sort((a, b) => a.day - b.day)
      .map((entry) => [entryDate(entry), entry.title, entry.amount, entry.note]);
    rows.push(["", "Toplam", monthTotal, ""]);
    downloadCsv(
      "gider-notlari-" + year + "-" + String(month).padStart(2, "0") + ".csv",
      ["Tarih", "Gider", "Tutar (TL)", "Not"],
      rows
    );
  }

  function exportYear() {
    const rows = months.map((item) => [item.label + " " + year, item.count, item.days, item.total]);
    rows.push(["Toplam", entries.length, "", yearTotal]);
    downloadCsv("gider-notlari-" + year + "-aylik.csv", ["Ay", "Kayıt", "Gün", "Toplam (TL)"], rows);
  }

  return (
    <div className="view" data-busy={loading} aria-busy={loading}>
      <div className="view-bar">
        <div className="cal-nav">
          <button type="button" className="icon-btn" onClick={() => shiftMonth(-1)} aria-label="Önceki ay">
            <CaretLeft weight="bold" />
          </button>
          <strong>{MONTHS[month - 1]} {year}</strong>
          <button type="button" className="icon-btn" onClick={() => shiftMonth(1)} aria-label="Sonraki ay">
            <CaretRight weight="bold" />
          </button>
        </div>
        <div className="view-actions">
          <div className="filters glass glass--chip" role="group" aria-label="Gider notu görünümü">
            {[["list", "Liste"], ["days", "Gün raporu"], ["table", "Aylık tablo"]].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={"filter" + (tab === key ? " is-active" : "")}
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="duo ledger-duo">
        <article className="panel glass">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Bağımsız defter</p>
              <h2>{form.id ? "Gider notunu düzenle" : "Gider notu ekle"}</h2>
            </div>
            {form.id ? (
              <button className="icon-btn" type="button" onClick={() => setForm(emptyForm(year, month))} aria-label="Düzenlemeyi bırak">
                <X weight="bold" />
              </button>
            ) : null}
          </div>
          <form className="sheet-form" onSubmit={submit}>
            <div className="form-grid">
              <div className="field span-2">
                <label htmlFor="ledger-title">Ne için</label>
                <input
                  id="ledger-title"
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  maxLength={120}
                  placeholder="Örn. market, benzin, noter"
                  autoComplete="off"
                  required
                />
              </div>
              <MoneyField id="ledger-amount" label="Tutar" value={form.amount} onChange={(value) => update("amount", value)} kind="expense" required />
              <div className="field">
                <label htmlFor="ledger-date">Tarih</label>
                <input id="ledger-date" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} required />
              </div>
              <div className="field span-2">
                <label htmlFor="ledger-note">Not <span>(isteğe bağlı)</span></label>
                <input id="ledger-note" value={form.note} onChange={(e) => update("note", e.target.value)} maxLength={240} />
              </div>
            </div>
            <div className="sheet-actions">
              <button className={"btn btn-primary" + (saving ? " is-busy" : "")} type="submit">
                {form.id ? <PencilSimple weight="bold" /> : <Plus weight="bold" />}
                {form.id ? "Değişikliği kaydet" : "Gideri kaydet"}
              </button>
            </div>
          </form>

          <div className="net-box">
            <div>
              <span>{MONTHS[month - 1]} toplamı</span>
              <strong className="num tone-warn">{formatCurrency(monthTotal)}</strong>
            </div>
            <div>
              <span>Kayıt</span>
              <strong className="num">{monthEntries.length}</strong>
            </div>
            <div className="net-box-total">
              <span>{year} toplamı</span>
              <strong className="num tone-warn">{formatCurrency(yearTotal)}</strong>
            </div>
          </div>
        </article>

        <article className="panel glass">
          {tab === "list" ? (
            <>
              <div className="panel-head">
                <div>
                  <p className="eyebrow">{MONTHS[month - 1]} {year}</p>
                  <h2>Gider listesi</h2>
                </div>
                <button className="btn btn-glass btn-sm" type="button" onClick={exportMonth} disabled={!monthEntries.length}>
                  <DownloadSimple weight="bold" />
                  Excel
                </button>
              </div>
              <div className="feed">
                {monthEntries.length ? (
                  monthEntries.map((entry) => (
                    <div className={"feed-item" + (form.id === entry.id ? " is-active" : "")} key={entry.id}>
                      <span className="feed-mark tone-warn"><Notebook weight="fill" /></span>
                      <div className="feed-body">
                        <strong>{entry.title}</strong>
                        <span>
                          {entryDate(entry)} · {WEEKDAYS[new Date(entry.year, entry.month - 1, entry.day).getDay()]}
                          {entry.note ? " · " + entry.note : ""}
                        </span>
                      </div>
                      <span className="feed-side num">{formatCurrency(entry.amount)}</span>
                      <button className="icon-btn" type="button" onClick={() => edit(entry)} aria-label={entry.title + " kaydını düzenle"}>
                        <PencilSimple weight="bold" />
                      </button>
                      <button
                        className={"icon-btn is-danger" + (removing === entry.id ? " is-busy" : "")}
                        type="button"
                        onClick={() => remove(entry)}
                        aria-label={entry.title + " kaydını sil"}
                      >
                        <Trash weight="bold" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    <Notebook weight="duotone" />
                    <strong>Bu ay not yok</strong>
                    <span>Soldan harcadığınızı yazın; burada ay ay listelenir.</span>
                  </div>
                )}
              </div>
            </>
          ) : null}

          {tab === "days" ? (
            <>
              <div className="panel-head">
                <div>
                  <p className="eyebrow">{MONTHS[month - 1]} {year}</p>
                  <h2>Gün gün rapor</h2>
                </div>
                <span className="pill pill-warn">{days.length} gün · {formatCurrency(monthTotal)}</span>
              </div>
              <BarList items={bars} empty="Bu ay kayıt yok." />
              {days.length ? (
                <div className="matrix-scroll">
                  <table className="matrix bus-table">
                    <thead>
                      <tr>
                        <th scope="col">Gün</th>
                        <th scope="col">Kalemler</th>
                        <th scope="col">Toplam</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((item) => (
                        <tr key={item.day}>
                          <th scope="row">
                            {item.day} {WEEKDAYS[new Date(year, month - 1, item.day).getDay()]}
                          </th>
                          <td className="ledger-items">{item.items.map((entry) => entry.title + " (" + formatCurrency(entry.amount) + ")").join(", ")}</td>
                          <td className="num">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Ay</th>
                        <td>{monthEntries.length} kayıt</td>
                        <td className="num">{formatCurrency(monthTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}

          {tab === "table" ? (
            <>
              <div className="panel-head">
                <div>
                  <p className="eyebrow">{year} · {activeMonths} ay kayıtlı</p>
                  <h2>Aylık gider tablosu</h2>
                </div>
                <div className="view-actions">
                  <button className="icon-btn" type="button" onClick={() => setYear(year - 1)} aria-label="Önceki yıl">
                    <CaretLeft weight="bold" />
                  </button>
                  <button className="icon-btn" type="button" onClick={() => setYear(year + 1)} aria-label="Sonraki yıl">
                    <CaretRight weight="bold" />
                  </button>
                  <button className="btn btn-glass btn-sm" type="button" onClick={exportYear} disabled={!entries.length}>
                    <DownloadSimple weight="bold" />
                    Excel
                  </button>
                </div>
              </div>
              <div className="matrix-scroll">
                <table className="matrix bus-table">
                  <thead>
                    <tr>
                      <th scope="col">Ay</th>
                      <th scope="col">Kayıt</th>
                      <th scope="col">Gün</th>
                      <th scope="col">En büyük kalem</th>
                      <th scope="col">Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((item) => (
                      <tr key={item.month} className={item.month === month ? "is-now" : ""}>
                        <th scope="row">
                          <button type="button" className="ledger-month" onClick={() => { setMonth(item.month); setTab("days"); }}>
                            {item.label}
                          </button>
                        </th>
                        <td>{item.count || "—"}</td>
                        <td>{item.days || "—"}</td>
                        <td>{item.top ? item.top.title + " · " + formatCurrency(item.top.amount) : "—"}</td>
                        <td className="num">{item.total ? formatCurrency(item.total) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Yıl</th>
                      <td>{entries.length}</td>
                      <td>—</td>
                      <td>Aylık ortalama {formatCurrency(activeMonths ? yearTotal / activeMonths : 0)}</td>
                      <td className="num">{formatCurrency(yearTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : null}
        </article>
      </div>
    </div>
  );
}
