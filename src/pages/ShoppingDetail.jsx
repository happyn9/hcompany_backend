import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, LogIn, UserPlus, CheckCircle2, ShoppingBag } from "lucide-react";
import NavBar from "../components/layout/NavBar.jsx";
import Footer from "../components/layout/Footer.jsx";
import FAQ from "../components/sections/FAQ.jsx";
import { api } from "../lib/api.js";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useUser } from "../context/Usercontext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { useProgressAction } from "../context/ProgressContext.jsx";
import FormLoadingOverlay from "../components/ui/FormLoadingOverlay.jsx";

const CATEGORY_KEYS = ["catFurniture", "catClothing", "catCraft", "catElectronics", "catOther"];

function SignInPrompt({ t }) {
  return (
    <div className="rounded-2xl border border-line bg-cream p-8 text-center">
      <p className="text-stone leading-relaxed mb-6 max-w-sm mx-auto">{t("shopping.authRequired")}</p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          to="/connexion"
          state={{ redirectTo: "/shopping" }}
          className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3 hover:bg-coffee-dark transition-colors"
        >
          <LogIn size={15} />
          {t("shopping.signIn")}
        </Link>
        <Link
          to="/creer-un-compte"
          state={{ redirectTo: "/shopping" }}
          className="inline-flex items-center gap-2 rounded-full border border-line text-ink text-sm font-medium px-6 py-3 hover:border-coffee-light transition-colors"
        >
          <UserPlus size={15} />
          {t("shopping.createAccount")}
        </Link>
      </div>
    </div>
  );
}

