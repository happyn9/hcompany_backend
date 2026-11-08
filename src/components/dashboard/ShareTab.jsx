import { useMemo, useState } from "react";
import { Copy, Download, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import QrCode from "../qr/QrCode.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { Link } from "react-router-dom";

const T = {
  fr: { title: "Carte QR & appareils", lead: "Partagez vos coordonnées en un scan, ou connectez votre ordinateur à votre compte.", contact: "Carte de contact", site: "Lien H-Company", copy: "Copier", copied: "Copié", dl: "Télécharger (PNG)", contactHint: "Un scan ajoute votre société, e-mail et téléphone aux contacts du téléphone.", siteHint: "Ouvre H-Company sur le site, pour un client qui vous cherche.", devices: "Connecter un appareil", devicesBody: "Sur un ordinateur, ouvrez la page de connexion par QR puis scannez-la depuis ce téléphone (app Rafiki ou navigateur).", scan: "Scanner un code", open: "Page de connexion QR" },
  en: { title: "QR card & devices", lead: "Share your details in one scan, or sign your computer in to your account.", contact: "Contact card", site: "H-Company link", copy: "Copy", copied: "Copied", dl: "Download (PNG)", contactHint: "One scan adds your company, e-mail and phone to the phone's contacts.", siteHint: "Opens H-Company on the site, for a customer looking for you.", devices: "Connect a device", devicesBody: "On a computer, open the QR sign-in page then scan it from this phone (Rafiki app or browser).", scan: "Scan a code", open: "QR sign-in page" },
};

const esc = (s) => String(s || "").replace(/([\\;,])/g, "\\$1").replace(/\n/g, " ");
export function vcard({ company, name, email, phone, url }) {
  return ["BEGIN:VCARD", "VERSION:3.0", `FN:${esc(name || company)}`, `ORG:${esc(company)}`, email && `EMAIL:${esc(email)}`, phone && `TEL;TYPE=CELL:${esc(phone)}`, url && `URL:${url}`, "END:VCARD"].filter(Boolean).join("\r\n");
}

export default function ShareTab({ application, user }) {
  const { lang } = useLanguage();
  const t = T[lang] || T.fr;
  const [mode, setMode] = useState("contact");
  const [copied, setCopied] = useState(false);
  const site = typeof window !== "undefined" ? window.location.origin : "";
  const value = useMemo(() => (mode === "contact"
    ? vcard({ company: application?.company, name: application?.contact_name || user?.full_name, email: application?.email || user?.email, phone: application?.phone, url: site })
    : site), [mode, application, user, site]);

  async function download() {
    const url = await QRCode.toDataURL(value, { width: 1024, margin: 2, errorCorrectionLevel: "M" });
    const a = document.createElement("a"); a.href = url; a.download = `h-company-${mode}.png`; a.click();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(mode === "site" ? site : value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* presse-papier indisponible */ }
  }
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-display text-2xl text-ink mb-1">{t.title}</h2>
        <p className="text-sm text-ink-soft mb-5">{t.lead}</p>
        <div className="inline-flex rounded-full bg-latte-soft p-1 mb-6" role="tablist">
          {[["contact", t.contact], ["site", t.site]].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`px-4 py-2 rounded-full text-sm ${mode === k ? "bg-ink text-cream" : "text-ink-soft"}`}>{l}</button>
          ))}
        </div>
        <div className="flex flex-col items-center gap-4">
          <QrCode value={value} size={240} label={mode === "contact" ? t.contact : t.site} />
          <p className="text-xs text-ink-faint text-center max-w-xs">{mode === "contact" ? t.contactHint : t.siteHint}</p>
          <div className="flex gap-2">
            <button onClick={download} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm px-5 py-2.5"><Download size={15} />{t.dl}</button>
            {mode === "site" && <button onClick={copy} className="inline-flex items-center gap-2 rounded-full border border-line text-sm px-5 py-2.5"><Copy size={15} />{copied ? t.copied : t.copy}</button>}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-6 flex flex-col">
        <span className="w-10 h-10 rounded-xl bg-latte-soft text-coffee-dark flex items-center justify-center mb-4"><Smartphone size={19} /></span>
        <h3 className="font-display text-xl text-ink mb-2">{t.devices}</h3>
        <p className="text-sm text-ink-soft leading-relaxed mb-6">{t.devicesBody}</p>
        <div className="mt-auto flex flex-wrap gap-2">
          <Link to="/scanner" className="rounded-full bg-ink text-cream text-sm px-5 py-2.5">{t.scan}</Link>
          <Link to="/connexion-qr" className="rounded-full border border-line text-sm px-5 py-2.5">{t.open}</Link>
        </div>
      </div>
    </div>
  );
}
