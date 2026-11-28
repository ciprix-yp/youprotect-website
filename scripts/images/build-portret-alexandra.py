"""Build the WebP variants of the founder portrait used in the hero of /despre-noi/.

Usage (needs Pillow, which is not in the system Python):
  mise exec uv@0.13.6 -- uv run --no-project --with pillow==13.0.0 python -I scripts/images/build-portret-alexandra.py

Input : .catalog-work/images/portret-alexandra-20261126/original/IMG_7981.jpg (local, gitignored: a COPY of the
        file received from the owner; the original in Downloads is never touched). JPEG 1536x2304 (2:3), sRGB.
Output: public/images/portret-alexandra-pop-640.webp / -960 / -1280 / -1536 and src/data/portret-alexandra.json
        (real width, height and bytes per variant; the page reads it, nothing is hard-coded there).

Per variant: EXIF rotation, sRGB, LANCZOS resize (never upscaled, 1536 is the source width), lossy WebP with adaptive
quality (starts at q82, goes down until the file is under its byte budget; the hard limit is 250 KB, as in
tests/image-weight.test.mjs). ALL metadata is dropped: the pixels are copied into a fresh image (the camera EXIF of the
original, including the author field and the capture date, never reaches the output), and every written file is checked
for EXIF / XMP / ICCP chunks by reading the RIFF header. Idempotent: the same input gives the same files.

Security (the input is an untrusted file): the source path is fixed and must resolve inside the expected directory;
only JPEG is accepted; Pillow keeps its default pixel limit (decompression-bomb warnings become errors); verify() before
decode; output names are fixed here, never taken from external data.
"""
import io
import json
import sys
import warnings
from pathlib import Path

try:
    from PIL import Image, ImageCms, ImageOps
except ImportError:
    sys.exit(
        "Pillow lipsește. Rulează: uv run --no-project --with pillow==13.0.0 python -I scripts/images/build-portret-alexandra.py"
    )

warnings.simplefilter("error", Image.DecompressionBombWarning)

ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = (ROOT / ".catalog-work" / "images" / "portret-alexandra-20261126" / "original").resolve()
SRC = SRC_DIR / "IMG_7981.jpg"
OUT = (ROOT / "public" / "images").resolve()
DATA = ROOT / "src" / "data" / "portret-alexandra.json"
NAME = "portret-alexandra-pop"
WIDTHS = (640, 960, 1280, 1536)
MAX_BYTES = 250 * 1024
# Bugete orientative pe lățime; calitatea coboară până încap (limita dură e 250 KB).
BUDGET = {640: 45 * 1024, 960: 80 * 1024, 1280: 120 * 1024, 1536: 160 * 1024}
QUALITY_START, QUALITY_MIN, QUALITY_STEP = 82, 50, 2
SRGB = ImageCms.createProfile("sRGB")
FORBIDDEN = {"EXIF", "XMP ", "ICCP"}


def fail(message):
    sys.exit(f"EROARE: {message}")


def load_source():
    if SRC.resolve().parent != SRC_DIR:
        fail("calea sursei iese din directorul așteptat")
    try:
        with Image.open(SRC, formats=["JPEG"]) as probe:
            probe.verify()
    except FileNotFoundError:
        fail(f"lipsește {SRC.relative_to(ROOT)} (copia originalului din Downloads)")
    except OSError:
        fail(f"{SRC.name} nu e un JPEG valid")
    with Image.open(SRC, formats=["JPEG"]) as img:
        img.load()
        icc = img.info.get("icc_profile")
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        if icc:
            try:
                img = ImageCms.profileToProfile(img, ImageCms.ImageCmsProfile(io.BytesIO(icc)), SRGB, outputMode="RGB")
            except ImageCms.PyCMSError:
                print("AVERTISMENT: profil ICC ilizibil, pixelii sunt tratați ca sRGB")
        return Image.frombytes("RGB", img.size, img.tobytes())  # fresh image, no metadata carried over


def chunk_names(data):
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        fail("fișier WebP invalid")
    names, pos = [], 12
    while pos + 8 <= len(data):
        size = int.from_bytes(data[pos + 4:pos + 8], "little")
        names.append(data[pos:pos + 4].decode("ascii", "replace"))
        pos += 8 + size + (size & 1)
    return names


def encode(img, budget):
    quality = QUALITY_START
    while True:
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=quality, method=6, exif=b"", icc_profile=None)
        data = buf.getvalue()
        if len(data) <= budget or quality <= QUALITY_MIN:
            return data, quality
        quality -= QUALITY_STEP


def main():
    src = load_source()
    sw, sh = src.size
    if (sw, sh) != (1536, 2304):
        fail(f"sursa are {sw}x{sh}, se aștepta 1536x2304")
    variants = []
    for w in WIDTHS:
        w = min(w, sw)  # no upscaling
        h = round(sh * w / sw)
        img = src if w == sw else src.resize((w, h), Image.LANCZOS)
        data, quality = encode(img, BUDGET[w])
        if len(data) > MAX_BYTES:
            fail(f"{w}: {len(data) // 1024} KB peste limita de 250 KB")
        found = FORBIDDEN & set(chunk_names(data))
        if found:
            fail(f"{w}: metadate rămase în WebP: {sorted(found)}")
        name = f"{NAME}-{w}.webp"
        target = (OUT / name).resolve()
        if target.parent != OUT:
            fail("cale de ieșire în afara directorului")
        target.write_bytes(data)
        variants.append({"width": w, "height": h, "file": name, "bytes": len(data)})
        print(f"{w}x{h} q{quality} {len(data) / 1024:.1f} KB")
    DATA.write_text(json.dumps({"variants": variants}, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
