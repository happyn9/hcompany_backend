FROM python:3.12-slim

WORKDIR /app

# psycopg2-binary a besoin de libpq au runtime ; gcc pour compiler certaines
# dépendances natives (bcrypt, etc.) si aucune wheel précompilée n'est dispo.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=100 --retries 5 -r requirements.txt

COPY . .
RUN chmod +x entrypoint.sh

# Utilisateur non-root : bonne pratique, réduit la surface d'attaque du conteneur.
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["./entrypoint.sh"]
