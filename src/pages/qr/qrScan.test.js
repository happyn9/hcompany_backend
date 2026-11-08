import { describe, expect, it } from "vitest";
import { extractCode } from "./QrScan.jsx";
import { vcard } from "../../components/dashboard/ShareTab.jsx";

describe("extractCode", () => {
  it("lit le code dans une URL scannée", () => {
    expect(extractCode("https://hcompany.example/qr/AbCdEf123456_-xyZ0")).toBe("AbCdEf123456_-xyZ0");
  });
  it("accepte le code collé seul", () => {
    expect(extractCode("  AbCdEf123456_-xyZ0AbCd ")).toBe("AbCdEf123456_-xyZ0AbCd");
  });
  it("refuse le reste", () => {
    expect(extractCode("bonjour")).toBe("");
    expect(extractCode("")).toBe("");
    expect(extractCode(null)).toBe("");
  });
});

describe("vcard", () => {
  it("génère une carte de contact valide et échappe les séparateurs", () => {
    const v = vcard({ company: "Mwila, Lodge; & Co", name: "Mwila", email: "a@b.com", phone: "0971234567", url: "https://x.y" });
    expect(v.startsWith("BEGIN:VCARD\r\nVERSION:3.0")).toBe(true);
    expect(v).toContain(String.raw`ORG:Mwila\, Lodge\; & Co`);
    expect(v).toContain("TEL;TYPE=CELL:0971234567");
    expect(v.endsWith("END:VCARD")).toBe(true);
  });
  it("omet les champs vides", () => {
    expect(vcard({ company: "X" })).not.toContain("EMAIL");
  });
});
