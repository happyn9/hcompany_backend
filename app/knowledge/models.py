from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class KnowledgeEntry(SQLModel, table=True):
    """Une paire question → réponse que l'assistante a APPRISE (réponse d'un agent, ajout/correction de l'admin).
    Ce n'est pas un réseau de neurones : c'est un apprentissage par mémoire + recherche (BM25), amélioré par les 👍/👎."""
    id: Optional[int] = Field(default=None, primary_key=True)
    question: str
    answer: str
    lang: str = Field(default="fr", index=True)
    source: str = Field(default="agent", index=True)  # db | agent | admin
    uses: int = 0
    helpful: int = 0
    unhelpful: int = 0
    active: bool = Field(default=True, index=True)
    thread_code: Optional[str] = Field(default=None, index=True)  # conversation d'origine (évite les doublons)
    created_at: datetime = Field(default_factory=datetime.utcnow)
