import logging
from contextlib import asynccontextmanager
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlmodel import Session, select

from app.config import settings
from app.database import engine
from app.middleware import SecurityHeadersMiddleware
from app.models import Course, Product, User, UserRole
from app.routers.learning import sync_course_from_youtube
from app.routers.learning_plans import seed_learning_plans
from app.services.youtube import parse_playlist_id
from app.routers import auth, partners, learning, learning_plans, products, contact, onboarding, notifications, services, partner_modules, qr_login
from app.lukondo.routers import parcels as lukondo_parcels
from app.lukondo.routers import rooms as lukondo_rooms
from app.lukondo.routers import bus as lukondo_bus
from app.shopping.routers import admin as shopping_admin, agency as shopping_agency, buyer as shopping_buyer, catalog as shopping_catalog, seller as shopping_seller
from app.shopping.services import seed_shopping
from app.transport.routers import admin as transport_admin, operator as transport_operator, public as transport_public
from app.transport import cargo as transport_cargo
from app import agents as agents_module
from app.restaurant.routers import admin as restaurant_admin, owner as restaurant_owner, public as restaurant_public
from app.lodging.routers import admin as lodging_admin, catalog as lodging_catalog, guest as lodging_guest, host as lodging_host
from app.services.rate_limit import limiter

SEED_COURSES = [
    {
        "title": "Cybersécurité pour débutants",
        "category": "Cybersécurité",
        "level": "Initiation",
        "description": "Les bons réflexes pour protéger un système et reconnaître les menaces courantes.",
    },
    {
        "title": "Développement mobile avec Flutter",
        "category": "Développement",
        "level": "Intermédiaire",
        "description": "Construire une application mobile complète, de l'interface à la mise en ligne.",
    },
    {
        "title": "Design d'interfaces",
        "category": "Design",
        "level": "Initiation",
        "description": "Concevoir des écrans clairs et agréables à utiliser, sans expérience préalable.",
    },
    {
        "title": "Gestion de projet IT",
        "category": "Gestion",
        "level": "Intermédiaire",
        "description": "Cadrer, planifier et livrer un projet informatique dans les délais annoncés.",
    },
    {
        "title": "Entrepreneuriat numérique",
        "category": "Business",
        "level": "Tous niveaux",
        "description": "Structurer une idée d'entreprise digitale, du modèle économique au lancement.",
    },
]

SEED_PRODUCTS = [
    {
        "name": "Développement sur mesure",
        "category": "Développement web & mobile",
        "description": "Applications web et mobiles conçues et développées pour un besoin spécifique.",
        "partner_name": "H-Company",
    },
    {
        "name": "Audit cybersécurité",
        "category": "Cybersécurité",
        "description": "Évaluation de la sécurité de vos systèmes et recommandations concrètes.",
        "partner_name": "H-Company",
    },
    {
        "name": "Identité visuelle & design",
        "category": "Design",
        "description": "Logo, charte graphique et interfaces pensés pour votre marque.",
        "partner_name": "H-Company",
    },
]


logger = logging.getLogger("hcompany.startup")



def _ensure_default_playlist_course(session: Session) -> None:
    """Si YOUTUBE_DEFAULT_PLAYLIST_ID est défini et qu'aucun cours n'a encore
    de playlist, crée le cours « Chaîne H-Learning » et importe ses vidéos.
    Une panne YouTube ne bloque jamais le démarrage."""
    playlist = parse_playlist_id(settings.youtube_default_playlist_id)
    if not playlist:
        return
    if session.exec(select(Course).where(Course.youtube_playlist_id != None)).first():  # noqa: E711
        return
    course = Course(
        title="Les formations H-Learning",
        level="Tous niveaux",
        description="Toutes les vidéos de la chaîne H-Learning, à suivre gratuitement et à votre rythme.",
        youtube_playlist_id=playlist,
        sort_order=-1,
    )
    session.add(course)
    session.commit()
    session.refresh(course)
    try:
        sync_course_from_youtube(session, course)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Import YouTube initial impossible : %s", exc)


