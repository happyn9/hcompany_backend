import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Loader2, Plus, Star, Trash2, X } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import AuthGate from "../../components/shop/AuthGate.jsx";
import { ErrorState, ImagePicker, ShopImage, Spinner, useShopUi, useSellerUi } from "../../components/shop/Shared.jsx";
import { SField, fieldClass } from "./SellerStart.jsx";
import { errMessage, useCategories, useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const XT = {
  fr: { cut: "Détourer automatiquement les photos (supprime un fond uni)", cutMiss: "Fond non uni : la photo a été gardée telle quelle.", colors: "Couleurs de l'article", colorsHint: "Le client voit l'article « habillé » de la couleur choisie (photo détourée ou modèle 3D).", addColor: "Ajouter une couleur", colorName: "Nom (ex. Noir)", model3d: "Vue 3D", model3dHint: "Forme 3D que le client peut faire tourner et recolorer.", none: "Aucune" },
  en: { cut: "Automatically cut out photos (removes a plain background)", cutMiss: "Background isn't plain: the photo was kept as is.", colors: "Item colours", colorsHint: "Customers see the item \"dressed\" in the chosen colour (cut-out photo or 3D model).", addColor: "Add a colour", colorName: "Name (e.g. Black)", model3d: "3D view", model3dHint: "3D shape customers can rotate and recolour.", none: "None" },
};
const M3 = { sofa: ["Canapé", "Sofa"], armchair: ["Fauteuil", "Armchair"], chair: ["Chaise", "Chair"], table: ["Table", "Table"], bed: ["Lit", "Bed"], wardrobe: ["Armoire", "Wardrobe"], shelf: ["Étagère", "Shelf"], lamp: ["Lampe", "Lamp"], tshirt: ["T-shirt", "T-shirt"], hoodie: ["Sweat à capuche", "Hoodie"], dress: ["Robe", "Dress"], trousers: ["Pantalon", "Trousers"], shoe: ["Chaussure", "Shoe"], bag: ["Sac", "Bag"] };

const EMPTY = { title: "", description: "", category_id: "", price: "", compare_at_price: "", stock: "0", sku: "", brand: "", weight_kg: "", attributes: "", tags: "", status: "draft", images: [], variants: [], colors: [], model3d: "" };

function Inner() {
  const { id } = useParams();
  const isNew = id === "new";
  const ui = useShopUi();
  const e = useSellerUi().editor;
  const { lang } = useLanguage();
  const { pivot } = useShopMoney();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const shopId = Number(params.get("boutique")) || null;
  const { withAuth } = useUser();
  const toast = useToast();
  usePageMeta({ title: isNew ? e.newTitle : e.editTitle });
  const cats = useCategories();
  const x = XT[lang] || XT.fr;
  const [cut, setCut] = useState(true);
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [targetShop, setTargetShop] = useState(shopId);
  const { data: existing, loading, error, reload } = useLoad(() => (isNew ? Promise.resolve(null) : withAuth((t) => api.shop.seller.product(t, id))), [id]);
  const shops = useLoad(() => withAuth((t) => api.shop.seller.shops(t)), []);

  useEffect(() => {
    if (!existing) return;
    setF({
      title: existing.title, description: existing.description || "", category_id: existing.category_id || "", price: String(existing.price),
      compare_at_price: existing.compare_at_price ? String(existing.compare_at_price) : "", stock: String(existing.stock), sku: existing.sku || "", brand: existing.brand || "",
      weight_kg: existing.weight_kg ? String(existing.weight_kg) : "", attributes: (existing.attributes || []).map((a) => `${a.label}: ${a.value}`).join("\n"),
      tags: (existing.tags || []).join(", "), status: existing.status, images: existing.images || [], colors: existing.colors || [], model3d: existing.model3d || "",
      variants: (existing.variants || []).map((v) => ({ id: v.id, label: v.label, sku: v.sku || "", price: v.price && v.price !== existing.price ? String(v.price) : "", stock: String(v.stock), is_active: v.is_active })),
    });
    setTargetShop(existing.shop.id);
  }, [existing]);
  useEffect(() => { if (isNew && !targetShop && shops.data?.length) setTargetShop(shops.data[0].id); }, [isNew, targetShop, shops.data]);

  const shop = shops.data?.find((s) => s.id === targetShop);
  const set = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const setVariant = (i, k, v) => setF((p) => ({ ...p, variants: p.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  const flatCats = cats || [];

  function validate() {
    const er = {};
    if (f.title.trim().length < 2) er.title = e.errTitle;
    if (!(Number(f.price) >= 0.5)) er.price = e.errPrice;
    if (f.status === "active" && f.images.length === 0) er.images = e.errImages;
    if (f.variants.some((v) => !v.label.trim())) er.variants = e.errVariant;
    if (f.colors.some((c) => !c.name.trim())) er.colors = x.colorName;
    setErrors(er);
    return Object.keys(er).length === 0;
  }
  async function save(ev) {
    ev.preventDefault();
    if (busy || !validate()) return;
    setBusy(true); setServerError("");
    const body = {
      title: f.title, description: f.description, category_id: f.category_id ? Number(f.category_id) : null, price: Number(f.price),
      compare_at_price: f.compare_at_price ? Number(f.compare_at_price) : null, stock: Number(f.stock) || 0, sku: f.sku, brand: f.brand,
      weight_kg: Number(f.weight_kg) || 0, attributes: f.attributes, tags: f.tags, status: f.status, images: f.images, colors: f.colors.map((c) => ({ name: c.name.trim(), hex: c.hex })), model3d: f.model3d,
      variants: f.variants.map((v) => ({ ...(v.id && { id: v.id }), label: v.label, sku: v.sku, price: v.price ? Number(v.price) : null, stock: Number(v.stock) || 0, is_active: v.is_active !== false })),
    };
    try {
      if (isNew) await withAuth((t) => api.shop.seller.createProduct(t, targetShop, body));
      else await withAuth((t) => api.shop.seller.updateProduct(t, id, body));
      toast?.success?.(e.saved);
      navigate(`/shopping/vendeur?boutique=${targetShop}&onglet=products`);
    } catch (err) { setServerError(errMessage(err, ui.common.error)); } finally { setBusy(false); }
  }

  if (!isNew && loading) return <ShopLayout width="max-w-4xl"><Spinner label={ui.common.loading} /></ShopLayout>;
  if (!isNew && error) return <ShopLayout width="max-w-4xl"><ErrorState onRetry={reload} /></ShopLayout>;

  const card = "rounded-3xl border border-line bg-surface p-6 sm:p-8 space-y-5";
  return (
    <ShopLayout width="max-w-4xl">
      <Link to={`/shopping/vendeur?boutique=${targetShop || ""}&onglet=products`} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-coffee mb-5"><ChevronLeft size={16} /> {e.back}</Link>
      <h1 className="font-display text-3xl text-ink mb-8">{isNew ? e.newTitle : e.editTitle}</h1>
      <form onSubmit={save} noValidate className="space-y-6">
        {isNew && shops.data?.length > 1 && (
          <SField label={ui.common.shopBy}><select className={fieldClass} value={targetShop || ""} onChange={(ev) => setTargetShop(Number(ev.target.value))}>{shops.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></SField>
        )}
        <section className={card}>
          <h2 className="font-display text-xl text-ink">{e.basics}</h2>
          <SField label={e.title} error={errors.title}><input className={fieldClass} value={f.title} onChange={set("title")} maxLength={140} /></SField>
          <SField label={e.description}><textarea className={`${fieldClass} resize-y`} rows={5} value={f.description} onChange={set("description")} maxLength={6000} /></SField>
          <div className="grid sm:grid-cols-2 gap-4">
            <SField label={e.category}><select className={fieldClass} value={f.category_id} onChange={set("category_id")}><option value="">{e.chooseCategory}</option>{flatCats.map((c) => <option key={c.id} value={c.id}>{lang === "en" ? c.name_en : c.name_fr}</option>)}</select></SField>
            <SField label={e.brand}><input className={fieldClass} value={f.brand} onChange={set("brand")} maxLength={60} /></SField>
            <SField label={e.sku}><input className={fieldClass} value={f.sku} onChange={set("sku")} maxLength={60} /></SField>
            <SField label={e.weight}><input className={fieldClass} type="number" min="0" step="0.01" value={f.weight_kg} onChange={set("weight_kg")} /></SField>
          </div>
          <SField label={e.attributes} hint={e.attributesHint}><textarea className={`${fieldClass} resize-y font-mono text-xs`} rows={3} value={f.attributes} onChange={set("attributes")} maxLength={2000} /></SField>
          <SField label={e.tags}><input className={fieldClass} value={f.tags} onChange={set("tags")} maxLength={300} /></SField>
        </section>

        <section className={card}>
          <h2 className="font-display text-xl text-ink">{e.images}</h2>
          <p className="text-xs text-ink-faint -mt-3">{e.imagesHint}</p>
          {f.images.length > 0 && (
            <ul className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {f.images.map((p, i) => (
                <li key={p} className="relative group">
                  <ShopImage path={p} ratio="aspect-square" className={`rounded-2xl ${i === 0 ? "ring-2 ring-coffee" : ""}`} />
                  <div className="absolute inset-x-1 bottom-1 flex justify-between">
                    {i !== 0 ? <button type="button" onClick={() => setF((x) => ({ ...x, images: [p, ...x.images.filter((y) => y !== p)] }))} aria-label={e.makeMain} title={e.makeMain} className="w-7 h-7 rounded-full bg-cream-fixed/90 text-ink-fixed flex items-center justify-center"><Star size={13} /></button> : <span />}
                    <button type="button" onClick={() => setF((x) => ({ ...x, images: x.images.filter((y) => y !== p) }))} aria-label={e.removeImage} className="w-7 h-7 rounded-full bg-cream-fixed/90 text-ink-fixed flex items-center justify-center"><X size={13} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" className="accent-coffee" checked={cut} onChange={(ev) => setCut(ev.target.checked)} />{x.cut}</label>
          {f.images.length < 10 && <ImagePicker multiple cutout={cut} onCutoutMiss={() => toast.info?.(x.cutMiss)} label={e.addImage} onChange={(paths) => setF((x) => ({ ...x, images: [...x.images, ...paths].slice(0, 10) }))} />}
          {errors.images && <p role="alert" className="text-xs text-red-600">{errors.images}</p>}
        </section>

        <section className={card}>
          <h2 className="font-display text-xl text-ink">{e.pricing}</h2>
          <p className="text-xs text-ink-faint -mt-3">{e.priceCurrency(pivot)}</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <SField label={e.price} error={errors.price}><input className={fieldClass} type="number" min="0.5" step="0.01" value={f.price} onChange={set("price")} /></SField>
            <SField label={e.compare}><input className={fieldClass} type="number" min="0" step="0.01" value={f.compare_at_price} onChange={set("compare_at_price")} /></SField>
            <SField label={e.stock}><input className={fieldClass} type="number" min="0" value={f.stock} onChange={set("stock")} disabled={f.variants.length > 0} /></SField>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-display text-xl text-ink">{x.colors}</h2>
          <p className="text-xs text-ink-faint -mt-3">{x.colorsHint}</p>
          {f.colors.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="color" aria-label="color" value={c.hex} onChange={(ev) => setF((p) => ({ ...p, colors: p.colors.map((y, j) => (j === i ? { ...y, hex: ev.target.value } : y)) }))} className="w-11 h-11 rounded-xl border border-line bg-surface p-1" />
              <input aria-label={x.colorName} placeholder={x.colorName} maxLength={30} className={fieldClass} value={c.name} onChange={(ev) => setF((p) => ({ ...p, colors: p.colors.map((y, j) => (j === i ? { ...y, name: ev.target.value } : y)) }))} />
              <button type="button" aria-label={e.removeImage} onClick={() => setF((p) => ({ ...p, colors: p.colors.filter((_, j) => j !== i) }))} className="h-11 w-9 text-ink-faint hover:text-red-600 flex items-center justify-center"><X size={16} /></button>
            </div>
          ))}
          {f.colors.length < 8 && <button type="button" onClick={() => setF((p) => ({ ...p, colors: [...p.colors, { name: "", hex: "#111111" }] }))} className="inline-flex items-center gap-2 text-sm text-coffee"><Plus size={14} />{x.addColor}</button>}
          <SField label={x.model3d} hint={x.model3dHint}>
            <select className={fieldClass} value={f.model3d} onChange={set("model3d")}><option value="">{x.none}</option>{Object.entries(M3).map(([k, v]) => <option key={k} value={k}>{lang === "en" ? v[1] : v[0]}</option>)}</select>
          </SField>
        </section>

        <section className={card}>
          <h2 className="font-display text-xl text-ink">{e.variants}</h2>
          <p className="text-xs text-ink-faint -mt-3">{e.variantsHint}</p>
          {f.variants.map((v, i) => (
            <div key={v.id || i} className="grid grid-cols-[1fr_90px_90px_auto] gap-2 items-end">
              <SField label={i === 0 ? e.variantLabel : ""}><input aria-label={e.variantLabel} className={fieldClass} value={v.label} onChange={(ev) => setVariant(i, "label", ev.target.value)} maxLength={80} /></SField>
              <SField label={i === 0 ? e.variantPrice : ""}><input aria-label={e.variantPrice} className={fieldClass} type="number" min="0" step="0.01" value={v.price} onChange={(ev) => setVariant(i, "price", ev.target.value)} /></SField>
              <SField label={i === 0 ? e.variantStock : ""}><input aria-label={e.variantStock} className={fieldClass} type="number" min="0" value={v.stock} onChange={(ev) => setVariant(i, "stock", ev.target.value)} /></SField>
              <button type="button" aria-label={e.removeImage} onClick={() => setF((x) => ({ ...x, variants: x.variants.filter((_, j) => j !== i) }))} className="h-11 w-9 text-ink-faint hover:text-red-600 flex items-center justify-center"><Trash2 size={16} /></button>
            </div>
          ))}
          {errors.variants && <p role="alert" className="text-xs text-red-600">{errors.variants}</p>}
          <button type="button" onClick={() => setF((x) => ({ ...x, variants: [...x.variants, { label: "", sku: "", price: "", stock: "0", is_active: true }] }))} className="inline-flex items-center gap-2 text-sm text-coffee hover:underline"><Plus size={15} /> {e.addVariant}</button>
        </section>

        <section className={card}>
          <h2 className="font-display text-xl text-ink">{e.status}</h2>
          <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label={e.status}>
            {[["draft", e.statusDraft], ["active", e.statusActive], ["archived", e.statusArchived]].map(([k, l]) => (
              <button type="button" key={k} role="radio" aria-checked={f.status === k} onClick={() => setF((x) => ({ ...x, status: k }))} className={`rounded-2xl border p-4 text-sm text-left ${f.status === k ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft hover:border-coffee-light"}`}>{l}</button>
            ))}
          </div>
          {isNew && shop && shop.status !== "approved" && <p className="text-xs text-amber-700 dark:text-amber-300">{e.shopNotApproved}</p>}
        </section>

        {serverError && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-4">{serverError}</p>}
        <div className="flex justify-end"><button disabled={busy || !targetShop} className="rounded-full bg-ink text-cream text-sm font-medium px-10 py-4 hover:bg-coffee-dark disabled:opacity-60 inline-flex items-center gap-2">{busy ? <><Loader2 size={16} className="animate-spin" /> {e.saving}</> : e.save}</button></div>
      </form>
    </ShopLayout>
  );
}
export default function ProductEditor() { return <AuthGate><Inner /></AuthGate>; }
