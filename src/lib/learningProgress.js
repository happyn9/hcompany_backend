import { mem } from "./memStore.js";
// Progression H-Learning. Les visiteurs sans compte la gardent dans le
// navigateur ; connectés, elle est aussi envoyée au serveur et fusionnée.
const KEY = "hc_learning_progress_v1";

function readAll() {
  return mem.get(KEY, {});
}

function writeAll(data) {
  mem.set(KEY, data); // en mémoire : sans compte, la progression ne survit pas au rechargement ; connecté, elle est sur le serveur
}

/** { [lessonId]: { done: bool, t: seconds } } */
export function getLocalProgress() {
  return readAll();
}

export function setLocalProgress(lessonId, patch) {
  const all = readAll();
  const prev = all[lessonId] || { done: false, t: 0 };
  all[lessonId] = { done: prev.done || !!patch.done, t: patch.t ?? prev.t };
  writeAll(all);
  return all;
}

/** Fusionne la progression serveur (liste) dans la locale : terminé = OU. */
export function mergeServerProgress(rows) {
  const all = readAll();
  for (const r of rows || []) {
    const prev = all[r.lesson_id] || { done: false, t: 0 };
    all[r.lesson_id] = { done: prev.done || r.completed, t: Math.max(prev.t, r.position_seconds || 0) };
  }
  writeAll(all);
  return all;
}

/** Première leçon non terminée, sinon la première. */
export function nextLesson(lessons, progress) {
  return lessons.find((l) => !progress[l.id]?.done) || lessons[0] || null;
}

export function countDone(lessons, progress) {
  return lessons.filter((l) => progress[l.id]?.done).length;
}
