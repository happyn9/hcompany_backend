"""Détourage : retire un fond uni (photo de studio) et renvoie un PNG transparent.

Principe : couleur de fond = médiane du pourtour ; on propage depuis les bords les pixels
proches de cette couleur (remplissage par diffusion) — le contenu de l'objet, même blanc,
n'est donc jamais effacé s'il n'est pas relié au bord. Si le fond n'est pas uni (moins de 8 %
de l'image reconnue comme fond), l'image est renvoyée telle quelle."""
import io
from typing import Tuple

import numpy as np
from PIL import Image, ImageFilter

MAX_SIDE = 1400
TOLERANCE = 38  # écart max par canal, 0-255
MIN_BG_RATIO = 0.08


def cutout_png(data: bytes) -> Tuple[bytes, bool]:
    img = Image.open(io.BytesIO(data))
    img.load()
    img = img.convert("RGBA")
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE))
    arr = np.asarray(img)
    rgb = arr[..., :3].astype(np.int16)
    # image déjà détourée (beaucoup de transparence) : on garde
    if (arr[..., 3] < 20).mean() > MIN_BG_RATIO:
        return _png(img), True
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.abs(rgb - bg).max(axis=2)
    close = dist <= TOLERANCE
    bgmask = _connected_to_border(close)
    if bgmask.mean() < MIN_BG_RATIO:
        return _png(img), False
    alpha = np.where(bgmask, 0, 255).astype(np.uint8)
    a = Image.fromarray(alpha, "L").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    w, h = img.size
    out = img.copy()
    out.putalpha(a)
    bbox = a.point(lambda v: 255 if v > 10 else 0).getbbox()
    if bbox:
        pad = 12
        out = out.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad)))
    return _png(out), True


def _connected_to_border(close: np.ndarray) -> np.ndarray:
    """Pixels « fond » reliés au bord : dilatation 4-connexe bornée par le masque."""
    reach = np.zeros_like(close)
    reach[0, :], reach[-1, :], reach[:, 0], reach[:, -1] = close[0, :], close[-1, :], close[:, 0], close[:, -1]
    while True:
        grown = reach.copy()
        grown[1:, :] |= reach[:-1, :]
        grown[:-1, :] |= reach[1:, :]
        grown[:, 1:] |= reach[:, :-1]
        grown[:, :-1] |= reach[:, 1:]
        grown &= close
        if (grown == reach).all():
            return reach
        reach = grown


def _png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
