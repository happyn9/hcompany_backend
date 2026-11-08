import { createRoot } from "react-dom/client";
import "./index.css";
import { LanguageProvider } from "./context/LanguageContext.jsx";
import WalkView from "./three/WalkView.jsx";
import { buildInterior } from "./three/models/interior.js";
import { buildNeighbourhood } from "./three/models/quartier.js";
const q = new URLSearchParams(location.search);
const prop = { type: q.get("type") || "apartment", bedrooms: +(q.get("bd") || 2), beds: +(q.get("beds") || 3), bathrooms: +(q.get("ba") || 1), amenities: (q.get("am") || "tv,ac,workspace,pool").split(",") };
createRoot(document.getElementById("root")).render(
  <LanguageProvider>
    <div style={{ padding: 8 }}>
      <WalkView height={620} build={() => q.get("quartier") ? buildNeighbourhood(null, ["house","apartment","villa","hotel_room","studio","room","lodge","house","guesthouse","villa"].map((type, i) => ({ id: i + 1, type, title: ["Maison familiale Kabulonga","Appartement Rhodes Park","Villa piscine Woodlands","Hôtel Cairo Road","Studio Roma","Chambre simple Chelstone","Lodge Kafue","Maison Chilenje","Maison d'hôtes Olympia","Villa Ibex Hill"][i], price_per_night: 300 + i * 150, rating_avg: 4.2 + (i % 5) / 10 })), { lang: "fr", money: (n) => `K ${n}` }) : buildInterior(null, prop, "fr")}
        onReady={({ teleport }) => { window.__tp = teleport; const x = q.get("x"); if (x !== null) teleport(+x, +q.get("z"), +(q.get("yaw") || 0), +(q.get("pitch") || -0.05)); }} />
    </div>
  </LanguageProvider>
);
