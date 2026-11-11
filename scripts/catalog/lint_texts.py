"""Check product texts against PROJECT_OS/08-GHID_CONTINUT.md.

Usage:
  python -I scripts/catalog/lint_texts.py <texts_dir> [<texts_dir> ...]

Errors stop the assembly (assemble_*.py imports `lint`); warnings are printed only.
Files whose name starts with "_" (templates) are skipped.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

FORMAL = re.compile(
    r"\b(dumneavoastră|dumneavoastra|dvs\.?|vă|cereți|aveți|puteți|sunteți|alegeți|verificați|contactați|"
    r"consultați|aflați|descoperiți|programați|sunați|trimiteți|comandați|testați|beneficiați|solicitați)\b",
    re.IGNORECASE,
)
BANNED = ["cel mai bun", "cea mai bună", "cei mai buni", "revoluționar", "lider", "nr. 1", "numărul 1",
          "toată ziua", "100% sigur", "garantăm"]
CEDILLA = re.compile(r"[şţŞŢ]")
BAD_QUOTES = re.compile(r"[“”\"]")
STOPWORDS = {"de", "din", "pentru", "cu", "si", "și", "la", "în", "in", "pe"}


def fold(text):
    """Lowercase without diacritics, for keyword matching."""
    norm = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in norm if not unicodedata.combining(c))


def keyword_in(keyword, text):
    words = re.findall(r"[a-z0-9]+", fold(text))
    for token in re.findall(r"[a-z0-9]+", fold(keyword)):
        if token in STOPWORDS or len(token) < 3:
            continue
        stem = token[:5]
        if not any(w.startswith(stem) for w in words):
            return False
    return True


def all_strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, list):
        for item in obj:
            yield from all_strings(item)
    elif isinstance(obj, dict):
        for key, value in obj.items():
            if not key.startswith("_") and key not in ("model", "slug", "category", "industries", "primaryColour", "status"):
                yield from all_strings(value)


def check_voice(text, errors):
    for s in all_strings(text):
        if FORMAL.search(s):
            errors.append(f"ton formal („{FORMAL.search(s).group(0)}”): „{s[:70]}…”")
        if CEDILLA.search(s):
            errors.append(f"diacritice cu sedilă (ş/ţ): „{s[:70]}…”")
        if BAD_QUOTES.search(s):
            errors.append(f"ghilimele greșite (folosește „…”): „{s[:70]}…”")
        low = s.lower()
        for word in BANNED:
            if word in low:
                errors.append(f"expresie interzisă „{word}”: „{s[:70]}…”")


def check_seo(text, keyword, errors, warnings):
    seo = text.get("seo", {})
    title, desc, summary = seo.get("title", ""), seo.get("description", ""), text.get("summary", "")
    if len(title) > 50:
        errors.append(f"seo.title are {len(title)} caractere (max. 50)")
    if not 70 <= len(desc) <= 160:
        errors.append(f"seo.description are {len(desc)} caractere (70–160)")
    if not 60 <= len(summary) <= 220:
        errors.append(f"summary are {len(summary)} caractere (60–220)")
    description = text.get("description", [])
    first_sentence = re.split(r"(?<=[.!?])\s", summary, maxsplit=1)[0]
    for label, value in (("seo.title", title), ("name", text.get("name", "")),
                         ("prima frază din summary", first_sentence),
                         ("primul paragraf", description[0] if description else "")):
        if not keyword_in(keyword, value):
            errors.append(f"keyword-ul „{keyword}” lipsește din {label}")
    exact = fold(" ".join(description)).count(fold(keyword))
    if exact > 2:
        warnings.append(f"keyword-ul exact apare de {exact} ori în descriere (recomandat max. 2)")


def check_structure(text, errors, warnings):
    description, benefits, faq = text.get("description", []), text.get("benefits", []), text.get("faq", [])
    if len(description) != 3:
        errors.append(f"descrierea are {len(description)} paragrafe (trebuie 3: experiență, cum te simți, firmă)")
    if not 5 <= len(benefits) <= 6:
        warnings.append(f"{len(benefits)} beneficii (recomandat 5–6)")
    for b in benefits:
        if ":" not in b:
            warnings.append(f"beneficiu fără formatul „Rezultat: cum”: „{b[:60]}”")
    if not 5 <= len(faq) <= 6:
        errors.append(f"{len(faq)} întrebări frecvente (trebuie 5–6)")
    local = [f for f in faq if fold(f.get("q", "")).startswith("de unde")]
    if not local:
        errors.append("lipsește întrebarea locală „De unde pot comanda …?”")
    elif not ("You Protect" in local[0].get("a", "") and "Satu Mare" in local[0].get("a", "")):
        errors.append("răspunsul la „De unde pot comanda…” trebuie să numească You Protect și Satu Mare")
    for f in faq:
        if not f.get("q", "").endswith("?"):
            errors.append(f"întrebarea nu se termină cu „?”: „{f.get('q', '')[:60]}”")
        if re.match(r"^(Acesta|Aceasta|Acestea|El|Ea|Ei|Ele)\b", f.get("a", "")):
            warnings.append(f"răspunsul începe cu un pronume (GEO: repetă numele produsului): „{f['a'][:50]}”")


def lint(text):
    """Return (errors, warnings) for one product text."""
    errors, warnings = [], []
    keyword = text.get("keyword", "").strip()
    if not keyword:
        errors.append("lipsește câmpul „keyword”")
    check_voice(text, errors)
    if keyword:
        check_seo(text, keyword, errors, warnings)
    check_structure(text, errors, warnings)
    return errors, warnings


def main(dirs):
    failed = False
    for directory in dirs:
        for path in sorted(Path(directory).glob("*.json")):
            if path.name.startswith("_"):
                continue
            errors, warnings = lint(json.loads(path.read_text(encoding="utf-8")))
            status = "EROARE" if errors else "ok"
            print(f"{status:6s} {path.name}")
            for e in errors:
                print(f"   ✗ {e}")
            for w in warnings:
                print(f"   ! {w}")
            failed = failed or bool(errors)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
