"""Assemble website product entries from Sir Safety facts + Romanian texts.

Usage:
  python -I scripts/catalog/assemble_sirsafety.py <source_dir> <texts_dir> <maps.json> <out_dir>
         [--public-dir public/images/products]

- <source_dir>: JSON from extract_sirsafety.py (product page + English datasheet text).
- <texts_dir>:  catalog/texts/sirsafety/<CODE>.json, Romanian copy (see catalog/texts/_template.json).
- Taken from the source, never typed: colour codes and photos, sizes, documents, product URL.
- Written in the text file but checked against the English datasheet: every certification code
  and the fabric weight must appear in it, otherwise the assembly stops.
- Missing colour translations or missing local photos also stop it.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lint_texts import lint  # noqa: E402  (same folder; works with python -I)

NBSP = "\u00a0"  # spațiu nedespărțit între număr și unitate
CHECK_IMAGES = True  # --no-image-check: validează textele înainte de descărcarea pozelor


class AssemblyError(Exception):
    pass


def squash(s):
    """Lower-case, single spaces, no NBSP: for checking that a value appears in the datasheet."""
    return re.sub(r"\s+", " ", str(s).replace(NBSP, " ")).strip().lower()


def datasheet_colour_names(text):
    i = text.find("AVAILABLE COLOURS")
    j = text.find("SIZES", i)
    if i < 0:
        return {}
    chunk = text[i + len("AVAILABLE COLOURS"):j if j > 0 else None].replace("\n", " ")
    pattern = r"\b([A-Z0-9]{2}) - ([A-Z][A-Z /-]*?)(?= [A-Z0-9]{2} - |\s*www\.|$)"
    return {m.group(1): m.group(2).strip() for m in re.finditer(pattern, chunk)}


def datasheet_sizes(text):
    i = text.find("\nSIZES")
    j = text.find("In stock", i)
    if i < 0 or j < 0:
        return []
    chunk = text[i + len("\nSIZES"):j]
    if chunk.split()[:2] == ["ONE", "SIZE"]:  # căști, ochelari, antifoane, hamuri; la lonje urmează lungimea („ONE SIZE 1,8”)
        return ["Mărime unică"]
    # Fișele scriu XX pentru XXL și 3X, 4X… pentru 3XL, 4XL…; pe site folosim 2XL, 3XL…
    norm = {"XX": "2XL", "XXL": "2XL"}
    values = []
    for t in chunk.split():
        glove = re.match(r"^(X{0,2}[SML]|XL)-(\d{1,2})$", t)  # mănuși: „S-7” = mărimea S, numărul 7 (EN ISO 21420)
        if glove:
            values.append(f"{glove.group(1)} ({glove.group(2)})")
        elif re.match(r"^(\d{1,2}|X{0,2}[SML]|XL|XX|\dX|\dXL)$", t):  # 1 cifră: mănuși (8 9 10 11)
            values.append(norm.get(t, re.sub(r"^(\d)X$", r"\1XL", t)))
    return values


def colours(source, text, maps, public_dir):
    names = datasheet_colour_names(source["datasheet"]["text"])
    ordered = sorted(source["colours"], key=lambda c: c["code"] != text["primaryColour"])
    if ordered[0]["code"] != text["primaryColour"]:
        raise AssemblyError(f"culoarea principală {text['primaryColour']} nu există în sursă")
    result = []
    folder = public_dir / text["slug"]
    for c in ordered:
        if c["code"] == "":
            # Produs fără variante de culoare (ochelari, viziere, antifoane): o singură intrare, fără nume de culoare;
            # fișa de produs nu mai arată blocul „Culori”.
            main, thumb = folder / "PS.webp", folder / "PS-thumb.webp"
            if CHECK_IMAGES and (not main.exists() or not thumb.exists()):
                raise AssemblyError("lipsește poza (rulează fetch_images_sirsafety.py)")
            base = f"/images/products/{text['slug']}"
            result.append({"code": "", "name": "", "swatch": None,
                           "images": [{"src": f"{base}/{main.name}", "thumb": f"{base}/{thumb.name}", "view": "PS"}],
                           "spin": []})
            continue
        en = c["name"] or names.get(c["code"])
        override = text.get("colourNames", {}).get(c["code"])  # ex. două nuanțe numite „GREEN” în sursă
        if not en:
            raise AssemblyError(f"culoarea {c['code']} nu are nume în sursă")
        if not override and en not in maps["colours"]:
            raise AssemblyError(f"lipsește traducerea pentru culoarea {en!r}")
        main, thumb = folder / f"{c['code']}-PS.webp", folder / f"{c['code']}-PS-thumb.webp"
        if CHECK_IMAGES and (not main.exists() or not thumb.exists()):
            raise AssemblyError(f"lipsește poza pentru {c['code']} (rulează fetch_images_sirsafety.py)")
        base = f"/images/products/{text['slug']}"
        result.append({
            "code": c["code"],
            "name": override or maps["colours"][en],
            "swatch": None,
            "images": [{"src": f"{base}/{main.name}", "thumb": f"{base}/{thumb.name}", "view": "PS"}],
            "spin": [],
        })
    return result


def sizes(source, text):
    values = datasheet_sizes(source["datasheet"]["text"])
    if not values:
        raise AssemblyError("nu am găsit mărimile în fișa tehnică")
    summary = values[0] if len(values) == 1 else f"{values[0]}–{values[-1]}"
    return {"summary": summary, "values": values, "table": [], "note": text.get("sizeNote")}


def assemble(source, text, maps, public_dir):
    ds = source["datasheet"]["text"]
    sheet = squash(ds)
    for cert in text["certifications"]:
        core = re.match(r"(EN(?: ISO| IEC)? \d+(?:-\d+)*|IEC \d+(?:-\d+)*|OEKO-TEX)", cert["code"])
        if not core or squash(core.group(1)) not in sheet:
            raise AssemblyError(f"certificarea {cert['code']!r} nu apare în fișa tehnică")
    if text.get("weight") and squash(text["weight"]).replace(" ", "") not in sheet.replace(" ", ""):
        raise AssemblyError(f"gramajul {text['weight']!r} nu apare în fișa tehnică")

    specs = []
    if text.get("material"):
        specs.append({"label": "Material", "value": text["material"]})
    if text.get("weight"):
        specs.append({"label": "Gramaj", "value": text["weight"].replace(" g/m²", f"{NBSP}g/m²")})
    specs += text.get("specs", [])

    documents = [{"type": "fisa-tehnica", "label": "Fișă tehnică (în engleză)", "url": source["datasheet"]["url"],
                  "language": "en"}]
    # `declaration` vine din extract_sirsafety.py: linkul e un PDF verificat; fără el, fișa nu pune linkul.
    decl = source.get("declaration")
    notes = list(text.get("notes", []))
    if decl and decl["kind"] == "conformity":
        documents.append({"type": "declaratie-conformitate", "label": "Declarație de conformitate UE (în engleză)",
                          "url": decl["url"], "language": "en"})
    elif decl and decl["kind"] == "correspondence":
        # Produs fabricat de altcineva: Sir Safety declară că articolul lor corespunde modelului producătorului.
        maker = text.get("manufacturer")
        if not maker or not decl["manufacturer"] or squash(maker["name"]) not in squash(decl["manufacturer"]):
            raise AssemblyError("produsul e fabricat de altcineva: completează „manufacturer” {name, country} "
                                f"ca în declarația de corespondență ({decl['manufacturer']!r})")
        documents.append({"type": "declaratie-corespondenta",
                          "label": "Declarație de corespondență Sir Safety (în italiană), cu declarația UE a producătorului",
                          "url": decl["url"], "language": "it"})
        notes.append(f"Producător: {maker['name']} ({maker['country']}). Sir Safety System vinde produsul cu codul "
                     f"{source['code']} și declară că acesta corespunde modelului producătorului.")
    series = next((line.strip() for line in ds.splitlines()[1:3] if line.strip().endswith("SERIES")), None)
    return {
        "status": text["status"],
        "name": text["name"],
        "category": text["category"],
        "industries": text["industries"],
        "summary": text["summary"],
        "description": text["description"],
        "benefits": text["benefits"],
        "specs": specs,
        "notes": notes,
        # Codul rămâne cel din fișă (verificat mai sus); doar „Class 3” se afișează în română, ca la MASCOT.
        "certifications": [{"code": re.sub(r"\s+Class\s+(\d)", r", clasa \1", c["code"]), "label": c.get("label")}
                           for c in text["certifications"]],
        "care": text.get("care", []),
        "colours": colours(source, text, maps, public_dir),
        "otherColoursCount": 0,
        "sizes": sizes(source, text),
        "personalization": None,
        "documents": documents,
        "faq": text["faq"],
        "seo": text["seo"],
        "supplier": {
            "name": "Sir Safety",
            # Marca produsului: Sir Safety System, sau a producătorului când Sir Safety vinde modelul lui (ex. Climax).
            "brand": text.get("brand", "Sir Safety System"),
            "model": source["code"],
            "range": series.title() if series else None,
            "productUrl": source["url"],
        },
        "reviewNotes": [n for n in text.get("reviewNotes", []) if n],
        "source": {"feed": "sirsafety.com: pagina produsului și fișa tehnică (EN)",
                   "assembledAt": date.today().isoformat()},
    }


def main(argv):
    global CHECK_IMAGES
    if "--no-image-check" in argv:
        CHECK_IMAGES = False
        argv = [a for a in argv if a != "--no-image-check"]
    public_dir = Path("public/images/products")
    if "--public-dir" in argv:
        i = argv.index("--public-dir")
        public_dir = Path(argv[i + 1])
        argv = argv[:i] + argv[i + 2:]
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
        if errors:
            for e in errors:
                print(f"!! {text['model']}: {e}", file=sys.stderr)
            failed = True
            continue
        try:
            source = json.loads((source_dir / f"{text['model']}.json").read_text(encoding="utf-8"))
            entry = assemble(source, text, maps, public_dir)
        except (AssemblyError, FileNotFoundError) as exc:
            print(f"!! {text['model']}: {exc}", file=sys.stderr)
            failed = True
            continue
        if text.get("riskFreeTesting") is False:  # „Testare fără riscuri” nu se aplică (D-2026-11-19-06)
            entry = {**entry, "riskFreeTesting": False}
        (out_dir / f"{text['slug']}.json").write_text(
            json.dumps(entry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"ok {text['model']} -> {text['slug']}.json | culori {len(entry['colours'])} | "
              f"certificări {len(entry['certifications'])} | mărimi {entry['sizes']['summary']} | status {entry['status']}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
