"""Poza pe model (cardPhoto) din catalog/texts/<furnizor>/<model>.json: validare și asamblare.

Cheia opțională, lângă primaryColour:

    "cardPhoto": {"colour": "14010", "sourceId": "<ID din DAM/Media Hub>", "kind": "studio" | "scena",
                  "focus": "50% 30%", "alt": "…"}

Variantă pentru o poză pe model DEJA în repo (Sir Safety, fișierul `<culoare>-PS.webp`): în loc de `sourceId`,
`"existing": "<culoare>-<view>"`. Nu se descarcă nimic și fișierul nu se schimbă; intrarea din images[] primește doar
kind/focus/alt.

Ștergerea cheii dă exact rezultatul de dinainte (cardul rămâne pe packshot). Poza se identifică după `sourceId`
(ID-ul din DAM / Media Hub, nu un URL: URL-urile semnate nu intră în repo). Fișierul local se numește
`<culoare>-<view>.webp` (+ `-thumb`), cu view = "C" + primele 8 caractere ale ID-ului (card_view); la produsele fără
culoare (Sir Safety, culoare "") fișierul e `<view>.webp`. Fetch-ul îl salvează, assemble-ul îl pune pe poziția 0 din
images[] doar la culoarea aleasă, packshot-ul rămâne imediat după el, ordinea din colours[] nu se schimbă.

Reguli de eligibilitate decise de owner (nu se rediscută): fără practici nesigure, fără mărci concurente sau texte terțe
vizibile, nimic care să sugereze că oamenii sunt clienți/angajați You Protect; excluse MASCOT 19035 și 20382;
încălțămintea rămâne packshot; culoarea din poză trebuie să fie în colours[] (verificat la assemble).
"""
import re

SOURCE_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
FOCUS = re.compile(r"^(\d{1,3})% (\d{1,3})%$")
KINDS = ("studio", "scena")
EXISTING = re.compile(r"^([A-Za-z0-9]{1,10})-([A-Za-z0-9]{2,12})$")
KEYS = {"colour", "sourceId", "existing", "kind", "focus", "alt"}
EXCLUDED_MODELS = {"19035": "practică nesigură", "20382": "mărci concurente vizibile"}
ALT_FORBIDDEN = re.compile(r"you protect|angaja|client", re.IGNORECASE)


class CardPhotoError(Exception):
    pass


def card_view(source_id):
    """Numele „view” al pozei pe model în fișiere și în images[]: „C” + 8 caractere din ID (ex. „C3fa9b2c1”)."""
    if not isinstance(source_id, str) or not SOURCE_ID.fullmatch(source_id):
        raise CardPhotoError("sourceId invalid")
    return "C" + re.sub(r"[^0-9a-z]", "", source_id.lower())[:8]


def _source_errors(card):
    """sourceId (poză de descărcat) sau existing (poză deja în repo), exact unul dintre ele."""
    if "existing" not in card:
        if isinstance(card.get("sourceId"), str) and SOURCE_ID.fullmatch(card["sourceId"]):
            return []
        return ["cardPhoto.sourceId: ID din DAM/Media Hub (litere, cifre, cratime; 8–64 caractere), nu URL"]
    errors = []
    existing = card["existing"]
    match = EXISTING.fullmatch(existing) if isinstance(existing, str) else None
    if "sourceId" in card:
        errors.append("cardPhoto: „existing” și „sourceId” se exclud (o poză deja în repo nu se descarcă din nou)")
    if not match:
        errors.append("cardPhoto.existing: numele fișierului existent fără extensie, „<culoare>-<view>” (ex. „Q5-PS”)")
    elif match.group(1) != card.get("colour"):
        errors.append("cardPhoto.existing trebuie să înceapă cu culoarea din cardPhoto.colour")
    return errors


def _focus_errors(card):
    focus = card.get("focus")
    match = FOCUS.fullmatch(focus) if isinstance(focus, str) else None
    if match and (int(match.group(1)) > 100 or int(match.group(2)) > 100):
        match = None
    if card.get("kind") == "scena" and not match:
        return ["cardPhoto.focus („X% Y%”, 0–100) e obligatoriu la scenă"]
    if focus is not None and not match:
        return ["cardPhoto.focus trebuie să fie „X% Y%”, cu valori 0–100"]
    return []


