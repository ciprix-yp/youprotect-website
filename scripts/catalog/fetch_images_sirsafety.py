"""Download Sir Safety product photos and save them as self-hosted WebP files.

Usage:
  uv run --no-project --with pillow python -I scripts/catalog/fetch_images_sirsafety.py \
      <source_dir> <texts_dir> <cache_dir> <public_dir>

- <source_dir>: JSON from extract_sirsafety.py (colour codes + image URLs).
- <texts_dir>:  catalog/texts/sirsafety/<CODE>.json (gives the slug).
- Sir Safety publishes one front photo per colour (PNG, ~1100 px, transparent background).
  Output per colour: <colour>-PS.webp (max 1200 px) + <colour>-PS-thumb.webp (240 px).
- Originals are cached in <cache_dir>; only https://www.sirsafety.com/assets/img/prodotti/ is fetched.
"""
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ALLOWED_HOST = "www.sirsafety.com"
ALLOWED_PATH = "/assets/img/prodotti/"
MAX_BYTES = 25 * 1024 * 1024
CODE_RE = re.compile(r"^[A-Z]{1,3}\d{2,5}$")
COLOUR_RE = re.compile(r"^[A-Z0-9]{2}$")
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; catalog-sync)"}


def download(url, cache):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != ALLOWED_HOST or not parsed.path.startswith(ALLOWED_PATH):
        raise ValueError(f"URL în afara sursei permise: {url}")
    if cache.exists():
        return cache.read_bytes()
    time.sleep(1.0)
    req = urllib.request.Request(url, headers=HEADERS)  # noqa: S310  (schema și host validate mai sus)
    # URL verificat mai sus: doar imaginile de produs de pe www.sirsafety.com.
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310  # nosemgrep
        data = resp.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError(f"fișier prea mare: {url}")
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(data)
    return data


def save_webp(img, path, max_side, quality):
    im = img.copy()
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    im.save(path, "WEBP", quality=quality, method=6)


def main(argv):
    source_dir, texts_dir, cache_dir, public_dir = map(Path, argv[:4])
    failed = False
    for text_path in sorted(texts_dir.glob("*.json")):
        if text_path.name.startswith("_"):
            continue
        text = json.loads(text_path.read_text(encoding="utf-8"))
        code, slug = text["model"], text["slug"]
        if not CODE_RE.match(code) or not re.match(r"^[a-z0-9-]+$", slug):
            print(f"!! {text_path.name}: cod sau slug invalid", file=sys.stderr)
            failed = True
            continue
        source = json.loads((source_dir / f"{code}.json").read_text(encoding="utf-8"))
        out = public_dir / slug
        out.mkdir(parents=True, exist_ok=True)
        n = 0
        for c in source["colours"]:
            if not COLOUR_RE.match(c["code"]):
                continue
            try:
                raw = download(c["image"], cache_dir / f"{code}{c['code']}.png")
                img = Image.open(io.BytesIO(raw))
                img.load()
                if img.format not in ("PNG", "JPEG", "WEBP"):
                    raise ValueError(f"format neașteptat: {img.format}")
                img = img.convert("RGBA")
                save_webp(img, out / f"{c['code']}-PS.webp", 1200, 82)
                save_webp(img, out / f"{c['code']}-PS-thumb.webp", 240, 75)
                n += 1
            except Exception as exc:  # noqa: BLE001
                print(f"!! {code} {c['code']}: {exc}", file=sys.stderr)
                failed = True
        size = sum(f.stat().st_size for f in out.glob("*.webp")) // 1024
        print(f"ok {code} -> {slug}: {n} culori, {size} KB")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
