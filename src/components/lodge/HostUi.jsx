import { useEffect, useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { HOST_UI } from "../../i18n/lodgeHostUi.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { api } from "../../lib/api.js";

export function useHostUi() {
  const { lang } = useLanguage();
  return HOST_UI[lang] || HOST_UI.fr;
}

export const inputCls = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15";

export function Field({ label, hint, error, children, className = "", htmlFor }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink mb-1.5">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-ink-faint mt-1.5">{hint}</p>}
      {error && <p role="alert" className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}

export function Modal({ title, onClose, children, closeLabel = "Close" }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/50" aria-label={closeLabel} onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-cream p-6 sm:p-8">
        <h2 className="font-display text-2xl text-ink mb-5">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Card({ children, className = "" }) {
  return <section className={`rounded-3xl border border-line bg-surface p-5 sm:p-6 ${className}`}>{children}</section>;
}

/** Téléverse une ou plusieurs images vers l'API hôte ; appelle onChange avec les chemins. */
export function HostUploader({ onUploaded, label, multiple = false, busyLabel }) {
  const { withAuth } = useUser();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function pick(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      const paths = [];
      for (const f of files) paths.push((await withAuth((t) => api.lodge.hosting.upload(t, f))).path);
      onUploaded(paths);
    } catch (err) {
      toast?.error?.(err?.data?.detail || "Upload impossible.");
    } finally { setBusy(false); }
  }
  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-ink cursor-pointer hover:border-coffee-light">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />} {busy ? busyLabel : label}
      <input type="file" accept="image/png,image/jpeg,image/webp" multiple={multiple} onChange={pick} className="sr-only" disabled={busy} />
    </label>
  );
}

export const OPERATORS = [["zamtel_money", "Zamtel Money"], ["mtn_momo", "MTN MoMo"], ["airtel_money", "Airtel Money"]];

/** Transforme une erreur 422 FastAPI en message lisible : « Titre : au moins 4 caractères ». */
export function validationMessage(err, labels = {}, lang = "fr", fallback = "") {
  const list = err?.data?.errors;
  if (!Array.isArray(list) || !list.length) return err?.data?.detail && err.data.detail !== "Données invalides." ? String(err.data.detail) : fallback || err?.message || "";
  const fr = lang !== "en";
  const why = (x) => {
    const c = x.ctx || {};
    switch (x.type) {
      case "string_too_short": return fr ? `au moins ${c.min_length} caractères` : `at least ${c.min_length} characters`;
      case "string_too_long": return fr ? `${c.max_length} caractères maximum` : `at most ${c.max_length} characters`;
      case "less_than_equal": return fr ? `maximum ${c.le}` : `maximum ${c.le}`;
      case "less_than": return fr ? `doit être inférieur à ${c.lt}` : `must be less than ${c.lt}`;
      case "greater_than_equal": return fr ? `minimum ${c.ge}` : `minimum ${c.ge}`;
      case "greater_than": return fr ? `doit être supérieur à ${c.gt}` : `must be greater than ${c.gt}`;
      case "missing": return fr ? "obligatoire" : "required";
      default: return x.msg || (fr ? "valeur invalide" : "invalid value");
    }
  };
  return list.map((x) => { const k = x.loc?.[x.loc.length - 1]; return `${labels[k] || k} : ${why(x)}`; }).join(" · ");
}
