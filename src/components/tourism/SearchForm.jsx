import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useTourUi, inputCls } from "./Shared.jsx";

export default function TourSearchForm({ cities = [], initial = {} }) {
  const ui = useTourUi().home;
  const navigate = useNavigate();
  const [f, setF] = useState({ day: initial.day || "", people: initial.people || "2", city: initial.city || "" });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const go = (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (f.day) p.set("day", f.day);
    p.set("people", f.people);
    if (f.city) p.set("city", f.city);
    navigate(`/tourisme/recherche?${p}`);
  };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form onSubmit={go} className="grid grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_auto] gap-3 rounded-3xl border border-line bg-surface p-4 shadow-sm" aria-label={ui.where}>
      <label className="col-span-2 lg:col-span-1 text-xs text-ink-soft">{ui.where}
        <select value={f.city} onChange={set("city")} className={`${inputCls} mt-1`}><option value="">{ui.allCities}</option>{cities.map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}</select>
      </label>
      <label className="text-xs text-ink-soft">{ui.date}<input type="date" min={today} value={f.day} onChange={set("day")} className={`${inputCls} mt-1`} /></label>
      <label className="text-xs text-ink-soft">{ui.people}<input type="number" min="1" max="40" value={f.people} onChange={set("people")} className={`${inputCls} mt-1`} required /></label>
      <button className="col-span-2 lg:col-span-1 inline-flex items-center justify-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 self-end"><Search size={16} />{ui.search}</button>
    </form>
  );
}
