"""Recherche BM25 (stdlib uniquement) FR/EN sur : paires apprises + contenu de la base (services, cours, boutiques,
produits, logements). Honnêteté : c'est de la RECHERCHE, pas un modèle de langage — l'assistante ne sait que ce qu'on lui a appris
et le dit quand elle n'est pas sûre (confiance sous le seuil → escalade vers un agent)."""
import math
import re
import time
import unicodedata
from collections import Counter
from dataclasses import dataclass, field

STOP = set("""le la les un une des du de d l et ou a au aux en dans sur pour par avec sans ce ces cet cette mon ma mes ton ta tes son sa ses nos notre votre vos
je tu il elle on nous vous ils elles me te se y qui que quoi dont est sont etre ai as avez avons ont fait faire peut peux puis puisje comment quel quelle quels quelles
the a an of to in on for and or is are be do does can i you we they it my your our with from at by this that what how which when where""".split())

SYN = {  # mot → forme canonique (FR/EN), appliqué après normalisation
    "tarif": "prix", "tarifs": "prix", "cout": "prix", "couts": "prix", "price": "prix", "prices": "prix", "pricing": "prix", "cost": "prix", "combien": "prix", "fee": "frais", "fees": "frais", "commission": "frais",
    "bus": "transport", "voyage": "transport", "billet": "transport", "ticket": "transport", "trip": "transport",
    "colis": "colis", "parcel": "colis", "package": "colis", "cargo": "colis",
    "logement": "logement", "hotel": "logement", "lodge": "logement", "maison": "logement", "appartement": "logement", "stay": "logement", "stays": "logement", "room": "logement", "chambre": "logement", "apartment": "logement",
    "argent": "money", "transfert": "money", "envoyer": "envoi", "send": "envoi", "retrait": "retrait", "withdraw": "retrait", "mpesa": "money", "momo": "money", "mobile": "mobile",
    "cours": "formation", "course": "formation", "courses": "formation", "learning": "formation", "formation": "formation", "formations": "formation", "training": "formation", "apprendre": "formation",
    "boutique": "shopping", "shop": "shopping", "acheter": "shopping", "buy": "shopping", "produit": "shopping", "product": "shopping", "shopping": "shopping",
    "partenaire": "partenaire", "partner": "partenaire", "partners": "partenaire", "agence": "partenaire",
    "motdepasse": "password", "mdp": "password", "oublie": "password", "forgot": "password",
    "compte": "compte", "account": "compte", "inscription": "compte", "register": "compte", "signup": "compte",
    "restaurant": "restaurant", "table": "restaurant", "resto": "restaurant", "tourisme": "tourisme", "tourism": "tourisme", "excursion": "tourisme", "tour": "tourisme",
    "traduction": "traduction", "translate": "traduction", "translation": "traduction", "interprete": "traduction", "interpreter": "traduction",
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _stem(w: str) -> str:
    for suf in ("ements", "ement", "ations", "ation", "ing", "ies", "es", "s", "x"):
        if len(w) > len(suf) + 3 and w.endswith(suf):
            return w[: -len(suf)]
    return w


def tokens(text: str) -> list[str]:
    out = []
    for w in norm(text).split():
        if w in STOP or (len(w) < 2 and not w.isdigit()):
            continue
        w = SYN.get(w) or SYN.get(_stem(w)) or _stem(w)
        out.append(SYN.get(w, w))
    return out


@dataclass
class Doc:
    key: str
    kind: str  # learned | service | course | shop | product | property
    question: str
    answer: str
    link: str = ""
    entry_id: int | None = None
    lang: str = ""
    boost: float = 1.0
    toks: Counter = field(default_factory=Counter)
    n: int = 0


class Index:
    def __init__(self, docs: list[Doc]):
        self.docs = docs
        self.df: Counter = Counter()
        for d in docs:
            weighted = tokens(d.question) * 3 + tokens(d.answer)  # le titre / la question pèse triple
            d.toks, d.n = Counter(weighted), len(weighted)
            self.df.update(d.toks.keys())
        self.N = max(1, len(docs))
        self.avg = (sum(d.n for d in docs) / len(docs)) if docs else 1

    def idf(self, t: str) -> float:
        return math.log(1 + (self.N - self.df.get(t, 0) + 0.5) / (self.df.get(t, 0) + 0.5))

    def search(self, query: str, lang: str = "fr", k: int = 3) -> list[tuple[Doc, float, float]]:
        """→ [(doc, score BM25, confiance 0..1)]. Confiance = part du poids (idf) des mots de la question retrouvée dans le doc."""
        q = [t for t in dict.fromkeys(tokens(query))]
        known = [t for t in q if t in self.df]
        if not known:
            return []
        total = sum(self.idf(t) for t in q) or 1
        out = []
        for d in self.docs:
            if d.lang and d.lang != lang and d.kind == "learned":
                continue
            s = hit = 0.0
            for t in known:
                f = d.toks.get(t, 0)
                if not f:
                    continue
                hit += self.idf(t)
                s += self.idf(t) * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * d.n / self.avg))
            if s:
                out.append((d, s * d.boost, min(1.0, hit / total) * min(1.2, d.boost)))
        out.sort(key=lambda r: (r[2], r[1]), reverse=True)
        return out[:k]


