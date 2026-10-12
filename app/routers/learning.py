import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlmodel import Session, delete, func, select

from app.config import settings
from app.database import engine, get_session
from app.deps import get_current_admin, get_current_user, get_optional_user
from app.models import (
    CompanyTrainingRequest,
    Course,
    Lesson,
    LessonProgress,
    RegistrationStatus,
    TrainingRegistration,
    User,
)
from app.schemas import (
    TRAINING_PLAN_PRICES,
    CompanyTrainingRequestCreate,
    CompanyTrainingRequestRead,
    CompanyTrainingRequestStatusUpdate,
    CourseAdminRead,
    CourseAdminWrite,
    CourseDetailRead,
    CourseRead,
    LessonAdminWrite,
    LessonProgressRead,
    LessonProgressWrite,
    LessonRead,
    TrainingRegistrationCreate,
    TrainingRegistrationRead,
    TrainingRegistrationStatusUpdate,
    _lines,
)
from app.services.notifications import send_email
from app.services.rate_limit import limiter
from app.services.youtube import (
    YouTubeError,
    fetch_playlist,
    parse_playlist_id,
    parse_video_id,
    thumbnail_for,
)

logger = logging.getLogger("hcompany.learning")

router = APIRouter(prefix="/api/v1/learning", tags=["learning"])


# --------------------------------------------------------------------------
# Synchronisation YouTube
# --------------------------------------------------------------------------

def sync_course_from_youtube(session: Session, course: Course) -> int:
    """Importe/actualise les leçons d'un cours depuis sa playlist YouTube.

    - une vidéo déjà connue est mise à jour (titre, durée...) sans perdre sa
      progression ;
    - une vidéo retirée de la playlist est dépubliée, pas supprimée ;
    - les leçons ajoutées à la main ne sont jamais touchées.
    Retourne le nombre de vidéos vues dans la playlist."""
    if not course.youtube_playlist_id:
        raise YouTubeError("Ce cours n'a pas de playlist YouTube.")
    items = fetch_playlist(course.youtube_playlist_id)
    if not items:
        raise YouTubeError("La playlist est vide.")

    existing = {
        l.youtube_id: l
        for l in session.exec(
            select(Lesson).where(Lesson.course_id == course.id, Lesson.source == "youtube")
        ).all()
    }
    seen = set()
    for position, item in enumerate(items, start=1):
        seen.add(item["youtube_id"])
        lesson = existing.get(item["youtube_id"])
        if lesson is None:
            lesson = Lesson(course_id=course.id, youtube_id=item["youtube_id"], source="youtube", title=item["title"])
        lesson.title = item["title"] or lesson.title
        lesson.description = item.get("description") or lesson.description
        lesson.thumbnail_url = thumbnail_for(item["youtube_id"])
        lesson.position = position
        lesson.published_at = item.get("published_at")
        if item.get("duration_seconds"):
            lesson.duration_seconds = item["duration_seconds"]
        lesson.is_published = True
        session.add(lesson)
    for vid, lesson in existing.items():
        if vid not in seen:
            lesson.is_published = False
            session.add(lesson)
    course.synced_at = datetime.utcnow()
    session.add(course)
    session.commit()
    return len(items)


def _refresh_course_in_background(course_id: int) -> None:
    """Rafraîchit un cours en tâche de fond ; n'échoue jamais bruyamment —
    le visiteur voit les leçons déjà en base, c'est tout."""
    try:
        with Session(engine) as session:
            course = session.get(Course, course_id)
            if course and course.youtube_playlist_id:
                sync_course_from_youtube(session, course)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Rafraîchissement YouTube du cours %s impossible : %s", course_id, exc)


def _is_stale(course: Course) -> bool:
    if not course.youtube_playlist_id:
        return False
    if not course.synced_at:
        return True
    return datetime.utcnow() - course.synced_at > timedelta(hours=settings.youtube_refresh_hours)


# --------------------------------------------------------------------------
# Catalogue public — tout est gratuit à regarder
# --------------------------------------------------------------------------

def _stats(session: Session) -> dict[int, tuple[int, int]]:
    rows = session.exec(
        select(Lesson.course_id, func.count(Lesson.id), func.coalesce(func.sum(Lesson.duration_seconds), 0))
        .where(Lesson.is_published == True)  # noqa: E712
        .group_by(Lesson.course_id)
    ).all()
    return {cid: (n, int(total or 0)) for cid, n, total in rows}


