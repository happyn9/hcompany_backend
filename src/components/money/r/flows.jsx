import { useEffect, useMemo, useState } from "react";
import { Check, Copy, MessageCircle, ShieldCheck } from "lucide-react";
import { api } from "../../../lib/api.js";
import { useUser } from "../../../context/Usercontext.jsx";
import { useToast } from "../../../context/ToastContext.jsx";
import PhoneField from "../PhoneField.jsx";
import { COUNTRY, FLAG, msgOf, nf, useQuote } from "../parts.jsx";
import { Frame, H, NAVY, OpRow, Primary, Row, SoonChips, bare, field } from "./ui.jsx";

const CC = ["ZM", "CD"];
const other = (c) => (c === "ZM" ? "CD" : "ZM");

/** Dollars saisis → monnaie du pays qui paie (ZMW) au taux du marché ; en RDC la monnaie est déjà le dollar. */
function useUsdLocal(cur, usd) {
  const [v, setV] = useState("");
  useEffect(() => {
    const n = Number(usd);
    if (!n || n <= 0) { setV(""); return undefined; }
    if (cur === "USD") { setV(String(n)); return undefined; }
    let on = true;
    const t = setTimeout(() => { api.money.change(n, "USD", cur).then((r) => { if (on) setV(String(Math.round(n * r.mid_rate * 100) / 100)); }).catch(() => on && setV("")); }, 250);
    return () => { on = false; clearTimeout(t); };
  }, [cur, usd]);
  return v;
}

