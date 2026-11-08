/** Carte + panneau : côte à côte sur grand écran, empilés sur mobile (carte en haut, panneau dessous). */
export default function MapLayout({ title, lead, map, children }) {
  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 pt-5">
      <div className="mb-4"><h1 className="font-display text-2xl sm:text-3xl">{title}</h1>{lead && <p className="text-sm text-ink-soft mt-1">{lead}</p>}</div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px] gap-4">
        <div className="rounded-3xl overflow-hidden border border-line h-[46vh] min-h-[320px] lg:h-[calc(100vh-170px)] lg:sticky lg:top-[84px]">{map}</div>
        <div className="min-w-0 lg:max-h-[calc(100vh-170px)] lg:overflow-y-auto space-y-3 pb-2">{children}</div>
      </div>
    </div>
  );
}
export function Modal({ onClose, title, children, wide }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Fermer" className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className={`relative w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-cream border border-line p-4 sm:p-6`}>
        <div className="flex items-center justify-between mb-3"><h2 className="font-display text-xl">{title}</h2><button onClick={onClose} className="rounded-full border border-line px-3 py-1.5 text-xs hover:bg-latte-soft">Fermer</button></div>
        {children}
      </div>
    </div>
  );
}
export const Empty = ({ children }) => <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-ink-soft text-center">{children}</p>;
export const Skel = () => <div className="h-24 rounded-2xl bg-latte-soft/60 animate-pulse" />;
