import { useState } from "react";
import { Link } from "react-router-dom";
import { LogIn, UserPlus, ShieldCheck, Paperclip } from "lucide-react";
import { api } from "../../lib/api.js";
import Reveal from "../ui/Reveal.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useProgressAction } from "../../context/ProgressContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import FormLoadingOverlay from "../ui/FormLoadingOverlay.jsx";

const FIELDS_INITIAL = {
  company: "",
  contactName: "",
  category: "Développement web & mobile",
  message: "",
  phone: "",
  address: "",
  id_document_type: "national_id",
  id_document_number: "",
};

const CATEGORIES = [
  "Cybersécurité",
  "Développement web & mobile",
  "Design",
  "Conseil & infrastructure IT",
  "Maintenance",
  "Formation (H-learning)",
  "Autre",
];

const MAX_ID_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_ID_TYPES = ["image/png", "image/jpeg", "application/pdf"];

/** Invite à se connecter avant de candidater — affiché à la place du
 * formulaire tant que l'utilisateur n'a pas de session active. */
function SignInPrompt({ t }) {
  return (
    <div className="rounded-2xl border border-line bg-cream p-8 text-center">
      <p className="text-stone leading-relaxed mb-6 max-w-sm mx-auto">
        {t("joinForm.authRequired")}
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          to="/connexion"
          state={{ redirectTo: "/infos#rejoindre" }}
          className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3 hover:bg-coffee-dark transition-colors"
        >
          <LogIn size={15} />
          {t("joinForm.signIn")}
        </Link>
        <Link
          to="/creer-un-compte"
          state={{ redirectTo: "/infos#rejoindre" }}
          className="inline-flex items-center gap-2 rounded-full border border-line text-ink text-sm font-medium px-6 py-3 hover:border-coffee-light transition-colors"
        >
          <UserPlus size={15} />
          {t("joinForm.createAccount")}
        </Link>
      </div>
    </div>
  );
}

