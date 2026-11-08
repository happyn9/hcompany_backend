// Données structurelles des services — le texte lui-même reste dans
// translations.js (via les clés ci-dessous), pour rester bilingue. Ce
// fichier sert de source unique à la fois à la section catalogue et aux
// pages de détail par service, pour ne jamais les laisser diverger.

export const SERVICES_META = [
  {
    slug: "cybersecurite",
    key: "s1",
    categoryKey: "security",
    priceFrom: 150,
    unitKey: "audit",
    tagKey: "popular",
    image: "cybersecurity,africa,office",
  },
  {
    slug: "developpement",
    key: "s2",
    categoryKey: "dev",
    priceFrom: 450,
    unitKey: "project",
    tagKey: null,
    image: "developer,africa,laptop",
  },
  {
    slug: "design",
    key: "s3",
    categoryKey: "design",
    priceFrom: 200,
    unitKey: "project",
    tagKey: null,
    image: "designer,africa,studio",
  },
  {
    slug: "infrastructure",
    key: "s4",
    categoryKey: "infra",
    priceFrom: 300,
    unitKey: "month",
    tagKey: null,
    image: "datacenter,africa,server",
  },
  {
    slug: "maintenance",
    key: "s5",
    categoryKey: "support",
    priceFrom: 150,
    unitKey: "month",
    tagKey: "noCommitment",
    image: "callcenter,africa,support",
  },
];

export const UNIT_LABEL = {
  fr: { audit: "audit", project: "projet", month: "mois" },
  en: { audit: "audit", project: "project", month: "month" },
};

export function findServiceBySlug(slug) {
  return SERVICES_META.find((s) => s.slug === slug);
}
