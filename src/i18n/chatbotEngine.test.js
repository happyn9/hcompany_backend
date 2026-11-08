import { describe, it, expect } from "vitest";
import { answer } from "./chatbotEngine.js";
import { SERVICE_UI } from "./servicePageUi.js";

describe("chatbot local", () => {
  it("répond sur les tarifs sans inventer de prix", () => {
    const r = answer("quels sont vos tarifs ?", "fr");
    expect(r.topic).toBe("pricing");
    expect(r.text).toContain("150");
  });
  it("comprend une faute de frappe", () => {
    expect(answer("mot de pass oublie", "fr").topic).toBe("password_forgot");
  });
  it("répond en anglais", () => {
    expect(answer("how do I send a parcel", "en").text).toMatch(/Parcels?/);
  });
  it("calcule sans eval", () => {
    expect(answer("combien font 12 x 5 + 3", "fr").text).toContain("63");
    expect(answer("alert(1)", "fr").text).not.toContain("1 =");
  });
  it("avoue ne pas savoir et propose le contact", () => {
    const r = answer("qui a gagné la coupe du monde 1998", "fr");
    expect(r.cta).toBe(true);
    expect(r.text).toMatch(/préfère ne rien inventer/);
  });
  it("suit la conversation avec « oui »", () => {
    const first = answer("devenir partenaire", "fr");
    const next = answer("oui", "fr", { topic: first.topic });
    expect(next.topic).not.toBe(first.topic);
  });
});

describe("textes de l'interface", () => {
  it("FR et EN ont les mêmes clés", () => {
    expect(Object.keys(SERVICE_UI.fr).sort()).toEqual(Object.keys(SERVICE_UI.en).sort());
  });
});
