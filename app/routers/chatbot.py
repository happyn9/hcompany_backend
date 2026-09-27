import os
import time
from collections import defaultdict, deque
from typing import Literal

from anthropic import APIError, AsyncAnthropic
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/chat", tags=["chat"])

MODEL = os.getenv("CHAT_MODEL", "claude-haiku-4-5-20251001")
MAX_HISTORY = 20            # messages envoyés au modèle
RATE_LIMIT = 20             # requêtes max…
RATE_WINDOW_S = 10 * 60     # …par IP sur 10 minutes

_client: AsyncAnthropic | None = None


def get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise HTTPException(503, "Chat indisponible : ANTHROPIC_API_KEY manquante.")
        _client = AsyncAnthropic()
    return _client


# ───────────────────────── Connaissances H-Company ─────────────────────────
# ⚠️ Tout ce qu'Avila affirme sur H-Company vient d'ici. Mets à jour ce
# texte quand une offre, un prix ou un partenaire change.
KNOWLEDGE = """
H-COMPANY : plateforme multi-services qui relie des agences partenaires et
leurs clients, principalement entre la RDC et la Zambie (dont la diaspora).

SERVICES (5 métiers) : cybersécurité, développement web & mobile, design,
infrastructure IT, maintenance.

TARIFS (formules mensuelles, sans engagement de durée) :
- Starter : 150 $ / mois
- Pro : 450 $ / mois (la plus choisie)
- Entreprise : 1200 $ / mois

RÉSEAU DE PARTENAIRES :
- Lukondo : transport en bus, envoi de colis, lodge, transfert d'argent
  entre la RDC et la Zambie.
- Confismila : restaurant.
- H-learning : formation courte et pratique (cybersécurité, développement,
  design), avec des formateurs internes et partenaires.
- U-Study : application mobile.
Chaque partenaire a son propre espace sur la plateforme.

DEVENIR PARTENAIRE (agences) : l'outil est gratuit pour l'agence ;
H-Company prend seulement une commission sur les nouveaux clients qu'elle
lui apporte. Aucun coût ni engagement pour l'agence. Pour candidater :
formulaire « Rejoindre le réseau » en bas de la page d'accueil. L'équipe
étudie la candidature et, si elle est approuvée, envoie un contrat et des
offres visibles dans l'espace partenaire.

CONTACT : le formulaire « Rejoindre le réseau » en bas de page ; un membre
de l'équipe répond rapidement.
""".strip()

SYSTEM_PROMPT = f"""Tu es Avila, l'assistante du site H-Company.

Ton rôle : répondre à TOUTES les questions des visiteurs, clairement et
chaleureusement.
- Questions sur H-Company : réponds uniquement à partir de la fiche
  ci-dessous. Si l'information n'y est pas (un délai précis, un prix non
  listé, une disponibilité…), dis-le honnêtement, n'invente jamais, et
  propose le formulaire de contact.
- Questions générales (tech, conseils, culture, pratique…) : réponds
  normalement et utilement, puis, si c'est naturel, fais le lien avec ce
  que H-Company peut apporter.
- Refuse poliment ce qui est dangereux, illégal ou offensant.

Style :
- Réponds dans la langue du visiteur (français par défaut, anglais si
  on t'écrit en anglais, etc.).
- Court : 2 à 5 phrases, sauf si on te demande des détails ou des étapes.
- Texte simple, sans Markdown (pas de **, #, ni tableaux). Tu peux faire
  des listes avec des tirets et des retours à la ligne.
- Quand tu recommandes le formulaire « Rejoindre le réseau », termine ta
  réponse par le marqueur exact [FORM] (le site affichera un bouton).

FICHE H-COMPANY :
{KNOWLEDGE}
"""


# ───────────────────────── Schémas ─────────────────────────
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=60)
    lang: Literal["fr", "en"] = "fr"


class ChatResponse(BaseModel):
    reply: str
    show_form: bool = False


# ───────────────────────── Limitation de débit ─────────────────────────
_hits: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    # Render place l'IP réelle dans X-Forwarded-For
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(ip: str) -> None:
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > RATE_WINDOW_S:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        raise HTTPException(429, "Trop de messages, réessayez dans quelques minutes.")
    q.append(now)


def _clean_history(messages: list[ChatMessage]) -> list[dict]:
    """L'API exige : commencer par « user » et alterner les rôles."""
    out: list[dict] = []
    for m in messages[-MAX_HISTORY:]:
        text = m.content.strip()
        if not text:
            continue
        if not out and m.role != "user":
            continue  # on saute le message d'accueil du bot
        if out and out[-1]["role"] == m.role:
            out[-1]["content"] += "\n\n" + text  # fusionne deux messages du même rôle
        else:
            out.append({"role": m.role, "content": text})
    if not out or out[-1]["role"] != "user":
        raise HTTPException(422, "Le dernier message doit venir du visiteur.")
    return out


# ───────────────────────── Route ─────────────────────────
@router.post("", response_model=ChatResponse)
async def chat(body: ChatRequest, request: Request) -> ChatResponse:
    _check_rate_limit(_client_ip(request))
    history = _clean_history(body.messages)
    system = SYSTEM_PROMPT + (
        "\nLangue de l'interface : anglais." if body.lang == "en" else "\nLangue de l'interface : français."
    )

    try:
        resp = await get_client().messages.create(
            model=MODEL,
            max_tokens=600,
            system=system,
            messages=history,
        )
    except APIError as exc:
        raise HTTPException(502, "L'assistant est momentanément indisponible.") from exc

    text = "".join(block.text for block in resp.content if block.type == "text").strip()
    show_form = "[FORM]" in text
    text = text.replace("[FORM]", "").strip()
    if not text:
        raise HTTPException(502, "Réponse vide de l'assistant.")
    return ChatResponse(reply=text, show_form=show_form)