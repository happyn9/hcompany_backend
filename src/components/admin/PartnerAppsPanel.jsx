import { useEffect, useState } from "react";
import { Check, X, DollarSign, Loader2, Package, TrendingUp, Wallet } from "lucide-react";

const STATUS = {
  requested: { label: "En attente", cls: "bg-latte-soft text-coffee-dark border-latte-light", dot: "bg-latte" },
  active: { label: "Active", cls: "bg-latte-soft text-coffee-dark border-coffee-light", dot: "bg-coffee" },
  suspended: { label: "Suspendue", cls: "bg-chocolate text-cream-fixed border-chocolate", dot: "bg-latte" },
  rejected: { label: "Refusée", cls: "bg-line/60 text-ink-faint border-line", dot: "bg-ink-faint" },
};

const inputCls =
  "w-full text-sm rounded-xl border border-line bg-surface px-3 py-2 outline-none placeholder:text-ink-faint focus:border-coffee-light";

export default function PartnerAppsPanel({ applicationId, withAuth, api }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revenueFormFor, setRevenueFormFor] = useState(null);
  const [amount, setAmount] = useState("");
  const [commission, setCommission] = useState("");
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await withAuth((token) => api.admin.listPartnerApps(token, applicationId));
      setApps(data);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  async function updateStatus(appId, status) {
    setBusyId(appId);
    try {
      await withAuth((token) => api.admin.updateAppStatus(token, appId, status));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function submitRevenue(e, appId) {
    e.preventDefault();
    if (!amount) return;
    setBusyId(appId);
    try {
      await withAuth((token) =>
        api.admin.addRevenue(token, appId, {
          amount: parseFloat(amount),
          commission_amount: parseFloat(commission || 0),
          description: null,
        })
      );
      setAmount("");
      setCommission("");
      setRevenueFormFor(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2.5">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-cream/70 animate-pulse" />
        ))}
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
        <Package size={20} className="mx-auto text-ink-faint mb-2" strokeWidth={1.6} />
        <p className="text-sm text-ink-soft">Ce partenaire n'a encore demandé aucune app.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {apps.map((app) => {
        const st = STATUS[app.status] || STATUS.requested;
        const busy = busyId === app.id;
        const formOpen = revenueFormFor === app.id;
        return (
          <div key={app.id} className="rounded-2xl border border-line bg-surface overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-cream text-coffee-dark flex items-center justify-center shrink-0">
                    <Package size={16} strokeWidth={1.8} />
                  </span>
                  <p className="text-sm font-semibold text-ink truncate">{app.name}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${st.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3.5">
                <div className="rounded-xl bg-cream/50 px-3 py-2">
                  <p className="flex items-center gap-1 text-[11px] text-ink-faint"><TrendingUp size={11} /> Revenu total</p>
                  <p className="text-sm font-semibold text-ink mt-0.5">{app.total_revenue.toFixed(0)} $</p>
                </div>
                <div className="rounded-xl bg-cream/50 px-3 py-2">
                  <p className="flex items-center gap-1 text-[11px] text-ink-faint"><Wallet size={11} /> Montant dû</p>
                  <p className={`text-sm font-semibold mt-0.5 ${app.total_owed > 0 ? "text-coffee-dark" : "text-ink"}`}>
                    {app.total_owed.toFixed(0)} $
                  </p>
                </div>
              </div>

              {app.status === "requested" && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    onClick={() => updateStatus(app.id, "active")}
                    disabled={busy}
                    className="flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg bg-coffee text-white py-2 hover:bg-coffee-dark disabled:opacity-50 transition-colors"
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Approuver
                  </button>
                  <button
                    onClick={() => updateStatus(app.id, "rejected")}
                    disabled={busy}
                    className="flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg border border-line text-ink-soft py-2 hover:bg-line/50 hover:text-ink hover:border-ink-faint disabled:opacity-50 transition-colors"
                  >
                    <X size={13} />
                    Refuser
                  </button>
                </div>
              )}

              {app.status === "active" && !formOpen && (
                <button
                  onClick={() => setRevenueFormFor(app.id)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg border border-dashed border-coffee-light text-coffee-dark py-2 hover:bg-cream transition-colors"
                >
                  <DollarSign size={13} />
                  Ajouter un revenu
                </button>
              )}
            </div>

            {formOpen && (
              <form onSubmit={(e) => submitRevenue(e, app.id)} className="border-t border-line bg-cream/40 p-4">
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className="block text-[11px] font-medium text-ink-soft mb-1">Montant ($)</span>
                    <input type="number" min="0" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} required autoFocus />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-ink-soft mb-1">Commission ($)</span>
                    <input type="number" min="0" placeholder="0" value={commission} onChange={(e) => setCommission(e.target.value)} className={inputCls} />
                  </label>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex items-center gap-1.5 text-xs font-medium bg-ink text-cream rounded-full px-4 py-2 disabled:opacity-50 hover:bg-coffee-dark transition-colors"
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRevenueFormFor(null); setAmount(""); setCommission(""); }}
                    className="text-xs font-medium text-ink-soft px-3 py-2 hover:text-ink"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}