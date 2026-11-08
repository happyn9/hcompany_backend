import { ArrowLeftRight, Lock, ShieldCheck, Smartphone, Zap } from "lucide-react";

const FLAG = { ZM: "🇿🇲", CD: "🇨🇩" };
const fmt = (v) => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4));

/** Colonne de droite : taux d'envoi et de retrait des deux sens + rassurance. */
export default function RatesCard({ rates }) {
  const entries = Object.entries(rates || {});
  return (
    <aside className="space-y-4 lg:sticky lg:top-24 self-start">
      <section className="rounded-3xl bg-ink-fixed text-cream-fixed p-6 relative overflow-hidden">
        <div aria-hidden="true" className="absolute -right-16 -top-16 w-52 h-52 rounded-full opacity-25" style={{ background: "radial-gradient(circle,#C89A3D 0%,transparent 65%)" }} />
        <p className="relative flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cream-fixed/55"><ArrowLeftRight size={13} />Taux du jour</p>
        {entries.length === 0 ? <p className="relative text-sm text-cream-fixed/60 mt-4">Taux indisponibles pour le moment.</p> : (
          <div className="relative mt-4 space-y-5">
            {entries.map(([id, r]) => {
              const [a, b] = id.split(">");
              return (
                <div key={id}>
                  <p className="text-sm font-medium">{FLAG[a]} {a} → {FLAG[b]} {b}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/[0.07] border border-white/10 p-3"><dt className="text-[10px] uppercase tracking-wider text-cream-fixed/50">Envoi</dt><dd className="font-display text-xl tabular-nums mt-0.5" style={{ color: "#C89A3D" }}>{fmt(r.send)}</dd></div>
                    <div className="rounded-xl bg-white/[0.07] border border-white/10 p-3"><dt className="text-[10px] uppercase tracking-wider text-cream-fixed/50">Retrait</dt><dd className="font-display text-xl tabular-nums mt-0.5" style={{ color: "#C89A3D" }}>{fmt(r.withdraw)}</dd></div>
                  </dl>
                  <p className="text-[11px] text-cream-fixed/45 mt-1.5">1 {r.send_currency} = … {r.receive_currency}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section className="rounded-3xl border border-line bg-surface p-6">
        <p className="font-display text-lg">Comment ça marche</p>
        <ol className="mt-4 space-y-4 text-sm">
          {[[Smartphone, "Vous payez en mobile money dans votre pays."], [Zap, "Le bénéficiaire reçoit dans le sien, en quelques instants."], [Lock, "L'argent ne quitte jamais le pays : un partenaire local paie de son côté."], [ShieldCheck, "Taux et frais affichés avant de confirmer. Rien de caché."]].map(([I, t], i) => (
            <li key={i} className="flex gap-3"><span className="w-8 h-8 shrink-0 rounded-xl bg-latte-soft text-coffee-dark flex items-center justify-center"><I size={15} /></span><span className="text-ink-soft leading-snug pt-1">{t}</span></li>
          ))}
        </ol>
      </section>
    </aside>
  );
}
