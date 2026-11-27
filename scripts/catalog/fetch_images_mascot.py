"""Download MASCOT product photos from Picturepark (guest session) and build web images.

Usage (needs Pillow):
  uv run --no-project --with pillow python -I scripts/catalog/fetch_images_mascot.py \
      <source_dir> <texts_dir> <cache_dir> <public_dir> [--spin]

  <source_dir>  .catalog-work/mascot           (extract_mascot.py output: qualities, ordered colours, swatches)
  <texts_dir>   catalog/texts/mascot           (slug + primaryColour per model)
  <cache_dir>   .catalog-work/images/mascot    (downloaded originals, local only)
  <public_dir>  public/images/products         (web images, committed)

Per product: primary colour -> gallery views PS, P01, P04, P07, P13, P19; other ordered colours -> P01, P07, P13 (+ PS).
Web output per colour: gallery views as <colour>-<view>.webp (1200 px) + <colour>-<view>-thumb.webp (240 px) and
<colour>-swatch.webp. With --spin, the primary colour also gets all 360° frames P01–P24 as <colour>-spin-<view>.webp
(800 px), for the 360° viewer idea (PROJECT_OS/07-IDEA_INBOX.md, I-2026-11-11-01). Off by default since 20.11.2026:
no page used them, and the 501 frames weighed 5.9 MB in every deploy.

Card photo (poza pe model): when catalog/texts/mascot/<model>.json has `cardPhoto` ({colour, sourceId, kind, focus, alt},
see card_photo.py), that DAM item is downloaded too, at up to 1800 px, as <colour>-C<id8>.webp (+ -thumb). It is looked up
by its content id (never by a name pattern) and its DAM name must contain the model-quality-colour code.

Security (scripts/lib/safe_fetch.py): allowlisted https hosts checked on every redirect hop, real image type (JPEG/PNG/WebP)
and pixel/size limits, validated names and paths that stay under the output folders, sRGB output without EXIF/XMP/ICC.
Signed URLs are never stored: only content ids.
"""
import json
import re
import sys
import time
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))  # python -I does not add the script folder
sys.path.insert(0, str(Path(__file__).resolve().parent))
import safe_fetch  # noqa: E402
from card_photo import card_photo_errors, card_view  # noqa: E402
from safe_fetch import FetchError, NotRaster  # noqa: E402

PICTUREPARK = "https://mascot.picturepark.com"
ALLOWED_HOSTS = {"mascot.picturepark.com", "mascotsitecore-1ccb8.kxcdn.com"}
CODE = re.compile(r"^[A-Z0-9]{1,10}$")
SLUG = re.compile(r"^[a-z0-9-]{3,120}$")
CONTENT_ID = re.compile(r"^[0-9a-f]{32}$")
# P01–P24 = 360° frames, PS = pack shot; F/M/A/D + two digits = photos with a person (front, model, action, detail).
VIEW = re.compile(r"^(P\d{2}|PS|[FMAD]\d{2})$")
SPIN_VIEWS = [f"P{i:02d}" for i in range(1, 25)]
OTHER_VIEWS = ["P01", "P07", "P13"]
GALLERY_VIEWS = ["PS", "P01", "P04", "P07", "P13", "P19"]
CARD_MAX_SIDE = 1800
CARD_BUDGET = 240 * 1024  # tests/image-weight.test.mjs: nothing in public/ over 250 KB
JSON_HEADERS = {"x-csrf": "1", "Content-Type": "application/json", "Accept": "application/json, */*"}


def name_pattern(mqc):
    """Names vary in the DAM: "19035-449-14010_P01.jpg" and also "51587-969-02 P13" (space, no extension)."""
    return re.compile(rf"^{re.escape(mqc)}[_ ](P\d{{2}}|PS|[FMAD]\d{{2}})(\.(jpe?g|png))?$")


def parse_frames(results, mqc):
    """Map view -> content id for one model-quality-colour, from search results."""
    pattern = name_pattern(mqc)
    found = {}
    for item in results:
        match = pattern.match(str(item.get("displayValues", {}).get("name", "")))
        content_id = str(item.get("id", ""))
        if match and CONTENT_ID.fullmatch(content_id):
            found.setdefault(match.group(1), content_id)
    return found


def find_card_item(results, mqc, source_id):
    """The search hit with this content id, only if its DAM name contains the model-quality-colour code (so a wrong id
    can never attach another product's photo). Raises FetchError otherwise."""
    if not CONTENT_ID.fullmatch(source_id):
        raise FetchError("sourceId invalid pentru MASCOT (32 de caractere hex)")
    for item in results:
        if str(item.get("id", "")) == source_id:
            name = str(item.get("displayValues", {}).get("name", ""))
            if not name_pattern(mqc).match(name):
                raise FetchError(f"poza cardPhoto nu aparține codului {mqc}")
            return name
    raise FetchError(f"poza cardPhoto nu apare în căutarea pentru {mqc}")