export default function JoinForm() {
  const { t } = useLanguage();
  const { isAuthenticated, withAuth, user } = useUser();
  const [fields, setFields] = useState(FIELDS_INITIAL);
  const [idFile, setIdFile] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const toast = useToast();
  const withProgress = useProgressAction();

  function update(key, value) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return setIdFile(null);
    if (!ACCEPTED_ID_TYPES.includes(file.type)) {
      toast.error("Format non accepté — utilisez un JPG, PNG ou PDF.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_ID_FILE_SIZE) {
      toast.error("Le fichier ne doit pas dépasser 5 Mo.");
      e.target.value = "";
      return;
    }
    setIdFile(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!idFile) {
      const msg = t("joinForm.idDocumentFile");
      setStatus("error");
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      await withProgress(() => withAuth((token) => api.partners.apply(token, fields, idFile)));
      setStatus("success");
      setFields(FIELDS_INITIAL);
      setIdFile(null);
      toast.success(t("joinForm.success"));
    } catch (err) {
      setStatus("error");
      const msg = err?.data?.detail || t("joinForm.formError");
      setErrorMsg(msg);
      toast.error(msg);
    }
  }

  return (
    <section id="rejoindre" className="px-6 py-28 border-t border-line bg-surface">
      <div className="max-w-content mx-auto grid md:grid-cols-[0.9fr_1.1fr] gap-16">
        <Reveal>
          <p className="text-sm font-medium text-coffee mb-4">{t("joinForm.eyebrow")}</p>
          <h2 className="font-display text-3xl sm:text-4xl leading-tight text-ink max-w-md">
            {t("joinForm.heading")}
          </h2>
          <p className="mt-6 text-stone leading-relaxed max-w-sm">
            {t("joinForm.lead")}
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          {!isAuthenticated ? (
            <SignInPrompt t={t} />
          ) : (
          <form onSubmit={handleSubmit} className="relative space-y-5">
          <FormLoadingOverlay show={status === "loading"} label={t("joinForm.submitting")} rounded="rounded-2xl" />
          <p className="text-sm text-ink-soft">
            {t("joinForm.connectedAs")} <span className="font-medium text-ink">{user?.email}</span>
          </p>
          <div className="grid sm:grid-cols-2 gap-5">
            <Field
              id="company"
              label={t("joinForm.company")}
              value={fields.company}
              onChange={(v) => update("company", v)}
              required
            />
            <Field
              id="contactName"
              label={t("joinForm.contactName")}
              value={fields.contactName}
              onChange={(v) => update("contactName", v)}
              required
            />
          </div>

          <div>
            <label htmlFor="category" className="block text-sm text-stone mb-1.5">
              {t("joinForm.category")}
            </label>
            <select
              id="category"
              value={fields.category}
              onChange={(e) => update("category", e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-ink focus:border-coffee outline-none transition-colors"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="message" className="block text-sm text-stone mb-1.5">
              {t("joinForm.message")}
            </label>
            <textarea
              id="message"
              rows={4}
              value={fields.message}
              onChange={(e) => update("message", e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-ink placeholder:text-stone/60 focus:border-coffee outline-none transition-colors resize-none"
              placeholder={t("joinForm.messagePlaceholder")}
            />
          </div>

          {/* --- Dossier KYC --- */}
          <div className="rounded-2xl border border-line/70 bg-cream/60 p-5 space-y-5">
            <div className="flex items-start gap-2.5">
              <ShieldCheck size={17} className="text-coffee-dark shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-ink">{t("joinForm.kycHeading")}</p>
                <p className="text-xs text-ink-faint mt-0.5 leading-relaxed">{t("joinForm.kycNote")}</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <Field
                id="phone"
                label={t("joinForm.phone")}
                type="tel"
                value={fields.phone}
                onChange={(v) => update("phone", v)}
                required
              />
              <Field
                id="address"
                label={t("joinForm.address")}
                value={fields.address}
                onChange={(v) => update("address", v)}
                required
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="id_document_type" className="block text-sm text-stone mb-1.5">
                  {t("joinForm.idDocumentType")}
                </label>
                <select
                  id="id_document_type"
                  value={fields.id_document_type}
                  onChange={(e) => update("id_document_type", e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-ink focus:border-coffee outline-none transition-colors"
                >
                  <option value="national_id">{t("joinForm.idTypeNationalId")}</option>
                  <option value="voter_card">{t("joinForm.idTypeVoterCard")}</option>
                  <option value="passport">{t("joinForm.idTypePassport")}</option>
                </select>
              </div>
              <Field
                id="id_document_number"
                label={t("joinForm.idDocumentNumber")}
                value={fields.id_document_number}
                onChange={(v) => update("id_document_number", v)}
                required
              />
            </div>

            <div>
              <label htmlFor="id_document" className="block text-sm text-stone mb-1.5">
                {t("joinForm.idDocumentFile")}
              </label>
              <label
                htmlFor="id_document"
                className="flex items-center gap-2.5 w-full rounded-lg border border-dashed border-line bg-surface px-4 py-3 text-sm text-ink-soft cursor-pointer hover:border-coffee-light transition-colors"
              >
                <Paperclip size={15} className="shrink-0 text-coffee-dark" />
                <span className="truncate">
                  {idFile ? (
                    <>
                      <span className="text-ink-faint">{t("joinForm.idDocumentFileChosen")}</span>{" "}
                      <span className="text-ink font-medium">{idFile.name}</span>
                    </>
                  ) : (
                    t("joinForm.idDocumentFile")
                  )}
                </span>
              </label>
              <input
                id="id_document"
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                onChange={handleFileChange}
                className="sr-only"
              />
            </div>
          </div>

          {status === "success" && (
            <p className="text-sm text-coffee-dark bg-coffee-light/15 border border-coffee-light/40 rounded-lg px-4 py-3">
              {t("joinForm.success")}
            </p>
          )}
          {status === "error" && <p className="text-sm text-red-700">{errorMsg}</p>}

          <button
            type="submit"
            disabled={status === "loading"}
            className="bg-ink text-cream rounded-full px-8 py-3.5 font-medium transition-transform duration-300 hover:scale-[1.02] disabled:opacity-60"
          >
            {status === "loading" ? t("joinForm.submitting") : t("joinForm.submit")}
          </button>
        </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}

function Field({ id, label, value, onChange, type = "text", required = false }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-stone mb-1.5">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-ink placeholder:text-stone/60 focus:border-coffee outline-none transition-colors"
      />
    </div>
  );
}
