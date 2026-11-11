"""Assemble website product entries from MASCOT source facts + Romanian texts.

Usage:
  python -I scripts/catalog/assemble_mascot.py <source_dir> <texts_dir> <maps.json> <out_dir> [--no-network]

- <source_dir>: JSON files produced by extract_mascot.py (one per model, local only).
- <texts_dir>:  catalog/texts/mascot/<model>.json, Romanian copy written and reviewed by people.
- Facts (colours, images, sizes, certifications, care, logo zones, documents) are taken
  from the supplier feed, never typed by hand. Missing translations stop the build.
- Network is used only to check which extra product photos exist (HTTP HEAD).
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lint_texts import lint  # noqa: E402  (same folder; works with python -I)

NBSP = " "
ALLOWED_IMAGE_HOSTS = {"pimage.mascotworkwear.ie"}
LETTER_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"]
WEAVES = {"Ripstop": "ripstop", "Twill": "twill", "Pique fabric": "piqué", "ULTIMATE STRETCH": "ULTIMATE STRETCH"}


class MissingTranslation(Exception):
    pass


def norm(value):
    """Feed values sometimes contain non-breaking or repeated spaces; normalize before lookup."""
    return re.sub(r"\s+", " ", str(value).replace(NBSP, " ")).strip()


def tr(mapping, key, what):
    key = norm(key)
    if key not in mapping:
        raise MissingTranslation(f"lipsește traducerea pentru {what}: {key!r}")
    return mapping[key]


def first(fields, name):
    values = fields.get(name) or []
    return values[0] if values else None


def is_allowed_image_url(url):
    """Feed URLs are external data: only https on the supplier's image host may be requested."""
    parsed = urllib.parse.urlparse(url)
    return parsed.scheme == "https" and parsed.hostname in ALLOWED_IMAGE_HOSTS


def url_exists(url, network):
    if not is_allowed_image_url(url):
        return False
    if not network:
        return True
    req = urllib.request.Request(url, method="HEAD")  # noqa: S310 (scheme/host checked above)
    try:
        # URL validated above (https + allowlisted host), so file:// and other schemes can't reach urlopen.
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310, E501  # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
            return resp.status == 200
    except Exception:
        return False


def material(fields, maps):
    quality = first(fields, "Quality")
    if not quality:
        return None
    parts = []
    for chunk in (c.strip() for c in quality.split("/")):
        m = re.match(r"^(\d+)% ?(\S.*)$", chunk)
        if m:
            parts.append(f"{m.group(1)}{NBSP}% {tr(maps['materials'], m.group(2), 'material')}")
        else:
            parts.append(tr(maps["materials"], chunk.strip(), "material"))
    value = " / ".join(parts)
    remark = first(fields, "Quality remark")
    if remark:
        weave = remark.split(".")[0].strip()
        if weave in WEAVES:
            value += f", {WEAVES[weave]}"
    return value


def weight(fields):
    w = first(fields, "Quality weight")
    if not w:
        return None
    m = re.match(r"^Size (\d+): (\d+) g$", w)
    if m:
        return ("Greutate", f"{m.group(2)}{NBSP}g (mărimea {m.group(1)})")
    m = re.match(r"^(\d+) g/m²$", w)
    if m:
        return ("Gramaj", f"{m.group(1)}{NBSP}g/m²")
    raise MissingTranslation(f"format de gramaj necunoscut: {w!r}")


def cm(value):
    m = re.match(r"^(\d+(?:[.,]\d+)?) cm", value or "")
    return f"{m.group(1)}{NBSP}cm" if m else None


