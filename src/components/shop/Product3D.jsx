import { useMemo } from "react";
import Viewer3D from "../../three/Viewer3D.jsx";
import { buildShopModel } from "../../three/models/shop.js";
import { Swatches } from "./ProductVisual.jsx";

/** Article en 3D : tourne, se zoome, se recolore avec les couleurs proposées par le vendeur. */
export default function Product3D({ kind, colors = [], color, onColor, height = 420 }) {
  const hex = colors.find((c) => c.name === color)?.hex || colors[0]?.hex || "#c9b79c";
  const build = useMemo(() => () => buildShopModel(kind, hex), [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Viewer3D build={build} tint={hex} deps={[kind]} height={height}>
      {colors.length > 0 && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-surface/85 backdrop-blur rounded-full px-4 py-2 border border-line"><Swatches colors={colors} value={color || colors[0].name} onChange={(n) => onColor?.(n || colors[0].name)} size="w-7 h-7" className="gap-2.5" /></div>}
    </Viewer3D>
  );
}
