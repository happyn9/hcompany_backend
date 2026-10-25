"""Détourage d'image et couleurs produit."""
import io

import pytest
from PIL import Image, ImageDraw
from pydantic import ValidationError

from app.shopping.cutout import cutout_png
from app.shopping.schemas import ColorWrite
from app.shopping.views import parse_colors


def _studio(bg=(250, 250, 248)):
    im = Image.new("RGB", (600, 450), bg)
    d = ImageDraw.Draw(im)
    d.rectangle((150, 100, 450, 350), fill=(30, 30, 30))
    d.rectangle((220, 170, 380, 280), fill=(255, 255, 255))  # intérieur blanc : doit rester opaque
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def test_cutout_removes_plain_background_keeps_white_interior():
    out, ok = cutout_png(_studio())
    assert ok
    img = Image.open(io.BytesIO(out))
    assert img.mode == "RGBA" and img.getpixel((1, 1))[3] == 0
    assert img.getpixel((img.width // 2, img.height // 2))[3] == 255


def test_cutout_leaves_busy_background_alone():
    noisy = Image.effect_noise((200, 200), 80).convert("RGB")
    buf = io.BytesIO()
    noisy.save(buf, "PNG")
    assert cutout_png(buf.getvalue())[1] is False


def test_colors_validation_and_parse():
    assert ColorWrite(name="Noir", hex="#111111").hex == "#111111"
    with pytest.raises(ValidationError):
        ColorWrite(name="Rouge", hex="red")
    assert parse_colors("Noir:#111111,Rouge:#c0392b") == [{"name": "Noir", "hex": "#111111"}, {"name": "Rouge", "hex": "#c0392b"}]
    assert parse_colors("") == []