def card_photo_errors(text):
    """Erorile cheii cardPhoto dintr-un text de produs (listă goală dacă lipsește sau e corectă)."""
    card = text.get("cardPhoto")
    if card is None:
        return []
    if not isinstance(card, dict):
        return ["cardPhoto trebuie să fie un obiect"]
    errors = []
    unknown = set(card) - KEYS
    if unknown:
        errors.append(f"cardPhoto: chei necunoscute {sorted(unknown)}")
    if str(text.get("model", "")) in EXCLUDED_MODELS:
        errors.append(f"cardPhoto: modelul {text['model']} e exclus ({EXCLUDED_MODELS[str(text['model'])]})")
    if str(text.get("category", "")).startswith("incaltaminte"):
        errors.append("cardPhoto: încălțămintea rămâne pe packshot")
    if not isinstance(card.get("colour"), str):
        errors.append("cardPhoto.colour trebuie să fie codul unei culori din produs")
    errors += _source_errors(card)
    if card.get("kind") not in KINDS:
        errors.append(f"cardPhoto.kind trebuie să fie unul din {KINDS}")
    errors += _focus_errors(card)
    alt = card.get("alt")
    if not isinstance(alt, str) or not 20 <= len(alt) <= 160:
        errors.append("cardPhoto.alt: text în română de 20–160 de caractere care descrie produsul purtat")
    elif ALT_FORBIDDEN.search(alt):
        errors.append("cardPhoto.alt: nu sugera că oamenii sunt clienți sau angajați You Protect")
    return errors


def image_entry(slug, colour, card):
    """Intrarea din images[] pentru poza pe model (fără verificarea fișierului)."""
    view = card_view(card["sourceId"])
    stem = f"{colour}-{view}" if colour else view
    base = f"/images/products/{slug}"
    entry = {"src": f"{base}/{stem}.webp", "thumb": f"{base}/{stem}-thumb.webp", "view": view, "kind": card["kind"]}
    if card.get("focus"):
        entry["focus"] = card["focus"]
    entry["alt"] = card["alt"]
    return entry


def _label_existing(target, slug, card):
    """Poza pe model e deja în repo (ex. Sir Safety: <culoare>-PS.webp): nu se descarcă și nu se modifică fișierul,
    doar se etichetează intrarea existentă din images[] (kind/focus/alt), pe loc. Trebuie să fie prima poză a culorii."""
    wanted = f"/images/products/{slug}/{card['existing']}.webp"
    images = target["images"]
    if not images or images[0]["src"] != wanted:
        raise CardPhotoError(f"cardPhoto.existing „{card['existing']}” trebuie să fie prima poză a culorii {target['code']}")
    images[0]["kind"] = card["kind"]
    if card.get("focus"):
        images[0]["focus"] = card["focus"]
    images[0]["alt"] = card["alt"]


def apply_card_photo(colour_list, text, public_dir, check_images=True):
    """Pune poza pe model pe poziția 0 din images[] la culoarea aleasă. Întoarce codul culorii (cardColour) sau None
    dacă produsul nu are cardPhoto. Pică explicit (nu revine tăcut la packshot) dacă lipsește culoarea sau fișierul."""
    card = text.get("cardPhoto")
    if not card:
        return None
    errors = card_photo_errors(text)
    if errors:
        raise CardPhotoError("; ".join(errors))
    target = next((c for c in colour_list if c["code"] == card["colour"]), None)
    if target is None:
        have = ", ".join(c["code"] for c in colour_list)
        raise CardPhotoError(f"cardPhoto.colour „{card['colour']}” nu e în colours[] ({have})")
    if "existing" in card:
        _label_existing(target, text["slug"], card)
        return target["code"]
    entry = image_entry(text["slug"], target["code"], card)
    if check_images:
        folder = public_dir / text["slug"]
        for key in ("src", "thumb"):
            if not (folder / entry[key].rsplit("/", 1)[-1]).exists():
                raise CardPhotoError(f"lipsește {entry[key]} (rulează fetch_images_*.py)")
    target["images"].insert(0, entry)
    return target["code"]
