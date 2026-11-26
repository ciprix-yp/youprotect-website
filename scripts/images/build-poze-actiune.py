"""Build the WebP variants of the "action" photos (the list in src/data/poze-actiune.json) served from public/images/actiune/.

Usage (needs Pillow, which is not in the system Python):
  mise exec uv@0.13.6 -- uv run --no-project --with pillow python -I scripts/images/build-poze-actiune.py

Input : src/data/poze-actiune.json (single source of truth: id, slug, source, planned widths)
        .catalog-work/images/actiune/efectiv.json (field fisier_efectiv) + original/ or preview/ files.
        Both are local (gitignored): run scripts/images/fetch-poze-actiune.py first; it reads the committed
        scripts/images/poze-actiune-surse.json and writes efectiv.json (Portwest downloads also need
        PW_COLLECTION_URL / PW_COLLECTION_ID, see that script; not needed when the originals already exist).
        Previews are local sources: P11 (and any
        preview) is taken by hand from Media Hub into preview/<ID>.jpg and is never downloaded automatically, so
        a full regeneration needs that file (a missing file stops with a clear message).
        scripts/images/poze-actiune-surse.json, only for the optional `decupaj` of an ID: {x, y, latime, inaltime}
        in pixels of the source after EXIF rotation (M20: the left edge, with other brands on the equipment, is cut).
        The portrait crop (`portret.decupaj` in poze-actiune.json, fractions [x0, y0, x1, y1]) is relative to the WHOLE
        original (after EXIF rotation, before `decupaj`), independent of the desktop crop: it may extend outside it.
Output: public/images/actiune/<slug>-<width>.webp and src/data/poze-actiune-variante.json (real sizes).

Partial run: `--only ID[,ID...]` (IDs from poze-actiune.json) processes just those photos and MERGES their variants into the
existing poze-actiune-variante.json: the other entries stay byte for byte as they are, keys in the order of
poze-actiune.json. efectiv.json / originals are needed only for the listed IDs (useful when other originals are missing
locally). Without `--only` everything is rebuilt and the file is rewritten, as before.

Per photo: EXIF rotation, sRGB, LANCZOS resize (never upscaled), WebP with adaptive quality (starts at
q80, goes down until the file is under its byte budget; the hard limit is 250 KB, as in
tests/image-weight.test.mjs). All metadata is dropped: the pixels are copied into a fresh image and the
written files are checked for EXIF/XMP/ICC chunks. Idempotent: the same input gives the same files.

Security (inputs are untrusted files):
- only the fixed ID list is processed; the source path comes from a validated manifest field, must match
  (original|preview)/<ID>.(jpg|png|webp) and resolve inside the expected directory;
- a crop box must be exactly {x, y, latime, inaltime}, non-negative integers, non-empty and inside the source;
- Pillow keeps its default pixel limit (decompression-bomb warnings become errors); verify() + reload;
  only JPEG / PNG / WEBP are accepted;
- output names come only from src/data/poze-actiune.json (slug and widths are validated), never from
  external data; each output path must resolve inside public/images/actiune/.
"""
import argparse
import io
import json
import re
import sys
import warnings
from pathlib import Path

try:
    from PIL import Image, ImageCms, ImageOps
except ImportError:
    sys.exit("Pillow lipsește. Rulează: uv run --no-project --with pillow python -I scripts/images/build-poze-actiune.py")

warnings.simplefilter("error", Image.DecompressionBombWarning)  # default pixel limit stays on

ID_RE = re.compile(r"^[MPS][0-9]{2}$")
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / ".catalog-work" / "images" / "actiune"
MANIFEST = BASE / "efectiv.json"
DATA = ROOT / "src" / "data" / "poze-actiune.json"
SOURCES = ROOT / "scripts" / "images" / "poze-actiune-surse.json"
VARIANTS = ROOT / "src" / "data" / "poze-actiune-variante.json"
OUT = ROOT / "public" / "images" / "actiune"

