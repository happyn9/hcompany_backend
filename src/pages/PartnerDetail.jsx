import { useState } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Handshake, Mail } from "lucide-react";
import NavBar from "../components/layout/NavBar.jsx";
import Footer from "../components/layout/Footer.jsx";
import StoreBadges from "../components/ui/StoreBadges.jsx";
import FAQ from "../components/sections/FAQ.jsx";
import ContactModal from "../components/sections/ContactModal.jsx";
import DetailHero from "../components/detail/DetailHero.jsx";
import DetailSidebarCard from "../components/detail/DetailSidebarCard.jsx";
import RelatedGrid from "../components/detail/RelatedGrid.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { usePageMeta } from "../components/ui/HeadManager.jsx";
import { PARTNER_META, getPartnerContent, findPartnerBySlug } from "../data/partners.js";

// Lukondo et Confismila exploitent déjà un service H-Company que les
// utilisateurs peuvent utiliser directement (transport/colis/logement pour
// Lukondo, restauration pour Confismila) — contrairement à H-Learning/
// U-Study, qui sont des produits internes. Pour ceux-là seulement, on
// propose un vrai bouton "Contacter ce partenaire" en plus du CTA
// "Devenir partenaire" (qui s'adresse à de futures agences candidates).
const CONTACTABLE_SLUGS = ["lukondo", "confismila"];

export default function PartnerDetail() {
  const { slug } = useParams();
  const { t } = useLanguage();
  const [contactOpen, setContactOpen] = useState(false);
  const meta = findPartnerBySlug(slug);
  const previewContent = meta ? getPartnerContent(t, meta) : null;
  usePageMeta(meta ? { title: meta.name, description: previewContent?.text } : null);

  if (!meta) return <Navigate to="/infos#partenaires" replace />;

  const content = previewContent;
  const others = PARTNER_META.filter((p) => p.slug !== slug).slice(0, 3);
  const gradientHex = meta.gradient.match(/#[0-9A-Fa-f]{6}/)[0];

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />

      <DetailHero
        image={`https://loremflickr.com/1600/1000/${encodeURIComponent(meta.heroImage)}`}
        overlay={`linear-gradient(0deg, ${gradientHex}f0 5%, ${gradientHex}90 45%, rgba(30,26,23,0.2) 100%)`}
        backTo="/infos#partenaires"
        backLabel={t("partners.heading")}
        title={meta.name}
      >
        <div className="flex items-center gap-4 mt-5">
          <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center font-display text-2xl text-cream-fixed shrink-0">
            {meta.initial}
          </div>
          <p className="text-cream-fixed/80 text-base">{content.role}</p>
        </div>
      </DetailHero>

      {/* --- Description + schéma/visuel + stats --- */}
      <section className="px-6 py-20 max-w-content mx-auto grid lg:grid-cols-[1.4fr_1fr] gap-14">
        <div>
          <p className="text-xl text-stone leading-relaxed mb-12 max-w-2xl">{content.longText}</p>

          <p className="text-sm font-medium text-coffee uppercase tracking-widest mb-2 flex items-center gap-2">
            <Handshake size={14} />
            {t("partners.howItWorks")}
          </p>
          <h2 className="font-display italic text-2xl text-ink mb-8">{meta.name}</h2>

          <div className="relative">
            {content.highlights.map((h, i) => (
              <motion.div
                key={h}
                initial={{ opacity: 0, x: -14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.1 }}
                className="relative flex items-start gap-4 pb-8 last:pb-0"
              >
                {i < content.highlights.length - 1 && (
                  <span className="absolute left-[15px] top-8 bottom-0 w-px bg-line" />
                )}
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-cream text-xs font-medium shrink-0"
                  style={{ background: meta.gradient }}
                >
                  {i + 1}
                </span>
                <span className="text-stone leading-relaxed pt-1">{h}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="lg:sticky lg:top-24 h-fit space-y-5">
          {meta.Visual && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="rounded-3xl p-6 text-cream shadow-[0_30px_60px_-30px_rgba(30,26,23,0.35)]"
              style={{ background: meta.gradient }}
            >
              <meta.Visual />
            </motion.div>
          )}
          <div className="grid grid-cols-3 gap-3">
            {content.stats.map((s) => (
              <div key={s.label} className="rounded-2xl bg-surface border border-line p-4 text-center">
                <p className="font-display text-xl text-ink leading-none">{s.value}</p>
                <p className="text-[0.65rem] text-ink-soft mt-2 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
          {meta.slug === "u-study" && (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <p className="text-xs font-medium text-ink">
                  {t("companies.ustudy.available")}
                </p>
              </div>
              <StoreBadges to="#" />
            </div>
          )}
          <DetailSidebarCard className="!p-5 space-y-2.5">
            {CONTACTABLE_SLUGS.includes(meta.slug) && (
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className="w-full flex items-center justify-center gap-2 rounded-full bg-ink text-cream text-sm font-medium py-4 hover:bg-coffee-dark hover:scale-[1.02] transition-all"
              >
                <Mail size={15} />
                {t("partners.contactThis")} {meta.name}
              </button>
            )}
            <Link
              to="/infos#rejoindre"
              className={`w-full flex items-center justify-center gap-2 rounded-full text-sm font-medium py-4 transition-all ${
                CONTACTABLE_SLUGS.includes(meta.slug)
                  ? "border border-line text-ink hover:bg-line/50"
                  : "bg-ink text-cream hover:bg-coffee-dark hover:scale-[1.02]"
              }`}
            >
              {t("partners.workWith")} {meta.name}
              <ArrowRight size={15} />
            </Link>
          </DetailSidebarCard>
        </div>
      </section>

      {contactOpen && (
        <ContactModal onClose={() => setContactOpen(false)} context={`${t("partners.contactThis")} ${meta.name}`} />
      )}

      {/* --- FAQ spécifique à ce partenaire --- */}
      {t(`faq.partner.${meta.key}`) && Array.isArray(t(`faq.partner.${meta.key}`)) && (
        <FAQ
          eyebrow={t("faq.eyebrow")}
          heading={`${meta.name} : ${t("faq.heading").toLowerCase()}`}
          items={t(`faq.partner.${meta.key}`).map((item) => ({ question: item.q, answer: item.a }))}
        />
      )}

      <RelatedGrid
        eyebrow={t("partners.heading")}
        heading={t("partners.otherPartners")}
        items={others.map((p) => ({
          key: p.slug,
          to: `/partenaires/${p.slug}`,
          image: `https://loremflickr.com/500/360/${encodeURIComponent(p.heroImage)}`,
          title: p.name,
        }))}
      />

      <Footer />
    </div>
  );
}
