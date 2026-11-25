"""Download the high-resolution originals of the 22 "action" photos (MASCOT, Portwest, Sir Safety).

Usage (needs Pillow, which is not in the system Python; same convention as scripts/catalog/fetch_images_mascot.py):
  uv run --no-project --with pillow python -I scripts/images/fetch-poze-actiune.py

Input : .catalog-work/images/actiune/manifest.json (22 entries) and preview/<ID>.jpg (the supplier previews).
Output: .catalog-work/images/actiune/original/<ID>.<ext> (local only, gitignored) and, per manifest entry,
        the fields sursa_folosita ("original" / "preview"), motiv, rezolutie_efectiva [w, h] (after EXIF
        rotation), fisier_efectiv and dimensiune_bytes.

Idempotent: a valid original already on disk is kept and not downloaded again. When an original cannot be
used, the preview stays the source and the reason is written to the manifest.

Security (the downloaded files are untrusted external data):
- fixed allowlist of https hosts, checked before every request, including every redirect hop (no automatic
  redirects); Portwest serves its signed file URLs from mediahub.portwest.com itself; MASCOT originals redirect
  from mascot.picturepark.com to ids-cp-ch.picturepark.com (both listed as exact hostnames);
- timeout and a per-response size cap; TLS verification stays on;
- output names come only from the fixed ID list (regex ^[MPS]\\d{2}$), the extension from the format Pillow
  detects (never from a header or URL); the resolved path must stay inside original/;
- every file is opened with Pillow with the default pixel limit active (decompression-bomb warnings are
  turned into errors), verify() + full reload, and only JPEG / PNG / WEBP are accepted;
- nothing from the files is executed or interpreted; no secrets; cookies and signed URLs are never logged.
"""
import http.cookiejar
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import warnings
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow lipsește. Rulează: uv run --no-project --with pillow python -I scripts/images/fetch-poze-actiune.py")

warnings.simplefilter("error", Image.DecompressionBombWarning)  # default limit stays on; a bomb becomes an error

IDS = ("M01 M02 M04 M05 M09 M10 M12 M18 M19 P04 P05 P06 P11 P13 S01 S02 S04 S06 S08 S12 S14 S16").split()
ID_RE = re.compile(r"^[MPS]\d{2}$")
ALLOWED_HOSTS = frozenset({
    "mascot.picturepark.com",
    "ids-cp-ch.picturepark.com",  # Picturepark download node: the Original URL on mascot.* redirects here
    "mediahub.portwest.com",
    "www.sirsafety.com",
})
FORMATS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}
MAX_BYTES = 60 * 1024 * 1024
TIMEOUT = 60
MAX_HOPS = 5
PAUSE = 0.5  # be gentle with the suppliers
UA = "Mozilla/5.0 (compatible; youprotect-catalog-sync)"

MASCOT = "https://mascot.picturepark.com"
PORTWEST = "https://mediahub.portwest.com"
PW_COLLECTION_PAGE = PORTWEST + "/web/c98f9ae4545b878/eu_row-mood-images/"
PW_MOOD_COLLECTION_ID = "90EAF721-7B52-4DFD-848B1AAC0E5EB2E5"  # public collection id "EU_ROW mood images"
PW_SKIP = {"P11": "originalul din Media Hub are doar 2000 px, la fel ca preview-ul"}

MASCOT_ID_RE = re.compile(r"^[0-9a-f]{32}$")
BYNDER_ID_RE = re.compile(r"^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{16}$")

BASE = Path(__file__).resolve().parents[2] / ".catalog-work" / "images" / "actiune"
ORIG_DIR = BASE / "original"
PREVIEW_DIR = BASE / "preview"
MANIFEST = BASE / "manifest.json"


