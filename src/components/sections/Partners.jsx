import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Carousel from "./Carousel.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { PARTNER_META, getPartnerContent } from "../../data/partners.js";

function Monogram({ letter }) {
  return (
    <div className="hc-monogram" aria-hidden="true">
      <span>{letter}</span>
    </div>
  );
}

export default function Partners() {
  const { t } = useLanguage();
  const partners = PARTNER_META.map((m) => ({ ...m, ...getPartnerContent(t, m) }));

  return (
    <section className="hc-partners">
      <style>{`
        .hc-partners {
          --hc-ink: #10140F;
          --hc-canvas: #F3EEDF;
          --hc-coffee: #4A3020;
          --hc-gold: #C89A3D;
          --hc-clay: #A94B32;
          --hc-mist: #656B58;
          --hc-line: rgba(16,20,15,0.12);
          --hc-line-strong: #D4D8CB;
          background: #FFFFFF;
          color: var(--hc-ink);
          font-family: 'Inter', sans-serif;
          padding-bottom: 6rem;
        }
        .hc-partners-banner {
          position: relative; width: 100%; height: 300px; overflow: hidden; margin-bottom: 4.5rem;
        }
        .hc-partners-banner img {
          width: 100%; height: 100%; object-fit: cover; display: block;
          filter: grayscale(0.5) contrast(1.05) brightness(0.85) sepia(0.12);
        }
        .hc-partners-banner::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(115deg, rgba(74,48,32,0.88) 10%, rgba(74,48,32,0.35) 65%);
        }
        .hc-partners-banner-inner {
          position: absolute; inset: 0; z-index: 1;
          display: flex; flex-direction: column; justify-content: flex-end;
          padding: 2.5rem; max-width: 68rem; margin: 0 auto;
        }
        .hc-partners-label { font-size: 0.85rem; font-weight: 600; color: var(--hc-gold); margin-bottom: 1rem; }
        .hc-heading {
          font-family: 'Instrument Serif', serif; font-style: italic; font-weight: 400;
          font-size: clamp(2rem, 1.5rem + 2vw, 3rem); line-height: 1.15; letter-spacing: -0.01em;
          color: var(--hc-canvas); max-width: 18ch;
        }
        .hc-partners-inner { max-width: 68rem; margin: 0 auto; padding: 0 1.5rem; }
        .hc-partners-desc { max-width: 34rem; color: #5C6357; line-height: 1.75; font-size: 0.98rem; }

        .hc-roster { margin-top: 3.25rem; }
        .hc-roster-row {
          display: flex; align-items: center; gap: 1.1rem; padding: 1.15rem 1rem;
          border-top: 1px solid var(--hc-line); border-radius: 14px;
          transition: background 0.2s ease; text-decoration: none; color: inherit;
        }
        .hc-roster-row:hover { background: rgba(74,48,32,0.04); }
        .hc-roster-row:last-child { border-bottom: 1px solid var(--hc-line); }
        .hc-roster-index { font-size: 0.78rem; font-weight: 600; color: #7D5F1A; width: 1.4rem; }
        .hc-roster-name { font-family: 'Instrument Serif', serif; font-style: italic; font-size: 1.15rem; min-width: 9rem; }
        .hc-roster-role { font-size: 0.85rem; color: var(--hc-mist); flex: 1; }
        .hc-roster-arrow { color: var(--hc-mist); transition: transform 0.2s ease, color 0.2s ease; }
        .hc-roster-row:hover .hc-roster-arrow { color: var(--hc-clay); transform: translate(2px, -2px); }

        .hc-partners-body { margin-top: 4.5rem; }
        .hc-partner-card {
          width: 280px; background: var(--hc-canvas); padding: 2rem;
          display: flex; flex-direction: column; text-decoration: none; color: inherit;
        }
        @media (min-width: 640px) { .hc-partner-card { width: 320px; } }
        .hc-monogram {
          width: 46px; height: 46px; border-radius: 50%; border: 1.5px solid var(--hc-gold);
          display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem;
        }
        .hc-monogram span { font-family: 'Instrument Serif', serif; font-style: italic; font-size: 1.3rem; color: var(--hc-ink); }
        .hc-partner-name { font-family: 'Instrument Serif', serif; font-style: italic; font-weight: 400; font-size: 1.35rem; margin-bottom: 0.75rem; }
        .hc-partner-text { font-size: 0.92rem; line-height: 1.65; color: #5C6357; flex: 1; }
        .hc-partner-link { margin-top: 1.25rem; display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; font-weight: 600; color: var(--hc-clay); }

        .hc-join-card {
          width: 280px; border: 1px dashed var(--hc-line-strong); padding: 2rem;
          display: flex; flex-direction: column; justify-content: space-between;
        }
        @media (min-width: 640px) { .hc-join-card { width: 320px; } }
        .hc-join-title { font-family: 'Instrument Serif', serif; font-style: italic; font-weight: 400; font-size: 1.35rem; margin-bottom: 0.85rem; }
        .hc-join-text { font-size: 0.92rem; line-height: 1.65; color: #5C6357; }
        .hc-join-link {
          margin-top: 1.5rem; display: inline-flex; align-items: center; gap: 0.4rem;
          font-size: 0.88rem; font-weight: 600; color: var(--hc-clay); text-decoration: none;
        }
        .hc-join-link svg { transition: transform 0.15s ease; }
        .hc-join-link:hover svg { transform: translateX(3px); }
      `}</style>

      <div className="hc-partners-banner">
        <img
          src="https://loremflickr.com/1200/440/teamwork,network"
          alt="Équipe travaillant ensemble, illustrant le réseau de partenaires"
          loading="lazy"
        />
        <div className="hc-partners-banner-inner">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="hc-partners-label">{t("partners.label")} : {partners.length} {t("partners.activeMembers")}</p>
            <h2 className="hc-heading">{t("partners.heading")}</h2>
          </motion.div>
        </div>
      </div>

      <div className="hc-partners-inner">
        <motion.p
          className="hc-partners-desc"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          {t("partners.lead")}
        </motion.p>

        <div className="hc-roster">
          {partners.map((p, i) => (
            <motion.div
              key={p.slug}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link to={`/partenaires/${p.slug}`} className="hc-roster-row">
                <span className="hc-roster-index">{String(i + 1).padStart(2, "0")}</span>
                <span className="hc-roster-name">{p.name}</span>
                <span className="hc-roster-role">{p.role}</span>
                <ArrowUpRight size={16} className="hc-roster-arrow" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="hc-partners-inner hc-partners-body">
        <Carousel>
          {partners.map((p, i) => (
            <motion.div
              key={p.slug}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -6 }}
            >
              <Link to={`/partenaires/${p.slug}`} className="hc-partner-card">
                <Monogram letter={p.initial} />
                <h3 className="hc-partner-name">{p.name}</h3>
                <p className="hc-partner-text">{p.text}</p>
                <span className="hc-partner-link">
                  {t("services.learnMore")}
                  <ArrowUpRight size={13} />
                </span>
              </Link>
            </motion.div>
          ))}

          <motion.article
            className="hc-join-card"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: partners.length * 0.08, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -6 }}
          >
            <div>
              <h3 className="hc-join-title">{t("partners.yourCompany")}</h3>
              <p className="hc-join-text">{t("partners.joinText")}</p>
            </div>
            <Link to="/infos#rejoindre" className="hc-join-link">
              {t("partners.becomePartner")}
              <svg width="13" height="11" viewBox="0 0 13 11" aria-hidden="true">
                <path d="M1 5.5H12M7.5 1L12 5.5L7.5 10" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </motion.article>
        </Carousel>
      </div>
    </section>
  );
}