class Picturepark:
    def __init__(self):
        self.client = safe_fetch.SafeClient(ALLOWED_HOSTS, user_agent="youprotect-catalog-sync")
        self.client.request(f"{PICTUREPARK}/bff/silent-login", headers=JSON_HEADERS)  # anonymous guest session (cookie)

    def search(self, mqc):
        body, _ = self.client.request(f"{PICTUREPARK}/service/Contents/search", headers=JSON_HEADERS, data=json.dumps({
            "searchString": mqc, "limit": 60, "channelId": "rootChannel",
            "searchType": "MetadataAndFullText", "lifeCycleFilter": "ActiveOnly"}).encode())
        return json.loads(body).get("results", [])

    def frames(self, mqc):
        return parse_frames(self.search(mqc), mqc)

    def download(self, content_id):
        if not CONTENT_ID.fullmatch(content_id):
            raise FetchError("id de conținut invalid")
        return self.client.request_image(f"{PICTUREPARK}/service/Contents/downloads/{content_id}/Preview",
                                         headers=JSON_HEADERS)


def fetch_plain(url):
    client = safe_fetch.SafeClient(ALLOWED_HOSTS, user_agent="youprotect-catalog-sync")
    return client.request_image(url, timeout=30)


def save_webp(raw, path, max_side, quality, base, budget=None):
    safe_fetch.save_webp(safe_fetch.clean_image(raw), path, max_side, quality, base=base, budget=budget)


def cached(cache_dir, mqc, view, pp, content_id):
    path = safe_fetch.safe_join(cache_dir, mqc, f"{view}.img")
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(pp.download(content_id))
        time.sleep(0.2)  # be gentle with the supplier's DAM
    return path.read_bytes()


def process_card_photo(pp, mqc, colour, card, cache_dir, out_dir, public_dir):
    """Download the person photo of `cardPhoto` (by content id, name checked) at up to 1800 px."""
    find_card_item(pp.search(mqc), mqc, card["sourceId"])
    view = card_view(card["sourceId"])
    raw = cached(cache_dir, mqc, view, pp, card["sourceId"])
    save_webp(raw, out_dir / f"{colour}-{view}.webp", CARD_MAX_SIDE, 82, public_dir, CARD_BUDGET)
    save_webp(raw, out_dir / f"{colour}-{view}-thumb.webp", 240, 75, public_dir)
    return view


def process_colour(pp, mqc, colour, is_primary, cache_dir, out_dir, public_dir, with_spin=False):
    if is_primary:
        wanted = SPIN_VIEWS + ["PS"] if with_spin else GALLERY_VIEWS
    else:
        wanted = OTHER_VIEWS + ["PS"]
    available = pp.frames(mqc)
    stats = {"gallery": 0, "spin": 0, "missing": [v for v in wanted if v not in available and v != "PS"]}
    for view in wanted:
        if view not in available:
            continue
        raw = cached(cache_dir, mqc, view, pp, available[view])
        if view in GALLERY_VIEWS:
            save_webp(raw, out_dir / f"{colour}-{view}.webp", 1200, 82, public_dir)
            save_webp(raw, out_dir / f"{colour}-{view}-thumb.webp", 240, 75, public_dir)
            stats["gallery"] += 1
        if with_spin and is_primary and view in SPIN_VIEWS:
            save_webp(raw, out_dir / f"{colour}-spin-{view}.webp", 800, 72, public_dir)
            stats["spin"] += 1
    return stats


def main(argv):
    with_spin = "--spin" in argv
    source_dir, texts_dir, cache_dir, public_dir = map(Path, [a for a in argv if a != "--spin"][:4])
    pp = Picturepark()
    for text_path in sorted(texts_dir.glob("*.json")):
        if text_path.name.startswith("_"):
            continue
        text = json.loads(text_path.read_text(encoding="utf-8"))
        errors = card_photo_errors(text)
        if errors:
            raise ValueError(f"{text_path.name}: {'; '.join(errors)}")
        source = json.loads(safe_fetch.safe_join(source_dir, f"{text['model']}.json").read_text(encoding="utf-8"))
        slug, model, quality = text["slug"], source["model"], (source["qualities"] or [""])[0]
        if not (SLUG.match(slug) and CODE.match(model) and CODE.match(quality) and model == text["model"]):
            raise ValueError(f"cod invalid: {slug} {model} {quality}")
        ordered = [c for c in source["colours"] if c["ordered"]] or source["colours"][:1]
        primary = text.get("primaryColour") or ordered[0]["number"]
        card = text.get("cardPhoto")
        if card and card["colour"] not in [c["number"] for c in ordered]:
            raise ValueError(f"{model}: cardPhoto.colour {card['colour']} nu e în colours[]")
        out_dir = safe_fetch.safe_join(public_dir, slug)
        for c in ordered:
            colour = c["number"]
            if not CODE.match(colour):
                raise ValueError(f"cod de culoare invalid: {colour}")
            mqc = f"{model}-{quality}-{colour}"
            stats = process_colour(pp, mqc, colour, colour == primary, cache_dir, out_dir, public_dir, with_spin)
            if c.get("swatch"):
                try:
                    save_webp(fetch_plain(c["swatch"]), out_dir / f"{colour}-swatch.webp", 64, 80, public_dir)
                except (NotRaster, urllib.error.HTTPError) as exc:  # eșantionul e opțional (F3003: 404 la MASCOT)
                    stats["missing"].append(f"swatch ({exc})")
            if card and card["colour"] == colour:
                stats["card"] = process_card_photo(pp, mqc, colour, card, cache_dir, out_dir, public_dir)
            note = f" lipsă: {','.join(stats['missing'])}" if stats["missing"] else ""
            extra = f", poză pe model {stats['card']}" if "card" in stats else ""
            print(f"ok {mqc}: galerie {stats['gallery']}, 360° {stats['spin']}{extra}{note}")


if __name__ == "__main__":
    main(sys.argv[1:])
