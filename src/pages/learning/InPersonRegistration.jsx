import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, CheckCircle2, Loader2, Users2 } from "lucide-react";
import NavBar from "../../components/layout/NavBar.jsx";
import Footer from "../../components/layout/Footer.jsx";
import BackLink from "../../components/ui/BackLink.jsx";
import { useLearningUi } from "../../components/learning/Shared.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import { useCourses } from "../../data/courses.js";
import { useUser } from "../../context/Usercontext.jsx";
import { api } from "../../lib/api.js";

const field =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15 transition";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-soft mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export default function InPersonRegistration() {
  const ui = useLearningUi();
  const r = ui.reg;
  const [params] = useSearchParams();
  const { courses } = useCourses();
  const { user, isAuthenticated, withAuth } = useUser();
  const real = courses.filter((c) => c.id > 0);
  usePageMeta({ title: r.eyebrow, description: r.lead });

  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", city: "", course_id: params.get("cours") || "", availability: "", message: "",
  });
  const [state, setState] = useState("idle"); // idle | sending | done
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, full_name: f.full_name || user.full_name || user.name || "", email: f.email || user.email || "" }));
  }, [user]);

  async function submit(e) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) return setError(r.required);
    setError("");
    setState("sending");
    const payload = {
      ...form,
      course_id: form.course_id ? Number(form.course_id) : null,
      phone: form.phone || null, city: form.city || null,
      availability: form.availability || null, message: form.message || null,
    };
    try {
      if (isAuthenticated) await withAuth((token) => api.learning.register(payload, token));
      else await api.learning.register(payload);
      setState("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err?.status === 429 ? "Trop de demandes pour le moment, réessayez plus tard." : err?.status === 422 ? r.required : r.error);
      setState("idle");
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="max-w-content mx-auto px-6 pt-28 pb-24">
        <BackLink to="/formations" className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink mb-8">
          <ArrowLeft size={15} />
          {r.back}
        </BackLink>

        <AnimatePresence mode="wait">
          {state === "done" ? (
            <motion.div key="done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto text-center py-10">
              <span className="mx-auto w-16 h-16 rounded-full bg-latte-soft text-coffee flex items-center justify-center mb-6">
                <CheckCircle2 size={30} />
              </span>
              <h1 className="font-display text-4xl text-ink mb-4">{r.successTitle}</h1>
              <p className="text-ink-soft leading-relaxed mb-10">{r.successText}</p>
              <ol className="text-left rounded-3xl border border-line bg-surface p-6 space-y-4 mb-10">
                {r.next.map((s, i) => (
                  <li key={s} className="flex items-center gap-4 text-sm text-ink">
                    <span className="w-7 h-7 rounded-full bg-coffee text-cream text-xs font-medium flex items-center justify-center shrink-0">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
              <p className="text-sm text-ink-soft mb-5">{r.meanwhile}</p>
              <Link to="/formations#catalogue" className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 hover:bg-coffee-dark transition-colors">
                {r.watch}
              </Link>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid lg:grid-cols-[1.5fr_1fr] gap-12 items-start">
              <div>
                <p className="text-sm font-medium text-coffee uppercase tracking-widest mb-3">{r.eyebrow}</p>
                <h1 className="font-display text-4xl sm:text-5xl text-ink leading-tight mb-4">{r.title}</h1>
                <p className="text-ink-soft leading-relaxed max-w-xl mb-10">{r.lead}</p>

                <form onSubmit={submit} className="space-y-5 max-w-xl" noValidate>
                  <div className="grid sm:grid-cols-2 gap-5">
                    <Field label={r.name}><input className={field} value={form.full_name} onChange={set("full_name")} autoComplete="name" required /></Field>
                    <Field label={r.email}><input className={field} type="email" value={form.email} onChange={set("email")} autoComplete="email" required /></Field>
                    <Field label={r.phone}><input className={field} type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" /></Field>
                    <Field label={r.city}><input className={field} value={form.city} onChange={set("city")} placeholder={r.cityPh} autoComplete="address-level2" /></Field>
                  </div>
                  <Field label={r.course}>
                    <select className={field} value={form.course_id} onChange={set("course_id")}>
                      <option value="">{r.courseAny}</option>
                      {real.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  </Field>
                  <Field label={r.availability}><input className={field} value={form.availability} onChange={set("availability")} placeholder={r.availabilityPh} /></Field>
                  <Field label={r.message}><textarea className={`${field} min-h-28 resize-y`} value={form.message} onChange={set("message")} placeholder={r.messagePh} /></Field>
                  {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                  <button type="submit" disabled={state === "sending"} className="inline-flex items-center justify-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-7 py-4 hover:bg-coffee-dark transition-colors disabled:opacity-60">
                    {state === "sending" && <Loader2 size={15} className="animate-spin" />}
                    {state === "sending" ? r.sending : r.submit}
                  </button>
                  {!isAuthenticated && (
                    <p className="text-xs text-ink-faint">{r.account} <Link to="/connexion" className="text-coffee underline">{r.signIn}</Link></p>
                  )}
                </form>
              </div>

              <aside className="space-y-4 lg:sticky lg:top-24">
                <div className="rounded-3xl bg-[#2E1D12] text-cream-fixed p-7">
                  <p className="font-display text-xl mb-5">{r.aside.title}</p>
                  <ul className="space-y-3">
                    {r.aside.items.map((i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-cream-fixed/90">
                        <span className="w-6 h-6 rounded-full bg-latte/25 text-latte flex items-center justify-center shrink-0"><Check size={13} /></span>
                        {i}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-3xl border border-line bg-surface p-6">
                  <p className="flex items-center gap-2 font-medium text-ink mb-1"><Users2 size={16} className="text-coffee" />{r.aside.teamTitle}</p>
                  <p className="text-sm text-ink-soft mb-4">{r.aside.teamText}</p>
                  <Link to="/formations/bouquets?plan=equipe#equipe" className="text-sm text-coffee font-medium hover:underline">{r.aside.teamCta} →</Link>
                </div>
              </aside>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Footer />
    </div>
  );
}
