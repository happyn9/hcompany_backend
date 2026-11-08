import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Minus, Plus, Search, Users } from "lucide-react";
import { useLodgeUi } from "./Shared.jsx";
import { addDays, clampGuests, searchQuery, todayISO } from "../../lib/lodge.js";

const field = "w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none";

/** Formulaire de recherche (destination, dates, voyageurs). `initial` = paramètres déjà choisis. */
export default function SearchForm({ initial = {}, variant = "hero", onSubmit }) {
  const ui = useLodgeUi();
  const h = ui.home;
  const navigate = useNavigate();
  const [q, setQ] = useState(initial.q || initial.city || "");
  const [ci, setCi] = useState(initial.check_in || "");
  const [co, setCo] = useState(initial.check_out || "");
  const [guests, setGuests] = useState(clampGuests(initial.guests || 1));
  const today = todayISO();

  useEffect(() => {
    setQ(initial.q || initial.city || "");
    setCi(initial.check_in || "");
    setCo(initial.check_out || "");
    setGuests(clampGuests(initial.guests || 1));
  }, [initial.q, initial.city, initial.check_in, initial.check_out, initial.guests]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeCi = (v) => {
    setCi(v);
    if (v && (!co || co <= v)) setCo(addDays(v, 1));
  };

  function submit(e) {
    e.preventDefault();
    const params = { q: q.trim(), check_in: ci, check_out: co && ci ? co : "", guests: guests > 1 ? guests : "" };
    if (onSubmit) return onSubmit(params);
    navigate(`/logement/recherche?${searchQuery(params)}`);
  }

  const hero = variant === "hero";
  return (
    <form onSubmit={submit} role="search" aria-label={h.search} className={`grid gap-2 ${hero ? "bg-surface text-ink rounded-3xl p-2 shadow-xl shadow-black/10 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]" : "rounded-3xl border border-line bg-surface p-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]"}`}>
      <label className="flex items-center gap-3 rounded-2xl px-4 py-2.5 hover:bg-latte-soft/60 focus-within:bg-latte-soft/60 cursor-text">
        <MapPin size={18} className="text-coffee shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block text-[0.7rem] font-semibold uppercase tracking-wider text-ink-faint">{h.where}</span>
          <input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder={h.wherePlaceholder} />
        </span>
      </label>
      <label className="rounded-2xl px-4 py-2.5 hover:bg-latte-soft/60 focus-within:bg-latte-soft/60 block">
        <span className="block text-[0.7rem] font-semibold uppercase tracking-wider text-ink-faint">{h.checkIn}</span>
        <input type="date" className={field} value={ci} min={today} onChange={(e) => changeCi(e.target.value)} />
      </label>
      <label className="rounded-2xl px-4 py-2.5 hover:bg-latte-soft/60 focus-within:bg-latte-soft/60 block">
        <span className="block text-[0.7rem] font-semibold uppercase tracking-wider text-ink-faint">{h.checkOut}</span>
        <input type="date" className={field} value={co} min={ci ? addDays(ci, 1) : today} onChange={(e) => setCo(e.target.value)} />
      </label>
      <div className="rounded-2xl px-4 py-2.5 flex items-center gap-3">
        <Users size={18} className="text-coffee shrink-0" aria-hidden="true" />
        <span className="flex-1">
          <span className="block text-[0.7rem] font-semibold uppercase tracking-wider text-ink-faint">{h.guests}</span>
          <span className="flex items-center gap-3">
            <button type="button" aria-label="−" onClick={() => setGuests((g) => clampGuests(g - 1))} disabled={guests <= 1} className="w-6 h-6 rounded-full border border-line flex items-center justify-center disabled:opacity-30"><Minus size={12} /></button>
            <span className="text-sm font-medium tabular-nums w-4 text-center">{guests}</span>
            <button type="button" aria-label="+" onClick={() => setGuests((g) => clampGuests(g + 1))} className="w-6 h-6 rounded-full border border-line flex items-center justify-center"><Plus size={12} /></button>
          </span>
        </span>
      </div>
      <button type="submit" className="rounded-2xl bg-ink text-cream text-sm font-medium px-7 py-4 hover:bg-coffee-dark transition-colors inline-flex items-center justify-center gap-2">
        <Search size={16} /> {h.search}
      </button>
    </form>
  );
}