SOURCE_RE = re.compile(r"^(original|preview)/([MPS][0-9]{2})\.(jpg|png|webp)$")
SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
FORMATS = {"JPEG", "PNG", "WEBP"}
BASE_WIDTHS = (640, 960, 1440)
# Lățimi. Poza obișnuită: 640/960/1440. Eroii (erou: true) nu au 640: pe telefon (390 px CSS, DPR 3) 640 px dă 1,79x și
# muchii moi, așa că au 768/960/1440/1920 (măsurat, task 12). Excepții în planned_widths(): sursa pătrată (raport < 1,2)
# are eroul doar 768/960/1440, iar nicio lățime nu depășește sursa (fără upscaling; după decupajul `decupaj`, dacă există).
# Excepție: un erou cu `latimiCorp` în date (azi S02, folosit și ca poză de corp în ghid) primește și setul de corp
# 640/960/1440; variantele doar de erou (768, 1920) au `doar: "erou"`, cele doar de corp (640) `doar: "corp"`,
# iar 960/1440 sunt comune.
HERO_WIDTHS = (768, 960, 1440, 1920)
MAX_BYTES = 250 * 1024  # limita dură, ca în tests/image-weight.test.mjs: peste ea scriptul se oprește cu EROARE
# Bugetul de octeți per lățime (țintă, nu limită dură): calitatea scade cu QUALITY_STEP până când fișierul încape.
# Eroii la 768 px (telefon): 45 KB. Dacă și la QUALITY_MIN (q50) fișierul rămâne peste buget, se păstrează la q50 și
# main() tipărește pe stderr `AVERTISMENT: ...` (azi: S01, S06 și S17 la 768 px, ieșiți la q50 peste 45 KB; bugetul
# nu s-a schimbat, e doar o abatere cunoscută, sub limita de 250 KB). Testul din tests/poze-actiune.test.mjs acceptă
# eroii la 768 px până la 56 KB (toleranță peste cei 45 KB) și portretul 4:5 la 768 px până la 55 KB (PORTRAIT_BUDGET).
BUDGET = {640: 70 * 1024, 768: 45 * 1024, 960: 120 * 1024, 1440: 200 * 1024, 1920: 240 * 1024}
QUALITY_START, QUALITY_MIN, QUALITY_STEP = 80, 50, 2
# 768 (eroii) pornește de la q70: la q80 ar depăși bugetul de 45 KB, iar măsurătoarea LCP s-a făcut pe q~70
QUALITY_START_BY_WIDTH = {768: 70}
SRGB = ImageCms.createProfile("sRGB")
CROP_KEYS = ("x", "y", "latime", "inaltime")


def fail(message):
    sys.exit(f"EROARE: {message}")


def load_source(entry, manifest_entry):
    rel = manifest_entry["fisier_efectiv"]
    match = SOURCE_RE.fullmatch(rel)
    if not match or match.group(2) != entry["id"] or match.group(1) != entry["sursa"]:
        fail(f"{entry['id']}: fisier_efectiv nepotrivit ({rel!r}) sau sursa diferă de JSON")
    path = (BASE / rel).resolve()
    if path.parent != (BASE / match.group(1)).resolve():
        fail(f"{entry['id']}: cale în afara directorului așteptat")
    try:
        with Image.open(path, formats=list(FORMATS)) as probe:
            fmt = probe.format
            probe.verify()
    except FileNotFoundError:
        fail(f"{entry['id']}: lipsește {rel}; rulează întâi scripts/images/fetch-poze-actiune.py")
    except OSError:  # includes UnidentifiedImageError (format outside JPEG/PNG/WEBP)
        fail(f"{entry['id']}: {rel} nu e o imagine JPEG/PNG/WEBP validă")
    if fmt not in FORMATS:
        fail(f"{entry['id']}: format nepermis {fmt}")
    with Image.open(path, formats=list(FORMATS)) as img:
        img.load()
        icc = img.info.get("icc_profile")
        img = ImageOps.exif_transpose(img)
        if icc:
            try:
                img = ImageCms.profileToProfile(
                    img.convert("RGB"), ImageCms.ImageCmsProfile(io.BytesIO(icc)), SRGB, outputMode="RGB"
                )
            except ImageCms.PyCMSError:
                # unreadable profile: pixels are treated as sRGB (the id only; nothing else from the file)
                print(f"AVERTISMENT {entry['id']}: profil ICC ilizibil, pixelii sunt tratați ca sRGB")
        img = img.convert("RGB")
        return Image.frombytes("RGB", img.size, img.tobytes())  # fresh image, no metadata carried over


