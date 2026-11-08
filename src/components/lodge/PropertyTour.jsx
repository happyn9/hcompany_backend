import { Suspense, lazy, useState } from "react";
import { Footprints, X } from "lucide-react";
import { Spinner, useLodgeUi } from "./Shared.jsx";

const Interior3D = lazy(() => import("./Interior3D.jsx"));

/** Section « Visite en 3D » de la fiche logement : chargée seulement quand le visiteur la démarre. */
export default function PropertyTour({ p, autoStart = false }) {
  const ui = useLodgeUi();
  const tr = ui.tour;
  const [on, setOn] = useState(autoStart);
  const [bad, setBad] = useState(false);
  if (bad) return null;
  return (
    <section aria-labelledby="tour-h">
      <h2 id="tour-h" className="font-display text-2xl text-ink">{tr.title}</h2>
      <p className="mt-2 text-sm text-ink-soft">{tr.kinds[p.type] || tr.lead}</p>
      {!on ? (
        <div className="mt-4 rounded-3xl border border-line bg-gradient-to-br from-latte-soft to-cream p-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-ink-soft max-w-md">{tr.lead}</p>
          <button type="button" onClick={() => setOn(true)} className="inline-flex items-center gap-2 rounded-full bg-coffee text-cream-fixed px-6 py-3 text-sm font-medium hover:opacity-90"><Footprints size={16} /> {tr.start}</button>
        </div>
      ) : (
        <div className="mt-4">
          <Suspense fallback={<Spinner />}>
            <Interior3D p={p} help={tr.help} onUnsupported={() => setBad(true)} />
          </Suspense>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-faint max-w-xl">{tr.note}</p>
            <button type="button" onClick={() => setOn(false)} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"><X size={14} /> {tr.hide}</button>
          </div>
        </div>
      )}
    </section>
  );
}
