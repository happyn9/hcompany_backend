import { useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import CityMap from "./CityMap.jsx";
import { coordOf } from "../../lib/cities.js";
import { MAX_KM, areasOf, haversineKm, nearCity } from "../../lib/cityAreas.js";

const valid = (v) => v !== "" && v != null && Number.isFinite(Number(v));

/** Placer un logement : toucher la carte, choisir un quartier, ou « Ma position » (GPS). Le point doit rester dans la ville (≤ 60 km). */
export default function LocationPicker({ lat, lng, city, onChange, height = 340 }) {
  const [msg, setMsg] = useState("");
  const pin = valid(lat) && valid(lng) ? { lat: Number(lat), lng: Number(lng) } : null;
  const put = (la, ln) => {
    if (!nearCity(city, la, ln)) { setMsg(`Ce point est trop loin de ${city || "la ville"} (plus de ${MAX_KM} km). Placez l'épingle sur le logement, dans la ville.`); return; }
    setMsg(""); onChange(la, ln);
  };
  const locate = () => {
    setMsg("");
    if (!navigator.geolocation) { setMsg("Position indisponible sur cet appareil : touchez la carte."); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      const c = coordOf(city);
      if (c && haversineKm(c, [p.coords.latitude, p.coords.longitude]) > MAX_KM) { setMsg(`Vous semblez être loin de ${city}. Touchez la carte pour placer l'épingle sur le logement.`); return; }
      put(Number(p.coords.latitude.toFixed(6)), Number(p.coords.longitude.toFixed(6)));
    }, () => setMsg("Autorisez la localisation ou touchez la carte."), { enableHighAccuracy: true, timeout: 10000 });
  };
  const areas = areasOf(city);
  return (
    <div>
      <div className="relative rounded-2xl overflow-hidden border border-line" style={{ height }}>
        <CityMap city={city} pin={pin} onPick={put} className="absolute inset-0" />
        <button type="button" onClick={locate} className="absolute z-20 top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-surface border border-line shadow text-xs font-medium px-3.5 py-2 hover:bg-latte-soft"><Crosshair size={14} />Ma position</button>
        {!pin && <p className="absolute z-20 top-3 left-3 right-24 rounded-full bg-ink-fixed/90 text-cream-fixed text-xs px-4 py-2 inline-flex items-center gap-2"><MapPin size={13} className="shrink-0" />Touchez la carte pour poser l'épingle sur votre logement</p>}
      </div>
      {areas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Quartiers">
          {areas.map(([n, la, ln]) => <button key={n} type="button" onClick={() => put(la, ln)} className="rounded-full border border-line bg-surface text-xs px-3 py-1.5 text-ink-soft hover:border-coffee-light hover:text-ink">{n}</button>)}
        </div>
      )}
      {msg && <p role="alert" className="text-xs text-red-600 mt-2">{msg}</p>}
    </div>
  );
}
