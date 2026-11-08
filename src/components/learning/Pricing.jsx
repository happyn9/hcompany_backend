import { useEffect, useState } from "react";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { convert, formatMoney } from "../../lib/pricing.js";
import { loadCurrency, saveCurrency } from "../../data/plans.js";

/** Devise d'affichage choisie (mémorisée), avec repli sur le pivot. */
export function useCurrencyChoice(currencies, pivot) {
  const [code, setCode] = useState(() => loadCurrency(pivot));
  const current = currencies.find((c) => c.code === code) || currencies.find((c) => c.code === pivot) || currencies[0];
  useEffect(() => {
    if (current && current.code !== code) setCode(current.code);
  }, [current, code]);
  const choose = (c) => {
    setCode(c);
    saveCurrency(c);
  };
  return { currency: current, choose };
}

/** Montant exprimé en monnaie pivot, affiché dans la devise choisie. */
export function useMoney(currency) {
  const { lang } = useLanguage();
  return (amountPivot) => formatMoney(convert(amountPivot, currency?.rate), currency, lang);
}

export function CurrencySelect({ currencies, value, onChange, label }) {
  if (!currencies || currencies.length < 2) return null;
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1" role="group" aria-label={label}>
      {currencies.map((c) => (
        <button
          key={c.code}
          type="button"
          onClick={() => onChange(c.code)}
          aria-pressed={value === c.code}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
            value === c.code ? "bg-ink text-cream" : "text-ink-soft hover:text-ink"
          }`}
        >
          {c.code}
        </button>
      ))}
    </div>
  );
}

export function PeriodToggle({ value, onChange, labels, saving }) {
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-surface p-1" role="group">
      {["month", "year"].map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-pressed={value === p}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
            value === p ? "bg-ink text-cream" : "text-ink-soft hover:text-ink"
          }`}
        >
          {labels[p]}
          {p === "year" && saving > 0 && (
            <span className={`ml-2 text-[0.65rem] rounded-full px-2 py-0.5 ${value === p ? "bg-latte/30 text-cream" : "bg-latte-soft text-coffee"}`}>
              {labels.save(saving)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
