import { useState } from "react";
import { BadgeCheck, Crown, Loader2, Lock, Megaphone, Palette, Sparkles } from "lucide-react";
import { api } from "../../lib/api.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { moduleByKey } from "./modules.js";

const FEATURE_ICON = { promotion: Megaphone, branding: Palette };
const money = (n) => `${Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`;
const msg = (e) => e?.data?.detail || e?.message || "Action impossible.";

/** Mon espace : plan, revenus de toutes les apps au même endroit, fonctions payantes, marque. */
export default function HubTab({ hub, setHub, onOpenModules, onOpenModule }) {
  const { withAuth } = useUser();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const [brand, setBrand] = useState(null);
  if (!hub) return <Loader2 className="animate-spin text-ink-faint" />;
  const pro = hub.plan.name === "pro";
  const form = brand || hub.branding || { display_name: "", tagline: "", accent: "#7b3f00", logo_url: "" };
  const brandingOn = hub.features.paid.find((f) => f.key === "branding")?.status === "active";

  async function run(key, fn, okMsg) {
    setBusy(key);
    try { setHub(await withAuth(fn)); if (okMsg) toast?.success?.(okMsg); } catch (e) { toast?.error?.(msg(e)); } finally { setBusy(""); }
  }

  return (
    <div className="space-y-8">
      {/* Plan */}
      <section className={`rounded-2xl border p-6 flex flex-wrap items-center justify-between gap-5 ${pro ? "border-coffee/40 bg-latte-soft" : "border-line bg-surface"}`}>
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-faint mb-1">Mon plan</p>
          <p className="font-display text-2xl text-ink flex items-center gap-2">{pro ? <><Crown size={20} className="text-coffee" />Pro</> : "Standard"}</p>
          <p className="text-sm text-ink-soft mt-1">
            {pro ? "Apps illimitées et toutes les fonctions payantes incluses." : `${hub.apps_used} / ${hub.plan.max_apps} apps utilisées. Le plan Pro débloque 3 apps ou plus, et toutes les fonctions payantes.`}
          </p>
          {hub.plan.pro_until && <p className="text-xs text-ink-faint mt-1">Pro jusqu'au {new Date(hub.plan.pro_until).toLocaleDateString("fr-FR")}</p>}
        </div>
        {!pro && (
          hub.plan.upgrade_requested
            ? <p className="text-sm text-coffee-dark bg-latte-soft rounded-full px-4 py-2">Demande Pro envoyée — H-Company vous contacte pour le paiement.</p>
            : <button disabled={busy === "up"} onClick={() => run("up", (t) => api.partnerHub.upgrade(t), "Demande envoyée")} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3 hover:bg-coffee-dark disabled:opacity-50">Passer en Pro · {hub.plan.pro_price_usd} USD/mois</button>
        )}
      </section>

      {/* Revenus par app */}
      <section>
        <div className="flex items-end justify-between mb-3">
          <h2 className="font-display text-xl text-ink">Mes apps et revenus</h2>
          <button onClick={onOpenModules} className="text-sm text-coffee-dark underline underline-offset-4">Gérer mes apps</button>
        </div>
        <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
          {hub.apps.filter((a) => a.active).length === 0 && <p className="p-6 text-sm text-ink-soft">Aucune app activée. Choisissez-en jusqu'à {hub.plan.max_apps ?? "autant que vous voulez"} dans « Gérer mes apps » : votre profil est créé d'office à partir de votre dossier, sans second formulaire.</p>}
          {hub.apps.filter((a) => a.active).map((a) => {
            const m = moduleByKey(a.key); const Icon = m?.icon;
            return (
              <button key={a.key} onClick={() => onOpenModule(a.key)} className="w-full text-left flex items-center gap-4 p-5 hover:bg-latte-soft/50 transition-colors">
                <span className="w-10 h-10 rounded-xl bg-latte-soft text-coffee-dark flex items-center justify-center">{Icon && <Icon size={18} strokeWidth={1.7} />}</span>
                <span className="flex-1 min-w-0"><span className="block font-medium text-ink">{m?.fr?.name || a.key}</span><span className="block text-xs text-ink-faint">{a.revenue ? `${a.revenue.count} commande(s)/réservation(s)` : "Suivi bientôt disponible"}</span></span>
                {a.revenue && <span className="text-right"><span className="block font-display text-lg text-ink tabular-nums">{money(a.revenue.net)}</span><span className="block text-[11px] text-ink-faint">revenu net</span></span>}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-ink-faint mt-2">Revenu net = ce que vous recevez après la commission H-Company. Total, toutes apps : <strong className="text-ink">{money(hub.totals.net)}</strong>. Chiffres indicatifs, dans la devise de chaque app.</p>
      </section>

      {/* Fonctions */}
      <section>
        <h2 className="font-display text-xl text-ink mb-3">Fonctions</h2>
        <p className="text-sm text-ink-soft mb-4 flex items-center gap-2"><BadgeCheck size={15} className="text-emerald-600" />Gratuit, toujours inclus : publier, inventaire, commandes, revenus.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {hub.features.paid.map((f) => {
            const Icon = FEATURE_ICON[f.key] || Sparkles;
            return (
              <div key={f.key} className="rounded-2xl border border-line bg-surface p-5 flex flex-col">
                <div className="flex items-center justify-between mb-3"><span className="w-10 h-10 rounded-xl bg-latte-soft text-coffee-dark flex items-center justify-center"><Icon size={18} strokeWidth={1.7} /></span>
                  {f.status === "active" ? <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-emerald-700">Débloquée</span> : <Lock size={15} className="text-ink-faint" />}</div>
                <p className="font-medium text-ink">{f.label}</p>
                <p className="text-sm text-ink-soft mt-1 flex-1">{f.price_usd} USD/{f.per} — incluse dans le plan Pro.</p>
                {f.status === "locked" && <button disabled={busy === f.key} onClick={() => run(f.key, (t) => api.partnerHub.unlock(t, f.key), "Demande envoyée")} className="mt-4 self-start rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 hover:bg-coffee-dark disabled:opacity-50">Débloquer</button>}
                {f.status === "requested" && <p className="mt-4 text-xs text-coffee-dark bg-latte-soft rounded-full px-3 py-1.5 self-start">Demandée — en attente de confirmation du paiement</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Marque */}
      {brandingOn && (
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="font-display text-xl text-ink mb-1">Mon dashboard à mon nom</h2>
          <p className="text-sm text-ink-soft mb-4">Ce nom s'affiche à l'ouverture de votre dashboard et dans son en-tête.</p>
          <form className="grid sm:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); run("brand", (t) => api.partnerHub.saveBranding(t, form), "Enregistré"); }}>
            <label className="block text-sm"><span className="block font-medium text-ink mb-1.5">Nom de l'entreprise</span><input required minLength={2} maxLength={80} value={form.display_name} onChange={(e) => setBrand({ ...form, display_name: e.target.value })} className="w-full rounded-xl border border-line bg-cream px-4 py-3 text-sm" /></label>
            <label className="block text-sm"><span className="block font-medium text-ink mb-1.5">Slogan (facultatif)</span><input maxLength={120} value={form.tagline} onChange={(e) => setBrand({ ...form, tagline: e.target.value })} className="w-full rounded-xl border border-line bg-cream px-4 py-3 text-sm" /></label>
            <label className="block text-sm"><span className="block font-medium text-ink mb-1.5">Couleur</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(form.accent) ? form.accent : "#7b3f00"} onChange={(e) => setBrand({ ...form, accent: e.target.value })} className="h-11 w-24 rounded-lg border border-line bg-cream" /></label>
            <div className="flex items-end"><button disabled={busy === "brand"} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3 hover:bg-coffee-dark disabled:opacity-50">Enregistrer</button></div>
          </form>
        </section>
      )}
    </div>
  );
}