export default function ShoppingDetail() {
  const { t } = useLanguage();
  const { isAuthenticated, withAuth, user } = useUser();
  const toast = useToast();
  const withProgress = useProgressAction();

  const [fields, setFields] = useState({ company: "", contactName: "", category: t("shopping.catFurniture"), catalogSize: "", message: "" });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const benefits = [t("shopping.benefit1"), t("shopping.benefit2"), t("shopping.benefit3"), t("shopping.benefit4")];

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const message = `${t("shopping.formCatalogSize")} : ${fields.catalogSize || "?"}\n${fields.message}`;
      await withProgress(() =>
        withAuth((token) =>
          api.partners.apply(token, {
            company: fields.company,
            contactName: fields.contactName,
            category: `${t("shopping.eyebrow")} : ${fields.category}`,
            message,
          })
        )
      );
      setStatus("success");
      toast.success(t("shopping.formSuccess"));
    } catch (err) {
      setStatus("error");
      setError(err?.data?.detail || "Impossible d'envoyer votre candidature pour le moment.");
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />

      {/* --- Hero --- */}
      <section className="relative h-[46vh] min-h-[380px] overflow-hidden pt-16">
        <img
          src="https://loremflickr.com/1600/900/marketplace,shop,products"
          alt="Vitrine de produits en vente sur le réseau H-Company"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-fixed via-ink-fixed/50 to-ink-fixed/20" />
        <div className="relative h-full max-w-content mx-auto px-6 flex flex-col justify-end pb-12">
          <Link to="/infos#explorer" className="inline-flex items-center gap-1.5 text-cream-fixed/70 text-sm hover:text-cream-fixed transition-colors mb-4 w-fit">
            <ArrowLeft size={14} />
            {t("shopping.eyebrow")}
          </Link>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-[#C89A3D] mb-4">
              <ShoppingBag size={22} />
            </div>
            <h1 className="font-display italic text-3xl sm:text-5xl text-cream-fixed max-w-xl">
              {t("shopping.heroTitle")}
            </h1>
          </motion.div>
        </div>
      </section>

      {/* --- Grandir avec nous --- */}
      <section className="px-6 py-16 max-w-content mx-auto grid lg:grid-cols-[1.4fr_1fr] gap-12">
        <div>
          <p className="text-lg text-stone leading-relaxed mb-10">{t("shopping.heroLead")}</p>
          <ul className="space-y-4">
            {benefits.map((b, i) => (
              <motion.li
                key={b}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="flex items-start gap-3 text-stone"
              >
                <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-coffee-dark" />
                {b}
              </motion.li>
            ))}
          </ul>
        </div>

        <div className="lg:sticky lg:top-24 h-fit rounded-2xl border border-line bg-surface p-7">
          <p className="text-xs font-medium uppercase tracking-wide text-coffee mb-2">{t("shopping.eyebrow")}</p>
          <p className="text-sm text-stone leading-relaxed">{t("shopping.lead")}</p>
        </div>
      </section>

      {/* --- Formulaire de candidature --- */}
      <section id="candidature" className="px-6 py-16 border-t border-line bg-surface">
        <div className="max-w-content mx-auto grid md:grid-cols-[0.9fr_1.1fr] gap-16">
          <div>
            <p className="text-sm font-medium text-coffee mb-4">{t("shopping.formEyebrow")}</p>
            <h2 className="font-display text-3xl leading-tight text-ink max-w-md">{t("shopping.formHeading")}</h2>
          </div>

          {!isAuthenticated ? (
            <SignInPrompt t={t} />
          ) : (
            <form onSubmit={handleSubmit} className="relative space-y-5">
              <FormLoadingOverlay show={status === "loading"} label={t("shopping.formSubmitting")} rounded="rounded-2xl" />
              <p className="text-sm text-ink-soft">
                {t("shopping.connectedAs")} <span className="font-medium text-ink">{user?.email}</span>
              </p>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm text-stone mb-1.5">{t("shopping.formCompany")}</label>
                  <input
                    required
                    value={fields.company}
                    onChange={(e) => setFields((f) => ({ ...f, company: e.target.value }))}
                    className="w-full rounded-lg border border-line bg-cream px-4 py-2.5 text-ink focus:border-coffee outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-stone mb-1.5">{t("shopping.formContact")}</label>
                  <input
                    required
                    value={fields.contactName}
                    onChange={(e) => setFields((f) => ({ ...f, contactName: e.target.value }))}
                    className="w-full rounded-lg border border-line bg-cream px-4 py-2.5 text-ink focus:border-coffee outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm text-stone mb-1.5">{t("shopping.formCategory")}</label>
                  <select
                    value={fields.category}
                    onChange={(e) => setFields((f) => ({ ...f, category: e.target.value }))}
                    className="w-full rounded-lg border border-line bg-cream px-4 py-2.5 text-ink focus:border-coffee outline-none transition-colors"
                  >
                    {CATEGORY_KEYS.map((k) => (
                      <option key={k} value={t(`shopping.${k}`)}>
                        {t(`shopping.${k}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-stone mb-1.5">{t("shopping.formCatalogSize")}</label>
                  <input
                    type="number"
                    min="1"
                    value={fields.catalogSize}
                    onChange={(e) => setFields((f) => ({ ...f, catalogSize: e.target.value }))}
                    className="w-full rounded-lg border border-line bg-cream px-4 py-2.5 text-ink focus:border-coffee outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-stone mb-1.5">{t("shopping.formMessage")}</label>
                <textarea
                  rows={4}
                  value={fields.message}
                  onChange={(e) => setFields((f) => ({ ...f, message: e.target.value }))}
                  className="w-full rounded-lg border border-line bg-cream px-4 py-2.5 text-ink focus:border-coffee outline-none transition-colors resize-none"
                />
              </div>

              {status === "success" && (
                <p className="text-sm text-coffee-dark bg-coffee-light/15 border border-coffee-light/40 rounded-lg px-4 py-3">
                  {t("shopping.formSuccess")}
                </p>
              )}
              {status === "error" && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={status === "loading"}
                className="bg-ink text-cream rounded-full px-8 py-3.5 font-medium transition-transform duration-300 hover:scale-[1.02] disabled:opacity-60"
              >
                {status === "loading" ? t("shopping.formSubmitting") : t("shopping.formSubmit")}
                {status !== "loading" && <ArrowRight size={15} className="inline ml-2" />}
              </button>
            </form>
          )}
        </div>
      </section>

      <FAQ
        eyebrow={t("faq.eyebrow")}
        heading={t("shopping.faqHeading")}
        items={[1, 2, 3].map((i) => ({
          question: t(`shopping.faq${i}q`),
          answer: t(`shopping.faq${i}a`),
        }))}
      />

      <Footer />
    </div>
  );
}
