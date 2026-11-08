import { describe, it, expect } from "vitest";
import { trText } from "../i18n/autoTranslate.js";
describe("autoTranslate", () => {
  it("traduit les textes connus et garde les autres", () => {
    expect(trText("  Envoyer de l'argent ")).toBe("  Send money ");
    expect(trText("3 candidatures")).toBe("3 applications");
    expect(trText("Texte inconnu xyz")).toBe("Texte inconnu xyz");
  });
});
