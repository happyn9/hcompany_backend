import { mem } from "./memStore.js";
import { beforeEach, describe, expect, it } from "vitest";
import { countDone, getLocalProgress, mergeServerProgress, nextLesson, setLocalProgress } from "./learningProgress.js";
import { formatDuration } from "../data/courses.js";
import { answer } from "../i18n/chatbotEngine.js";

describe("progression H-Learning", () => {
  beforeEach(() => mem.clear());

  it("garde une leçon terminée terminée, même si on revoit le début", () => {
    setLocalProgress(1, { done: true, t: 0 });
    setLocalProgress(1, { done: false, t: 30 });
    expect(getLocalProgress()[1]).toEqual({ done: true, t: 30 });
  });

  it("fusionne la progression serveur sans rien perdre", () => {
    setLocalProgress(1, { done: false, t: 50 });
    const merged = mergeServerProgress([{ lesson_id: 1, completed: true, position_seconds: 10 }, { lesson_id: 2, completed: false, position_seconds: 5 }]);
    expect(merged[1]).toEqual({ done: true, t: 50 });
    expect(merged[2]).toEqual({ done: false, t: 5 });
  });

  it("propose la première leçon non terminée", () => {
    const lessons = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(nextLesson(lessons, { 1: { done: true } }).id).toBe(2);
    expect(nextLesson(lessons, { 1: { done: true }, 2: { done: true }, 3: { done: true } }).id).toBe(1);
    expect(countDone(lessons, { 1: { done: true }, 3: { done: true } })).toBe(2);
  });

  it("formate les durées", () => {
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(720)).toBe("12 min");
    expect(formatDuration(3900)).toBe("1 h 05");
  });
});

describe("chatbot H-Learning", () => {
  it("explique que les vidéos sont gratuites", () => {
    const r = answer("les cours sont gratuits ?", "fr", {});
    expect(r.text.toLowerCase()).toContain("gratuit");
  });
  it("oriente vers l'inscription au présentiel", () => {
    const r = answer("comment s'inscrire en présentiel avec un formateur", "fr", {});
    expect(r.text.toLowerCase()).toContain("présentiel");
    expect(JSON.stringify(r.links)).toContain("/formations/inscription");
  });
});
