import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const msgOf = (e) => e?.data?.detail || e?.message || "Une erreur est survenue.";
const btn = "rounded-lg px-3.5 py-2 text-xs font-medium disabled:opacity-50";
const FEAT = { promotion: "Promotions", branding: "Dashboard à son nom" };

/** Invitations de partenariat (lien par e-mail), demandes de plan Pro et de fonctions payantes. */
export default function PartnerHubAdminPanel({ withAuth, api }) {
  const [req, setReq] = useState(null);
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [months, setMonths] = useState(1);
  const [ref, setRef] = useState({});
  const [last, setLast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const A = api.partnerHub.admin;
  const load = useCallback(async () => {
    try { const [r, i] = await Promise.all([withAuth((t) => A.requests(t)), withAuth((t) => A.invites(t))]); setReq(r); setInvites(i); setErr(""); } catch (e) { setErr(msgOf(e)); }
  }, [withAuth, A]);
  useEffect(() => { load(); }, [load]);
  async function act(fn) { setBusy(true); try { await withAuth(fn); await load(); } catch (e) { setErr(msgOf(e)); } finally { setBusy(false); } }
  async function invite(e) {
    e.preventDefault(); setBusy(true); setErr("");
    try { setLast(await withAuth((t) => A.createInvite(t, { email, note }))); setEmail(""); setNote(""); await load(); } catch (e2) { setErr(msgOf(e2)); } finally { setBusy(false); }
  }
  if (!req) return err ? <p className="text-sm text-red-600">{err}</p> : <Loader2 className="animate-spin text-ink-faint" />;
  return (
    <div className="space-y-8">
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <section className="bg-surface border border-line rounded-2xl p-6">
        <h2 className="font-display text-xl text-ink mb-1">Inviter un partenaire</h2>
        <p className="text-sm text-ink-soft mb-4">Envoie par e-mail le lien personnel du formulaire de partenariat (valable 14 jours).</p>
        <form onSubmit={invite} className="flex flex-wrap gap-3">
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e-mail du partenaire" className="flex-1 min-w-[14rem] rounded-xl border border-line bg-cream px-4 py-3 text-sm" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note interne (facultatif)" className="flex-1 min-w-[10rem] rounded-xl border border-line bg-cream px-4 py-3 text-sm" />
          <button disabled={busy} className="rounded-xl bg-ink text-cream text-sm font-medium px-6 py-3 disabled:opacity-50">Envoyer le lien</button>
        </form>
        {last && <p className="text-xs text-ink-soft mt-3 break-all">Lien créé (aussi envoyé par e-mail) : <code>{last.link}</code></p>}
        <ul className="divide-y divide-line mt-5 text-sm">
          {invites.slice(0, 8).map((i) => <li key={i.id} className="py-2 flex justify-between gap-3"><span className="truncate">{i.email}</span><span className="text-xs text-ink-faint">{i.used ? "utilisé" : i.expired ? "expiré" : "en attente"}</span></li>)}
        </ul>
      </section>
      <section className="bg-surface border border-line rounded-2xl p-6">
        <h2 className="font-display text-xl text-ink mb-4">Demandes de plan Pro ({req.upgrades.length})</h2>
        {req.upgrades.length === 0 && <p className="text-sm text-ink-soft">Aucune.</p>}
        {req.upgrades.map((u) => (
          <div key={u.user_id} className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-line last:border-0">
            <p className="text-sm"><strong>{u.name || u.email}</strong> <span className="text-ink-faint">{u.partner_code} · {u.email}</span></p>
            <div className="flex items-center gap-2">
              <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="rounded-lg border border-line bg-cream px-2 py-2 text-xs">{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} mois</option>)}</select>
              <button disabled={busy} onClick={() => act((t) => A.setPlan(t, u.user_id, { plan: "pro", months }))} className={`${btn} bg-ink text-cream`}>Paiement reçu → activer Pro</button>
            </div>
          </div>
        ))}
      </section>
      <section className="bg-surface border border-line rounded-2xl p-6">
        <h2 className="font-display text-xl text-ink mb-4">Fonctions payantes demandées ({req.features.length})</h2>
        {req.features.length === 0 && <p className="text-sm text-ink-soft">Aucune.</p>}
        {req.features.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-line last:border-0">
            <p className="text-sm"><strong>{FEAT[f.key] || f.key}</strong> — {f.name || f.email} <span className="text-ink-faint">{f.partner_code}</span></p>
            <div className="flex items-center gap-2">
              <input value={ref[f.id] || ""} onChange={(e) => setRef({ ...ref, [f.id]: e.target.value })} placeholder="Réf. paiement" className="rounded-lg border border-line bg-cream px-3 py-2 text-xs w-36" />
              <button disabled={busy} onClick={() => act((t) => A.decideFeature(t, f.id, { status: "active", reference: ref[f.id] || "" }))} className={`${btn} bg-ink text-cream`}>Débloquer</button>
              <button disabled={busy} onClick={() => act((t) => A.decideFeature(t, f.id, { status: "off" }))} className={`${btn} border border-line text-ink-soft`}>Refuser</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
