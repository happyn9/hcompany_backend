import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Mail, Trash2, Users2 } from "lucide-react";
import NavBar from "../../components/layout/NavBar.jsx";
import Footer from "../../components/layout/Footer.jsx";
import { useLearningUi } from "../../components/learning/Shared.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { formatDate } from "../../lib/pricing.js";

const STATUS_TONE = {
  active: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  expired: "bg-line text-ink-soft",
  cancelled: "bg-line text-ink-soft",
  failed: "bg-red-50 text-red-700",
};

function amount(sub) {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(sub.amount_pivot))} ${sub.pivot_currency}`;
}

export default function MySubscription() {
  const ui = useLearningUi();
  const a = ui.account;
  const { lang } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, withAuth } = useUser();
  const [data, setData] = useState(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  usePageMeta({ title: a.title, description: a.lead });

  const load = useCallback(() => {
    withAuth((token) => api.learning.mySubscription(token))
      .then(setData)
      .catch(() => setData({ active: null, history: [] }));
  }, [withAuth]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  async function addMember(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError("");
    try {
      await withAuth((token) => api.learning.addMember(token, data.active.id, email.trim()));
      setEmail("");
      load();
    } catch (err) {
      setError(err?.data?.detail || ui.checkout.error);
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(memberId) {
    setBusy(true);
    try {
      await withAuth((token) => api.learning.removeMember(token, data.active.id, memberId));
      load();
    } catch {
      /* la liste se rechargera au prochain essai */
    } finally {
      setBusy(false);
    }
  }

  const shell = (body) => (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <main className="pt-28 pb-20 px-6">
        <div className="max-w-3xl mx-auto">{body}</div>
      </main>
      <Footer />
    </div>
  );

  if (isLoading) return shell(<div className="h-72 rounded-3xl bg-surface border border-line animate-pulse" />);
  if (!isAuthenticated) {
    return shell(
      <div className="rounded-3xl border border-line bg-surface p-8 text-center">
        <p className="text-ink mb-5">{a.signinNeeded}</p>
        <button
          type="button"
          onClick={() => navigate("/connexion", { state: { redirectTo: location.pathname } })}
          className="rounded-full bg-ink text-cream text-sm font-medium px-7 py-3.5 hover:bg-coffee-dark transition-colors"
        >
          {a.signin}
        </button>
      </div>
    );
  }

  const active = data?.active;
  const isTeam = active && active.seats > 1;
  const used = active ? 1 + active.members.length : 0;

  return shell(
    <>
      <Link to="/formations" className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink mb-6">
        <ArrowLeft size={15} />
        {a.back}
      </Link>
      <h1 className="font-display text-4xl text-ink mb-2">{a.title}</h1>
      <p className="text-ink-soft mb-8">{a.lead}</p>

      {!data ? (
        <div className="h-48 rounded-3xl bg-surface border border-line animate-pulse" />
      ) : !active ? (
        <div className="rounded-3xl border border-dashed border-line bg-surface p-8 text-center">
          <p className="font-display text-xl text-ink mb-2">{a.none}</p>
          <p className="text-sm text-ink-soft mb-6">{a.noneText}</p>
          <Link to="/formations/bouquets" className="inline-block rounded-full bg-ink text-cream text-sm font-medium px-7 py-3.5 hover:bg-coffee-dark transition-colors">
            {a.see}
          </Link>
        </div>
      ) : (
        <section className="rounded-3xl bg-[#2E1D12] text-cream-fixed p-7 sm:p-9">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 text-emerald-300 text-xs font-medium px-3 py-1 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                {a.active}
              </span>
              <h2 className="font-display text-3xl">{active.plan_name}</h2>
              {active.org_name && <p className="text-cream-fixed/70 text-sm mt-1">{active.org_name}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm text-cream-fixed/80">{a.until(formatDate(active.ends_at, lang))}</p>
              {active.days_left != null && <p className="text-xs text-latte mt-1">{a.daysLeft(active.days_left)}</p>}
            </div>
          </div>
          <ul className="mt-6 flex flex-wrap gap-2">
            {[active.includes_exclusive && ui.plans.exclusive, active.includes_inperson && ui.plans.inperson].filter(Boolean).map((t) => (
              <li key={t} className="inline-flex items-center gap-2 rounded-full bg-white/10 text-sm px-4 py-2">
                <Check size={13} className="text-latte" />
                {t}
              </li>
            ))}
          </ul>
          {!active.is_owner ? (
            <p className="mt-6 text-sm text-cream-fixed/70">{a.sharedText}</p>
          ) : (
            <div className="mt-7">
              <Link to={`/formations/bouquets/${active.plan_code}/paiement?periode=${active.period}${isTeam ? `&places=${active.seats}` : ""}`} className="inline-block rounded-full bg-cream-fixed text-ink-fixed text-sm font-medium px-6 py-3 hover:scale-[1.03] transition-transform">
                {a.renew}
              </Link>
            </div>
          )}
        </section>
      )}

      {active?.is_owner && isTeam && (
        <section className="mt-6 rounded-3xl border border-line bg-surface p-7">
          <h2 className="flex items-center gap-2 font-display text-xl text-ink mb-1"><Users2 size={18} className="text-coffee" />{a.members}</h2>
          <p className="text-sm text-ink-soft mb-5">{a.membersLead(used, active.seats)}</p>
          <ul className="divide-y divide-line mb-5">
            {active.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="flex items-center gap-2 text-ink min-w-0"><Mail size={14} className="text-ink-faint shrink-0" /><span className="truncate">{m.email}</span></span>
                <button type="button" disabled={busy} onClick={() => removeMember(m.id)} className="text-ink-faint hover:text-red-600 transition-colors" aria-label={`${a.remove} ${m.email}`}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          {used < active.seats ? (
            <form onSubmit={addMember} className="flex gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={a.memberPh}
                className="flex-1 min-w-0 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee"
              />
              <button type="submit" disabled={busy} className="rounded-xl bg-ink text-cream text-sm font-medium px-5 hover:bg-coffee-dark transition-colors disabled:opacity-50 flex items-center gap-2">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {a.add}
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink-soft">{a.memberFull}</p>
          )}
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          <p className="mt-3 text-xs text-ink-faint">{a.memberHint}</p>
        </section>
      )}

      {data?.history?.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl text-ink mb-4">{a.history}</h2>
          <ul className="rounded-3xl border border-line bg-surface divide-y divide-line overflow-hidden">
            {data.history.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
                <div>
                  <p className="text-ink font-medium">{s.plan_name}{s.seats > 1 ? ` · ${s.seats}` : ""}</p>
                  <p className="text-xs text-ink-faint mt-0.5">
                    {formatDate(s.created_at, lang)} · {a.method[s.method] || s.method} · {a.ref} {s.reference}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ink">{amount(s)}</span>
                  <span className={`rounded-full text-xs font-medium px-3 py-1 ${STATUS_TONE[s.status] || STATUS_TONE.expired}`}>{a.status[s.status] || s.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