def load_crops(ids):
    """The optional `decupaj` per ID from poze-actiune-surse.json, validated (the bounds are checked per image)."""
    crops = {}
    for source in json.loads(SOURCES.read_text(encoding="utf-8")):
        box = source.get("decupaj")
        if box is None:
            continue
        if source.get("id") not in ids:
            fail("poze-actiune-surse.json: decupaj pentru un id care nu e în poze-actiune.json")
        valid = (
            isinstance(box, dict)
            and set(box) == set(CROP_KEYS)
            and all(type(box[k]) is int and box[k] >= 0 for k in CROP_KEYS)
            and box["latime"] > 0
            and box["inaltime"] > 0
        )
        if not valid:
            fail(f"{source['id']}: decupaj invalid (cere exact x, y, latime, inaltime, numere întregi nenegative)")
        crops[source["id"]] = box
    return crops


def apply_crop(entry, src, box):
    x, y, w, h = (box[k] for k in CROP_KEYS)
    if x + w > src.size[0] or y + h > src.size[1]:
        fail(f"{entry['id']}: decupajul iese din imagine ({src.size[0]}x{src.size[1]})")
    return src.crop((x, y, x + w, y + h))


def planned_widths(entry, source_width, source_height):
    widths = []
    hero_widths = HERO_WIDTHS
    if source_width / source_height < 1.2:
        # Sursă pătrată (2048x2048): 1920x1920 nu încape în 250 KB la o calitate acceptabilă și, în cadrele late ale
        # eroilor, jumătate din pixeli sunt tăiați de object-fit. Eroii pătrați au 768/960/1440.
        hero_widths = HERO_WIDTHS[:3]
    for w in (hero_widths if entry["erou"] else BASE_WIDTHS):
        w = min(w, source_width)  # no upscaling: the last variant is the source width
        if w not in widths:
            widths.append(w)
    return widths


def planned_body_widths(source_width):
    """Setul de corp (640/960/1440) al unui erou care apare și ca poză de corp (`latimiCorp` în date); fără upscaling."""
    widths = []
    for w in BASE_WIDTHS:
        w = min(w, source_width)
        if w not in widths:
            widths.append(w)
    return widths


# Decupajul portret (4:5) al eroului homepage-ului pe telefon: `portret.decupaj` = [x0, y0, x1, y1] în fracții din
# ORIGINALUL ÎNTREG (după rotația EXIF, ÎNAINTE de `decupaj` din poze-actiune-surse.json), cu raportul 4:5 (în pixeli).
# Decupajul de desktop (16:9, `decupaj`) și cel de telefon (4:5) sunt independente: cel de telefon poate ieși din cel de
# desktop (ex. original 5820x3880, desktop y=374..3648, telefon y=0..3880). Lățimile eroului pe desktop
# (planned_widths) se calculează tot pe imaginea de desktop, deci nu depind de decupajul portret.
# Se scriu <slug>-p768.webp și <slug>-p960.webp, marcate `portret: true` în variante;
# `photoVariants()` le lasă în afara srcset-ului obișnuit, iar ActionPhoto le pune într-un <source> pe telefon.
PORTRAIT_WIDTHS = (768, 960)
PORTRAIT_BUDGET = {768: 55 * 1024, 960: 100 * 1024}
PORTRAIT_QUALITY_START = {768: 70, 960: 70}


