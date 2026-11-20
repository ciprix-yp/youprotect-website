"""Extract source facts for selected Portwest models from the files fetch_portwest.py downloaded.

Usage:
  mise x uv@0.13.6 -- uv run -q --no-project --with pypdf python -I scripts/catalog/extract_portwest.py \
      <work_dir> <out_dir> <STYLE> [<STYLE> ...]

- <work_dir>: .catalog-work/portwest (CSV-urile și documente/<STYLE>/*.pdf, din fetch_portwest.py).
- Output: <out_dir>/<STYLE>.json, every value traceable to a Portwest file:
  descriptions + features (descrieri-ro.csv), certificate (certificari.csv), materials and care
  (materiale-*.csv), colours, sizes and photos (variante*.csv), the Romanian datasheet text and the
  Romanian EU declaration (category, standards, certificate, notified body).
- Prices and stock are not in the input files (fetch_portwest.py drops them) and never in the output.
"""
import csv
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

STYLE_RE = re.compile(r"^[A-Z0-9]{2,8}$")
LETTER_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL"]
# Pe site scriem 2XL și 3XL, ca la celelalte mărci.
SIZE_LABEL = {"XXL": "2XL", "XXXL": "3XL", "": "Mărime unică"}
FIT_LABEL = {"R": "obișnuită", "S": "scurtă", "T": "lungă"}
CDN_IMAGES = "https://d11ak7fd9ypfb7.cloudfront.net/"
DESC_FILES = ("descrieri-ro.csv", "descrieri-base-ro.csv")
CERT_FILES = ("certificari.csv", "certificari-base.csv")
MATERIAL_FILES = ("materiale-imbracaminte.csv", "materiale-incaltaminte.csv", "materiale-incaltaminte-base.csv",
                  "materiale-epi.csv")
VARIANT_FILES = ("variante.csv", "variante-base.csv")


def read_csv(path):
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig") as fh:
        return [{k: (v or "").replace("﻿", "").strip() for k, v in row.items() if k} for row in csv.DictReader(fh)]


def pdf_text(path):
    if not path.exists():
        return None
    return "\n".join(page.extract_text() or "" for page in PdfReader(path).pages)


def size_key(size):
    if size in LETTER_SIZES:
        return (0, LETTER_SIZES.index(size), size)
    if re.fullmatch(r"\d+(\.\d)?", size):
        return (1, float(size), size)
    return (2, 0, size)


def parse_declaration(text):
    """Categoria EIP, standardele, certificatul și organismul notificat din declarația UE în română."""
    if not text:
        return None
    flat = re.sub(r"\s+", " ", text)
    category = re.search(r"\(Cat\. ?(I{1,3})\)", flat)
    # Două șabloane: „standardul (standardele) armonizat(e) relevant(e):” și „standardul(ele) armonizat(e):”.
    start = re.search(r"armonizat\(e\)[^:\n]{0,40}:", text)
    end = re.search(r"PPE este identic|PPE se supune|Semnat", text[start.end():]) if start else None
    block = text[start.end():start.end() + end.start()] if start and end else ""
    cert = re.search(r"numărul de certificat (\S+)", flat)
    body_name = re.search(r"Eliberat de: ?([^\n]{1,120})", text)  # prima linie: numele, apoi adresa
    body_nb = re.search(r"Eliberat de: [^(]{1,200} \(NB: (\d+)\)", flat)
    maker = re.search(r"producătorului ([^,]{1,80}(?:, Srl [A-Za-z]+)?)", flat)
    # Toate declarațiile Portwest scriu „Cat. III”, și la genunchiere sau veste reflectorizante. Categoria III cere
    # supravegherea producției de către un organism notificat (modulul C2 sau D); o afișăm doar când declarația o
    # menționează.
    surveillance = re.search(r"\(modulul (C2|D)\)", flat, re.IGNORECASE)
    return {
        "category": category.group(1) if category else None,
        "productionSurveillance": surveillance.group(1).upper() if surveillance else None,
        "standards": [line.strip() for line in block.splitlines() if line.strip()],
        "certificate": cert.group(1) if cert else None,
        "notifiedBody": {"name": body_name.group(1).strip(), "number": body_nb.group(1)} if body_name and body_nb else None,
        "manufacturer": maker.group(1).strip() if maker else None,
    }


