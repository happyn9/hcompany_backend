import { describe, it, expect } from "vitest";
import { translations } from "../i18n/translations.js";

/** Compare récursivement la forme (les clés) de deux objets, sans se
 * soucier des valeurs — c'est exactement le genre de désynchronisation
 * FR/EN qui a causé plusieurs bugs pendant le développement de ce site. */
function collectKeyPaths(obj, prefix = "") {
  let paths = [];
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      paths = paths.concat(collectKeyPaths(value, path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

describe("traductions FR/EN", () => {
  it("ont exactement les mêmes clés (aucune clé manquante d'un côté ou de l'autre)", () => {
    const frKeys = collectKeyPaths(translations.fr).sort();
    const enKeys = collectKeyPaths(translations.en).sort();

    const missingInEn = frKeys.filter((k) => !enKeys.includes(k));
    const missingInFr = enKeys.filter((k) => !frKeys.includes(k));

    expect(missingInEn, `Clés présentes en FR mais absentes en EN : ${missingInEn.join(", ")}`).toEqual([]);
    expect(missingInFr, `Clés présentes en EN mais absentes en FR : ${missingInFr.join(", ")}`).toEqual([]);
  });

  it("n'ont aucune valeur vide ou manifestement oubliée", () => {
    const frKeys = collectKeyPaths(translations.fr);
    for (const path of frKeys) {
      const value = path.split(".").reduce((o, k) => o?.[k], translations.fr);
      if (typeof value === "string") {
        expect(value.trim(), `Valeur vide pour la clé FR "${path}"`).not.toBe("");
      }
    }
  });
});
