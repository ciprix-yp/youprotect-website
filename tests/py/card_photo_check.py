"""Verifică cardPhoto (scripts/catalog/card_photo.py), lint-ul textelor și asamblarea poziției 0 din images[].

Nu cere Pillow și nu folosește rețea. Rulat de tests/safe-fetch.test.mjs. Usage: python -I tests/py/card_photo_check.py <repo>
"""
import copy
import sys
import tempfile
from pathlib import Path

REPO = Path(sys.argv[1])
sys.path.insert(0, str(REPO / "scripts" / "catalog"))
import card_photo  # noqa: E402
from card_photo import CardPhotoError  # noqa: E402
from lint_texts import lint  # noqa: E402


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def expect(label, exc, fn):
    try:
        fn()
    except exc:
        return
    raise AssertionError(f"{label}: trebuia să arunce {exc.__name__}")


ID = "0123456789abcdef0123456789abcdef"
CARD = {"colour": "14010", "sourceId": ID, "kind": "scena", "focus": "60% 35%",
        "alt": "Geacă reflectorizantă purtată de un muncitor pe șantier, văzută din față"}
TEXT = {"model": "15501", "slug": "geaca-test-15501", "category": "reflectorizante", "cardPhoto": CARD}

check(card_photo.card_view(ID) == "C01234567", "card_view")
check(card_photo.card_view("8A3F1C2B-0000-0000-0000-000000000000") == "C8a3f1c2b", "card_view cu ID de tip Bynder")
expect("card_view cu URL", CardPhotoError, lambda: card_photo.card_view("https://x.example/a?sig=1"))

check(card_photo.card_photo_errors({}) == [], "fără cardPhoto nu e nicio eroare")
check(card_photo.card_photo_errors(TEXT) == [], f"cardPhoto valid: {card_photo.card_photo_errors(TEXT)}")


def errors_with(**changes):
    text = copy.deepcopy(TEXT)
    for key, value in changes.items():
        if value is None:
            text["cardPhoto"].pop(key, None)
        else:
            text["cardPhoto"][key] = value
    return card_photo.card_photo_errors(text)


for bad_colour in ("../alt-produs/NV", "NV\n", "N V", "A" * 11, "NV/", 5):
    check(errors_with(colour=bad_colour), f"culoare {bad_colour!r} trebuia respinsă")
check(errors_with(colour="") == [], "culoare goală (Sir Safety) e permisă")
check(errors_with(colour="NV") == [], "culoare alfanumerică e permisă")
check(errors_with(focus=None), "scena fără focus trebuie să pice")
check(errors_with(focus="120% 5%"), "focus peste 100% trebuie să pice")
check(errors_with(focus="la dreapta"), "focus în alt format trebuie să pice")
check(errors_with(kind="packshot"), "kind în afara studio/scena trebuie să pice")
check(errors_with(sourceId="https://dam.example.com/x?sig=abc"), "URL în loc de ID trebuie să pice")
check(errors_with(alt="scurt"), "alt prea scurt trebuie să pice")
check(errors_with(alt="Angajații You Protect poartă geaca reflectorizantă pe șantier"),
      "alt cu angajați You Protect trebuie să pice")
check(not errors_with(kind="studio", focus=None), "studio fără focus e valid")
check(card_photo.card_photo_errors({**TEXT, "model": "19035"}), "MASCOT 19035 e exclus")
check(card_photo.card_photo_errors({**TEXT, "model": "20382"}), "MASCOT 20382 e exclus")
check(card_photo.card_photo_errors({**TEXT, "category": "incaltaminte"}), "încălțămintea rămâne packshot")
check(card_photo.card_photo_errors({**TEXT, "extra": 1, "cardPhoto": {**CARD, "url": "https://x"}}), "chei necunoscute")

# lint(): alt-ul trece prin verificarea de ton (formal = eroare), iar cardPhoto invalid iese ca eroare de lint
formal = copy.deepcopy(TEXT)
formal["cardPhoto"]["alt"] = "Geaca reflectorizantă pe care o puteți purta pe șantier, văzută din față"
errors, _ = lint(formal)
check(any("ton formal" in e for e in errors), "alt cu ton formal trebuie să pice la lint")
errors, _ = lint({**TEXT, "model": "19035"})
check(any("exclus" in e for e in errors), "lint trebuie să raporteze modelul exclus")

