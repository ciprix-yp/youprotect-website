"""Assemble website product entries from Portwest facts + Romanian texts.

Usage:
  python3 -I scripts/catalog/assemble_portwest.py <source_dir> <texts_dir> <maps.json> <out_dir> [--no-image-check]

- <source_dir>: JSON from extract_portwest.py; <texts_dir>: catalog/texts/portwest/<STYLE>.json (Romanian copy).
- Taken from the source, never typed: colour codes and photos, sizes, documents, product URL.
- Checked against the Romanian EU declaration of conformity: every certification in the text must be a standard
  the declaration lists. The fabric weight must match Portwest's data. Missing colour translations or photos stop it.
- Copies the Romanian declaration and datasheet (documents.portwest.com, via fetch_portwest.py --docs) to
  public/documente/<slug>/: Portwest's document server sometimes returns truncated PDFs, so we host them.
"""
import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from card_photo import CardPhotoError, apply_card_photo  # noqa: E402
from lint_texts import lint  # noqa: E402  (same folder; works with python -I)

NBSP = " "
PUBLIC_IMAGES = Path("public/images/products")
PUBLIC_DOCS = Path("public/documente")
WORK_DOCS = Path(".catalog-work/portwest/documente")
MAX_DOC_BYTES = 500 * 1024  # tests/local-documents.test.mjs
DOCS = [
    ("declaratie-de-conformitate-ro.pdf", "declaratie-conformitate", "Declarație de conformitate UE (în română)"),
    ("fisa-tehnica-ro.pdf", "fisa-tehnica", "Fișă tehnică (în română)"),
]
CHECK_IMAGES = True
# „Gama” de sub titlu: doar liniile de produs Portwest. Restul colecțiilor din date sunt categorii generice, uneori fără
# diacritice („Manusi pentru Protectie Chimica”), sau stări comerciale („Run@Work Pre-comandă”), și nu se afișează.
RANGE_NAMES = {
    "PW3": "PW3",
    "Bizweld™ Work": "Bizweld™ Work",
    "CompositeLite™": "CompositeLite™",
    "CompositeLite™ ESD.": "CompositeLite™ ESD",
    "Run@Work Pre-comandă": "Run@Work",
    "Iona Vest-Port": "Iona",
}


class AssemblyError(Exception):
    pass


def squash(s):
    """Lower-case, no spaces: for checking that a standard appears in the declaration."""
    return re.sub(r"\s+", "", str(s).replace(NBSP, " ")).lower()


def check_certifications(text, source):
    decl = source.get("declaration") or {}
    listed = squash(" ".join(decl.get("standards", [])))
    if not listed:
        raise AssemblyError("lipsește declarația în română (rulează fetch_portwest.py --docs)")
    for cert in text["certifications"]:
        core = re.match(r"((?:EN|IEC|ISO)(?: ISO| IEC)? \d+(?:-\d+)*)", cert["code"])
        if not core or squash(core.group(1)) not in listed:
            raise AssemblyError(f"certificarea {cert['code']!r} nu apare în declarația de conformitate")
    if not decl.get("productionSurveillance"):
        everything = squash(json.dumps({k: text.get(k) for k in ("summary", "description", "specs", "faq", "certifications")},
                                       ensure_ascii=False))
        if "categoriaiii" in everything or "categorieiii" in everything:
            raise AssemblyError("textul spune categoria III, dar declarația nu menționează modulul C2/D")


def check_weight(text, source):
    weight = text.get("weight")
    if not weight:
        return
    number = re.match(r"\d+", weight)
    datasheet = squash(source["datasheet"]["text"] or "")
    gm = source["materials"].get("ShellWeightGM")
    if not number or (number.group(0) != gm and f"{number.group(0)}g" not in datasheet):
        raise AssemblyError(f"gramajul {weight!r} nu apare în datele Portwest")


def colours(source, text, maps):
    ordered = sorted(source["colours"], key=lambda c: c["code"] != text["primaryColour"])
    if not ordered or ordered[0]["code"] != text["primaryColour"]:
        raise AssemblyError(f"culoarea principală {text['primaryColour']} nu există în sursă")
    base = f"/images/products/{text['slug']}"
    result = []
    for c in ordered:
        name = text.get("colourNames", {}).get(c["code"]) or maps["colours"].get(c["name"])
        if not name:
            raise AssemblyError(f"lipsește traducerea pentru culoarea {c['name']!r}")
        main_img = PUBLIC_IMAGES / text["slug"] / f"{c['code']}-PS.webp"
        if CHECK_IMAGES and not main_img.exists():
            raise AssemblyError(f"lipsește poza pentru {c['code']} (rulează fetch_images_portwest.py)")
        result.append({"code": c["code"], "name": name, "swatch": None,
                       "images": [{"src": f"{base}/{c['code']}-PS.webp", "thumb": f"{base}/{c['code']}-PS-thumb.webp",
                                   "view": "PS"}],
                       "spin": []})
    return result


