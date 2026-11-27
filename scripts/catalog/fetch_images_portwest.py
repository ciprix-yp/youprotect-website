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
- Person photos (cardPhoto.sourceId = Media Hub asset id): `--card-only` downloads just those, anonymously, from
  mediahub.portwest.com (host re-checked on every redirect; the signed download link is never printed or stored). The
  Media Hub "xlarge" derivative (JPEG, up to 2000 px) is taken, never the multi-MB original (PSD/17 MB JPEG).
  The collection page and id are NOT in the repo: PW_COLLECTION_URL / PW_COLLECTION_ID (or --collection-url /
  --collection-id), same as scripts/images/fetch-poze-actiune.py. Output: <colour>-C<8 id chars>.webp (+ -thumb).
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))  # python -I does not add the script folder
import safe_fetch  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from card_photo import card_photo_errors, card_view  # noqa: E402

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


MEDIAHUB_HOST = "mediahub.portwest.com"
ASSET_RE = re.compile(r"^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{16}$")
PAGE_RE = re.compile(r"^https://mediahub\.portwest\.com/web/[0-9a-f]{8,32}/[a-z0-9_-]+/?$")
CARD_MAX_SIDE = 1600
CARD_MIN_SIDE = 800  # below this the card (600 px) would be soft: the photo is refused
CARD_BUDGET = 240 * 1024  # tests/image-weight.test.mjs