def sizes(source, text):
    rows = source["sizes"]
    eu = [r["EU Size"] for r in rows]
    if all(re.match(r"^\d{2}C\d{2}$", s) for s in eu):
        table = []
        for r in sorted(rows, key=lambda r: (r["EU Size"][:2], int(r["EU Size"][3:]))):
            table.append({"size": r["EU Size"][2:], "measure": f"talie {cm(r.get('Waist size'))}",
                          "leg": cm(r.get("Leg length"))})
        by_leg = {}
        for row in table:
            by_leg.setdefault(row["leg"], []).append(row["size"])
        summary = "; ".join(f"{v[0]}–{v[-1]} (picior {leg})" for leg, v in by_leg.items())
        values = sorted({row["size"] for row in table}, key=lambda s: int(s[1:]))
    elif all(re.match(r"^\d{4}$", s) for s in eu):
        table = [{"size": r["EU Size"][2:], "measure": f"UK {r.get('UK size', '').lstrip('M').replace('.', ',')}"}
                 for r in sorted(rows, key=lambda r: r["EU Size"])]
        values = [row["size"] for row in table]
        summary = f"{values[0]}–{values[-1]}"
    else:
        unknown = [s for s in eu if s not in LETTER_ORDER]
        if unknown:
            raise MissingTranslation(f"mărimi necunoscute: {unknown}")
        ordered = sorted(rows, key=lambda r: LETTER_ORDER.index(r["EU Size"]))
        table = [{"size": r["EU Size"], "measure": f"piept {cm(r.get('Chest size'))}" if r.get("Chest size") else None}
                 for r in ordered]
        values = [row["size"] for row in table]
        summary = f"{values[0]}–{values[-1]}"
    return {"summary": summary, "values": values, "table": table, "note": text.get("sizeNote")}


def colours(source, text, maps, network):
    ordered = [c for c in source["colours"] if c["ordered"]] or source["colours"][:1]
    primary = text.get("primaryColour") or ordered[0]["number"]
    ordered.sort(key=lambda c: c["number"] != primary)
    out = []
    for i, c in enumerate(ordered):
        feed_images = c["images_1000"]
        candidates = list(feed_images)
        if i == 0 and feed_images:
            base = feed_images[0]
            for view in ("P01", "P02", "P03", "P04", "P05", "P06"):
                candidates.append(re.sub(r"_(P\d\d|PS)_1000pxweb", f"_{view}_1000pxweb", base))
        seen, images = set(), []
        for url in candidates:
            if url in seen:
                continue
            seen.add(url)
            if url in feed_images or url_exists(url, network):
                images.append(url)
        out.append({"code": c["number"], "name": tr(maps["colours"], c["name"], "culoare"),
                    "swatch": c["swatch"], "images": images})
    other = len(source["colours"]) - len(ordered)
    return out, other


def personalization(fields, maps):
    raw = first(fields, "Logo placement")
    if not raw:
        return None
    placements, special, seen = [], False, set()
    for item in raw.split(";"):
        item = item.strip()
        if not item:
            continue
        parts = [p.strip() for p in item.split(".") if p.strip()]
        if len(parts) < 2:
            continue
        position = parts[1]
        if position.startswith("Special placement"):
            special = True
            continue
        if position in maps["logoPositionsSkip"]:
            continue
        m = re.search(r"Max (\d+)x(\d+) cm", item)
        label = tr(maps["logoPositions"], position, "poziție logo")
        if label in seen:
            continue
        seen.add(label)
        placements.append({"position": label, "maxSize": f"{m.group(1)} × {m.group(2)}{NBSP}cm" if m else None})
    hivis = first(fields, "Hi-vis logo area")
    note = None
    if hivis:
        m = re.search(r"maximum logo area of ([\d,\.]+)\s*m²", hivis)
        area = m.group(1).rstrip("0").rstrip(",.") if m else None
        note = ("Ca să păstrezi certificarea EN ISO 20471, suprafața totală a logourilor nu poate depăși "
                f"{area}{NBSP}m²; pe față, respectiv pe spate, poți folosi cel mult 50{NBSP}% din această suprafață.")
    return {"placements": placements, "special": special, "hiVisNote": note}