# asamblare: poza pe model pe poziția 0 la culoarea aleasă, packshot-ul imediat după, ordinea culorilor neschimbată
def colours():
    base = "/images/products/geaca-test-15501"
    return [{"code": c, "name": c, "swatch": None, "spin": [],
             "images": [{"src": f"{base}/{c}-PS.webp", "thumb": f"{base}/{c}-PS-thumb.webp", "view": "PS"}]}
            for c in ("14010", "01", "49")]


with tempfile.TemporaryDirectory() as tmp:
    public = Path(tmp)
    folder = public / "geaca-test-15501"
    folder.mkdir()
    for name in ("14010-C01234567.webp", "14010-C01234567-thumb.webp", "01-C01234567.webp", "01-C01234567-thumb.webp"):
        (folder / name).write_bytes(b"x")

    listed = colours()
    check(card_photo.apply_card_photo(listed, {"slug": "geaca-test-15501"}, public) is None, "fără cardPhoto: None")
    check(listed == colours(), "fără cardPhoto nimic nu se schimbă")

    listed = colours()
    check(card_photo.apply_card_photo(listed, TEXT, public) == "14010", "cardColour")
    check([c["code"] for c in listed] == ["14010", "01", "49"], "ordinea din colours[] s-a schimbat")
    first, second = listed[0]["images"][:2]
    check(first["view"] == "C01234567" and first["kind"] == "scena", f"poza pe model: {first}")
    check(first["focus"] == "60% 35%" and first["alt"] == CARD["alt"], f"focus și alt: {first}")
    check(first["src"] == "/images/products/geaca-test-15501/14010-C01234567.webp", "src-ul pozei pe model")
    check(second["view"] == "PS" and "kind" not in second, "packshot-ul trebuia să rămână imediat după")
    check(len(listed[1]["images"]) == 1 and len(listed[2]["images"]) == 1, "alte culori neatinse")

    other = copy.deepcopy(TEXT)
    other["cardPhoto"]["colour"] = "01"
    listed = colours()
    check(card_photo.apply_card_photo(listed, other, public) == "01", "culoarea cardului ≠ colours[0]")
    check([c["code"] for c in listed] == ["14010", "01", "49"], "ordinea culorilor")
    check(listed[0]["images"][0]["view"] == "PS", "doar culoarea aleasă primește poza")

    missing = copy.deepcopy(TEXT)
    missing["cardPhoto"]["colour"] = "99"
    expect("culoare inexistentă în colours[]", CardPhotoError, lambda: card_photo.apply_card_photo(colours(), missing, public))
    nofile = copy.deepcopy(TEXT)
    nofile["cardPhoto"]["colour"] = "49"
    expect("fișier lipsă", CardPhotoError, lambda: card_photo.apply_card_photo(colours(), nofile, public))
    check(card_photo.apply_card_photo(colours(), nofile, public, check_images=False) == "49",
          "--no-image-check sare verificarea fișierului")
    expect("model exclus", CardPhotoError, lambda: card_photo.apply_card_photo(colours(), {**TEXT, "model": "20382"}, public))

# poză DEJA în repo (Sir Safety): `existing` în loc de sourceId, fără descărcare; se etichetează intrarea de pe poziția 0
EXISTING = {"colour": "Q5", "existing": "Q5-PS", "kind": "studio",
            "alt": "Geaca de ploaie Sir Safety Suncity, purtată de un om, pe fond alb"}
SS_TEXT = {"model": "MC4314", "slug": "geaca-test-mc4314", "category": "geci-jachete", "cardPhoto": EXISTING}


def ss_colours():
    base = "/images/products/geaca-test-mc4314"
    return [{"code": c, "name": c, "swatch": None, "spin": [],
             "images": [{"src": f"{base}/{c}-PS.webp", "thumb": f"{base}/{c}-PS-thumb.webp", "view": "PS"}]}
            for c in ("Q5", "H1")]


