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
Output: public/images/actiune/<slug>-<width>.webp and src/data/poze-actiune-variante.json (real sizes).

Per photo: EXIF rotation, sRGB, LANCZOS resize (never upscaled), WebP with adaptive quality (starts at
q80, goes down until the file is under its byte budget; the hard limit is 250 KB, as in
tests/image-weight.test.mjs). All metadata is dropped: the pixels are copied into a fresh image and the
written files are checked for EXIF/XMP/ICC chunks. Idempotent: the same input gives the same files.

Security (inputs are untrusted files):
- only the fixed ID list is processed; the source path comes from a validated manifest field, must match
  (original|preview)/<ID>.(jpg|png|webp) and resolve inside the expected directory;
- Pillow keeps its default pixel limit (decompression-bomb warnings become errors); verify() + reload;
  only JPEG / PNG / WEBP are accepted;
- output names come only from src/data/poze-actiune.json (slug and widths are validated), never from
  external data; each output path must resolve inside public/images/actiune/.
"""
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
VARIANTS = ROOT / "src" / "data" / "poze-actiune-variante.json"
OUT = ROOT / "public" / "images" / "actiune"

SOURCE_RE = re.compile(r"^(original|preview)/([MPS][0-9]{2})\.(jpg|png|webp)$")
SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
FORMATS = {"JPEG", "PNG", "WEBP"}
BASE_WIDTHS = (640, 960, 1440)
# Eroii (erou: true) nu au 640: pe telefon (390 px CSS, DPR 3) 640 px dă 1,79x și muchii moi; 768 px la q~70 cântărește
# la fel de puțin sau mai puțin și nu încetinește LCP (măsurat, task 12). Lățimi eroi: 768/960/1440/1920.
HERO_WIDTHS = (768, 960, 1440, 1920)
MAX_BYTES = 250 * 1024
# byte budget per width (ideal range from the brief); quality goes down until a file fits
BUDGET = {640: 70 * 1024, 768: 56 * 1024, 960: 120 * 1024, 1440: 200 * 1024, 1920: 240 * 1024}
QUALITY_START, QUALITY_MIN, QUALITY_STEP = 80, 50, 2
# 768 (eroii) pornește de la q70: la q80 ar depăși bugetul, iar măsurătoarea LCP s-a făcut pe q~70
QUALITY_START_BY_WIDTH = {768: 70}
SRGB = ImageCms.createProfile("sRGB")


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


def planned_widths(entry, source_width):
    widths = []
    for w in (HERO_WIDTHS if entry["erou"] else BASE_WIDTHS):
        w = min(w, source_width)  # no upscaling: the last variant is the source width
        if w not in widths:
            widths.append(w)
    return widths


def encode(img):
    width = img.size[0]
    budget = BUDGET.get(width, BUDGET[1440] if width > 960 else BUDGET[960])
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


def main():
    entries = json.loads(DATA.read_text(encoding="utf-8"))
    if not MANIFEST.exists():
        fail(f"lipsește {MANIFEST.relative_to(ROOT)}; rulează întâi scripts/images/fetch-poze-actiune.py")
    manifest = {m["id"]: m for m in json.loads(MANIFEST.read_text(encoding="utf-8"))}
    ids = [e["id"] for e in entries]
    if not ids or len(set(ids)) != len(ids) or not all(ID_RE.fullmatch(i) for i in ids):
        fail("poze-actiune.json: id-uri lipsă, duplicate sau în format nepermis")
    missing = [i for i in ids if i not in manifest]
    if missing:
        fail(f"efectiv.json nu are intrări pentru: {' '.join(missing)}")
    OUT.mkdir(parents=True, exist_ok=True)
    out_root = OUT.resolve()
    variants = {}
    for entry in entries:
        if not SLUG_RE.fullmatch(entry["slug"]):
            fail(f"{entry['id']}: slug invalid")
        src = load_source(entry, manifest[entry["id"]])
        widths = planned_widths(entry, src.size[0])
        if widths != entry["latimi"]:
            fail(f"{entry['id']}: latimi din JSON {entry['latimi']} != calculate {widths}")
        variants[entry["id"]] = []
        for w in widths:
            h = round(src.size[1] * w / src.size[0])
            img = src if w == src.size[0] else src.resize((w, h), Image.LANCZOS)
            data, quality = encode(img)
            if len(data) > MAX_BYTES:
                fail(f"{entry['id']} {w}: {len(data) // 1024} KB peste limita de 250 KB")
            if {"EXIF", "XMP ", "ICCP"} & set(chunk_names(data)):
                fail(f"{entry['id']} {w}: metadate rămase în WebP")
            name = f"{entry['slug']}-{w}.webp"
            target = (OUT / name).resolve()
            if target.parent != out_root:
                fail("cale de ieșire în afara directorului")
            target.write_bytes(data)
            variants[entry["id"]].append(
                {"width": img.size[0], "height": img.size[1], "file": name, "bytes": len(data)}
            )
            print(f"{entry['id']} {w}x{h} q{quality} {len(data) // 1024} KB")
    VARIANTS.write_text(json.dumps(variants, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