def sizes(source, text):
    values = source["sizes"]
    if not values:
        raise AssemblyError("nu am mărimi în sursă")
    summary = values[0] if len(values) == 1 else f"{values[0]}–{values[-1]}"
    return {"summary": summary, "values": values, "table": [], "note": text.get("sizeNote")}


def documents(source, text):
    result = []
    target = PUBLIC_DOCS / text["slug"]
    for name, kind, label in DOCS:
        src = WORK_DOCS / source["style"] / name
        dest = target / name
        if src.exists() and (not dest.exists() or dest.read_bytes() != src.read_bytes()):
            if src.stat().st_size > MAX_DOC_BYTES:
                raise AssemblyError(f"{name} are {src.stat().st_size // 1024} KB (max. 500 KB)")
            target.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dest)
        if dest.exists():
            result.append({"type": kind, "label": label, "url": f"/documente/{text['slug']}/{name}", "language": "ro"})
    if not result:
        raise AssemblyError("niciun document în română")
    return result


def manufacturer_note(source, text):
    maker = text.get("manufacturer")
    declared = (source.get("declaration") or {}).get("manufacturer") or ""
    if not maker:
        if declared and not declared.startswith("Portwest"):
            raise AssemblyError(f"declarația numește alt producător ({declared!r}): completează „manufacturer”")
        return []
    if squash(maker["name"].replace("Srl", "")) not in squash(declared):
        raise AssemblyError(f"„manufacturer” nu corespunde declarației ({declared!r})")
    return [f"Producător: {maker['name']} ({maker['country']}). Declarația UE de conformitate e semnată în numele "
            "Portwest, care vinde produsul în gama sa."]


def assemble(source, text, maps):
    check_certifications(text, source)
    check_weight(text, source)
    colour_list = colours(source, text, maps)
    card_colour = apply_card_photo(colour_list, text, PUBLIC_IMAGES, CHECK_IMAGES)  # poza pe model, dacă produsul are cardPhoto
    specs = []
    if text.get("material"):
        specs.append({"label": "Material", "value": text["material"]})
    if text.get("weight"):
        specs.append({"label": "Gramaj", "value": text["weight"].replace(" g/m²", f"{NBSP}g/m²")})
    specs += text.get("specs", [])
    entry = {
        "status": text["status"],
        "name": text["name"],
        "category": text["category"],
        "industries": text["industries"],
        "summary": text["summary"],
        "description": text["description"],
        "benefits": text["benefits"],
        "specs": specs,
        "notes": list(text.get("notes", [])) + manufacturer_note(source, text),
        "certifications": [{"code": c["code"], "label": c.get("label")} for c in text["certifications"]],
        "care": text.get("care", []),
        "colours": colour_list,
        **({"cardColour": card_colour} if card_colour is not None else {}),
        "otherColoursCount": 0,
        "sizes": sizes(source, text),
        "personalization": None,
        "documents": documents(source, text),
        "faq": text["faq"],
        "seo": text["seo"],
        "supplier": {
            "name": "Portwest",
            "brand": text.get("brand", "Portwest"),
            "model": source["style"],
            "range": RANGE_NAMES.get(source["collection"]),
            "productUrl": source["productUrl"],
        },
        "reviewNotes": [n for n in text.get("reviewNotes", []) if n],
        "source": {"feed": "Portwest: fișierele de date ale contului și documentele în română (documents.portwest.com)",
                   "assembledAt": date.today().isoformat()},
    }
    if text.get("riskFreeTesting") is False:  # „Testare fără riscuri” nu se aplică (D-2026-11-19-06)
        entry["riskFreeTesting"] = False
    return entry


def main(argv):
    global CHECK_IMAGES
    if "--no-image-check" in argv:
        CHECK_IMAGES = False
        argv = [a for a in argv if a != "--no-image-check"]
    source_dir, texts_dir, maps_path, out_dir = map(Path, argv[:4])
    maps = json.loads(maps_path.read_text(encoding="utf-8"))
    failed = False
    for text_path in sorted(texts_dir.glob("*.json")):
        if text_path.name.startswith("_"):
            continue
        text = json.loads(text_path.read_text(encoding="utf-8"))
        errors, warnings = lint(text)
        for w in warnings:
            print(f"   ! {text['model']}: {w}")
        try:
            if errors:
                raise AssemblyError("; ".join(errors))
            source = json.loads((source_dir / f"{text['model']}.json").read_text(encoding="utf-8"))
            entry = assemble(source, text, maps)
        except (AssemblyError, CardPhotoError, FileNotFoundError) as exc:
            print(f"!! {text['model']}: {exc}", file=sys.stderr)
            failed = True
            continue
        (out_dir / f"{text['slug']}.json").write_text(json.dumps(entry, ensure_ascii=False, indent=2) + "\n",
                                                       encoding="utf-8")
        print(f"ok {text['model']} -> {text['slug']}.json | culori {len(entry['colours'])} | "
              f"certificări {len(entry['certifications'])} | mărimi {entry['sizes']['summary']} | "
              f"documente {len(entry['documents'])} | status {entry['status']}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
