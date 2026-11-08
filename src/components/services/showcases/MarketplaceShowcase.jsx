import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search, Heart, Truck, ShieldCheck, Store, Sparkles, X, ArrowRight, Shirt, Home, Headphones, Apple, Palette,
  BellRing, Wallet,
} from "lucide-react";
import ProductArt from "../../art/ProductArt.jsx";
import Reveal from "../../ui/Reveal.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { SERVICE_UI } from "../../../i18n/servicePageUi.js";
import { MP_CATEGORIES, MP_PRODUCTS, MP_STORES } from "../../../data/marketplaceDemo.js";

const CAT_ICONS = { Shirt, Home, Headphones, Apple, Palette, Sparkles };

// Retire accents et majuscules : "electronique" doit trouver "Électronique".
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Aperçu interactif de la marketplace H-Shopping / H-Commerce : recherche,
 * catégories, tri, favoris. Tout est local et marqué "Exemple" — aucun faux
 * vendeur ni faux prix n'est présenté comme réel.
 */
export default function MarketplaceShowcase({ onNotify }) {
  const { lang } = useLanguage();
  const ui = SERVICE_UI[lang] || SERVICE_UI.fr;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("relevance");
  const [favorites, setFavorites] = useState(() => new Set());

  const storeById = useMemo(() => Object.fromEntries(MP_STORES.map((s) => [s.id, s])), []);

  const products = useMemo(() => {
    const q = norm(query);
    let list = MP_PRODUCTS.filter((p) => {
      if (category !== "all" && p.cat !== category) return false;
      if (!q) return true;
      const store = storeById[p.store];
      return [p.fr, p.en, store?.fr, store?.en].some((txt) => norm(txt).includes(q));
    });
    if (sort === "asc") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "desc") list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [query, category, sort, storeById]);

  const counts = useMemo(() => {
    const c = { all: MP_PRODUCTS.length };
    MP_PRODUCTS.forEach((p) => {
      c[p.cat] = (c[p.cat] || 0) + 1;
    });
    return c;
  }, []);

  function toggleFavorite(id) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setQuery("");
    setCategory("all");
    setSort("relevance");
  }

  return (
    <section id="apercu" className="px-6 py-20 md:py-28 bg-cream scroll-mt-16">
      <div className="max-w-content mx-auto">
        <Reveal className="max-w-2xl mb-10">
          <p className="text-sm font-medium text-coffee mb-3">{ui.mpEyebrow}</p>
          <h2 className="font-display italic text-3xl sm:text-4xl leading-tight text-ink mb-4">{ui.mpHeading}</h2>
          <p className="text-stone leading-relaxed">{ui.mpLead}</p>
        </Reveal>

        {/* Cadre "fenêtre de boutique" */}
        <Reveal>
          <div className="rounded-[28px] border border-line bg-surface overflow-hidden shadow-[0_30px_70px_-40px_rgba(30,26,23,0.35)]">
            {/* barre de fenêtre */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-line bg-cream/60">
              <div className="flex gap-1.5" aria-hidden="true">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E07A5F]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#E4B968]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#8FB996]" />
              </div>
              <div className="flex-1 max-w-sm mx-auto text-center text-[0.7rem] text-ink-faint bg-surface border border-line rounded-full py-1 truncate">
                h-company.com / shopping
              </div>
              <span className="text-[0.62rem] font-semibold uppercase tracking-wider text-coffee-dark bg-latte-soft rounded-full px-2.5 py-1">
                {ui.mpExample}
              </span>
            </div>

            {/* bandeau promo */}
            <div className="relative overflow-hidden px-6 py-6 sm:px-8 bg-gradient-to-r from-[#3B271C] via-[#5B3A28] to-[#8A5A36] text-cream-fixed">
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-[#E4B968]/20 blur-2xl" aria-hidden="true" />
              <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div>
                  <p className="font-display italic text-xl sm:text-2xl leading-tight">{ui.mpDelivery}</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5 text-xs text-cream-fixed/80">
                    <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-[#E4B968]" />{ui.mpBenefit1}</span>
                    <span className="inline-flex items-center gap-1.5"><Truck size={13} className="text-[#E4B968]" />{ui.mpBenefit2}</span>
                    <span className="inline-flex items-center gap-1.5"><Wallet size={13} className="text-[#E4B968]" />{ui.mpBenefit3}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onNotify}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-cream-fixed text-ink-fixed text-sm font-medium px-5 py-2.5 hover:bg-white transition-colors shrink-0"
                >
                  <BellRing size={14} />
                  {ui.mpNotify}
                </button>
              </div>
            </div>

            {/* recherche + tri */}
            <div className="p-4 sm:p-6 flex flex-col sm:flex-row gap-3 border-b border-line">
              <label className="relative flex-1">
                <span className="sr-only">{ui.mpSearch}</span>
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={ui.mpSearch}
                  className="w-full rounded-full border border-line bg-cream/60 text-ink pl-11 pr-10 py-3 text-sm outline-none focus:border-coffee-light transition-colors placeholder:text-ink-faint"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={ui.mpReset}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                  >
                    <X size={15} />
                  </button>
                )}
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <span className="sr-only">{ui.mpSort}</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="rounded-full border border-line bg-cream/60 text-ink text-sm px-4 py-3 outline-none focus:border-coffee-light w-full sm:w-auto"
                >
                  <option value="relevance">{ui.mpSortRelevance}</option>
                  <option value="asc">{ui.mpSortPriceAsc}</option>
                  <option value="desc">{ui.mpSortPriceDesc}</option>
                </select>
              </label>
            </div>

            {/* catégories */}
            <div className="px-4 sm:px-6 py-4 flex gap-2 overflow-x-auto snap-track border-b border-line" role="tablist" aria-label="Catégories">
              {[{ key: "all", icon: null, fr: ui.mpAll, en: ui.mpAll }, ...MP_CATEGORIES].map((cat) => {
                const Icon = cat.icon ? CAT_ICONS[cat.icon] : null;
                const active = category === cat.key;
                return (
                  <button
                    key={cat.key}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => setCategory(cat.key)}
                    className={`shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                      active
                        ? "bg-ink text-cream border-ink"
                        : "bg-surface text-ink-soft border-line hover:border-coffee-light hover:text-ink"
                    }`}
                  >
                    {Icon && <Icon size={14} />}
                    {cat[lang] || cat.fr}
                    <span className={`text-[0.65rem] ${active ? "text-cream/70" : "text-ink-faint"}`}>{counts[cat.key] || 0}</span>
                  </button>
                );
              })}
            </div>

            {/* résultats */}
            <div className="p-4 sm:p-6">
              <p className="text-xs text-ink-faint mb-4" aria-live="polite">
                {ui.mpResults(products.length)}
              </p>

              {products.length === 0 ? (
                <div className="text-center py-16">
                  <span className="w-14 h-14 rounded-full bg-latte-soft text-coffee flex items-center justify-center mx-auto mb-4">
                    <Search size={22} />
                  </span>
                  <p className="font-display text-lg text-ink mb-1">{ui.mpEmptyTitle}</p>
                  <p className="text-sm text-ink-soft mb-5">{ui.mpEmptyText}</p>
                  <button
                    type="button"
                    onClick={reset}
                    className="text-sm font-medium text-coffee-dark underline underline-offset-4"
                  >
                    {ui.mpReset}
                  </button>
                </div>
              ) : (
                <motion.div layout className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                  <AnimatePresence mode="popLayout">
                    {products.map((p) => {
                      const store = storeById[p.store];
                      const fav = favorites.has(p.id);
                      return (
                        <motion.article
                          layout
                          key={p.id}
                          initial={{ opacity: 0, scale: 0.94 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.94 }}
                          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                          className="group rounded-2xl border border-line bg-surface overflow-hidden hover:-translate-y-1 hover:shadow-[0_22px_44px_-26px_rgba(30,26,23,0.4)] transition-all duration-300"
                        >
                          <div
                            className="relative aspect-square overflow-hidden"
                            style={{ background: `linear-gradient(145deg, ${p.bg[0]}, ${p.bg[1]})` }}
                          >
                            <ProductArt
                              kind={p.kind}
                              c1={p.c1}
                              c2={p.c2}
                              className="absolute inset-[8%] w-[84%] h-[84%] group-hover:scale-105 transition-transform duration-500 ease-out"
                            />
                            <div className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1">
                              {p.badge && (
                                <span className="text-[0.62rem] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-[#1E1A17] text-[#FAF7F2]">
                                  {p.badge === "new" ? ui.mpNew : p.badge}
                                </span>
                              )}
                              <span className="text-[0.58rem] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 bg-white/75 text-[#4A3226] backdrop-blur">
                                {ui.mpExample}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleFavorite(p.id)}
                              aria-pressed={fav}
                              aria-label={ui.mpFavorite}
                              className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/85 backdrop-blur flex items-center justify-center text-[#4A3226] hover:scale-110 transition-transform"
                            >
                              <Heart size={15} className={fav ? "fill-[#D9453A] text-[#D9453A]" : ""} />
                            </button>
                          </div>
                          <div className="p-3.5 sm:p-4">
                            <p className="text-[0.7rem] text-ink-faint truncate mb-0.5">{store?.[lang] || store?.fr}</p>
                            <h3 className="font-display text-base text-ink leading-snug mb-2 truncate">{p[lang] || p.fr}</h3>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-display text-lg text-ink">${p.price}</span>
                              <span className="inline-flex items-center gap-1 text-[0.65rem] text-ink-faint">
                                <Truck size={12} />
                                <span className="hidden sm:inline">{ui.mpDelivery}</span>
                              </span>
                            </div>
                          </div>
                        </motion.article>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          </div>
        </Reveal>

        {/* Boutiques du réseau */}
        <div className="mt-20">
          <Reveal className="max-w-xl mb-8">
            <h3 className="font-display italic text-2xl sm:text-3xl text-ink mb-2">{ui.mpStoresTitle}</h3>
            <p className="text-sm text-stone">{ui.mpStoresLead}</p>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {MP_STORES.map((s, i) => (
              <Reveal key={s.id} delay={i * 0.05}>
                <button
                  type="button"
                  onClick={() => setCategory(s.cat)}
                  className="group w-full text-left rounded-2xl border border-line bg-surface p-4 hover:border-coffee-light hover:-translate-y-0.5 transition-all"
                >
                  <div
                    className="aspect-[4/3] rounded-xl mb-3 flex items-center justify-center overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${s.c1}, ${s.c1}CC)` }}
                  >
                    <ProductArt kind={s.kind} c1={s.c2} c2="#FAF7F2" className="w-[70%] h-[70%] group-hover:scale-110 transition-transform duration-500" />
                  </div>
                  <p className="font-display text-sm text-ink leading-tight mb-0.5">{s[lang] || s.fr}</p>
                  <p className="text-[0.68rem] text-ink-faint">
                    {(MP_CATEGORIES.find((c) => c.key === s.cat) || {})[lang]}
                  </p>
                </button>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Appel aux vendeurs */}
        <Reveal className="mt-20">
          <div className="relative overflow-hidden rounded-[28px] bg-ink-fixed text-cream-fixed px-7 py-10 sm:px-12 sm:py-14">
            <div className="absolute -right-16 -bottom-20 w-72 h-72 rounded-full bg-[#C89A3D]/20 blur-3xl" aria-hidden="true" />
            <div className="absolute -left-10 -top-16 w-56 h-56 rounded-full bg-[#8A5A36]/30 blur-3xl" aria-hidden="true" />
            <div className="relative grid md:grid-cols-[1.4fr_1fr] gap-8 items-center">
              <div>
                <span className="inline-flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#E4B968] mb-4">
                  <Store size={14} />
                  {ui.mpSellerTitle}
                </span>
                <p className="font-display italic text-2xl sm:text-3xl leading-snug mb-3 max-w-lg">{ui.mpSellerTitle}</p>
                <p className="text-sm text-cream-fixed/70 leading-relaxed max-w-lg">{ui.mpSellerText}</p>
              </div>
              <div className="md:justify-self-end">
                <Link
                  to="/shopping"
                  className="inline-flex items-center gap-2 rounded-full bg-[#E4B968] text-ink-fixed text-sm font-semibold px-7 py-3.5 hover:bg-[#F0C98A] transition-colors"
                >
                  {ui.mpSellerCta}
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
