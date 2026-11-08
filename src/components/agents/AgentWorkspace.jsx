import { useEffect, useState } from "react";
import ModuleStats from "./ModuleStats.jsx";
import AgentInbox from "./AgentInbox.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { deptLabel } from "../../lib/agents.js";

const T = {
  fr: { stats: "Mes modules", messages: "Messages", departments: "Départements", online: "En ligne", err: "Impossible de charger les statistiques." },
  en: { stats: "My modules", messages: "Messages", departments: "Departments", online: "Online", err: "Could not load statistics." },
};

/** Heartbeat toutes les 60 s : tant que l'espace agent est ouvert, l'agent est « en ligne » pour le chat. */
export function useHeartbeat(enabled) {
  const { withAuth } = useUser();
  useEffect(() => {
    if (!enabled) return undefined;
    const beat = () => withAuth((tk) => api.agents.heartbeat(tk)).catch(() => {});
    beat();
    const i = setInterval(beat, 60000);
    return () => clearInterval(i);
  }, [enabled, withAuth]);
}

export default function AgentWorkspace({ section }) {
  const { withAuth } = useUser();
  const { lang } = useLanguage();
  const t = T[lang] || T.fr;
  const [me, setMe] = useState(null);
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    withAuth((tk) => api.agents.me(tk)).then(setMe).catch(() => {});
    withAuth((tk) => api.agents.stats(tk)).then(setStats).catch(() => setErr(t.err));
  }, [withAuth, t.err]);
  if (section === "messages") return <AgentInbox />;
  return (
    <div className="space-y-4">
      {me && <p className="text-sm text-ink-soft">{t.departments} : {me.departments.map((d) => deptLabel(lang, d)).join(" · ")}</p>}
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      {stats && Object.entries(stats).map(([m, s]) => <ModuleStats key={m} module={m} stats={s} />)}
    </div>
  );
}
