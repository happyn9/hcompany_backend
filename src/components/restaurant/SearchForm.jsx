import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useRestoUi, inputCls } from "./Shared.jsx";
import { isoToday } from "../../lib/resto.js";

export const TIMES = Array.from({ length: 27 }, (_, i) => { const m = 10 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });

export default function SearchForm({ cities = [], initial = {} }) {
  const ui = useRestoUi().home;
  const navigate = useNavigate();
  const [f, setF] = useState({ day: initial.day || isoToday(), time: initial.time || "19:00", party: initial.party || "2", city: initial.city || "" });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const go = (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    p.set("day", f.day); p.set("time", f.time); p.set("party", f.party);
    if (f.city) p.set("city", f.city);
    navigate(`/restaurant/recherche?${p}`);
  };
  return (
    <form onSubmit={go} className="grid grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-3 rounded-3xl border border-line bg-surface p-4 shadow-sm" aria-label={ui.when}>
      <label className="col-span-2 lg:col-span-1 text-xs text-ink-soft">{ui.city}
        <select value={f.city} onChange={set("city")} className={`${inputCls} mt-1`}><option value="">{ui.allCities}</option>{cities.map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}</select>
      </label>
      <label className="text-xs text-ink-soft">{ui.date}<input type="date" min={isoToday()} value={f.day} onChange={set("day")} className={`${inputCls} mt-1`} required /></label>
      <label className="text-xs text-ink-soft">{ui.time}<select value={f.time} onChange={set("time")} className={`${inputCls} mt-1`}>{TIMES.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className="text-xs text-ink-soft">{ui.party}<input type="number" min="1" max="40" value={f.party} onChange={set("party")} className={`${inputCls} mt-1`} required /></label>
      <button className="col-span-2 lg:col-span-1 inline-flex items-center justify-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 self-end"><Search size={16} />{ui.search}</button>
    </form>
  );
}
