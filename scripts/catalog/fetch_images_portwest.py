"""Download Portwest product photos and save them as self-hosted WebP files.

Usage:
  mise x uv@0.13.6 -- uv run -q --no-project --with pillow python -I scripts/catalog/fetch_images_portwest.py \
      <source_dir> <texts_dir> <cache_dir> <public_dir>

- <source_dir>: JSON from extract_portwest.py (colour codes + photo URLs from Portwest's data file).
- <texts_dir>:  catalog/texts/portwest/<STYLE>.json (gives the slug).
- Portwest publishes one front photo per colour (JPEG, 1100 px, white background) on its CDN.
  Output per colour: <colour>-PS.webp (max 1200 px) + <colour>-PS-thumb.webp (240 px).
- Licence: the Portwest Media Hub terms let customers use the materials only to market and sell Portwest products
  (catalog/sources/portwest.md), so these photos stay on the Portwest product pages.
- Originals are cached in <cache_dir>; only https://d11ak7fd9ypfb7.cloudfront.net/styles1100px/ is fetched.
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

ALLOWED_HOST = "d11ak7fd9ypfb7.cloudfront.net"
ALLOWED_PATH = "/styles1100px/"
MAX_BYTES = 25 * 1024 * 1024
STYLE_RE = re.compile(r"^[A-Z0-9]{2,8}$")
COLOUR_RE = re.compile(r"^[A-Z0-9]{1,4}$")
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; catalog-sync)"}


def download(url, cache):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != ALLOWED_HOST or not parsed.path.startswith(ALLOWED_PATH):
        raise ValueError(f"URL în afara sursei permise: {url}")
    if cache.exists():
        return cache.read_bytes()
    time.sleep(0.5)
    req = urllib.request.Request(url, headers=HEADERS)  # noqa: S310  (schema și host validate mai sus)
    # URL verificat mai sus: doar pozele de produs de pe CDN-ul Portwest.
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


def fetch_style(source, slug, cache_dir, out):
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    for c in source["colours"]:
        if not COLOUR_RE.match(c["code"]):
            errors.append(f"cod de culoare invalid: {c['code']!r}")
            continue
        try:
            img = Image.open(io.BytesIO(download(c["image"], cache_dir / f"{source['style']}{c['code']}.jpg")))
            img.load()
            if img.format not in ("JPEG", "PNG", "WEBP"):
                raise ValueError(f"format neașteptat: {img.format}")
            img = img.convert("RGB")
            save_webp(img, out / f"{c['code']}-PS.webp", 1200, 82)
            save_webp(img, out / f"{c['code']}-PS-thumb.webp", 240, 75)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{c['code']}: {exc}")
    return errors


def main(argv):
    source_dir, texts_dir, cache_dir, public_dir = map(Path, argv[:4])
    failed = False
    for text_path in sorted(texts_dir.glob("*.json")):
        if text_path.name.startswith("_"):
            continue
        text = json.loads(text_path.read_text(encoding="utf-8"))
        style, slug = text["model"], text["slug"]
        if not STYLE_RE.match(style) or not re.match(r"^[a-z0-9-]+$", slug):
            print(f"!! {text_path.name}: cod sau slug invalid", file=sys.stderr)
            failed = True
            continue
        source = json.loads((source_dir / f"{style}.json").read_text(encoding="utf-8"))
        errors = fetch_style(source, slug, cache_dir, public_dir / slug)
        for e in errors:
            print(f"!! {style} {e}", file=sys.stderr)
        failed = failed or bool(errors)
        size = sum(f.stat().st_size for f in (public_dir / slug).glob("*.webp")) // 1024
        print(f"ok {style} -> {slug}: {len(source['colours'])} culori, {size} KB")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