def portrait_crop(full, box):
    """Decupajul 4:5 din imaginea ÎNTREAGĂ `full` (nu din cea decupată pentru desktop); fracțiile sunt relative la `full`."""
    if not (isinstance(box, list) and len(box) == 4 and all(isinstance(v, (int, float)) for v in box)):
        fail("portret.decupaj trebuie să fie [x0, y0, x1, y1]")
    x0, y0, x1, y1 = box
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        fail("portret.decupaj în afara imaginii")
    w, h = full.size
    crop = full.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h)))
    if abs(crop.size[0] / crop.size[1] - 0.8) > 0.01:
        fail(f"portret.decupaj nu e 4:5 (e {crop.size[0]}x{crop.size[1]})")
    if crop.size[0] < max(PORTRAIT_WIDTHS):
        fail(f"portret.decupaj prea mic ({crop.size[0]} px < {max(PORTRAIT_WIDTHS)} px): varianta ar fi mărită (upscaling)")
    return crop


def default_budget(width):
    return BUDGET.get(width, BUDGET[1440] if width > 960 else BUDGET[960])


def warn_over_budget(label, width, size, budget):
    """Fișierul a rămas peste buget chiar la QUALITY_MIN: se păstrează (sub MAX_BYTES), dar abaterea se vede."""
    if size > budget:
        print(
            f"AVERTISMENT: {label} {width}px rămas peste buget la q{QUALITY_MIN}: {size} B > {budget} B",
            file=sys.stderr,
        )


def encode(img, budget=None, quality=None):
    width = img.size[0]
    if budget is None:
        budget = default_budget(width)
    if quality is None:
        quality = QUALITY_START_BY_WIDTH.get(width, QUALITY_START)
    while True:
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=quality, method=6, exif=b"", icc_profile=None)
        data = buf.getvalue()
        if len(data) <= budget or quality <= QUALITY_MIN:
            return data, quality
        quality -= QUALITY_STEP


def chunk_names(data):
    names, pos = [], 12
    while pos + 8 <= len(data):
        names.append(data[pos:pos + 4].decode("ascii", "replace"))
        pos += 8 + int.from_bytes(data[pos + 4:pos + 8], "little") + (int.from_bytes(data[pos + 4:pos + 8], "little") & 1)
    return names


