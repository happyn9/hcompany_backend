import logging
from contextlib import asynccontextmanager

import httpx
import sentry_sdk
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlmodel import Session, select

from app.config import settings
from app.database import engine
from app.middleware import SecurityHeadersMiddleware
from app.models import Course, Product, User, UserRole
from app.routers import auth, partners, learning, products, contact, onboarding, notifications
from app.lukondo.routers import parcels as lukondo_parcels
from app.lukondo.routers import rooms as lukondo_rooms
from app.lukondo.routers import bus as lukondo_bus
from app.services.rate_limit import limiter

SEED_COURSES = [
    {
        "title": "Cybersécurité pour débutants",
        "level": "Initiation",
        "description": "Les bons réflexes pour protéger un système et reconnaître les menaces courantes.",
    },
    {
        "title": "Développement mobile avec Flutter",
        "level": "Intermédiaire",
        "description": "Construire une application mobile complète, de l'interface à la mise en ligne.",
    },
    {
        "title": "Design d'interfaces",
        "level": "Initiation",
        "description": "Concevoir des écrans clairs et agréables à utiliser, sans expérience préalable.",
    },
    {
        "title": "Gestion de projet IT",
        "level": "Intermédiaire",
        "description": "Cadrer, planifier et livrer un projet informatique dans les délais annoncés.",
    },
    {
        "title": "Entrepreneuriat numérique",
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


def seed_data() -> None:
    with Session(engine) as session:
        if not session.exec(select(Course)).first():
            session.add_all([Course(**c) for c in SEED_COURSES])
        if not session.exec(select(Product)).first():
            session.add_all([Product(**p) for p in SEED_PRODUCTS])

        # Compte admin de secours en dev, pour tester le flux d'approbation
        # partenaire sans devoir bricoler la base à la main. À ne surtout pas
        # laisser en production avec ce mot de passe.
        if not settings.is_production:
            admin_email = "admin@h-company.africa"
            admin_password = "changeme123"

            # Le mot de passe vit désormais dans le service d'authentification
            # commune — on l'y crée aussi, sans faire planter le démarrage si
            # ce service n'est pas encore joignable (dev sans le lancer, ou
            # ordre de démarrage Docker différent).
            try:
                with httpx.Client(timeout=3) as client:
                    resp = client.post(
                        f"{settings.auth_service_url}/api/v1/auth/register",
                        json={"email": admin_email, "password": admin_password, "full_name": "Admin H-Company (dev)"},
                    )
                    if resp.status_code not in (201, 400):  # 400 = existe déjà, pas un problème
                        logger.warning("Réponse inattendue du service auth au seed admin : %s", resp.status_code)
            except httpx.RequestError:
                logger.warning(
                    "Service d'authentification injoignable au démarrage — le compte admin de dev "
                    "devra être créé manuellement via %s/api/v1/auth/register.",
                    settings.auth_service_url,
                )

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
        content={"detail": "Données invalides.", "errors": exc.errors()},
    )


app.include_router(auth.router)
app.include_router(partners.router)
app.include_router(learning.router)
app.include_router(products.router)
app.include_router(contact.router)
app.include_router(onboarding.router)
app.include_router(notifications.router)
app.include_router(lukondo_parcels.router)
app.include_router(lukondo_rooms.router)
app.include_router(lukondo_bus.router)


@app.get("/")
def root():
    return {"name": settings.app_name, "status": "ok", "environment": settings.environment}


@app.get("/health")
def health():
    return {"status": "ok"}
