"""Verifică avertismentele de structură din scripts/catalog/lint_texts.py (08-GHID_CONTINUT.md §8) pe texte sintetice.

Rulat de tests/lint-texts.test.mjs. Usage: python -I tests/py/lint_texts_check.py <repo>
Doar biblioteca standard.
"""
import importlib.util
import sys
from pathlib import Path

REPO = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("lint_texts", REPO / "scripts/catalog/lint_texts.py")
lint_texts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lint_texts)


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def style(text):
    warnings = []
    lint_texts.check_style(text, warnings)
    return warnings


VARIED = [
    "Geaca are glugă. Țesătura e certificată EN ISO 20471 clasa 2, iar banda reflectorizantă e cusută pe mâneci și pe "
    "spate, ca să se vadă din toate părțile. Se spală la 60 de grade.",
    "Buzunarele au fermoar. Gulerul se strânge cu arici, iar manșetele au elastic, așa că vântul nu intră pe la "
    "încheieturi când ridici brațele. Mărimile merg de la S la 4XL.",
    "O probezi în showroom-ul din Vetiș.",
]
UNIFORM = [
    "Geaca are glugă reglabilă și guler înalt. Țesătura are clasa 2 după EN ISO 20471. "
    "Banda reflectorizantă e cusută pe mâneci. Buzunarele au fermoar ascuns sub clapă. "
    "Mărimile merg de la S la 4XL. Se spală la 60 de grade.",
]

# „nu …, ci …”: o dată e în regulă, de două ori e avertisment; „nu doar …, ci și …” se numără la fel.
one = {"description": ["Nu e o geacă de iarnă, ci una de trecere."] + VARIED[1:]}
check(not any("nu …, ci" in w for w in style(one)), "un singur „nu …, ci” nu trebuie semnalat")
two = {
    "description": VARIED,
    "faq": [{"q": "?", "a": "Nu doar ține de cald, ci și te face vizibil. Nu e impermeabilă, ci rezistentă la apă."}],
}
check(any("de 2 ori" in w for w in style(two)), f"două „nu …, ci” trebuie semnalate: {style(two)}")
nocomma = {"description": VARIED, "summary": "Nu doar vizibilă ci și caldă. Nu e grea, ci ușoară."}
check(any("de 2 ori" in w for w in style(nocomma)), "„nu doar … ci și” fără virgulă se numără și el")

# Fraze de rezumat la început de frază: una trece, două sunt avertisment; „așadar” în mijlocul frazei nu se numără.
recap_one = {"description": VARIED, "summary": "Pe scurt, geaca e pentru drum."}
check(not any("rezumat" in w for w in style(recap_one)), "o singură frază de rezumat nu trebuie semnalată")
recap_two = {"description": VARIED, "summary": "Pe scurt, geaca e pentru drum. Așadar, o porți lângă drum."}
check(any("2 fraze de rezumat" in w for w in style(recap_two)), f"două fraze de rezumat trebuie semnalate: {style(recap_two)}")
mid = {"description": VARIED, "summary": "Geaca e, așadar, pentru drum. Pe scurt, o porți lângă drum."}
check(not any("rezumat" in w for w in style(mid)), "„așadar” în mijlocul frazei nu e frază de rezumat")

# Lungimea frazelor din descriere: toate cam la fel → avertisment; alternate → nimic; sub 5 fraze → nimic.
check(any("lungimi apropiate" in w for w in style({"description": UNIFORM})), "frazele de aceeași lungime trebuie semnalate")
check(not any("lungimi apropiate" in w for w in style({"description": VARIED})), "frazele alternate nu trebuie semnalate")
short = {"description": ["Geaca are glugă reglabilă. Țesătura are clasa 2 după standard. Banda e cusută pe mâneci."]}
check(not any("lungimi apropiate" in w for w in style(short)), "sub 5 fraze nu se măsoară ritmul")

# Avertismentele nu devin niciodată erori: lint() le întoarce ca avertismente, iar erorile nu le conțin.
noisy = {"keyword": "geacă reflectorizantă", "description": UNIFORM,
         "summary": "Pe scurt, nu e grea, ci ușoară. Așadar, nu e scumpă, ci ieftină."}
errors, warnings = lint_texts.lint(noisy)
STYLE = ("nu …, ci", "rezumat", "lungimi apropiate")
check(not any(k in e for e in errors for k in STYLE), f"semnele de structură au ajuns la erori: {errors}")
found = sum(1 for w in warnings if any(k in w for k in STYLE))
check(found == 3, f"lint() trebuie să întoarcă cele trei avertismente: {warnings}")

print("ok")