class MediaHub:
    """Anonymous Media Hub (Bynder) download of the 'web' derivative of one asset, by asset id."""

    def __init__(self, page_url, collection_id, client=None):
        if not PAGE_RE.fullmatch(page_url or "") or not ASSET_RE.fullmatch(collection_id or ""):
            raise ValueError("colecția Media Hub lipsește sau are format invalid (PW_COLLECTION_URL / PW_COLLECTION_ID)")
        self.page_url, self.collection_id = page_url, collection_id
        self.client = client or safe_fetch.SafeClient({MEDIAHUB_HOST}, user_agent="youprotect-catalog-sync")
        self.csrf = None

    def derivative_id(self, asset_id):
        """Item id of the largest 'web' derivative that fits the safe_fetch cap (the xlarge JPEG)."""
        if not ASSET_RE.fullmatch(asset_id):
            raise safe_fetch.FetchError("sourceId invalid pentru Portwest Media Hub")
        body, _ = self.client.request(f"https://{MEDIAHUB_HOST}/media/detail/?mediaId={asset_id}")
        best, best_size = None, 0
        for tag in re.findall(r"<a\b[^>]*>", body.decode("utf-8", "replace")):
            attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', tag))
            size = attrs.get("data-media-size", "")
            if (attrs.get("data-media-type") == "web" and attrs.get("data-media-id") == asset_id
                    and ASSET_RE.fullmatch(attrs.get("data-id", "")) and size.isdigit()
                    and best_size < int(size) <= safe_fetch.MAX_BYTES):
                best, best_size = attrs["data-id"], int(size)
        if not best:
            raise safe_fetch.FetchError("derivata web nu apare în Media Hub")
        return best

    def download(self, asset_id):
        item = self.derivative_id(asset_id)
        if not self.csrf:
            page, _ = self.client.request(self.page_url)
            match = re.search(r'csrf = "([0-9a-f]{20,64})"', page.decode("utf-8", "replace"))
            if not match:
                raise safe_fetch.FetchError("token CSRF negăsit")
            self.csrf = match.group(1)
        form = urllib.parse.urlencode([
            ("type", "mediaItem"), ("iframe", "false"), ("includeArchive", "true"),
            ("collectionId", self.collection_id), ("addAdditionals", "true"),
            ("requestData", item), ("media_ids[]", item)]).encode()
        answer, _ = self.client.request(f"https://{MEDIAHUB_HOST}/new_download/", data=form, max_bytes=1024 * 1024, headers={
            "X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": self.csrf, "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "Referer": self.page_url})
        signed = json.loads(answer).get("signed_url")
        if not isinstance(signed, str):
            raise safe_fetch.FetchError("Media Hub nu a returnat URL de descărcare")
        return self.client.request_image(signed, headers={"Referer": self.page_url})  # signed URL: never logged


def strip_letterbox(img):
    """Media Hub 'xlarge' derivatives are letterboxed to a square with pure-white bars. When the picture itself is not
    on white (a scene or a grey studio), cut the bars so the card crop and the gallery see only the photo."""
    from PIL import Image  # noqa: PLC0415  (Pillow is only needed by the downloaders that run with it)

    gray = img.convert("L")
    w, h = gray.size
    cols = [gray.crop((x, 0, x + 1, h)).getextrema() for x in range(w)]
    rows = [gray.crop((0, y, w, y + 1)).getextrema() for y in range(h)]

    def bars(lines):
        first = next((i for i, (lo, _hi) in enumerate(lines) if lo < 250), None)
        last = next((i for i, (lo, _hi) in reversed(list(enumerate(lines))) if lo < 250), None)
        return first, last

    x0, x1 = bars(cols)
    y0, y1 = bars(rows)
    if x0 is None or y0 is None:
        return img
    box = (x0, y0, x1 + 1, y1 + 1)
    inner = gray.crop(box)
    edge_mean = inner.crop((0, 0, 1, inner.height)).resize((1, 1), Image.BOX).getpixel((0, 0))
    if edge_mean > 235 or box == (0, 0, w, h):  # white studio: keep the margins, the card builder trims them
        return img
    return img.crop(box)


def process_card_photo(hub, style, colour, card, cache_dir, out, public_dir):
    """Save the person photo of `cardPhoto` (<colour>-C<id8>.webp + thumb); the source must be >= CARD_MIN_SIDE px."""
    view = card_view(card["sourceId"])
    cache = safe_fetch.safe_join(cache_dir, f"{style}-{view}.img")
    if cache.exists():
        raw = cache.read_bytes()
    else:
        time.sleep(0.5)
        raw = hub.download(card["sourceId"])
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(raw)
    img = strip_letterbox(safe_fetch.clean_image(raw))
    if max(img.size) < CARD_MIN_SIDE:
        raise safe_fetch.FetchError(f"poza are doar {max(img.size)} px pe latura lungă")
    stem = f"{colour}-{view}" if colour else view
    safe_fetch.save_webp(img, out / f"{stem}.webp", CARD_MAX_SIDE, 82, base=public_dir, budget=CARD_BUDGET)
    safe_fetch.save_webp(img, out / f"{stem}-thumb.webp", 240, 75, base=public_dir)
    return stem, img.size


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


def card_main(argv, environ):
    """`--card-only`: download just the cardPhoto person photos (Media Hub), nothing from the CDN."""
    args = [a for a in argv if a != "--card-only"]
    options = dict(a.split("=", 1) for a in args if a.startswith("--") and "=" in a)
    source_dir, texts_dir, cache_dir, public_dir = map(Path, [a for a in args if not a.startswith("--")][:4])
    hub = MediaHub(options.get("--collection-url") or environ.get("PW_COLLECTION_URL"),
                   options.get("--collection-id") or environ.get("PW_COLLECTION_ID"))
    failed = False
    for text_path in sorted(texts_dir.glob("*.json")):
        text = json.loads(text_path.read_text(encoding="utf-8")) if not text_path.name.startswith("_") else {}
        card = text.get("cardPhoto")
        if not card or "sourceId" not in card:
            continue
        errors = card_photo_errors(text)
        if errors or not SLUG_RE.match(text["slug"]) or not STYLE_RE.match(text["model"]):
            print(f"!! {text_path.name}: {'; '.join(errors) or 'cod sau slug invalid'}", file=sys.stderr)
            failed = True
            continue
        try:
            out = safe_fetch.safe_join(public_dir, text["slug"])
            out.mkdir(parents=True, exist_ok=True)
            stem, size = process_card_photo(hub, text["model"], card["colour"], card, cache_dir, out, public_dir)
            print(f"ok {text['model']} -> {stem}.webp (sursă {size[0]}x{size[1]})")
        except Exception as exc:  # noqa: BLE001  (never print the message: it could carry a signed URL)
            why = exc if isinstance(exc, safe_fetch.FetchError) else type(exc).__name__
            if isinstance(exc, urllib.error.HTTPError):
                why = f"HTTPError {exc.code}"  # code only: the message could carry a signed URL
            print(f"!! {text['model']}: {why}", file=sys.stderr)
            failed = True
    sys.exit(1 if failed else 0)


def main(argv):
    if "--card-only" in argv:
        card_main(argv, os.environ)
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
