"""Idempotence des opérations sensibles (en-tête « Idempotency-Key »).
Même clé + même contenu → la réponse d'origine est rejouée (aucune seconde opération) ; même clé + contenu différent → refus ;
même clé pendant que la première requête tourne encore → 409. Un refus sans effet (validation, plafond…) libère la clé ; un refus de paiement (402) est rejoué."""
import hashlib
import json
from typing import Callable

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.money.models import MoneyIdempotency


def run(session: Session, user_id: int, scope: str, key: str, payload: dict, fn: Callable[[], dict], status_code: int = 200):
    key = (key or "").strip()
    if not (8 <= len(key) <= 80):
        raise HTTPException(status_code=400, detail="En-tête Idempotency-Key requis (8 à 80 caractères).")
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
    row = session.exec(select(MoneyIdempotency).where(MoneyIdempotency.user_id == user_id, MoneyIdempotency.scope == scope, MoneyIdempotency.key == key)).first()
    if row is None:
        session.add(MoneyIdempotency(user_id=user_id, scope=scope, key=key, request_hash=digest))
        try:
            session.commit()
        except IntegrityError:  # requête jumelle simultanée
            session.rollback()
            raise HTTPException(status_code=409, detail="Cette opération est déjà en cours de traitement.")
    else:
        if row.request_hash != digest:
            raise HTTPException(status_code=422, detail="Cette clé d'idempotence a déjà servi pour une autre opération.")
        if row.state != "done":
            raise HTTPException(status_code=409, detail="Cette opération est déjà en cours de traitement.")
        data = json.loads(row.response_json)
        if row.status_code >= 400:
            raise HTTPException(status_code=row.status_code, detail=data.get("detail"))
        return JSONResponse(data, status_code=row.status_code)

    def _finish(code: int, body: dict) -> None:
        r = session.exec(select(MoneyIdempotency).where(MoneyIdempotency.user_id == user_id, MoneyIdempotency.scope == scope, MoneyIdempotency.key == key)).one()
        r.state, r.status_code, r.response_json = "done", code, json.dumps(body, default=str)
        session.add(r); session.commit()

    def _release() -> None:
        session.rollback()
        r = session.exec(select(MoneyIdempotency).where(MoneyIdempotency.user_id == user_id, MoneyIdempotency.scope == scope, MoneyIdempotency.key == key)).first()
        if r:
            session.delete(r); session.commit()

    try:
        out = fn()
    except HTTPException as e:
        if e.status_code == 402:  # paiement refusé : on garde la trace et on la rejoue
            _finish(402, {"detail": e.detail})
        else:
            _release()
        raise
    except Exception:
        _release()
        raise
    _finish(status_code, out)
    return JSONResponse(out, status_code=status_code)
