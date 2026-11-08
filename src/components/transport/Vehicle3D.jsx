import { useEffect, useMemo, useRef, useState } from "react";
import { DoorOpen } from "lucide-react";
import Viewer3D from "../../three/Viewer3D.jsx";
import { buildVehicle } from "../../three/models/vehicles.js";
import { useLanguage } from "../../context/LanguageContext.jsx";

/** Véhicule de fret en 3D : le chargement déjà réservé (cartons) et le colis du client (jaune) sont visibles ; la porte s'ouvre. */
export default function Vehicle3D({ kind, refrigerated = false, booked = 0, yours = 0, height = 340 }) {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const veh = useRef(null);
  const build = useMemo(() => () => buildVehicle(kind, { refrigerated }), [kind, refrigerated]);
  useEffect(() => { veh.current?.userData.setLoad?.(booked, yours); }, [booked, yours]);
  useEffect(() => { veh.current?.userData.setDoors?.(open); }, [open]);
  return (
    <Viewer3D build={build} deps={[kind, refrigerated]} height={height} autoRotate={false}
      onReady={({ root, live }) => { veh.current = root; root.userData.setLoad(booked, yours); root.userData.setDoors(open); live.current.frame = (dt) => root.userData.tick(dt); }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-pressed={open} className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-surface/90 backdrop-blur border border-line text-ink text-xs px-3.5 py-2"><DoorOpen size={14} />{open ? (lang === "en" ? "Close doors" : "Fermer les portes") : (lang === "en" ? "Open doors" : "Ouvrir les portes")}</button>
      <div className="absolute bottom-3 right-3 flex items-center gap-3 text-[11px] text-ink-soft bg-surface/85 backdrop-blur rounded-full px-3 py-1.5 border border-line">
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: "#c9a46c" }} />{lang === "en" ? "Booked" : "Déjà chargé"}</span>
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: "#e0a82e" }} />{lang === "en" ? "Your parcel" : "Votre colis"}</span>
      </div>
    </Viewer3D>
  );
}
