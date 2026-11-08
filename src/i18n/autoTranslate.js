import { EN } from "./enDict.js";

// Traducteur d'interface FR → EN : remplace les textes fixes exacts (nœuds texte + placeholder/title/aria-label).
// Actif seulement en anglais. Un texte absent du dictionnaire reste en français (jamais cassé).
const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const PATTERNS = [
  [/^(\d+) candidatures?$/, (m) => `${m[1]} application${m[1] === "1" ? "" : "s"}`],
  [/^(\d+) jours?$/, (m) => `${m[1]} day${m[1] === "1" ? "" : "s"}`],
  [/^(\d+) mois$/, (m) => `${m[1]} month${m[1] === "1" ? "" : "s"}`],
  [/^il y a (\d+) min$/, (m) => `${m[1]} min ago`],
  [/^il y a (\d+) h$/, (m) => `${m[1]} h ago`],
  [/^il y a (\d+) j$/, (m) => `${m[1]} d ago`],
  [/^Bonjour,? (.+)$/, (m) => `Hello, ${m[1]}`],
];

export function trText(s) {
  const t = s.trim();
  if (!t) return s;
  let out = EN[t];
  if (out === undefined) {
    for (const [re, fn] of PATTERNS) {
      const m = t.match(re);
      if (m) { out = fn(m); break; }
    }
  }
  if (out === undefined) return s;
  return s.replace(t, out);
}

function walk(node) {
  if (node.nodeType === 3) {
    const p = node.parentNode;
    if (p && /^(SCRIPT|STYLE|TEXTAREA|CODE)$/.test(p.nodeName)) return;
    const v = node.nodeValue;
    const n = trText(v);
    if (n !== v) node.nodeValue = n;
    return;
  }
  if (node.nodeType !== 1) return;
  if (node.hasAttribute?.("data-no-translate")) return;
  for (const a of ATTRS) {
    const v = node.getAttribute(a);
    if (v) {
      const n = trText(v);
      if (n !== v) node.setAttribute(a, n);
    }
  }
  node.childNodes.forEach(walk);
}

export function startAutoTranslate() {
  if (typeof document === "undefined") return () => {};
  let scheduled = false;
  const pending = new Set();
  const flush = () => {
    scheduled = false;
    obs.disconnect();
    pending.forEach((n) => n.isConnected && walk(n));
    pending.clear();
    obs.observe(document.body, cfg);
  };
  const cfg = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };
  const obs = new MutationObserver((muts) => {
    for (const m of muts) pending.add(m.type === "childList" ? m.target : m.target.nodeType === 3 ? m.target.parentNode : m.target);
    if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
  });
  walk(document.body);
  obs.observe(document.body, cfg);
  return () => obs.disconnect();
}
