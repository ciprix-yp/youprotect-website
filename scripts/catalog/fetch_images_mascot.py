"""Download MASCOT product photos from Picturepark (guest session) and build web images.

Usage (needs Pillow):
  uv run --no-project --with pillow python -I scripts/catalog/fetch_images_mascot.py \
      <source_dir> <texts_dir> <cache_dir> <public_dir>

  <source_dir>  .catalog-work/mascot           (extract_mascot.py output: qualities, ordered colours, swatches)
  <texts_dir>   catalog/texts/mascot           (slug + primaryColour per model)
  <cache_dir>   .catalog-work/images/mascot    (downloaded originals, local only)
  <public_dir>  public/images/products         (web images, committed)

Per product: primary colour -> all 360° frames P01–P24 (+ PS pack shot); other ordered colours -> P01, P07, P13 (+ PS).
Web output per colour: gallery views as <colour>-<view>.webp (1200 px) + <colour>-<view>-thumb.webp (240 px),
<colour>-swatch.webp, and for the primary colour <colour>-spin-<view>.webp (800 px) for a future 360° viewer.

Security: only allowlisted https hosts are requested; codes are validated and every local path is built here,
never taken from API responses; responses must be images within a size cap.
"""
import http.cookiejar
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

PICTUREPARK = "https://mascot.picturepark.com"
ALLOWED_HOSTS = {"mascot.picturepark.com", "mascotsitecore-1ccb8.kxcdn.com"}
CODE = re.compile(r"^[A-Z0-9]{1,10}$")
SLUG = re.compile(r"^[a-z0-9-]{3,120}$")
VIEW = re.compile(r"^(P\d{2}|PS)$")
SPIN_VIEWS = [f"P{i:02d}" for i in range(1, 25)]
OTHER_VIEWS = ["P01", "P07", "P13"]
GALLERY_VIEWS = ["PS", "P01", "P04", "P07", "P13", "P19"]
MAX_BYTES = 25 * 1024 * 1024


def check_host(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError(f"host nepermis: {url}")


class Picturepark:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.opener.addheaders = [("User-Agent", "youprotect-catalog-sync"), ("Accept", "application/json, */*")]
        self._open(f"{PICTUREPARK}/bff/silent-login").read()  # anonymous guest session (cookie)

    def _open(self, url, payload=None):
        check_host(url)
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(url, data=data, method="POST" if data else "GET",  # noqa: S310 (host checked)
                                     headers={"x-csrf": "1", "Content-Type": "application/json"})
        return self.opener.open(req, timeout=60)  # noqa: S310  # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected

    def frames(self, mqc):
        """Map view -> content id for one model-quality-colour, from the search index."""
        resp = self._open(f"{PICTUREPARK}/service/Contents/search", {
            "searchString": mqc, "limit": 60, "channelId": "rootChannel",
            "searchType": "MetadataAndFullText", "lifeCycleFilter": "ActiveOnly"})
        results = json.loads(resp.read()).get("results", [])
        # Names vary in the DAM: "19035-449-14010_P01.jpg" and also "51587-969-02 P13" (space, no extension).
        pattern = re.compile(rf"^{re.escape(mqc)}[_ ](P\d{{2}}|PS)(\.(jpg|png))?$")
        found = {}
        for item in results:
            match = pattern.match(str(item.get("displayValues", {}).get("name", "")))
            content_id = str(item.get("id", ""))
            if match and re.fullmatch(r"[0-9a-f]{32}", content_id):
                found.setdefault(match.group(1), content_id)
        return found

    def download(self, content_id):
        resp = self._open(f"{PICTUREPARK}/service/Contents/downloads/{content_id}/Preview")
        return read_image(resp)


class NotRaster(ValueError):
    pass


def read_image(resp):
    content_type = resp.headers.get("Content-Type", "")
    if not content_type.startswith("image/"):
        raise ValueError(f"răspuns care nu e imagine: {content_type}")
    if "svg" in content_type:
        # SVG can carry scripts; we never re-host it on our domain.
        raise NotRaster("SVG")
    body = resp.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError("imagine prea mare")
    return body


def fetch_plain(url):
    check_host(url)
    req = urllib.request.Request(url, headers={"User-Agent": "youprotect-catalog-sync"})  # noqa: S310 (host checked)
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310  # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
        return read_image(resp)


def save_webp(raw, path, max_side, quality):
    img = Image.open(io.BytesIO(raw))
    img.load()
    img = img.convert("RGBA") if img.mode in ("RGBA", "LA", "P") else img.convert("RGB")
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=quality, method=6)


def cached(cache_dir, mqc, view, pp, content_id):
    path = cache_dir / mqc / f"{view}.img"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(pp.download(content_id))
        time.sleep(0.2)  # be gentle with the supplier's DAM
    return path.read_bytes()


def process_colour(pp, mqc, colour, is_primary, cache_dir, out_dir):
    wanted = SPIN_VIEWS + ["PS"] if is_primary else OTHER_VIEWS + ["PS"]
    available = pp.frames(mqc)
    stats = {"gallery": 0, "spin": 0, "missing": [v for v in wanted if v not in available and v != "PS"]}
    for view in wanted:
        if view not in available:
            continue
        raw = cached(cache_dir, mqc, view, pp, available[view])
        if view in GALLERY_VIEWS:
            save_webp(raw, out_dir / f"{colour}-{view}.webp", 1200, 82)
            save_webp(raw, out_dir / f"{colour}-{view}-thumb.webp", 240, 75)
            stats["gallery"] += 1
        if is_primary and view in SPIN_VIEWS:
            save_webp(raw, out_dir / f"{colour}-spin-{view}.webp", 800, 72)
            stats["spin"] += 1
    return stats


def main(argv):
    source_dir, texts_dir, cache_dir, public_dir = map(Path, argv[:4])
    pp = Picturepark()
    for text_path in sorted(texts_dir.glob("*.json")):
        if text_path.name.startswith("_"):
            continue
        text = json.loads(text_path.read_text(encoding="utf-8"))
        source = json.loads((source_dir / f"{text['model']}.json").read_text(encoding="utf-8"))
        slug, model, quality = text["slug"], source["model"], (source["qualities"] or [""])[0]
        if not (SLUG.match(slug) and CODE.match(model) and CODE.match(quality)):
            raise ValueError(f"cod invalid: {slug} {model} {quality}")
        ordered = [c for c in source["colours"] if c["ordered"]] or source["colours"][:1]
        primary = text.get("primaryColour") or ordered[0]["number"]
        out_dir = public_dir / slug
        for c in ordered:
            colour = c["number"]
            if not CODE.match(colour):
                raise ValueError(f"cod de culoare invalid: {colour}")
            mqc = f"{model}-{quality}-{colour}"
            stats = process_colour(pp, mqc, colour, colour == primary, cache_dir, out_dir)
            if c.get("swatch"):
                try:
                    save_webp(fetch_plain(c["swatch"]), out_dir / f"{colour}-swatch.webp", 64, 80)
                except NotRaster as exc:
                    stats["missing"].append(f"swatch ({exc})")
            note = f" lipsă: {','.join(stats['missing'])}" if stats["missing"] else ""
            print(f"ok {mqc}: galerie {stats['gallery']}, 360° {stats['spin']}{note}")


if __name__ == "__main__":
    main(sys.argv[1:])