def parse_only(argv, ids):
    """The set of IDs from `--only ID[,ID...]`, or None when the option is absent. Each ID must match ID_RE and be in `ids`."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--only", default=None, help="doar aceste ID-uri (separate prin virgulă); restul rămân neatinse")
    raw = parser.parse_args(argv).only
    if raw is None:
        return None
    only = raw.split(",")
    if len(set(only)) != len(only) or not all(ID_RE.fullmatch(i) and i in ids for i in only):
        fail("--only cere id-uri unice, în formatul [MPS]NN, din poze-actiune.json")
    return set(only)


def merge_variants(ids, existing, fresh):
    """Variants for a partial run: fresh ones for the processed IDs, the existing ones untouched, in the order of `ids`."""
    return {i: fresh[i] if i in fresh else existing[i] for i in ids if i in fresh or i in existing}


def main(argv=None):
    entries = json.loads(DATA.read_text(encoding="utf-8"))
    ids = [e["id"] for e in entries]
    if not ids or len(set(ids)) != len(ids) or not all(ID_RE.fullmatch(i) for i in ids):
        fail("poze-actiune.json: id-uri lipsă, duplicate sau în format nepermis")
    only = parse_only(sys.argv[1:] if argv is None else argv, set(ids))
    if not MANIFEST.exists():
        fail(f"lipsește {MANIFEST.relative_to(ROOT)}; rulează întâi scripts/images/fetch-poze-actiune.py")
    manifest = {m["id"]: m for m in json.loads(MANIFEST.read_text(encoding="utf-8"))}
    crops = load_crops(set(ids))
    todo = [e for e in entries if only is None or e["id"] in only]
    missing = [e["id"] for e in todo if e["id"] not in manifest]
    if missing:
        fail(f"efectiv.json nu are intrări pentru: {' '.join(missing)}")
    OUT.mkdir(parents=True, exist_ok=True)
    out_root = OUT.resolve()
    variants = {}
    for entry in todo:
        if not SLUG_RE.fullmatch(entry["slug"]):
            fail(f"{entry['id']}: slug invalid")
        full = load_source(entry, manifest[entry["id"]])
        src = full
        if entry["id"] in crops:
            src = apply_crop(entry, src, crops[entry["id"]])
        widths = planned_widths(entry, src.size[0], src.size[1])
        if widths != entry["latimi"]:
            fail(f"{entry['id']}: latimi din JSON {entry['latimi']} != calculate {widths}")
        # Erou care apare și în corp (ex. S02: erou pe homepage, poză de corp în ghid): două seturi de lățimi. Fișierele
        # comune (960, 1440) se scriu o singură dată; variantele care aparțin unui singur set primesc `doar`.
        body = None
        if "latimiCorp" in entry:
            body = planned_body_widths(src.size[0])
            if not entry["erou"] or body != entry["latimiCorp"]:
                fail(f"{entry['id']}: latimiCorp din JSON {entry['latimiCorp']} != calculate {body} (sau poza nu e erou)")
        variants[entry["id"]] = []
        for w in (sorted(set(widths) | set(body)) if body else widths):
            h = round(src.size[1] * w / src.size[0])
            img = src if w == src.size[0] else src.resize((w, h), Image.LANCZOS)
            data, quality = encode(img)
            warn_over_budget(entry["id"], w, len(data), default_budget(img.size[0]))
            if len(data) > MAX_BYTES:
                fail(f"{entry['id']} {w}: {len(data) // 1024} KB peste limita de 250 KB")
            if {"EXIF", "XMP ", "ICCP"} & set(chunk_names(data)):
                fail(f"{entry['id']} {w}: metadate rămase în WebP")
            name = f"{entry['slug']}-{w}.webp"
            target = (OUT / name).resolve()
            if target.parent != out_root:
                fail("cale de ieșire în afara directorului")
            target.write_bytes(data)
            record = {"width": img.size[0], "height": img.size[1], "file": name, "bytes": len(data)}
            if body and (w in body) != (w in widths):
                record["doar"] = "corp" if w in body else "erou"
            variants[entry["id"]].append(record)
            print(f"{entry['id']} {w}x{h} q{quality} {len(data) // 1024} KB")
        if entry.get("portret"):
            crop = portrait_crop(full, entry["portret"].get("decupaj"))
            for w in PORTRAIT_WIDTHS:
                h = w * 5 // 4  # exact 4:5 (testul cere raportul 1,25), nu round() pe decupajul aproximativ
                img = crop.resize((w, h), Image.LANCZOS)
                data, quality = encode(img, PORTRAIT_BUDGET[w], PORTRAIT_QUALITY_START[w])
                warn_over_budget(f"{entry['id']} portret", w, len(data), PORTRAIT_BUDGET[w])
                if len(data) > MAX_BYTES or {"EXIF", "XMP ", "ICCP"} & set(chunk_names(data)):
                    fail(f"{entry['id']} portret {w}: prea mare sau cu metadate")
                name = f"{entry['slug']}-p{w}.webp"
                target = (OUT / name).resolve()
                if target.parent != out_root:
                    fail("cale de ieșire în afara directorului")
                target.write_bytes(data)
                variants[entry["id"]].append(
                    {"width": w, "height": h, "file": name, "bytes": len(data), "portret": True}
                )
                print(f"{entry['id']} portret {w}x{h} q{quality} {len(data) // 1024} KB")
    if only is not None:
        if not VARIANTS.exists():
            fail(f"--only cere un {VARIANTS.name} existent (altfel rulează fără --only)")
        variants = merge_variants(ids, json.loads(VARIANTS.read_text(encoding="utf-8")), variants)
        absent = [i for i in ids if i not in variants]
        if absent:
            print(f"AVERTISMENT: fără variante pentru {' '.join(absent)} (nici în fișier, nici în --only)", file=sys.stderr)
    VARIANTS.write_text(json.dumps(variants, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