def _course_read(course: Course, stats: dict[int, tuple[int, int]]) -> CourseRead:
    n, total = stats.get(course.id, (0, 0))
    return CourseRead(
        id=course.id, title=course.title, level=course.level, description=course.description,
        category=course.category, image_url=course.image_url, lesson_count=n, total_seconds=total,
    )


@router.get("/courses", response_model=List[CourseRead])
def list_courses(session: Session = Depends(get_session)):
    courses = session.exec(
        select(Course).where(Course.is_published == True).order_by(Course.sort_order, Course.id)  # noqa: E712
    ).all()
    stats = _stats(session)
    return [_course_read(c, stats) for c in courses]


@router.get("/courses/{course_id}", response_model=CourseDetailRead)
def get_course(course_id: int, background: BackgroundTasks, session: Session = Depends(get_session)):
    course = session.get(Course, course_id)
    if not course or not course.is_published:
        raise HTTPException(status_code=404, detail="Cours introuvable.")
    if _is_stale(course):
        background.add_task(_refresh_course_in_background, course.id)
    lessons = session.exec(
        select(Lesson)
        .where(Lesson.course_id == course.id, Lesson.is_published == True)  # noqa: E712
        .order_by(Lesson.position, Lesson.id)
    ).all()
    base = _course_read(course, {course.id: (len(lessons), sum(l.duration_seconds or 0 for l in lessons))})
    return CourseDetailRead(
        **base.model_dump(),
        outcomes=_lines(course.outcomes),
        requirements=_lines(course.requirements),
        youtube_playlist_id=course.youtube_playlist_id,
        lessons=[LessonRead.model_validate(l) for l in lessons],
    )


# --------------------------------------------------------------------------
# Progression (utilisateur connecté) — les visiteurs gardent la leur en local
# --------------------------------------------------------------------------

