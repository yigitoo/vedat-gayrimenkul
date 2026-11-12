"use client";

import { useState } from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { SheetFrame } from "./Sheets";
import MoneyField from "./MoneyField";
import { apiRequest, formatCurrency, parseMoney } from "../lib/client";

const MONTH_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTH_LONG = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/* Toplu düzelt: yanlış girilmiş kira tutarını ve ay kayıtlarını tek adımda
   düzeltir. Seçilen ayların eski kayıtları silinir, her aya yazılan tutarda
   tek kayıt düşer. Varsayılan seçim: kaydı olan ya da sözleşme içindeki
   aylar, bu ay hariç (bu ayı kendin işaretlersin). */
export default function BulkFixSheet({ row, year, currentMonth, token, onClose, onDone }) {
  const isThisYear = year === new Date().getFullYear();
  const [amountInput, setAmountInput] = useState(String(row.rentAmount || ""));
  const [months, setMonths] = useState(() =>
    row.months
      .filter((cell) => (cell.paid > 0 || cell.inside) && !(isThisYear && cell.month === currentMonth))
      .map((cell) => cell.month)
  );
  const [correctRent, setCorrectRent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const amount = amountInput.trim() ? parseMoney(amountInput) : NaN;
  const valid = Number.isFinite(amount) && amount > 0 && months.length > 0;
  const rentChanges = Number.isFinite(amount) && amount !== row.rentAmount;
  const left = MONTH_LONG.filter((unused, index) => !months.includes(index + 1));

  function toggle(month) {
    setMonths((current) =>
      current.includes(month) ? current.filter((item) => item !== month) : [...current, month].sort((a, b) => a - b)
    );
  }

  async function submit(event) {
    event.preventDefault();
    if (!valid) {
      setError(months.length ? "Geçerli bir tutar yaz." : "En az bir ay seç.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiRequest(
        "/api/payments",
        {
          method: "POST",
          body: JSON.stringify({
            tenantId: row.tenantId,
            bulk: { year, months, amount, correctRent: rentChanges && correctRent },
          }),
        },
        token
      );
      onDone(row.name + " · " + months.length + " ay " + formatCurrency(amount) + " olarak düzeltildi.");
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return (
    <SheetFrame eyebrow={"Toplu düzelt · " + year} title={row.name} onClose={onClose}>
      <form className="sheet-form bulk-sheet" onSubmit={submit}>
        <p className="raise-lead">
          Seçtiğin aylar yazdığın tutarla ödendi olur; o aylardaki eski (yanlış) kayıtlar silinir. Seçmediğin aylara dokunulmaz.
        </p>

        <MoneyField
          id="bulk-amount"
          label="Aylık tutar"
          value={amountInput}
          onChange={setAmountInput}
          kind="rent"
          required
        />

        {rentChanges ? (
          <label className="bulk-check">
            <input type="checkbox" checked={correctRent} onChange={(event) => setCorrectRent(event.target.checked)} />
            <span>
              Aylık kirayı da <strong className="num">{formatCurrency(amount)}</strong> olarak düzelt (şu an{" "}
              <span className="num">{formatCurrency(row.rentAmount)}</span>). Düzeltme zam sayılmaz; geçmiş aylar da bu tutara çekilir.
            </span>
          </label>
        ) : null}

        <fieldset className="bulk-months">
          <legend>Ödendi yapılacak aylar</legend>
          <div className="bulk-grid">
            {MONTH_SHORT.map((label, index) => {
              const month = index + 1;
              const on = months.includes(month);
              return (
                <button
                  key={label}
                  type="button"
                  className={"bulk-month" + (on ? " is-on" : "")}
                  aria-pressed={on}
                  aria-label={MONTH_LONG[index] + (on ? " seçili" : " seçili değil")}
                  onClick={() => toggle(month)}
                >
                  {on ? <CheckCircle weight="fill" /> : null}
                  {label}
                </button>
              );
            })}
          </div>
          <p className="bulk-left">
            {left.length ? "Boş kalacak: " + left.join(", ") : "12 ayın hepsi seçili."}
          </p>
        </fieldset>

        {error ? (
          <p className="form-error" role="alert">
            <WarningCircle weight="fill" />
            {error}
          </p>
        ) : null}

        <div className="sheet-actions">
          <button className="btn btn-quiet" type="button" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className={"btn btn-primary" + (busy ? " is-busy" : "")} type="submit" disabled={busy || !valid}>
            <CheckCircle weight="bold" />
            {months.length} ayı düzelt
          </button>
        </div>
      </form>
    </SheetFrame>
  );
}