def check_url(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS or parsed.username or parsed.password:
        raise ValueError(f"host sau schemă nepermise: {parsed.scheme}://{parsed.hostname}")
    return url


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # redirects are followed by hand, with the host check
        return None


class Client:
    """Cookie-keeping HTTP client that only talks to allowlisted https hosts."""

    def __init__(self):
        jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect)

    def request(self, url, data=None, headers=None, max_bytes=MAX_BYTES):
        hdrs = {"User-Agent": UA}
        hdrs.update(headers or {})
        method = "POST" if data is not None else "GET"
        for _ in range(MAX_HOPS + 1):
            check_url(url)
            req = urllib.request.Request(url, data=data, headers=hdrs, method=method)  # noqa: S310 (host checked)
            try:
                # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
                with self.opener.open(req, timeout=TIMEOUT) as resp:  # noqa: S310
                    return self._read(resp, max_bytes)
            except urllib.error.HTTPError as err:
                location = err.headers.get("Location")
                if err.code in (301, 302, 303, 307, 308) and location:
                    url = urllib.parse.urljoin(url, location)  # re-checked at the top of the loop
                    if err.code in (301, 302, 303):
                        method, data = "GET", None
                    continue
                raise
        raise ValueError("prea multe redirecturi")

    @staticmethod
    def _read(resp, max_bytes):
        declared = resp.headers.get("Content-Length")
        if declared and declared.isdigit() and int(declared) > max_bytes:
            raise ValueError("răspuns prea mare")
        body = resp.read(max_bytes + 1)
        if len(body) > max_bytes:
            raise ValueError("răspuns prea mare")
        return body


def safe_target(image_id, ext):
    """Output path derived only from a validated ID and a Pillow-detected extension."""
    if not ID_RE.fullmatch(image_id) or ext not in FORMATS.values():
        raise ValueError("id sau extensie invalide")
    target = (ORIG_DIR / f"{image_id}.{ext}").resolve()
    if target.parent != ORIG_DIR.resolve():
        raise ValueError("cale în afara directorului de ieșire")
    return target


def inspect(path):
    """Open with Pillow (default pixel limit), verify, reload fully. Returns (format, (w, h) after EXIF)."""
    with Image.open(path) as probe:
        fmt = probe.format
        probe.verify()
    if fmt not in FORMATS:
        raise ValueError(f"format nepermis: {fmt}")
    with Image.open(path) as img:
        img.load()
        width, height = img.size
        orientation = img.getexif().get(274, 1)
    if orientation in (5, 6, 7, 8):
        width, height = height, width
    return fmt, (width, height)


def existing_original(image_id):
    for ext in FORMATS.values():
        candidate = ORIG_DIR / f"{image_id}.{ext}"
        if candidate.exists():
            try:
                fmt, size = inspect(candidate)
                if FORMATS[fmt] == ext:
                    return candidate, size
            except (OSError, ValueError, SyntaxError, Image.DecompressionBombError):
                continue  # corrupt leftover: ignored, the file is downloaded again
    return None, None


def store(image_id, body):
    """Validate the downloaded bytes and place them as original/<ID>.<ext>. Returns (path, size)."""
    tmp = (ORIG_DIR / f".{image_id}.part").resolve()
    if tmp.parent != ORIG_DIR.resolve():
        raise ValueError("cale în afara directorului de ieșire")
    tmp.write_bytes(body)
    try:
        fmt, size = inspect(tmp)
        target = safe_target(image_id, FORMATS[fmt])
        tmp.replace(target)
        return target, size
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


# --- suppliers ---------------------------------------------------------------------------------------------

def mascot_bytes(client, entry):
    source_id = str(entry.get("id_sursa", ""))
    if not MASCOT_ID_RE.fullmatch(source_id):
        raise ValueError("id_sursa invalid")
    if not getattr(client, "mascot_ready", False):
        client.request(f"{MASCOT}/bff/silent-login", headers={"x-csrf": "1"})  # anonymous guest session
        client.mascot_ready = True
    return client.request(f"{MASCOT}/service/Contents/downloads/{source_id}/Original", headers={"x-csrf": "1"})