function CountryPick({ from, setFrom, label }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <span className="text-sm text-ink-soft">{label}</span>
      {CC.map((c) => <button key={c} type="button" onClick={() => setFrom(c)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${from === c ? "text-white border-transparent" : "border-line text-ink bg-surface"}`} style={from === c ? { background: NAVY } : undefined}>{FLAG[c]} {COUNTRY[c].fr}</button>)}
    </div>
  );
}

function OpList({ cor, country, role, onPick, note }) {
  const list = (cor?.operators?.[country] || []).filter((o) => o[role]);
  return (
    <div>
      {note && <p className="text-sm text-ink-soft -mt-2 mb-4">{note}</p>}
      <div role="radiogroup" className="space-y-3">{list.map((o) => <OpRow key={o.key} op={o.key} label={o.label} onClick={() => onPick(o.key)} />)}</div>
    </div>
  );
}

/* ───────────────────────────── ENVOYER ───────────────────────────── */
export function SendFlow({ cor, onExit, onDone, requireAuth, preset }) {
  const { user, withAuth } = useUser();
  const [step, setStep] = useState("amount");
  const [from, setFrom] = useState(preset?.to ? other(preset.to) : "ZM");
  const to = other(from);
  const [usd, setUsd] = useState("");
  const [withFee, setWithFee] = useState(true);
  const [benOp, setBenOp] = useState(preset?.operator || "");
  const [first, setFirst] = useState(preset?.first || "");
  const [last, setLast] = useState(preset?.last || "");
  const [phone, setPhone] = useState(preset?.phone || "");
  const [payOp, setPayOp] = useState("");
  const [payPhone, setPayPhone] = useState("");
  const [myName, setMyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const curFrom = cor?.currencies?.[from] || "ZMW";
  const local = useUsdLocal(curFrom, usd);
  const { q, err: qErr } = useQuote({ amount: local, from, to, withFee, payOp, benOp });
  const needName = !!user && !(user.full_name || "").trim();
  const steps = [...(preset ? ["amount"] : ["amount", "op", "name", "phone"]), "pay", ...(needName ? ["me"] : []), "review"];
  const idx = steps.indexOf(step);
  const go = (s) => { setErr(""); setStep(s); };
  const back = () => (idx <= 0 ? onExit() : go(steps[idx - 1]));
  const effRate = q ? (from === "ZM" ? q.send_amount / q.receive_amount : q.receive_amount / q.send_amount) : null;

  async function confirm() {
    if (!requireAuth()) return;
    setBusy(true); setErr("");
    try {
      const t = await withAuth((tk) => api.money.send(tk, { from_country: from, to_country: to, amount: Number(local), with_fee: withFee, beneficiary_name: `${first} ${last}`.trim(), beneficiary_phone: phone, beneficiary_operator: benOp, pay_phone: payPhone, pay_operator: payOp, note: "" }));
      if (needName || !user?.phone) withAuth((tk) => api.money.profile(tk, { full_name: myName || user?.full_name || `${first}`.trim() || "Client", phone: payPhone, country: from })).catch(() => {});
      onDone(t);
    } catch (x) { setErr(msgOf(x)); } finally { setBusy(false); }
  }

  return (
    <Frame onBack={back} progress={(idx + 1) / (steps.length + 1)}>
      {step === "amount" && (<>
        {!preset && <CountryPick from={from} setFrom={(c) => { setFrom(c); setBenOp(""); setPayOp(""); }} label="Je pars de" />}
        <label className="block text-sm text-ink mb-1.5">Vous envoyez</label>
        <div className="flex items-center rounded-lg border-2 h-14 px-3 gap-3 bg-surface" style={{ borderColor: NAVY }}>
          <span className="text-xl">🇺🇸</span>
          <input autoFocus inputMode="decimal" type="number" min="0" step="0.01" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="0" className={bare} />
          <span className="font-bold text-ink">USD</span>
        </div>
        <div className="mt-3 rounded-lg bg-latte-soft/70 px-4 py-3 text-sm text-ink">
          <strong>Taux de change :</strong> {effRate ? <>1 USD = <strong>{effRate.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ZMW</strong></> : "affiché dès que vous saisissez un montant"}
        </div>
        <label className="block text-sm text-ink mt-5 mb-1.5">Ils reçoivent</label>
        <div className="flex items-center rounded-lg border border-line h-14 px-3 gap-3 bg-surface">
          <span className="text-xl">{FLAG[to]}</span><span className="flex-1 text-lg text-ink tabular-nums">{q ? nf(q.receive_amount, "").trim() : "—"}</span>
          <span className="font-bold text-sm border border-line rounded px-2 py-1">{q?.receive_currency || cor?.currencies?.[to] || ""}</span>
        </div>
        {qErr && <p role="alert" className="text-sm text-red-600 mt-3">{qErr}</p>}
        {q && (
          <div className="mt-6 rounded-xl bg-latte-soft/70 p-4 text-sm">
            <Row k="Frais H-Money" v={nf(q.fee, q.send_currency)} />
            <Row k="Montant converti" v={nf(q.send_amount, q.send_currency)} />
            <div className="border-t border-line my-2" />
            <Row k="Total à payer" v={nf(q.total_paid, q.send_currency)} strong />
          </div>
        )}
        <label className="flex items-start gap-3 mt-4 text-sm text-ink-soft cursor-pointer">
          <input type="checkbox" checked={withFee} onChange={(e) => setWithFee(e.target.checked)} className="mt-0.5 w-4 h-4" style={{ accentColor: NAVY }} />
          <span>Ajouter les frais à mon montant. {withFee ? "Je paie le montant + les frais ; le bénéficiaire reçoit le montant saisi." : "Les frais sont retirés du montant saisi : je paie exactement ce montant."}</span>
        </label>
        <div className="mt-6"><Primary type="button" disabled={!q} onClick={() => go(steps[1])}>Continuer</Primary></div>
        <div className="mt-5"><SoonChips /></div>
      </>)}

      {step === "op" && (<>
        <H sub="Le bénéficiaire ne paie aucun frais.">Choisissez un mode de réception</H>
        <OpList cor={cor} country={to} role="receive" onPick={(k) => { setBenOp(k); go("name"); }} />
      </>)}

      {step === "name" && (<form onSubmit={(e) => { e.preventDefault(); go("phone"); }}>
        <H sub="Ces informations doivent correspondre à celles du compte mobile money du bénéficiaire.">Nom du bénéficiaire</H>
        <label className="block text-sm mb-1.5">Prénom</label><input required autoFocus className={field} value={first} onChange={(e) => setFirst(e.target.value)} />
        <label className="block text-sm mt-4 mb-1.5">Nom</label><input required className={field} value={last} onChange={(e) => setLast(e.target.value)} />
        <div className="mt-6"><Primary>Continuer</Primary></div>
      </form>)}

      {step === "phone" && (<form onSubmit={(e) => { e.preventDefault(); go("pay"); }}>
        <H>Téléphone du bénéficiaire</H>
        <label className="block text-sm mb-1.5">Numéro de téléphone</label>
        <PhoneField country={to} value={phone} onChange={setPhone} />
        <div className="mt-6"><Primary disabled={!phone}>Continuer</Primary></div>
      </form>)}

      {step === "pay" && (<form onSubmit={(e) => { e.preventDefault(); if (payOp) go(needName ? "me" : "review"); }}>
        <H sub={`Depuis ${COUNTRY[from].fr}. Vous recevrez une demande de validation sur votre téléphone.`}>Vous payez avec</H>
        <div role="radiogroup" className="space-y-3">{(cor?.operators?.[from] || []).filter((o) => o.pay).map((o) => <OpRow key={o.key} op={o.key} label={o.label} selected={payOp === o.key} onClick={() => setPayOp(o.key)} />)}</div>
        <label className="block text-sm mt-5 mb-1.5">Votre numéro mobile money</label>
        <PhoneField country={from} value={payPhone} onChange={setPayPhone} />
        <div className="mt-6"><Primary disabled={!payOp || !payPhone}>Continuer</Primary></div>
      </form>)}

      {step === "me" && (<form onSubmit={(e) => { e.preventDefault(); go("review"); }}>
        <H sub="C'est votre première opération : ces informations sont enregistrées dans votre compte (une seule fois).">Vos informations</H>
        <label className="block text-sm mb-1.5">Votre nom complet</label><input required autoFocus className={field} value={myName} onChange={(e) => setMyName(e.target.value)} />
        <div className="mt-6"><Primary>Continuer</Primary></div>
      </form>)}

      {step === "review" && q && (<>
        <H>Vérifiez votre envoi</H>
        <div className="rounded-xl border border-line p-4 text-sm space-y-0.5">
          <Row k="Vous envoyez" v={nf(Number(usd), "USD")} />
          <Row k="Bénéficiaire" v={`${first} ${last}`} />
          <Row k="Reçoit sur" v={`${(cor?.operators?.[to] || []).find((o) => o.key === benOp)?.label || benOp} · ${phone}`} />
          <Row k="Il reçoit" v={nf(q.receive_amount, q.receive_currency)} strong />
          <div className="border-t border-line my-2" />
          <Row k="Frais H-Money" v={nf(q.fee, q.send_currency)} />
          <Row k="Taux" v={`1 USD = ${effRate?.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ZMW`} />
          <Row k="Vous payez" v={nf(q.total_paid, q.send_currency)} strong />
          <Row k="Depuis" v={`${(cor?.operators?.[from] || []).find((o) => o.key === payOp)?.label || payOp} · ${payPhone}`} />
        </div>
        {cor?.simulated && <p role="note" className="mt-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3"><strong>Mode démonstration.</strong> Aucun argent réel n'est encaissé ni versé tant que le partenaire de paiement n'est pas branché.</p>}
        {err && <p role="alert" className="text-sm text-red-600 mt-4">{err}</p>}
        <div className="mt-6"><Primary type="button" busy={busy} onClick={confirm}><ShieldCheck size={18} />Confirmer et payer {nf(q.total_paid, q.send_currency)}</Primary></div>
      </>)}
    </Frame>
  );
}

/* ───────────────────────────── DEMANDER ───────────────────────────── */
export function RequestFlow({ cor, onExit, requireAuth }) {
  const { user, withAuth } = useUser();
  const toast = useToast();
  const [step, setStep] = useState("amount");
  const [mine, setMine] = useState("ZM");
  const payer = other(mine);
  const [usd, setUsd] = useState("");
  const [op, setOp] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const local = useUsdLocal(cor?.currencies?.[mine] || "ZMW", usd);
  const { q } = useQuote({ amount: local, from: payer, to: mine, mode: "receive", benOp: op });
  const needName = !!user && !(user.full_name || "").trim();
  const steps = ["amount", "op", ...(needName ? ["me"] : []), "phone"];
  const idx = steps.indexOf(step);
  const go = (s) => { setErr(""); setStep(s); };
  const link = done ? `${window.location.origin}/money/demande/${done.code}` : "";

  async function create(e) {
    e.preventDefault();
    if (!requireAuth()) return;
    setBusy(true); setErr("");
    try {
      const t = await withAuth((tk) => api.money.request(tk, { payer_country: payer, receiver_country: mine, amount_usd: Number(usd), receive_phone: phone, receive_operator: op, note }));
      if (needName || !user?.phone) withAuth((tk) => api.money.profile(tk, { full_name: name || user?.full_name || "Client", phone, country: mine })).catch(() => {});
      setDone(t);
    } catch (x) { setErr(msgOf(x)); } finally { setBusy(false); }
  }

  if (done) return (
    <Frame onBack={onExit} progress={1}>
      <div className="text-center">
        <span className="mx-auto w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: "#2F8F83" }}><Check size={26} /></span>
        <h2 className="font-bold text-2xl text-ink mt-4">Votre lien est prêt</h2>
        <p className="text-sm text-ink-soft mt-2">Partagez-le : la personne ({COUNTRY[payer].fr}) saisit son numéro et paie. Vous recevez <strong>{nf(Number(usd), "USD")}</strong> sur {(cor?.operators?.[mine] || []).find((o) => o.key === op)?.label} ({phone}).</p>
        <div className="mt-5 rounded-2xl border border-line p-5 text-left">
          <p className="text-sm text-ink-soft">{user?.full_name || "Vous"}</p>
          <p className="font-bold text-3xl text-ink tabular-nums mt-1">{nf(Number(usd), "USD")}</p>
          <p className="mt-3 rounded-lg bg-latte-soft/70 px-3 py-2 text-xs break-all text-ink-soft">{link}</p>
          <div className="mt-4 flex gap-3">
            <button onClick={() => { navigator.clipboard?.writeText(link); toast?.success?.("Lien copié"); }} className="flex-1 inline-flex items-center justify-center gap-2 rounded-full text-white font-bold h-12" style={{ background: NAVY }}><Copy size={16} />Copier le lien</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Bonjour, voici ma demande H-Money : ${link}`)}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="w-12 h-12 rounded-full bg-[#25D366] text-white flex items-center justify-center"><MessageCircle size={20} /></a>
          </div>
        </div>
        <p className="text-xs text-ink-faint mt-4">Valable 7 jours · référence {done.code}</p>
      </div>
    </Frame>
  );

  return (
    <Frame onBack={() => (idx <= 0 ? onExit() : go(steps[idx - 1]))} progress={(idx + 1) / (steps.length + 1)}>
      {step === "amount" && (<>
        <CountryPick from={mine} setFrom={(c) => { setMine(c); setOp(""); }} label="Je reçois en" />
        <label className="block text-sm text-ink mb-1.5">Montant demandé</label>
        <div className="flex items-center rounded-lg border-2 h-14 px-3 gap-3 bg-surface" style={{ borderColor: NAVY }}>
          <span className="text-xl">🇺🇸</span>
          <input autoFocus inputMode="decimal" type="number" min="0" step="0.01" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="0" className={bare} />
          <span className="font-bold text-ink">USD</span>
        </div>
        <p className="text-xs text-ink-faint mt-2">Toujours en dollars. Vous recevez exactement ce montant (converti si besoin) : les frais sont à la charge de la personne qui paie.</p>
        {q && <div className="mt-5 rounded-lg bg-latte-soft/70 px-4 py-3 text-sm text-ink">La personne ({COUNTRY[payer].fr}) paiera <strong>{nf(q.total_paid, q.send_currency)}</strong>, frais inclus.</div>}
        <div className="mt-6"><Primary type="button" disabled={!Number(usd)} onClick={() => go("op")}>Continuer</Primary></div>
        <div className="mt-5"><SoonChips /></div>
      </>)}
      {step === "op" && (<><H sub="Un seul numéro : c'est là que vous recevrez l'argent.">Je reçois sur</H><OpList cor={cor} country={mine} role="receive" onPick={(k) => { setOp(k); go(needName ? "me" : "phone"); }} /></>)}
      {step === "me" && (<form onSubmit={(e) => { e.preventDefault(); go("phone"); }}>
        <H sub="Première opération : ces informations sont enregistrées dans votre compte (une seule fois).">Vos informations</H>
        <label className="block text-sm mb-1.5">Votre nom complet</label><input required autoFocus className={field} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="mt-6"><Primary>Continuer</Primary></div>
      </form>)}
      {step === "phone" && (<form onSubmit={create}>
        <H sub="Vous commencerez à recevoir sur ce numéro dès qu'on aura payé.">Votre numéro de réception</H>
        <PhoneField country={mine} value={phone} onChange={setPhone} />
        <label className="block text-sm mt-4 mb-1.5">Motif (facultatif)</label><input maxLength={200} className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Loyer, scolarité…" />
        {err && <p role="alert" className="text-sm text-red-600 mt-4">{err}</p>}
        <div className="mt-6"><Primary busy={busy} disabled={!phone}>Créer mon lien</Primary></div>
      </form>)}
    </Frame>
  );
}

export function SendDone({ t, onAgain }) {
  const review = t.status === "under_review", ok = t.status === "completed";
  return (
    <Frame onBack={onAgain} progress={1}>
      <div className="text-center">
        <span className="mx-auto w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: ok || review ? "#2F8F83" : "#B45309" }}><Check size={26} /></span>
        <h2 className="font-bold text-2xl text-ink mt-4">{review ? "Envoi enregistré" : ok ? "Envoi effectué" : "Envoi non abouti"}</h2>
        <p className="text-sm text-ink-soft mt-2 max-w-sm mx-auto">{review ? `Votre paiement est reçu. Un contrôle rapide est en cours : ${t.counterpart_name} recevra ${nf(t.receive_amount, t.receive_currency)} dès la confirmation. En cas de refus, vous êtes remboursé.` : ok ? `${t.counterpart_name} reçoit ${nf(t.receive_amount, t.receive_currency)}.` : t.failure_reason}</p>
        <p className="text-xs text-ink-faint mt-3">Référence <strong className="text-ink">{t.code}</strong>{t.simulated && " · démonstration"}</p>
        <div className="mt-6 max-w-xs mx-auto"><Primary type="button" onClick={onAgain}>Terminer</Primary></div>
      </div>
    </Frame>
  );
}
