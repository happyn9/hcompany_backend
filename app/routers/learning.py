from typing import List
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.database import get_session
from app.models import Course
from app.schemas import CourseRead

router = APIRouter(prefix="/api/v1/learning", tags=["learning"])


@router.get("/courses", response_model=List[CourseRead])
def list_courses(session: Session = Depends(get_session)):
    return session.exec(select(Course)).all()
