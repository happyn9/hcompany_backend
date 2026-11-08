import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Carte OpenStreetMap (Leaflet). Les marqueurs sont des pastilles HTML (divIcon) : pas d'images à charger, donc
 * aucun souci de chemin d'icônes avec Vite. Les mises à jour de props ne recréent pas la carte.
 *  markers : [{ id, lat, lng, label, emoji, active }]   lines : [{ id, from:[lat,lng], to:[lat,lng], active }]
 */
export default function MapView({ markers = [], lines = [], center = [-14.5, 28.3], zoom = 6, fitTo, onSelect, height = "100%", className = "" }) {
  const el = useRef(null), map = useRef(null), layer = useRef(null), cb = useRef(onSelect);
  cb.current = onSelect;

  useEffect(() => {
    const m = L.map(el.current, { center, zoom, zoomControl: false, attributionControl: true, scrollWheelZoom: true });
    L.control.zoom({ position: "bottomright" }).addTo(m);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());  // la barre latérale change la largeur de la carte
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const g = layer.current, m = map.current;
    if (!g || !m) return;
    g.clearLayers();
    const pts = [];
    lines.forEach((l) => {
      const pl = L.polyline([l.from, l.to], { color: l.active ? "#C89A3D" : "#4A3020", weight: l.active ? 5 : 3, opacity: l.active ? 0.95 : 0.45, dashArray: l.active ? undefined : "6 8" });
      pl.on("click", () => cb.current?.(l.id, "line")); pl.addTo(g);
    });
    markers.forEach((k) => {
      if (k.lat == null || k.lng == null) return;
      pts.push([k.lat, k.lng]);
      const icon = L.divIcon({
        className: "", iconSize: [0, 0],
        html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer">
          <span style="background:${k.active ? "#C89A3D" : "#3B2417"};color:${k.active ? "#2A1A10" : "#FBF6EC"};font:600 12px system-ui;padding:5px 9px;border-radius:999px;box-shadow:0 4px 12px rgba(0,0,0,.28);white-space:nowrap;border:2px solid #FBF6EC;${k.active ? "transform:scale(1.12)" : ""}">${k.emoji ? k.emoji + " " : ""}${String(k.label ?? "").replace(/</g, "&lt;")}</span>
          <i style="width:2px;height:7px;background:${k.active ? "#C89A3D" : "#3B2417"}"></i></div>`,
      });
      const mk = L.marker([k.lat, k.lng], { icon, keyboard: true, title: String(k.label ?? ""), riseOnHover: true, zIndexOffset: k.active ? 1000 : 0 });
      mk.on("click", () => cb.current?.(k.id, "marker")); mk.addTo(g);
    });
    const fit = fitTo ?? pts;
    if (fit.length > 1) m.fitBounds(L.latLngBounds(fit), { padding: [50, 50], maxZoom: 11, animate: true });
    else if (fit.length === 1) m.setView(fit[0], Math.max(m.getZoom(), 11), { animate: true });
  }, [markers, lines, fitTo]);

  return <div ref={el} className={`z-0 ${className}`} style={{ height, width: "100%", background: "#E8DFD0" }} role="region" aria-label="Carte" />;
}
