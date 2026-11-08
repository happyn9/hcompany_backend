import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useUser } from "../context/Usercontext.jsx";

export const LEVEL_TONE = {
  "initiation": "gold",
  "intermédiaire": "clay",
  "tous niveaux": "coffee",
};

export function levelTone(level) {
  return LEVEL_TONE[(level || "").toLowerCase()] || "coffee";
}

// Identifiants négatifs pour ne jamais entrer en conflit avec de vrais
// identifiants venant du backend (autoincrement positif). Utilisés
// uniquement quand l'API est injoignable : ils s'affichent sans vidéos.
export const STATIC_FALLBACK_COURSES = [
  { id: -1, title: "Cybersécurité pour débutants", level: "Initiation", category: "Cybersécurité", description: "Reconnaître les menaces courantes et adopter les bons réflexes pour protéger un poste de travail." },
  { id: -2, title: "Développement mobile avec Flutter", level: "Intermédiaire", category: "Développement", description: "Construire une application mobile complète, de la première interface jusqu'à la mise en ligne." },
  { id: -3, title: "Design d'interfaces", level: "Initiation", category: "Design", description: "Concevoir des écrans clairs et agréables à utiliser, sans expérience préalable requise." },
  { id: -4, title: "Gestion de projet IT", level: "Intermédiaire", category: "Gestion", description: "Cadrer, planifier et livrer un projet informatique dans les délais annoncés." },
  { id: -5, title: "Entrepreneuriat numérique", level: "Tous niveaux", category: "Business", description: "Structurer une idée d'entreprise digitale, du modèle économique jusqu'au lancement." },
];

function normalize(c) {
  return { lesson_count: 0, total_seconds: 0, ...c, text: c.description || c.text };
}

/** "1 h 05", "12 min" — pour les durées de cours/leçons. */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h) return `${h} h ${String(m).padStart(2, "0")}`;
  return m ? `${m} min` : `${s} s`;
}

/** Catalogue de cours (avec repli local si l'API échoue). Utilisé par le
 * hub H-Learning, la section d'accueil, U-Study et la page de service. */
export function useCourses() {
  const [state, setState] = useState({ status: "loading", courses: [], offline: false });

  useEffect(() => {
    let cancelled = false;
    api.learning
      .courses()
      .then((data) => {
        if (cancelled) return;
        const source = data?.length ? data : STATIC_FALLBACK_COURSES;
        setState({ status: "ready", courses: source.map(normalize), offline: !data?.length });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "ready", courses: STATIC_FALLBACK_COURSES.map(normalize), offline: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** Détail d'un cours + ses leçons (YouTube). status : loading | ready | missing | error */
export function useCourse(id) {
  const [state, setState] = useState({ status: "loading", course: null });
  // Le jeton permet au serveur de débloquer les leçons exclusives d'un
  // bouquet actif ; on attend la fin de la restauration de session.
  const { token, isLoading } = useUser();

  useEffect(() => {
    if (isLoading) return undefined;
    let cancelled = false;
    setState((prev) => (prev.course && String(prev.course.id) === String(id) ? prev : { status: "loading", course: null }));
    const numeric = Number(id);
    if (!Number.isInteger(numeric) || numeric <= 0) {
      const fb = STATIC_FALLBACK_COURSES.find((c) => String(c.id) === String(id));
      setState(fb ? { status: "ready", course: { ...normalize(fb), outcomes: [], requirements: [], lessons: [] } } : { status: "missing", course: null });
      return undefined;
    }
    api.learning
      .course(numeric, token || undefined)
      .then((c) => !cancelled && setState({ status: "ready", course: { ...normalize(c), lessons: c.lessons || [] } }))
      .catch((e) => !cancelled && setState({ status: e?.status === 404 ? "missing" : "error", course: null }));
    return () => {
      cancelled = true;
    };
  }, [id, token, isLoading]);

  return state;
}
