"""Habillage HTML des e-mails H-Company (marque chocolat / crème / or), compatible clients mail (tables + styles en ligne)."""
import html
import re

BROWN, CREAM, GOLD, INK = "#3B2417", "#FBF6EC", "#C89A3D", "#2A1A10"
CODE_RE = re.compile(r"(?<!\d)(\d{4,8})(?!\d)")
URL_RE = re.compile(r"(https?://[^\s<]+)")

FOOTER = {
    "fr": "Vous recevez cet e-mail parce qu'une action a été faite avec cette adresse sur H-Company. Si ce n'est pas vous, ignorez-le.",
    "en": "You are receiving this email because an action was taken with this address on H-Company. If it wasn't you, please ignore it.",
}


def _para(text: str) -> str:
    esc = html.escape(text).replace("\n", "<br>")
    return URL_RE.sub(lambda m: f'<a href="{m.group(1)}" style="color:{BROWN};font-weight:600">{m.group(1)}</a>', esc)


def render_html(subject: str, body: str, *, lang: str = "fr", code: str | None = None, cta: tuple[str, str] | None = None, preheader: str = "") -> str:
    """`body` : texte brut (paragraphes séparés par une ligne vide). `code` : mis en avant. `cta` : (libellé, url)."""
    blocks = [b.strip() for b in re.split(r"\n\s*\n", body.strip()) if b.strip()]
    parts = []
    for b in blocks:
        if b.startswith("— "):  # signature
            parts.append(f'<p style="margin:18px 0 0;color:#7a6a5c;font-size:13px">{html.escape(b)}</p>')
        else:
            parts.append(f'<p style="margin:0 0 14px;line-height:1.6;font-size:15px;color:{INK}">{_para(b)}</p>')
    code_html = (f'<div style="margin:22px 0;text-align:center"><span style="display:inline-block;background:{BROWN};color:{GOLD};font:700 32px/1 \'Courier New\',monospace;'
                 f'letter-spacing:10px;padding:18px 26px 18px 36px;border-radius:14px">{html.escape(code)}</span></div>') if code else ""
    cta_html = (f'<div style="margin:24px 0 6px;text-align:center"><a href="{html.escape(cta[1])}" style="display:inline-block;background:{GOLD};color:{INK};text-decoration:none;'
                f'font-weight:700;font-size:15px;padding:14px 30px;border-radius:999px">{html.escape(cta[0])}</a></div>') if cta else ""
    return f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#EFE6D6;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">{html.escape(preheader or subject)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFE6D6"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:{CREAM};border-radius:20px;overflow:hidden">
<tr><td style="background:{BROWN};padding:22px 28px"><span style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;background:{GOLD};color:{BROWN};font-weight:800;border-radius:8px;vertical-align:middle">H</span>
<span style="color:{CREAM};font:600 19px Georgia,serif;vertical-align:middle;margin-left:10px">H-Company</span></td></tr>
<tr><td style="padding:30px 28px 10px"><h1 style="margin:0 0 16px;font:600 24px/1.25 Georgia,serif;color:{BROWN}">{html.escape(subject)}</h1>{''.join(parts)}{code_html}{cta_html}</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid #E6D9C2"><p style="margin:0;font-size:12px;line-height:1.5;color:#8a7a6c">{html.escape(FOOTER['fr'])}<br>{html.escape(FOOTER['en'])}</p>
<p style="margin:8px 0 0;font-size:12px;color:#8a7a6c">H-Company · Lusaka, Zambia · Congo · Africa</p></td></tr>
</table></td></tr></table></body></html>"""


def auto_html(subject: str, body: str, lang: str = "fr") -> str:
    """Habille un texte brut existant : détecte un code à usage unique et un lien principal pour les mettre en valeur."""
    code = None
    if re.search(r"(code|OTP)", body, re.I):
        m = CODE_RE.search(body)
        code = m.group(1) if m else None
    return render_html(subject, body, lang=lang, code=code)


def bilingual(fr: str, en: str) -> str:
    return f"{fr}\n\n{en}"
