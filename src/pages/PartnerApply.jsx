import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Paperclip, ShieldCheck } from "lucide-react";
import { api } from "../lib/api.js";
import { useUser } from "../context/Usercontext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { usePageMeta } from "../components/ui/HeadManager.jsx";

const CATEGORIES = ["Hébergement / logement", "Transport & colis", "Boutique / commerce", "Restaurant", "Tourisme & excursions", "Formation", "Cybersécurité", "Développement web & mobile", "Autre"];
const input = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15";
const MAX = 5 * 1024 * 1024;

/** Demande de partenariat : l'unique formulaire, ouvert par le lien envoyé par e-mail. */
export default function PartnerApply() {
  usePageMeta({ title: "Demande de partenariat" });
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated, isLoading, user, withAuth } = useUser();
  const [invite, setInvite] = useState(undefined); // undefined = vérification, null = lien invalide
  const [f, setF] = useState({ company: "", contactName: "", category: CATEGORIES[0], message: "", phone: "", address: "", id_document_type: "national_id", id_document_number: "" });
  const [file, setFile] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (!token) { setInvite(null); return; }
    api.partnerHub.invite(token).then(setInvite).catch((e) => setInvite({ error: e?.data?.detail || "Ce lien n'est plus valide." }));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    if (!file) { setErr("Joignez votre pièce d'identité (JPG, PNG ou PDF, 5 Mo max)."); return; }
    if (file.size > MAX) { setErr("La pièce d'identité ne doit pas dépasser 5 Mo."); return; }
    setBusy(true); setErr("");
    try {
      await withAuth((t) => api.partners.apply(t, { ...f, invite: token }, file));
      toast?.success?.("Demande envoyée. Nous revenons vers vous par e-mail.");
      navigate("/", { replace: true, state: { justApplied: true } });
    } catch (e2) { setErr(e2?.data?.detail || "Envoi impossible pour le moment."); } finally { setBusy(false); }
  }

  const here = `/demande-partenariat?token=${encodeURIComponent(token)}`;
  let body;
  if (invite === undefined || isLoading) body = <Loader2 className="animate-spin text-ink-faint mx-auto" />;
  else if (!invite || invite.error) body = (
    <div className="text-center">
      <p className="text-ink mb-2">{invite?.error || "Il manque le lien de demande."}</p>
      <p className="text-sm text-ink-soft mb-6">Écrivez-nous depuis la page d'accueil (« Parlez-nous de votre entreprise ») : nous vous envoyons un lien personnel.</p>
      <Link to="/infos#contact" className="inline-block rounded-full bg-ink text-cream text-sm font-medium px-6 py-3">Nous contacter</Link>
    </div>
  );
  else if (!isAuthenticated) body = (
    <div className="text-center">
      <p className="text-ink-soft mb-6">Ce lien est réservé à <strong className="text-ink">{invite.email}</strong>. Connectez-vous (ou créez un compte) avec cette adresse pour continuer.</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link to="/connexion" state={{ redirectTo: here }} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3">Se connecter</Link>
        <Link to="/creer-un-compte" state={{ redirectTo: here }} className="rounded-full border border-line text-ink text-sm font-medium px-6 py-3">Créer un compte</Link>
      </div>
    </div>
  );
  else if (user?.email?.toLowerCase() !== invite.email.toLowerCase()) body = <p className="text-center text-ink-soft">Ce lien est réservé à <strong className="text-ink">{invite.email}</strong>, mais vous êtes connecté avec {user?.email}. Déconnectez-vous puis revenez sur ce lien.</p>;
  else body = (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm"><span className="block font-medium mb-1.5">Entreprise / activité</span><input required className={input} value={f.company} onChange={set("company")} /></label>
        <label className="block text-sm"><span className="block font-medium mb-1.5">Votre nom complet</span><input required className={input} value={f.contactName} onChange={set("contactName")} /></label>
        <label className="block text-sm"><span className="block font-medium mb-1.5">Domaine</span><select className={input} value={f.category} onChange={set("category")}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="block text-sm"><span className="block font-medium mb-1.5">Téléphone / WhatsApp</span><input required type="tel" className={input} value={f.phone} onChange={set("phone")} placeholder="+260 97…" /></label>
      </div>
      <label className="block text-sm"><span className="block font-medium mb-1.5">Adresse (ville, quartier)</span><input required className={input} value={f.address} onChange={set("address")} /></label>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm"><span className="block font-medium mb-1.5">Pièce d'identité</span><select className={input} value={f.id_document_type} onChange={set("id_document_type")}><option value="national_id">Carte nationale d'identité</option><option value="voter_card">Carte d'électeur</option><option value="passport">Passeport</option></select></label>
        <label className="block text-sm"><span className="block font-medium mb-1.5">Numéro</span><input required className={input} value={f.id_document_number} onChange={set("id_document_number")} /></label>
      </div>
      <label className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-ink-soft cursor-pointer hover:border-coffee">
        <Paperclip size={16} /><span className="truncate">{file ? file.name : "Joindre la pièce (JPG, PNG, PDF — 5 Mo max)"}</span>
        <input type="file" accept="image/png,image/jpeg,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      <label className="block text-sm"><span className="block font-medium mb-1.5">Votre activité en quelques mots (facultatif)</span><textarea rows={3} className={input} value={f.message} onChange={set("message")} /></label>
      <p className="text-xs text-ink-faint flex items-start gap-2"><ShieldCheck size={14} className="shrink-0 mt-0.5" />Votre pièce est stockée de façon privée ; seuls nos agents de vérification la consultent.</p>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark disabled:opacity-60">{busy ? "Envoi…" : "Envoyer ma demande"}</button>
    </form>
  );

  return (
    <div className="min-h-screen bg-cream px-5 py-12">
      <div className="max-w-xl mx-auto">
        <Link to="/" className="font-display text-xl text-ink">H-Company</Link>
        <h1 className="font-display text-3xl text-ink mt-8 mb-2">Demande de partenariat</h1>
        <p className="text-sm text-ink-soft mb-8">Un seul formulaire. Après validation, vous recevez votre code partenaire et votre mot de passe, et vous gérez tout depuis un seul dashboard.</p>
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">{body}</div>
      </div>
    </div>
  );
}
