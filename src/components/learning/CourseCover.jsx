import { useId } from "react";
import { ShieldCheck, Smartphone, PenTool, KanbanSquare, Rocket, Code2, FileSpreadsheet, GraduationCap, Play } from "lucide-react";

// Couverture vectorielle d'un cours : aucune photo externe. Le thème est
// choisi par mots-clés dans le titre/la catégorie, comme l'ancien rapprochement
// de photos, mais le rendu est net, léger et aux couleurs de la marque.
const THEMES = [
  { keys: ["cyber", "sécurité", "securite", "security"], from: "#3B271C", to: "#17110D", accent: "#C89A3D", Icon: ShieldCheck },
  { keys: ["mobile", "flutter", "android", "ios"], from: "#4A3020", to: "#2A1B12", accent: "#E4D2BC", Icon: Smartphone },
  { keys: ["design", "interface", "ui", "ux"], from: "#7A3F2B", to: "#3E1F15", accent: "#F0C49A", Icon: PenTool },
  { keys: ["gestion", "projet", "management"], from: "#4B4A33", to: "#23231A", accent: "#D8CF9A", Icon: KanbanSquare },
  { keys: ["entrepreneur", "startup", "business"], from: "#8A4A2E", to: "#4A2A1A", accent: "#F2D3A4", Icon: Rocket },
  { keys: ["développement", "developpement", "web", "code", "program"], from: "#2F3A3B", to: "#141A1B", accent: "#9FD0C8", Icon: Code2 },
  { keys: ["bureautique", "office", "excel", "word"], from: "#5A4A2A", to: "#2B2412", accent: "#E8D08A", Icon: FileSpreadsheet },
];
const DEFAULT = { from: "#6F4A34", to: "#2E1D12", accent: "#C49A6C", Icon: GraduationCap };

export function themeFor(course) {
  const hay = `${course?.title || ""} ${course?.category || ""}`.toLowerCase();
  return THEMES.find((t) => t.keys.some((k) => hay.includes(k))) || DEFAULT;
}

export default function CourseCover({ course, className = "", showPlay = false }) {
  const id = useId().replace(/:/g, "");
  const th = themeFor(course);
  const pos = /\babsolute\b/.test(className) ? "" : "relative";
  const { Icon } = th;
  if (course?.image_url) {
    return (
      <div className={`${pos} overflow-hidden ${className}`}>
        <img src={course.image_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        {showPlay && <PlayBadge />}
      </div>
    );
  }
  return (
    <div className={`${pos} overflow-hidden ${className}`} aria-hidden="true">
      <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={th.from} />
            <stop offset="1" stopColor={th.to} />
          </linearGradient>
          <pattern id={`${id}-p`} width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.1" fill="#fff" opacity="0.14" />
          </pattern>
          <radialGradient id={`${id}-r`} cx="0.75" cy="0.2" r="0.7">
            <stop offset="0" stopColor={th.accent} stopOpacity="0.35" />
            <stop offset="1" stopColor={th.accent} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="400" height="260" fill={`url(#${id}-g)`} />
        <rect width="400" height="260" fill={`url(#${id}-p)`} />
        <rect width="400" height="260" fill={`url(#${id}-r)`} />
        <circle cx="318" cy="70" r="120" fill="none" stroke={th.accent} strokeOpacity="0.18" />
        <circle cx="318" cy="70" r="84" fill="none" stroke={th.accent} strokeOpacity="0.14" strokeDasharray="3 7" />
        <rect x="-40" y="190" width="300" height="120" rx="60" fill={th.accent} opacity="0.08" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="w-16 h-16 rounded-2xl bg-white/12 border border-white/20 backdrop-blur-sm flex items-center justify-center" style={{ color: th.accent }}>
          <Icon size={30} strokeWidth={1.5} />
        </span>
      </div>
      {showPlay && <PlayBadge />}
    </div>
  );
}

function PlayBadge() {
  return (
    <span className="absolute right-3 bottom-3 w-9 h-9 rounded-full bg-cream-fixed text-ink-fixed flex items-center justify-center shadow-lg">
      <Play size={14} fill="currentColor" className="ml-0.5" />
    </span>
  );
}