def ss_errors(**changes):
    text = copy.deepcopy(SS_TEXT)
    for key, value in changes.items():
        if value is None:
            text["cardPhoto"].pop(key, None)
        else:
            text["cardPhoto"][key] = value
    return card_photo.card_photo_errors(text)


check(card_photo.card_photo_errors(SS_TEXT) == [], f"existing valid: {card_photo.card_photo_errors(SS_TEXT)}")
check(ss_errors(sourceId=ID), "existing și sourceId împreună trebuie să pice")
check(ss_errors(existing="Q5/../x"), "existing cu cale trebuie să pice")
check(ss_errors(existing="H1-PS"), "existing cu altă culoare decât colour trebuie să pice")
check(ss_errors(existing=None), "fără existing și fără sourceId trebuie să pice")

listed = ss_colours()
before = copy.deepcopy(listed)
check(card_photo.apply_card_photo(listed, SS_TEXT, Path("/nu/există")) == "Q5", "existing: cardColour")
first = listed[0]["images"][0]
check(len(listed[0]["images"]) == 1 and first["view"] == "PS" and first["kind"] == "studio", f"existing: {first}")
check(first["src"] == before[0]["images"][0]["src"] and first["thumb"] == before[0]["images"][0]["thumb"],
      "existing: src/thumb nu se schimbă")
check(first["alt"] == EXISTING["alt"] and "focus" not in first, f"existing: alt, fără focus: {first}")
check(listed[1] == before[1], "existing: alte culori neatinse")
wrong = copy.deepcopy(SS_TEXT)
wrong["cardPhoto"]["existing"] = "Q5-P01"
expect("existing care nu e prima poză", CardPhotoError, lambda: card_photo.apply_card_photo(ss_colours(), wrong, Path("/x")))

# modelViews: restul culorilor cu poză pe model deja în repo (Suncity H1)
VIEW = {"colour": "H1", "existing": "H1-PS", "alt": "Geaca de ploaie Sir Safety Suncity, portocalie, purtată, văzută din lateral"}


def mv_errors(views):
    text = copy.deepcopy(SS_TEXT)
    text["modelViews"] = views
    return card_photo.card_photo_errors(text)


check(mv_errors([VIEW]) == [], f"modelViews valid: {mv_errors([VIEW])}")
check(mv_errors([]), "modelViews gol trebuie să pice")
check(mv_errors([{**VIEW, "existing": "Q5-PS"}]), "modelViews.existing cu altă culoare trebuie să pice")
check(mv_errors([{**VIEW, "colour": "Q5", "existing": "Q5-PS"}]), "modelViews pe culoarea cardului trebuie să pice")
check(mv_errors([VIEW, VIEW]), "modelViews cu aceeași culoare de două ori trebuie să pice")
check(mv_errors([{**VIEW, "alt": "prea scurt"}]), "modelViews.alt sub 20 de caractere trebuie să pice")
check(mv_errors([{**VIEW, "alt": "A" * 141}]), "alt peste 140 de caractere trebuie să pice")
check(mv_errors([{**VIEW, "kind": "scena"}]), "modelViews cu cheie necunoscută (kind) trebuie să pice")
mv_text = copy.deepcopy(SS_TEXT)
mv_text["modelViews"] = [VIEW]
mv_listed = ss_colours()
check(card_photo.apply_card_photo(mv_listed, mv_text, Path("/nu/există")) == "Q5", "modelViews: cardColour rămâne Q5")
h1 = mv_listed[1]["images"][0]
check(h1["kind"] == "studio" and h1["alt"] == VIEW["alt"] and "focus" not in h1, f"modelViews: {h1}")
check(h1["src"].endswith("/H1-PS.webp"), "modelViews: fișierul nu se schimbă")
mv_text["modelViews"] = [{**VIEW, "colour": "Z9", "existing": "Z9-PS"}]
expect("modelViews cu culoare lipsă", CardPhotoError, lambda: card_photo.apply_card_photo(ss_colours(), mv_text, Path("/x")))

print("ok")
