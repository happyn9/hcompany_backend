"""Contrôle de position d'un logement : le point doit se trouver près de la ville annoncée (anti-erreur, anti-fraude)."""
from math import asin, cos, radians, sin, sqrt
from typing import Optional

from fastapi import HTTPException

# Centres-villes (mêmes noms que transport.services.CITIES ; copie du front lib/cities.js).
CITY_COORDS = {
    "lusaka": (-15.4167, 28.2833), "kitwe": (-12.8024, 28.2132), "ndola": (-12.9587, 28.6366), "livingstone": (-17.8419, 25.8543),
    "kabwe": (-14.4469, 28.4464), "chipata": (-13.6333, 32.65), "kasama": (-10.2129, 31.1808), "solwezi": (-12.1688, 26.3894),
    "mongu": (-15.2484, 23.1274), "mansa": (-11.1996, 28.8943), "choma": (-16.8064, 26.9833), "mazabuka": (-15.8586, 27.7469),
    "kapiri mposhi": (-13.9667, 28.6833), "chingola": (-12.5289, 27.8531), "mufulira": (-12.5497, 28.2403), "luanshya": (-13.1367, 28.4167),
    "siavonga": (-16.5333, 28.7167), "petauke": (-14.2478, 31.3249), "lubumbashi": (-11.6609, 27.4794), "kolwezi": (-10.7167, 25.4667),
    "harare": (-17.8252, 31.0335), "johannesburg": (-26.2041, 28.0473), "dar es salaam": (-6.7924, 39.2083), "nairobi": (-1.2921, 36.8219),
    "kinshasa": (-4.4419, 15.2663),
}
MAX_KM = 60.0


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = radians(lat1), radians(lat2)
    a = sin((p2 - p1) / 2) ** 2 + cos(p1) * cos(p2) * sin(radians(lng2 - lng1) / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(a))


def check_location(city: str, lat: Optional[float], lng: Optional[float], max_km: float = MAX_KM) -> None:
    """422 si le point est à plus de `max_km` du centre de la ville. Ville inconnue ou point absent : rien à contrôler."""
    if lat is None or lng is None:
        return
    c = CITY_COORDS.get((city or "").strip().lower())
    if not c:
        return
    d = haversine_km(c[0], c[1], lat, lng)
    if d > max_km:
        raise HTTPException(status_code=422, detail=f"Ce point est à environ {round(d)} km de {city.strip()} : placez l'épingle sur le logement, dans la ville.")