def documents(source, colour_list, model_quality):
    fields = source["fields"]
    primary = colour_list[0]["code"]
    docs = []
    for url in fields.get("Product PDF", []):
        if url.endswith(f"/{model_quality}-{primary}-en.pdf"):
            docs.append({"type": "fisa-tehnica", "label": "Fișă tehnică (în engleză)", "url": url, "language": "en"})
    today = date.today().strftime("%Y%m%d")
    raw_docs = [u.strip() for v in fields.get("DOC", []) for u in v.split(";") if u.strip()]
    multi = len(colour_list) > 1
    for c in colour_list:
        best = None
        for url in raw_docs:
            name = url.rsplit("/", 1)[-1]
            if not name.startswith(f"{model_quality}-{c['code']}_") or name.endswith("_UK.pdf"):
                continue
            m = re.search(r"_F(\d{8})_T(\d{8})", name)
            if m and m.group(2) >= today and (best is None or m.group(1) > best[0]):
                best = (m.group(1), url)
        if best:
            suffix = f" – {c['name']}" if multi else ""
            docs.append({"type": "declaratie-conformitate", "label": f"Declarație de conformitate UE{suffix}",
                         "url": best[1], "language": "en"})
    return docs


def assemble(source, text, maps, network):
    fields = source["fields"]
    quality = source["qualities"][0] if source["qualities"] else ""
    model_quality = f"{source['model']}-{quality}" if quality else source["model"]
    colour_list, other_colours = colours(source, text, maps, network)

    specs = []
    mat = material(fields, maps)
    if mat:
        specs.append({"label": "Material", "value": mat})
    w = weight(fields)
    if w:
        specs.append({"label": w[0], "value": w[1]})
    specs += text.get("specs", [])

    care = [tr(maps["care"], s.strip(), "întreținere")
            for v in fields.get("Washing Symbol Name", []) for s in v.split(";") if s.strip()]
    industrial = text.get("industrialCare")
    if not industrial and first(fields, "Industrial care category"):
        industrial = first(fields, "Industrial care category").replace(
            "Industrial care category", "Categoria de întreținere industrială")
    if industrial:
        care.append(industrial)

    certs = []
    for v in fields.get("Certification", []):
        for code in (norm(c) for c in v.split(";")):
            if code:
                cert = tr(maps["certifications"], code, "certificare")
                certs.append({"code": cert["code"], "label": cert["label"] or None})

    review_notes = [n for n in [text.get("industriesNote")] if n]
    return {
        "status": text["status"],
        "name": text["name"],
        "category": text["category"],
        "industries": text["industries"],
        "summary": text["summary"],
        "description": text["description"],
        "benefits": text["benefits"],
        "specs": specs,
        "notes": text.get("notes", []),
        "certifications": certs,
        "care": care,
        "colours": colour_list,
        "otherColoursCount": other_colours,
        "sizes": sizes(source, text),
        "personalization": personalization(fields, maps),
        "documents": documents(source, colour_list, model_quality),
        "faq": text["faq"],
        "seo": text["seo"],
        "supplier": {
            "name": "MASCOT",
            "brand": first(fields, "Brand") or "MASCOT®",
            "model": model_quality,
            "range": first(fields, "Range"),
            "productUrl": first(fields, "Product URL"),
        },
        "reviewNotes": review_notes,
        "source": {"feed": source["source"]["feed"], "assembledAt": date.today().isoformat()},
    }


def main(argv):
    network = "--no-network" not in argv
    argv = [a for a in argv if a != "--no-network"]
    source_dir, texts_dir, maps_path, out_dir = map(Path, argv[:4])
    maps = json.loads(maps_path.read_text(encoding="utf-8"))
    out_dir.mkdir(parents=True, exist_ok=True)
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
        source_path = source_dir / f"{text['model']}.json"
        if not source_path.exists():
            print(f"!! {text['model']}: lipsesc datele sursă ({source_path})", file=sys.stderr)
            failed = True
            continue
        try:
            entry = assemble(json.loads(source_path.read_text(encoding="utf-8")), text, maps, network)
        except MissingTranslation as exc:
            print(f"!! {text['model']}: {exc}", file=sys.stderr)
            failed = True
            continue
        (out_dir / f"{text['slug']}.json").write_text(
            json.dumps(entry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        colours = f"culori {len(entry['colours'])} (+{entry['otherColoursCount']} la cerere)"
        print(f"ok {text['model']} -> {text['slug']}.json | {colours} | "
              f"poze {sum(len(c['images']) for c in entry['colours'])} | certificări {len(entry['certifications'])} | "
              f"documente {len(entry['documents'])} | mărimi {entry['sizes']['summary']}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