def seed_data() -> None:
    with Session(engine) as session:
        if settings.auth_legacy_database_url:  # reprise unique des comptes de l'ancien service auth
            try:
                from app.auth_core.legacy_import import import_legacy_users
                import_legacy_users(session, settings.auth_legacy_database_url)
            except Exception:
                logger.exception("Reprise des comptes de l'ancien service auth impossible — vérifiez AUTH_LEGACY_DATABASE_URL.")
                session.rollback()
        if not session.exec(select(Course)).first():
            session.add_all([Course(sort_order=i, **c) for i, c in enumerate(SEED_COURSES)])
            session.flush()
        _ensure_default_playlist_course(session)
        seed_learning_plans(session)
        seed_shopping(session)
        if not session.exec(select(Product)).first():
            session.add_all([Product(**p) for p in SEED_PRODUCTS])

        # Compte admin de secours en dev, pour tester le flux d'approbation
        # partenaire sans devoir bricoler la base à la main. À ne surtout pas
        # laisser en production avec ce mot de passe.
        if not settings.is_production:
            admin_email = "admin@h-company.africa"
            admin_password = "changeme123"

            # Le mot de passe vit dans le compte central (tables authuser, intégrées à cette base).
            from app.auth_core.models import AuthUser
            from app.auth_core.service import hash_password
            if not session.exec(select(AuthUser).where(AuthUser.email == admin_email)).first():
                session.add(AuthUser(email=admin_email, hashed_password=hash_password(admin_password),
                                     full_name="Admin H-Company (dev)", is_verified=True))
                session.flush()

            if not session.exec(select(User).where(User.email == admin_email)).first():
                session.add(
                    User(
                        email=admin_email,
                        full_name="Admin H-Company (dev)",
                        role=UserRole.admin,
                        is_verified=True,
                    )
                )
        session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_data()
    yield


# Supervision des erreurs — n'a aucun effet tant que SENTRY_DSN n'est pas
# renseigné dans .env (comportement par défaut, pas besoin de compte pour
# développer ou tester). Créez un projet gratuit sur sentry.io pour obtenir
# ce DSN quand vous serez prêt à surveiller les erreurs de production.
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        # Capture un échantillon des requêtes pour le suivi de performance,
        # sans pour autant tout envoyer (coûteux et peu utile en pratique).
        traces_sample_rate=0.1,
    )

app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Réponse uniforme (pas la trace Pydantic brute) pour ne pas fuiter de
    # détails d'implémentation au client en cas de payload malformé.
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        # `ctx` peut contenir l'exception d'origine (ValueError d'un validateur
        # personnalisé), non sérialisable en JSON : on ne garde que le message.
        content={"detail": "Données invalides.", "errors": [{k: v for k, v in e.items() if k != "ctx"} for e in exc.errors()]},
    )


# Fichiers statiques uploadés (logos de services, etc.) — le dossier est
# créé au chargement de app.routers.services s'il n'existe pas encore.
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
from app.upload_store import DbFallbackStaticFiles  # noqa: E402
app.mount("/uploads", DbFallbackStaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.include_router(auth.router)
app.include_router(partners.router)
app.include_router(partner_modules.router)
app.include_router(qr_login.router)
app.include_router(learning.router)
app.include_router(learning_plans.router)
app.include_router(products.router)
app.include_router(contact.router)
app.include_router(onboarding.router)
app.include_router(notifications.router)
app.include_router(services.router)
app.include_router(lukondo_parcels.router)
app.include_router(lukondo_rooms.router)
app.include_router(lukondo_bus.router)
app.include_router(shopping_catalog.router)
app.include_router(shopping_buyer.router)
app.include_router(shopping_seller.router)
app.include_router(shopping_agency.router)
app.include_router(shopping_admin.router)
app.include_router(lodging_catalog.router)
app.include_router(lodging_guest.router)
app.include_router(lodging_host.router)
app.include_router(lodging_admin.router)
app.include_router(restaurant_public.router)
app.include_router(restaurant_owner.router)
app.include_router(restaurant_admin.router)
app.include_router(transport_public.router)
app.include_router(transport_operator.router)
app.include_router(transport_admin.router)
app.include_router(agents_module.admin)
app.include_router(agents_module.agent)
app.include_router(agents_module.support)
app.include_router(transport_cargo.public)
app.include_router(transport_cargo.operator)


@app.get("/")
def root():
    return {"name": settings.app_name, "status": "ok", "environment": settings.environment}


@app.get("/health")
def health():
    return {"status": "ok"}
