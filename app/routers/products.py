from typing import List
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.database import get_session
from app.models import Product
from app.schemas import ProductRead

router = APIRouter(prefix="/api/v1/products", tags=["products"])


@router.get("", response_model=List[ProductRead])
def list_products(session: Session = Depends(get_session)):
    return session.exec(select(Product)).all()
