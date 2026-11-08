import { useMemo, useRef, useEffect } from "react";
import WalkView from "../../three/WalkView.jsx";
import { buildDining } from "../../three/models/dining.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useRestoUi } from "./Shared.jsx";

/** Salle 3D : marche libre, tables colorées selon leur disponibilité, clic = sélection. */
export default function DiningRoom3D({ restaurant, tables, statuses = {}, selectedId = null, onSelect, height = 460, onUnsupported }) {
  const { lang } = useLanguage();
  const ui = useRestoUi().page;
  const world = useRef(null);
  const key = `${restaurant.id}|${restaurant.room_w}|${restaurant.room_d}|${tables.map((t) => `${t.id}:${t.x}:${t.z}:${t.seats}:${t.shape}:${t.rotation}:${t.label}`).join(",")}|${lang}`;
  const build = useMemo(() => () => {
    const w = buildDining(null, { room_w: restaurant.room_w, room_d: restaurant.room_d, tables, statuses, selectedId, name: restaurant.name }, lang);
    world.current = w; return w;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { world.current?.setState({ statuses, selectedId }); }, [statuses, selectedId]);
  const label = (d) => (world.current ? world.current.statusLabel(d.table) : d.table.label);
  return (
    <WalkView
      build={build} deps={[key]} height={height} eye={1.55} speed={2.2} help={ui.visitHint}
      onPick={(d) => onSelect?.(d.table)} hoverLabel={label} onUnsupported={onUnsupported}
      onReady={({ world: w }) => { world.current = w; w.setState({ statuses, selectedId }); }}
    />
  );
}