def portwest_bytes(client, entry):
    asset_id = str(entry.get("bynder_asset_id", ""))
    if not BYNDER_ID_RE.fullmatch(asset_id):
        raise ValueError("bynder_asset_id invalid")
    if not getattr(client, "pw_csrf", None):
        page = client.request(PW_COLLECTION_PAGE).decode("utf-8", "replace")
        match = re.search(r'csrf = "([0-9a-f]{20,64})"', page)
        if not match:
            raise ValueError("token CSRF negăsit")
        client.pw_csrf = match.group(1)
    detail = client.request(f"{PORTWEST}/media/detail/?mediaId={asset_id}").decode("utf-8", "replace")
    item_id = None
    for tag in re.findall(r"<a\b[^>]*>", detail):
        attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', tag))
        if attrs.get("data-media-type") == "original" and attrs.get("data-media-id") == asset_id:
            item_id = attrs.get("data-id", "")
            break
    if not item_id or not BYNDER_ID_RE.fullmatch(item_id):
        raise ValueError("fișierul Original nu apare în Media Hub")
    form = urllib.parse.urlencode([
        ("type", "mediaItem"), ("iframe", "false"), ("includeArchive", "true"),
        ("collectionId", PW_MOOD_COLLECTION_ID), ("addAdditionals", "true"),
        ("requestData", item_id), ("media_ids[]", item_id)]).encode()
    answer = client.request(f"{PORTWEST}/new_download/", data=form, max_bytes=1024 * 1024, headers={
        "X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": client.pw_csrf, "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "Referer": PW_COLLECTION_PAGE})
    signed = json.loads(answer).get("signed_url")
    if not isinstance(signed, str):
        raise ValueError("Media Hub nu a returnat URL de descărcare")
    return client.request(signed, headers={"Referer": PW_COLLECTION_PAGE})  # signed URL: host-checked, never logged


def sirsafety_bytes(client, entry):
    return client.request(str(entry.get("url_sursa", "")))


FETCHERS = {"M": mascot_bytes, "P": portwest_bytes, "S": sirsafety_bytes}


# --- main --------------------------------------------------------------------------------------------------

def declared_max_side(entry):
    px = entry.get("rezolutie_originala_px")
    if isinstance(px, list) and len(px) == 2:
        return max(px)
    match = re.fullmatch(r"(\d+)x(\d+)", str(entry.get("rezolutie_originala", "")))
    return max(int(match.group(1)), int(match.group(2))) if match else None


def set_result(entry, source, reason, path, size):
    entry["sursa_folosita"] = source
    entry["motiv"] = reason
    entry["rezolutie_efectiva"] = list(size)
    entry["fisier_efectiv"] = str(path.relative_to(BASE))
    entry["dimensiune_bytes"] = path.stat().st_size


def process(client, entry):
    image_id = entry["id"]
    preview = (PREVIEW_DIR / f"{image_id}.jpg")
    _, preview_size = inspect(preview)
    preview_side = max(preview_size)

    def use_preview(reason):
        set_result(entry, "preview", reason, preview, preview_size)

    if image_id in PW_SKIP:
        return use_preview(PW_SKIP[image_id])
    declared = declared_max_side(entry)
    if declared is not None and declared <= preview_side:
        return use_preview(f"originalul declarat ({declared} px) nu depășește preview-ul ({preview_side} px)")

    path, size = existing_original(image_id)
    reused = path is not None
    if not reused:
        try:
            body = FETCHERS[image_id[0]](client, entry)
            time.sleep(PAUSE)
            path, size = store(image_id, body)
        except Exception as err:  # reason only; never the URL
            return use_preview(f"originalul nu a putut fi luat ({type(err).__name__}: {str(err)[:120]})")
    if max(size) <= preview_side:
        path.unlink()  # our own downloaded file, no gain over the preview
        return use_preview(f"originalul ({max(size)} px) nu aduce rezoluție peste preview ({preview_side} px)")
    reason = "original existent, revalidat cu Pillow" if reused else "original descărcat și validat cu Pillow"
    set_result(entry, "original", reason, path, size)


def main():
    entries = json.loads(MANIFEST.read_text(encoding="utf-8"))
    ids = [e.get("id") for e in entries]
    if ids != IDS or not all(ID_RE.fullmatch(i) for i in ids):
        sys.exit("manifest.json nu conține exact cele 22 de id-uri așteptate")
    ORIG_DIR.mkdir(parents=True, exist_ok=True)
    client = Client()
    for entry in entries:
        process(entry=entry, client=client)
        print(f"{entry['id']}: {entry['sursa_folosita']} {entry['rezolutie_efectiva'][0]}x{entry['rezolutie_efectiva'][1]}"
              f" {entry['dimensiune_bytes']} B | {entry['motiv']}")
    tmp = MANIFEST.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(MANIFEST)


if __name__ == "__main__":
    main()
