"""Download Sir Safety product photos and save them as self-hosted WebP files.

Usage:
  uv run --no-project --with pillow==13.0.0 python -I scripts/catalog/fetch_images_sirsafety.py \
      <source_dir> <texts_dir> <cache_dir> <public_dir>

- <source_dir>: JSON from extract_sirsafety.py (colour codes + image URLs).
- <texts_dir>:  catalog/texts/sirsafety/<CODE>.json (gives the slug).
- Sir Safety publishes one front photo per colour (PNG, ~1100 px, transparent background).
  Output per colour: <colour>-PS.webp (max 1200 px) + <colour>-PS-thumb.webp (240 px).
- Originals are cached in <cache_dir>; only https://www.sirsafety.com/assets/img/prodotti/ is fetched.
- Download rules (host check on every redirect, real image type, size/pixel limits, sRGB without EXIF/XMP/ICC,
  paths under the output folders): scripts/lib/safe_fetch.py.
- Person photos (cardPhoto) are not downloaded here; card_photo.py documents the file name assemble_sirsafety.py expects.
"""
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))  # python -I does not add the script folder
import safe_fetch  # noqa: E402

ALLOWED_HOST = "www.sirsafety.com"
ALLOWED_PATH = "/assets/img/prodotti/"
CODE_RE = re.compile(r"^[A-Z]{1,3}\d{2,5}$")
COLOUR_RE = re.compile(r"^[A-Z0-9]{2}$")
SLUG_RE = re.compile(r"^[a-z0-9-]+$")
HEADERS_UA = "Mozilla/5.0 (compatible; catalog-sync)"


def download(url, cache, client=None):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != ALLOWED_HOST or not parsed.path.startswith(ALLOWED_PATH):
        raise ValueError(f"URL în afara sursei permise: {url}")
    if cache.exists():
        return cache.read_bytes()
    time.sleep(1.0)
    client = client or safe_fetch.SafeClient({ALLOWED_HOST}, user_agent=HEADERS_UA)
    data = client.request_image(url)  # host re-checked on every redirect; real image type; 25 MB cap
    safe_fetch.write_atomic(cache, data)
    return data


def main(argv):
    source_dir, texts_dir, cache_dir, public_dir = map(Path, argv[:4])
    failed = False
    for text_path in sorted(texts_dir.glob("*.json")):
        if text_path.name.startswith("_"):
            continue
        text = json.loads(text_path.read_text(encoding="utf-8"))
        code, slug = text["model"], text["slug"]
        if not CODE_RE.fullmatch(code) or not SLUG_RE.fullmatch(slug) or len(slug) > safe_fetch.MAX_NAME:
            print(f"!! {text_path.name}: cod sau slug invalid", file=sys.stderr)
            failed = True
            continue
        source = json.loads(safe_fetch.safe_join(source_dir, f"{code}.json").read_text(encoding="utf-8"))
        out = safe_fetch.safe_join(public_dir, slug)
        out.mkdir(parents=True, exist_ok=True)
        n = 0
        for c in source["colours"]:
            if c["code"] and not COLOUR_RE.fullmatch(c["code"]):
                continue
            stem = f"{c['code']}-PS" if c["code"] else "PS"  # "" = produs fără variante de culoare
            try:
                raw = download(c["image"], safe_fetch.safe_join(cache_dir, f"{code}{c['code']}.png"))
                img = safe_fetch.clean_image(raw, alpha=True)
                safe_fetch.save_webp(img, out / f"{stem}.webp", 1200, 82, base=public_dir)
                safe_fetch.save_webp(img, out / f"{stem}-thumb.webp", 240, 75, base=public_dir)
                n += 1
            except Exception as exc:  # noqa: BLE001
                reason = exc if isinstance(exc, (ValueError, OSError)) else type(exc).__name__
                print(f"!! {code} {c['code']}: {reason}", file=sys.stderr)
                failed = True
        size = sum(f.stat().st_size for f in out.glob("*.webp")) // 1024
        print(f"ok {code} -> {slug}: {n} culori, {size} KB")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
