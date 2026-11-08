import { useMemo } from "react";
import WalkView from "../../three/WalkView.jsx";
import { buildInterior } from "../../three/models/interior.js";
import { useLanguage } from "../../context/LanguageContext.jsx";

/** Visite intérieure à pied d'un logement, générée d'après son type, ses chambres, lits et équipements. */
export default function Interior3D({ p, help, onUnsupported, height = 460 }) {
  const { lang } = useLanguage();
  const key = `${p.id}|${p.type}|${p.bedrooms}|${p.beds}|${p.bathrooms}|${(p.amenities || []).join(",")}|${lang}`;
  const build = useMemo(() => () => buildInterior(null, { type: p.type, bedrooms: p.bedrooms, beds: p.beds, bathrooms: p.bathrooms, amenities: p.amenities }, lang), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <WalkView build={build} deps={[key]} help={help} height={height} onUnsupported={onUnsupported} />;
}
