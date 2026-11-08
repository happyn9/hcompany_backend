import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Minus, Plus, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import { EmptyState, ShopImage, useShopUi } from "../../components/shop/Shared.jsx";
import { useShopMoney } from "../../data/shop.js";
import { useCart } from "../../context/CartContext.jsx";
import { api } from "../../lib/api.js";
import { groupByShop } from "../../lib/shop.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

export default function CartPage() {
  const ui = useShopUi();
  const c = ui.cart;
  const { items, count, subtotal, setQty, remove, clear } = useCart();
  const { money, currency } = useShopMoney();
  const navigate = useNavigate();
  usePageMeta({ title: c.title });
  const [problem, setProblem] = useState("");
  const [fresh, setFresh] = useState({}); // prix/stock confirmés par le serveur

  // Vérifie le panier côté serveur (prix à jour, stock, boutiques actives).
  useEffect(() => {
    if (!items.length) return;
    let alive = true;
    api.shop.agencies().then((ags) => {
      if (!ags.length) return null;
      return api.shop.quote({ items: items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id, color: i.color || null, quantity: i.quantity })), agency_id: ags[0].id, delivery_mode: "agency_pickup" });
    }).then((q) => {
      if (!alive || !q) return;
      setProblem("");
      const map = {};
      q.orders.forEach((o) => o.lines.forEach((l) => (map[`${l.product_id}:${l.variant_id || 0}`] = l.unit_price)));
      setFresh(map);
    }).catch((e) => alive && setProblem(e?.data?.detail || c.stockProblem));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => `${i.key}x${i.quantity}`).join("|")]);

  const groups = useMemo(() => groupByShop(items), [items]);
  const unit = (i) => fresh[i.key] ?? i.price;
  const total = items.reduce((s, i) => s + unit(i) * i.quantity, 0);

  if (!items.length) {
    return (
      <ShopLayout width="max-w-3xl">
        <EmptyState icon={ShoppingBag} title={c.empty} hint={c.emptyHint} action={<Link to="/shopping/produits" className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5">{c.continue}</Link>} />
      </ShopLayout>
    );
  }
  return (
    <ShopLayout>
      <h1 className="font-display text-3xl sm:text-4xl text-ink mb-8">{c.title} <span className="text-ink-faint text-xl">({count})</span></h1>
      <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
        <div className="space-y-6">
          {problem && <p role="alert" className="flex gap-3 rounded-2xl bg-amber-500/10 text-amber-800 dark:text-amber-200 text-sm p-4"><AlertTriangle size={18} className="shrink-0" /> {problem}</p>}
          {groups.length > 1 && <p className="text-sm text-ink-soft rounded-2xl bg-latte-soft px-4 py-3">{c.multiShop}</p>}
          {groups.map((g) => (
            <section key={g.slug} className="rounded-3xl border border-line bg-surface overflow-hidden">
              <Link to={`/shopping/boutique/${g.slug}`} className="block px-5 py-3 border-b border-line text-sm font-medium text-ink hover:text-coffee">{g.name}</Link>
              <ul className="divide-y divide-line">
                {g.items.map((i) => (
                  <li key={i.key} className="p-4 sm:p-5 flex gap-4">
                    <Link to={`/shopping/produit/${i.product_id}`} className="shrink-0"><ShopImage path={i.image} alt={i.title} ratio="w-20 h-20 sm:w-24 sm:h-24" className="rounded-2xl" /></Link>
                    <div className="flex-1 min-w-0">
                      <Link to={`/shopping/produit/${i.product_id}`} className="text-sm sm:text-base font-medium text-ink hover:text-coffee line-clamp-2">{i.title}</Link>
                      {i.variant_label && <p className="text-xs text-ink-faint mt-0.5">{i.variant_label}</p>}
                      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                        <div className="inline-flex items-center rounded-full border border-line">
                          <button onClick={() => setQty(i.key, i.quantity - 1)} aria-label="-" className="w-9 h-9 flex items-center justify-center text-ink-soft hover:text-ink"><Minus size={14} /></button>
                          <span className="w-7 text-center text-sm">{i.quantity}</span>
                          <button onClick={() => setQty(i.key, i.quantity + 1)} aria-label="+" className="w-9 h-9 flex items-center justify-center text-ink-soft hover:text-ink"><Plus size={14} /></button>
                        </div>
                        <p className="font-display text-lg text-ink">{money(unit(i) * i.quantity)}</p>
                      </div>
                    </div>
                    <button onClick={() => remove(i.key)} aria-label={`${c.remove} ${i.title}`} className="self-start text-ink-faint hover:text-red-600"><Trash2 size={17} /></button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <div className="flex justify-between">
            <Link to="/shopping/produits" className="text-sm text-coffee hover:underline">{c.continue}</Link>
            <button onClick={clear} className="text-sm text-ink-faint hover:text-red-600">{c.clear}</button>
          </div>
        </div>

        <aside className="rounded-3xl border border-line bg-surface p-6 lg:sticky lg:top-40">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-soft">{c.subtotal}</dt><dd className="text-ink">{money(total)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">{c.shipping}</dt><dd className="text-ink-faint text-right max-w-[11rem] text-xs">{c.shippingNote}</dd></div>
            <div className="flex justify-between border-t border-line pt-4"><dt className="text-ink font-medium">{c.total}</dt><dd className="font-display text-2xl text-ink">{money(total)}</dd></div>
          </dl>
          <button onClick={() => navigate("/shopping/commande")} disabled={!!problem && problem !== c.stockProblem && false} className="mt-6 w-full rounded-full bg-ink text-cream text-sm font-medium py-4 hover:bg-coffee-dark transition-colors">{c.checkout}</button>
          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-faint"><ShieldCheck size={14} /> {c.secureLine}</p>
          {currency?.code !== "ZMW" && <p className="mt-2 text-center text-[0.7rem] text-ink-faint">{ui.checkout.billedIn("ZMW")}</p>}
        </aside>
      </div>
    </ShopLayout>
  );
}