def group_by_image(rows, style):
    """Rândurile de croială obișnuită (R) grupate pe poză; celelalte croieli doar cu mărimile lor."""
    by_image, other_fits = {}, {}
    for r in rows:
        stem = r["Image_Path"].rsplit("/", 1)[-1].removesuffix(".jpg")
        if not stem.startswith(style) or not r["Image_Path"].startswith(CDN_IMAGES):
            continue
        if r["Fit"] and r["Fit"] != "R":
            other_fits.setdefault(r["Fit"], set()).add(r["Size"])
            continue
        code = stem[len(style):]
        if r["Fit"] and code.endswith(r["Fit"]) and len(code) > 2:  # FE05BGN: „N” e culoarea, nu croiala
            code = code[:-1]
        entry = by_image.setdefault(stem, {"code": code, "name": "", "image": r["Image_Path"], "sizes": set()})
        entry["name"] = entry["name"] or r["Colour"].strip()
        entry["sizes"].add(r["Size"])
    return by_image, other_fits


def size_labels(sizes):
    return [SIZE_LABEL.get(s, s) for s in sorted(sizes, key=size_key)]


def colours_and_sizes(rows, style):
    """O culoare = o poză de croială obișnuită (R); croiala scurtă/lungă devine notă la mărimi."""
    by_image, other_fits = group_by_image(rows, style)
    # Aceeași culoare sub două coduri (ex. CS11 NA/NV): păstrăm codul cu cele mai multe mărimi.
    by_name = {}
    for c in by_image.values():
        if c["name"] and len(c["sizes"]) > len(by_name.get(c["name"], {"sizes": ()})["sizes"]):
            by_name[c["name"]] = c
    colours = [{**c, "sizes": size_labels(c["sizes"])} for c in by_name.values()]
    all_sizes = size_labels({s for c in by_name.values() for s in c["sizes"]})
    fits = {FIT_LABEL.get(f, f): size_labels(v) for f, v in other_fits.items()}
    return colours, all_sizes, fits


def load_inputs(work):
    desc = {r["Style"]: r for f in DESC_FILES for r in read_csv(work / f)}
    # Caracteristicile sunt pe coloana Features și pe coloanele fără nume de după ea.
    features = {}
    for f in DESC_FILES:
        if (work / f).exists():
            with (work / f).open(encoding="utf-8-sig") as fh:
                for row in csv.reader(fh):
                    if row:
                        features.setdefault(row[0].replace("﻿", ""), [x.strip() for x in row[6:] if x.strip()])
    certs = {r["Style"]: r for f in CERT_FILES for r in read_csv(work / f)}
    materials = {}
    for f in MATERIAL_FILES:
        for r in read_csv(work / f):
            materials.setdefault(r["Style"], {k: v for k, v in r.items() if v and k != "Style"})
    variants = {}
    for f in VARIANT_FILES:
        for r in read_csv(work / f):
            variants.setdefault(r["Style"], []).append(r)
    return desc, features, certs, materials, variants


def build_source(style, work, desc, features, certs, materials, variants):
    d, c = desc[style], certs.get(style, {})
    docs = work / "documente" / style
    datasheet = pdf_text(docs / "fisa-tehnica-ro.pdf")
    declaration_text = pdf_text(docs / "declaratie-de-conformitate-ro.pdf")
    colours, sizes, fits = colours_and_sizes(variants[style], style)
    return {
        "style": style,
        "name": d["Product"].strip(),
        "productType": d["ProductType"],
        "range": d["Range"],
        "collection": d["Collection"],
        "description": d["Description"],
        "features": features.get(style, []),
        "certificate": {
            "testHouse": c.get("Test House"),
            "number": c.get("Cert No."),
            "standards": [c[k] for k in sorted(c) if k.startswith("Standards (") and c[k]],
        } if c else None,
        "materials": materials.get(style, {}),
        "colours": colours,
        "sizes": sizes,
        "otherFits": fits,
        "datasheet": {"text": datasheet, "local": datasheet is not None},
        "declaration": parse_declaration(declaration_text) | {"text": declaration_text} if declaration_text else None,
        "sizeChart": (docs / "tabel-marimi.pdf").exists(),
        "productUrl": f"https://portwest.com/products/view/{style}",
    }


def main(argv):
    work, out = Path(argv[0]), Path(argv[1])
    out.mkdir(parents=True, exist_ok=True)
    inputs = load_inputs(work)
    desc, _, _, _, variants = inputs
    failed = False
    for style in argv[2:]:
        if not STYLE_RE.match(style) or style not in desc or style not in variants:
            print(f"!! {style}: lipsește din descrieri sau variante", file=sys.stderr)
            failed = True
            continue
        source = build_source(style, work, *inputs)
        if not source["datasheet"]["text"] or not source["declaration"]:
            print(f"   ! {style}: lipsește fișa tehnică sau declarația în română")
        (out / f"{style}.json").write_text(json.dumps(source, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        decl = source["declaration"] or {}
        sizes = source["sizes"]
        print(f"ok {style}: {source['name'][:40]:40} | {len(source['colours'])} cul | {sizes[0]}–{sizes[-1]} | "
              f"{len(decl.get('standards', []))} standarde | modul {decl.get('productionSurveillance')}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
