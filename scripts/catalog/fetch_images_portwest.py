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
- Download rules (host check on every redirect, real image type, size/pixel limits, sRGB without EXIF/XMP/ICC,
  paths under the output folders): scripts/lib/safe_fetch.py.
- Person photos (cardPhoto) from the Portwest Media Hub are not downloaded here: signed Media Hub links never go in the
  repo. card_photo.py documents the file name assemble_portwest.py expects for them.
"""
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))  # python -I does not add the script folder
import safe_fetch  # noqa: E402

ALLOWED_HOST = "d11ak7fd9ypfb7.cloudfront.net"
ALLOWED_PATH = "/styles1100px/"
STYLE_RE = re.compile(r"^[A-Z0-9]{2,8}$")
COLOUR_RE = re.compile(r"^[A-Z0-9]{1,4}$")
SLUG_RE = re.compile(r"^[a-z0-9-]+$")
HEADERS_UA = "Mozilla/5.0 (compatible; catalog-sync)"


def download(url, cache, client=None):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != ALLOWED_HOST or not parsed.path.startswith(ALLOWED_PATH):
        raise ValueError(f"URL în afara sursei permise: {url}")
    if cache.exists():
        return cache.read_bytes()
    time.sleep(0.5)
    client = client or safe_fetch.SafeClient({ALLOWED_HOST}, user_agent=HEADERS_UA)
    data = client.request_image(url)  # host re-checked on every redirect; real image type; 25 MB cap
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(data)
    return data


def fetch_style(source, slug, cache_dir, out, public_dir=None, style=None):
    """`style` is the model code from catalog/texts (validated); the cache path is built from it, never from the
    source file, and the source must say the same."""
    style = style or source["style"]
    if not STYLE_RE.fullmatch(style) or source["style"] != style:
        return [f"stil invalid sau diferit de text: {source.get('style')!r}"]
    public_dir = public_dir or out.parent
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    for c in source["colours"]:
        if not COLOUR_RE.match(c["code"]):
            errors.append(f"cod de culoare invalid: {c['code']!r}")
            continue
        try:
            raw = download(c["image"], safe_fetch.safe_join(cache_dir, f"{style}{c['code']}.jpg"))
            img = safe_fetch.clean_image(raw, alpha=False)
            safe_fetch.save_webp(img, out / f"{c['code']}-PS.webp", 1200, 82, base=public_dir)
            safe_fetch.save_webp(img, out / f"{c['code']}-PS-thumb.webp", 240, 75, base=public_dir)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{c['code']}: {exc if isinstance(exc, (ValueError, OSError)) else type(exc).__name__}")
    return errors


def main(argv):
    source_dir, texts_dir, cache_dir, public_dir = map(Path, argv[:4])
    failed = False
    for text_path in sorted(texts_dir.glob("*.json")):
        if text_path.name.startswith("_"):
            continue
        text = json.loads(text_path.read_text(encoding="utf-8"))
        style, slug = text["model"], text["slug"]
        if not STYLE_RE.match(style) or not SLUG_RE.match(slug) or len(slug) > safe_fetch.MAX_NAME:
            print(f"!! {text_path.name}: cod sau slug invalid", file=sys.stderr)
            failed = True
            continue
        source = json.loads(safe_fetch.safe_join(source_dir, f"{style}.json").read_text(encoding="utf-8"))
        out = safe_fetch.safe_join(public_dir, slug)
        errors = fetch_style(source, slug, cache_dir, out, public_dir, style)
        for e in errors:
            print(f"!! {style} {e}", file=sys.stderr)
        failed = failed or bool(errors)
        size = sum(f.stat().st_size for f in out.glob("*.webp")) // 1024
        print(f"ok {style} -> {slug}: {len(source['colours'])} culori, {size} KB")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