@router.get("/me/progress", response_model=List[LessonProgressRead])
def my_progress(
    course_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    query = select(LessonProgress).where(LessonProgress.user_id == current_user.id)
    if course_id is not None:
        query = query.join(Lesson, Lesson.id == LessonProgress.lesson_id).where(Lesson.course_id == course_id)
    return session.exec(query).all()


@router.put("/lessons/{lesson_id}/progress", response_model=LessonProgressRead)
def save_progress(
    lesson_id: int,
    payload: LessonProgressWrite,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not session.get(Lesson, lesson_id):
        raise HTTPException(status_code=404, detail="Leçon introuvable.")
    row = session.exec(
        select(LessonProgress).where(
            LessonProgress.user_id == current_user.id, LessonProgress.lesson_id == lesson_id
        )
    ).first()
    if not row:
        row = LessonProgress(user_id=current_user.id, lesson_id=lesson_id)
    # une leçon terminée le reste, même si la personne revoit le début
    row.completed = row.completed or payload.completed
    row.position_seconds = payload.position_seconds
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


# --------------------------------------------------------------------------
# Inscription à une formation en présentiel
# --------------------------------------------------------------------------

@router.post("/registrations", response_model=TrainingRegistrationRead, status_code=201)
@limiter.limit("10/hour")
def register_in_person(
    request: Request,
    payload: TrainingRegistrationCreate,
    session: Session = Depends(get_session),
    user: Optional[User] = Depends(get_optional_user),
):
    """Inscription publique : la personne laisse ses coordonnées, l'équipe
    la recontacte pour le lieu et les dates. Rattachée au compte si la
    personne est connectée, sans l'exiger."""
    course = session.get(Course, payload.course_id) if payload.course_id else None
    if payload.course_id and not course:
        raise HTTPException(status_code=422, detail="Cours inconnu.")

    reg = TrainingRegistration(
        user_id=user.id if user else None,
        full_name=payload.full_name.strip(),
        email=payload.email,
        phone=(payload.phone or "").strip() or None,
        city=(payload.city or "").strip() or None,
        course_id=course.id if course else None,
        course_title=course.title if course else None,
        availability=(payload.availability or "").strip() or None,
        message=(payload.message or "").strip() or None,
    )
    session.add(reg)
    session.commit()
    session.refresh(reg)

    try:
        send_email(
            payload.email,
            "H-Learning — Votre inscription à la formation en présentiel",
            f"Bonjour {reg.full_name},\n\n"
            f"Nous avons bien reçu votre inscription"
            f"{' pour « ' + reg.course_title + ' »' if reg.course_title else ''}. "
            "Notre équipe vous contactera très prochainement pour convenir du lieu, "
            "des dates et des modalités de la formation en présentiel.\n\n"
            "En attendant, toutes les vidéos restent gratuites sur le site.\n\n"
            "— L'équipe H-Company",
        )
    except Exception as exc:  # noqa: BLE001 — l'inscription est déjà enregistrée
        logger.warning("E-mail de confirmation d'inscription non envoyé : %s", exc)
    return reg


@router.get("/me/registrations", response_model=List[TrainingRegistrationRead])
def my_registrations(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return session.exec(
        select(TrainingRegistration)
        .where(TrainingRegistration.user_id == current_user.id)
        .order_by(TrainingRegistration.created_at.desc())
    ).all()


# --------------------------------------------------------------------------
# Formation d'équipe (entreprise inscrivant plusieurs employés)
# --------------------------------------------------------------------------

@router.post("/company-enrollment", response_model=CompanyTrainingRequestRead, status_code=201)
def submit_company_enrollment(
    payload: CompanyTrainingRequestCreate,
    session: Session = Depends(get_session),
):
    """Point d'entrée public du formulaire "Formation d'équipe" — pas
    d'authentification requise : une entreprise intéressée n'a pas
    nécessairement de compte H-Company. Le prix est recalculé ici à partir
    de la grille serveur, jamais reçu tel quel du client."""
    price = TRAINING_PLAN_PRICES.get(payload.plan)
    if price is None:
        raise HTTPException(status_code=422, detail="Formule invalide.")

    request = CompanyTrainingRequest(
        company=payload.company,
        contact_name=payload.contact_name,
        contact_email=payload.contact_email,
        employee_count=payload.employee_count,
        domains=", ".join(payload.domains),
        plan=payload.plan,
        monthly_price_per_employee=price,
        estimated_total=price * payload.employee_count,
        message=payload.message,
    )
    session.add(request)
    session.commit()
    session.refresh(request)

    send_email(
        payload.contact_email,
        "H-Company — Votre demande de formation d'équipe",
        f"Bonjour {payload.contact_name},\n\n"
        f"Nous avons bien reçu votre demande pour {payload.employee_count} employé(s) de {payload.company} "
        f"sur la formule {payload.plan} mois (environ {request.estimated_total:.0f} $/mois, à confirmer). "
        "Notre équipe vous recontactera très prochainement pour finaliser les modalités.\n\n"
        "— L'équipe H-Company",
    )

    return request


# --------------------------------------------------------------------------
# Admin
# --------------------------------------------------------------------------

@router.get("/admin/company-enrollments", response_model=List[CompanyTrainingRequestRead])
def admin_list_company_enrollments(
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    return session.exec(
        select(CompanyTrainingRequest).order_by(CompanyTrainingRequest.created_at.desc())
    ).all()


@router.patch("/admin/company-enrollments/{request_id}/status", response_model=CompanyTrainingRequestRead)
def admin_update_company_enrollment_status(
    request_id: int,
    payload: CompanyTrainingRequestStatusUpdate,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    request = session.get(CompanyTrainingRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Demande introuvable.")
    request.status = payload.status
    session.add(request)
    session.commit()
    session.refresh(request)
    return request


@router.get("/admin/registrations", response_model=List[TrainingRegistrationRead])
def admin_list_registrations(
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    return session.exec(
        select(TrainingRegistration).order_by(TrainingRegistration.created_at.desc())
    ).all()


@router.patch("/admin/registrations/{registration_id}/status", response_model=TrainingRegistrationRead)
def admin_update_registration_status(
    registration_id: int,
    payload: TrainingRegistrationStatusUpdate,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    reg = session.get(TrainingRegistration, registration_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Inscription introuvable.")
    try:
        reg.status = RegistrationStatus(payload.status)
    except ValueError:
        raise HTTPException(status_code=422, detail="Statut invalide.")
    session.add(reg)
    session.commit()
    session.refresh(reg)
    return reg


def _admin_course(course: Course, session: Session) -> CourseAdminRead:
    n_total = session.exec(select(func.count(Lesson.id)).where(Lesson.course_id == course.id)).one()
    base = _course_read(course, _stats(session))
    data = base.model_dump()
    data["lesson_count"] = int(n_total)
    return CourseAdminRead(
        **data,
        outcomes=course.outcomes, requirements=course.requirements,
        youtube_playlist_id=course.youtube_playlist_id, sort_order=course.sort_order,
        is_published=course.is_published, synced_at=course.synced_at,
    )


def _apply_course_payload(course: Course, payload: CourseAdminWrite) -> None:
    playlist = None
    if payload.youtube_playlist and payload.youtube_playlist.strip():
        playlist = parse_playlist_id(payload.youtube_playlist)
        if not playlist:
            raise HTTPException(status_code=422, detail="Lien ou identifiant de playlist YouTube invalide.")
    if playlist != course.youtube_playlist_id:
        course.synced_at = None  # nouvelle playlist : à resynchroniser
    course.youtube_playlist_id = playlist
    course.title = payload.title.strip()
    course.level = payload.level.strip() or "Tous niveaux"
    course.description = payload.description.strip()
    course.category = payload.category.strip() or "Numérique"
    course.image_url = (payload.image_url or "").strip() or None
    course.outcomes = payload.outcomes.strip()
    course.requirements = payload.requirements.strip()
    course.sort_order = payload.sort_order
    course.is_published = payload.is_published


@router.get("/admin/courses", response_model=List[CourseAdminRead])
def admin_list_courses(session: Session = Depends(get_session), _admin: User = Depends(get_current_admin)):
    courses = session.exec(select(Course).order_by(Course.sort_order, Course.id)).all()
    return [_admin_course(c, session) for c in courses]


@router.post("/admin/courses", response_model=CourseAdminRead, status_code=201)
def admin_create_course(
    payload: CourseAdminWrite,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    course = Course(title=payload.title, level=payload.level, description=payload.description)
    _apply_course_payload(course, payload)
    session.add(course)
    session.commit()
    session.refresh(course)
    if course.youtube_playlist_id:
        try:
            sync_course_from_youtube(session, course)
        except YouTubeError as exc:
            logger.info("Cours %s créé sans import YouTube : %s", course.id, exc)
    return _admin_course(course, session)


@router.put("/admin/courses/{course_id}", response_model=CourseAdminRead)
def admin_update_course(
    course_id: int,
    payload: CourseAdminWrite,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Cours introuvable.")
    _apply_course_payload(course, payload)
    session.add(course)
    session.commit()
    session.refresh(course)
    return _admin_course(course, session)


@router.delete("/admin/courses/{course_id}", status_code=204)
def admin_delete_course(
    course_id: int,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Cours introuvable.")
    lesson_ids = [l.id for l in session.exec(select(Lesson).where(Lesson.course_id == course_id)).all()]
    if lesson_ids:
        session.exec(delete(LessonProgress).where(LessonProgress.lesson_id.in_(lesson_ids)))
        session.exec(delete(Lesson).where(Lesson.course_id == course_id))
    # les inscriptions gardent leur copie du titre
    for reg in session.exec(select(TrainingRegistration).where(TrainingRegistration.course_id == course_id)).all():
        reg.course_id = None
        session.add(reg)
    session.delete(course)
    session.commit()


@router.post("/admin/courses/{course_id}/sync", response_model=CourseAdminRead)
def admin_sync_course(
    course_id: int,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Cours introuvable.")
    try:
        sync_course_from_youtube(session, course)
    except YouTubeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    session.refresh(course)
    return _admin_course(course, session)


@router.get("/admin/courses/{course_id}/lessons", response_model=List[LessonRead])
def admin_list_lessons(
    course_id: int,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    return session.exec(
        select(Lesson).where(Lesson.course_id == course_id).order_by(Lesson.position, Lesson.id)
    ).all()


@router.post("/admin/courses/{course_id}/lessons", response_model=LessonRead, status_code=201)
def admin_add_lesson(
    course_id: int,
    payload: LessonAdminWrite,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    if not session.get(Course, course_id):
        raise HTTPException(status_code=404, detail="Cours introuvable.")
    video_id = parse_video_id(payload.youtube_url)
    if not video_id:
        raise HTTPException(status_code=422, detail="Lien YouTube invalide.")
    last = session.exec(select(func.max(Lesson.position)).where(Lesson.course_id == course_id)).one()
    lesson = Lesson(
        course_id=course_id, title=payload.title.strip(), description=payload.description.strip(),
        section=payload.section.strip(), youtube_id=video_id, thumbnail_url=thumbnail_for(video_id),
        position=payload.position if payload.position is not None else (last or 0) + 1,
        source="manual", is_published=payload.is_published,
    )
    session.add(lesson)
    session.commit()
    session.refresh(lesson)
    return lesson


@router.delete("/admin/lessons/{lesson_id}", status_code=204)
def admin_delete_lesson(
    lesson_id: int,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    lesson = session.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Leçon introuvable.")
    session.exec(delete(LessonProgress).where(LessonProgress.lesson_id == lesson_id))
    session.delete(lesson)
    session.commit()