_cache: dict = {"at": 0.0, "idx": None}
TTL = 45


def invalidate() -> None:
    _cache["at"] = 0.0


def _txt(*parts) -> str:
    return " ".join(str(p) for p in parts if p).strip()


def build_docs(session) -> list[Doc]:
    from sqlmodel import select
    from app.knowledge.models import KnowledgeEntry
    from app.models import Course, ServiceCatalogItem

    docs: list[Doc] = []
    for e in session.exec(select(KnowledgeEntry).where(KnowledgeEntry.active == True)).all():  # noqa: E712
        # un 👍 net renforce l'entrée, des 👎 la font reculer
        boost = max(0.4, min(1.4, 1 + 0.08 * (e.helpful - 2 * e.unhelpful)))
        docs.append(Doc(f"k{e.id}", "learned", e.question, e.answer, entry_id=e.id, lang=e.lang, boost=boost))
    for s in session.exec(select(ServiceCatalogItem).where(ServiceCatalogItem.disabled == False)).all():  # noqa: E712
        docs.append(Doc(f"s{s.id}", "service", _txt(s.label_fr, s.label_en), _txt(s.description_fr, s.description_en), link=f"/services/{s.key}"))
    for c in session.exec(select(Course).where(Course.is_published == True)).all():  # noqa: E712
        docs.append(Doc(f"c{c.id}", "course", c.title, _txt(c.description, c.category, c.level, c.outcomes.replace("\n", ", ")), link=f"/formations/{c.id}"))
    try:
        from app.shopping.models import Shop, ShopProduct
        for sh in session.exec(select(Shop).where(Shop.status == "approved")).all():
            docs.append(Doc(f"h{sh.id}", "shop", sh.name, _txt(sh.tagline, sh.description, sh.city), link=f"/shopping/boutique/{sh.slug}"))
        for p in session.exec(select(ShopProduct).where(ShopProduct.status == "active").limit(500)).all():
            docs.append(Doc(f"p{p.id}", "product", p.title, _txt(p.description, p.brand), link="/shopping"))
    except Exception:  # noqa: BLE001
        pass
    try:
        from app.lodging.models import Property
        for pr in session.exec(select(Property).where(Property.status == "active").limit(500)).all():
            docs.append(Doc(f"l{pr.id}", "property", pr.title, _txt(pr.summary, pr.city, pr.area, pr.type), link=f"/logement/{pr.slug}"))
    except Exception:  # noqa: BLE001
        pass
    return docs


def get_index(session) -> Index:
    if _cache["idx"] is None or time.monotonic() - _cache["at"] > TTL:
        _cache["idx"], _cache["at"] = Index(build_docs(session)), time.monotonic()
    return _cache["idx"]


KIND_FR = {"service": "le service", "course": "la formation", "shop": "la boutique", "product": "le produit", "property": "le logement"}
KIND_EN = {"service": "the service", "course": "the course", "shop": "the shop", "product": "the product", "property": "the listing"}


def compose(doc: Doc, lang: str) -> str:
    """Réponse affichée : paire apprise telle quelle, ou courte fiche tirée de la base."""
    if doc.kind == "learned":
        return doc.answer
    kind = (KIND_EN if lang == "en" else KIND_FR).get(doc.kind, "")
    desc = doc.answer if len(doc.answer) <= 280 else doc.answer[:277].rsplit(" ", 1)[0] + "…"
    lead = f"I found {kind} “{doc.question}”." if lang == "en" else f"J'ai trouvé {kind} « {doc.question} »."
    return f"{lead} {desc}".strip()


# --- apprentissage depuis les agents ---------------------------------------------------
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_LONGNUM = re.compile(r"\+?\d[\d\s().-]{5,}\d")
_CODE = re.compile(r"\b[A-Z]{1,4}-[A-Z0-9]{4,}\b")


def sanitize(text: str) -> str | None:
    """Masque e-mails, numéros et codes. Renvoie None si le texte parle d'une personne précise (trop risqué à réutiliser)."""
    t = _CODE.sub("[code]", _LONGNUM.sub("[numéro]", _EMAIL.sub("[e-mail]", text or ""))).strip()
    return t or None


def looks_reusable(question: str, answer: str) -> bool:
    return len(tokens(question)) >= 2 and len(answer.strip()) >= 25 and "[" not in answer.replace("[code]", "").replace("[numéro]", "").replace("[e-mail]", "") + ""


def detect_lang(text: str) -> str:
    n = set(norm(text).split())
    en = len(n & {"the", "you", "how", "what", "can", "is", "my", "to", "please", "hello", "thanks"})
    fr = len(n & {"le", "la", "les", "vous", "je", "mon", "est", "pour", "bonjour", "merci", "comment", "quel", "des", "une"})
    return "en" if en > fr else "fr"
