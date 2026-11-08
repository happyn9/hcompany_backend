import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import PhoneField from "../PhoneField.jsx";
import { COUNTRY, FLAG, nf } from "../parts.jsx";
import { NAVY, OpRow, Primary, Row } from "./ui.jsx";

/** Écran de paiement d'une demande ou d'une facture : la personne choisit son opérateur, saisit son numéro et paie. */
export default function PayPanel({ head, amount, sub, children, q, payCountry, ops = [], opKey, setOp, onPay, onDecline, busy, err, simulated }) {
  const [phone, setPhone] = useState("");
  return (
    <div className="min-h-screen bg-cream px-4 py-8">
      <div className="max-w-[520px] mx-auto">
        <Link to="/app" className="font-display text-xl text-ink">H-Money</Link>
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <p className="text-sm text-ink-soft">{head}</p>
          <p className="font-bold text-4xl text-ink tabular-nums mt-1">{amount}</p>
          {sub && <p className="text-sm text-ink-soft mt-2">{sub}</p>}
          {children}
          {q && (
            <form onSubmit={(e) => { e.preventDefault(); onPay(phone); }} className="mt-6">
              <div className="rounded-xl bg-latte-soft/70 p-4 text-sm">
                <Row k="Frais H-Money" v={nf(q.fee, q.send_currency)} />
                <div className="border-t border-line my-2" />
                <Row k={`Vous payez (${FLAG[payCountry]} ${COUNTRY[payCountry]?.fr})`} v={nf(q.total_paid, q.send_currency)} strong />
              </div>
              <h3 className="font-bold text-ink mt-6 mb-3">Payer avec</h3>
              <div role="radiogroup" className="space-y-3">{ops.map((o) => <OpRow key={o.key} op={o.key} label={o.label} selected={opKey === o.key} onClick={() => setOp(o.key)} />)}</div>
              <label className="block text-sm mt-5 mb-1.5">Votre numéro mobile money</label>
              <PhoneField country={payCountry} value={phone} onChange={setPhone} />
              {err && <p role="alert" className="text-sm text-red-600 mt-4">{err}</p>}
              <div className="mt-6"><Primary busy={busy} disabled={!phone || !opKey}><ShieldCheck size={18} />Payer {nf(q.total_paid, q.send_currency)}</Primary></div>
              {onDecline && <button type="button" onClick={onDecline} className="w-full text-center text-xs text-ink-faint hover:text-ink mt-4">Refuser cette demande</button>}
              {simulated && <p role="note" className="mt-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3"><strong>Mode démonstration.</strong> Aucun argent réel n'est encaissé.</p>}
              <p className="text-xs text-ink-faint mt-4 flex gap-2" style={{ color: NAVY }}><ShieldCheck size={14} className="shrink-0 mt-0.5" />L'argent est gardé jusqu'au contrôle, puis versé.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
