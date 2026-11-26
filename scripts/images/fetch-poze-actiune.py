"""Download the high-resolution originals of the "action" photos (MASCOT, Portwest, Sir Safety).

Usage (needs Pillow, which is not in the system Python; same convention as scripts/catalog/fetch_images_mascot.py):
  uv run --no-project --with pillow python -I scripts/images/fetch-poze-actiune.py

Portwest downloads (P*) need the Media Hub collection, which is NOT stored in this (public) repo. It is passed with
the environment variables PW_COLLECTION_URL (the link of the EU_ROW mood images collection in Media Hub) and
PW_COLLECTION_ID (8-4-4-16 hex id), or with --collection-url / --collection-id. The values are kept locally in
.catalog-work/images/actiune/NOTE-folosire.md. They are needed ONLY when a Portwest original has to be downloaded:
with valid files already on disk the script makes no request and runs without them. Not secrets (used anonymously),
but they do not belong in a public repo. The host is still checked (https, mediahub.portwest.com only).

Input : scripts/images/poze-actiune-surse.json (committed; per ID only public source data: supplier, source ID or
        URL, declared original resolution, and `pixeli_din` = "original" | "preview") and src/data/poze-actiune.json
        (the IDs and their order; `sursa` must agree with `pixeli_din`).
Output: .catalog-work/images/actiune/original/<ID>.<ext> (local only, gitignored) and the local manifest
        .catalog-work/images/actiune/efectiv.json (per ID: sursa_folosita, motiv, rezolutie_efectiva [w, h] after
        EXIF rotation, fisier_efectiv, dimensiune_bytes), which build-poze-actiune.py reads.

Idempotent: a valid file already on disk is kept and not downloaded again (no request is made). A downloaded
original must have the declared resolution. There is no silent fallback to a preview: an ID without a valid file
is reported and no manifest is written.

Previews are LOCAL sources. Two photos use the preview as the pixel source:
  - S12 (Sir Safety): the preview is the public file itself (same URL, 1152x768 as declared), so it is fetched
    into preview/S12.jpg when missing;
  - P11 (Portwest): the Media Hub preview (2000x1338) differs from the declared original (2000x1333) and the
    pixels MUST stay the preview. It is a MANUAL local file, preview/P11.jpg, taken by hand from Media Hub:
    there is no automatic download, so a full regeneration from nothing is not possible without that file
    (the script says so clearly when it is missing).
The Portwest collection URL is a Media Hub share-style link ("web/<hash>"); the research scripts opened it with no
login, but whether it is account-bound or public could not be verified offline, and its lifetime is not ours.

Security (the downloaded files are untrusted external data):
- fixed allowlist of https hosts, checked before every request, including every redirect hop (no automatic
  redirects); Portwest serves its signed file URLs from mediahub.portwest.com itself; MASCOT originals redirect
  from mascot.picturepark.com to ids-cp-ch.picturepark.com (both listed as exact hostnames);
- every ID is also bound to its own supplier's hosts (S: www.sirsafety.com; M: the two Picturepark hosts;
  P: mediahub.portwest.com), checked on the first request and on every redirect; only port 443; URLs with
  control characters or spaces are rejected; a redirect to another host drops every header except User-Agent
  (no CSRF token or Referer leaks) and is refused for requests with a body;
- errors reach stdout/the manifest as a fixed text or the exception class name, never as the exception text
  (an InvalidURL message can contain the path and query of a signed URL);
- timeout and a per-response size cap; TLS verification stays on;
- output names come only from the fixed ID list (regex ^[MPS]\\d{2}$), the extension from the format Pillow
  detects (never from a header or URL); the resolved path must stay inside original/;
- every file is opened with Pillow with the default pixel limit active (decompression-bomb warnings are
  turned into errors), verify() + full reload, and only JPEG / PNG / WEBP are accepted;
- nothing from the files is executed or interpreted; no secrets; cookies and signed URLs are never logged.
"""
import argparse
import http.cookiejar
import json
import os
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

ID_RE = re.compile(r"^[MPS][0-9]{2}$")
ALLOWED_HOSTS = frozenset({
    "mascot.picturepark.com",
    "ids-cp-ch.picturepark.com",  # Picturepark download node: the Original URL on mascot.* redirects here
    "mediahub.portwest.com",
    "www.sirsafety.com",
})
PROVIDER_HOSTS = {
    "M": frozenset({"mascot.picturepark.com", "ids-cp-ch.picturepark.com"}),
    "P": frozenset({"mediahub.portwest.com"}),
    "S": frozenset({"www.sirsafety.com"}),
}
FORMATS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}
PIL_FORMATS = list(FORMATS)
MAX_BYTES = 60 * 1024 * 1024
TIMEOUT = 60
MAX_HOPS = 5
PAUSE = 0.5  # be gentle with the suppliers
UA = "Mozilla/5.0 (compatible; youprotect-catalog-sync)"

MASCOT = "https://mascot.picturepark.com"
PORTWEST = "https://mediahub.portwest.com"

MASCOT_ID_RE = re.compile(r"^[0-9a-f]{32}$")
BYNDER_ID_RE = re.compile(r"^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{16}$")

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "src" / "data" / "poze-actiune.json"
BASE = ROOT / ".catalog-work" / "images" / "actiune"
ORIG_DIR = BASE / "original"
PREVIEW_DIR = BASE / "preview"
SOURCES = Path(__file__).resolve().with_name("poze-actiune-surse.json")  # public source data, committed
EFFECTIVE = BASE / "efectiv.json"  # generated here, read by build-poze-actiune.py (local only)


class FetchError(ValueError):
    """Our own error: the message is a fixed text (no URL, no response data), so it is safe to print."""


def check_url(url, hosts):
    """Allow only clean https URLs on port 443 whose host is on the global list AND on `hosts` (the supplier's)."""
    if not isinstance(url, str) or re.search(r"[\x00-\x20\x7f]", url):
        raise FetchError("URL cu caractere de control sau spații")
    parsed = urllib.parse.urlparse(url)
    try:
        port = parsed.port  # raises ValueError on a non-numeric port
    except ValueError:
        raise FetchError("port nepermis") from None
    if port not in (None, 443):
        raise FetchError("port nepermis")
    host = parsed.hostname
    if parsed.scheme != "https" or host not in ALLOWED_HOSTS or host not in hosts or parsed.username or parsed.password:
        raise FetchError("schemă sau host nepermise")
    return url


def reason_of(err):
    """Text safe to print/store: ours as is; anything else (URLError, InvalidURL, Pillow, ...) only by class name."""
    if isinstance(err, FetchError):
        return str(err)
    if isinstance(err, urllib.error.HTTPError):
        return f"HTTPError {err.code}"
    return type(err).__name__


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # redirects are followed by hand, with the host check
        return None


class Client:
    """Cookie-keeping HTTP client that only talks to allowlisted https hosts."""

    def __init__(self):
        jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect)
        self.pw_collection_page = None  # Portwest Media Hub collection (URL, id): set by main() from env/arguments
        self.pw_collection_id = None

    def request(self, url, hosts, data=None, headers=None, max_bytes=MAX_BYTES):
        hdrs = {"User-Agent": UA}
        hdrs.update(headers or {})
        method = "POST" if data is not None else "GET"
        for _ in range(MAX_HOPS + 1):
            check_url(url, hosts)
            req = urllib.request.Request(url, data=data, headers=hdrs, method=method)  # noqa: S310 (host checked)
            try:
                # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
                with self.opener.open(req, timeout=TIMEOUT) as resp:  # noqa: S310
                    return self._read(resp, max_bytes)
            except urllib.error.HTTPError as err:
                location = err.headers.get("Location")
                is_redirect = err.code in (301, 302, 303, 307, 308) and bool(location)
                err.close()
                if not is_redirect:
                    raise
                target = urllib.parse.urljoin(url, location)  # re-checked at the top of the loop
                if urllib.parse.urlparse(target).hostname != urllib.parse.urlparse(url).hostname:
                    if data is not None:
                        raise FetchError("redirect pe alt host la o cerere cu corp") from None
                    hdrs = {"User-Agent": UA}  # nothing else leaves for another host
                url = target
                if err.code in (301, 302, 303):
                    method, data = "GET", None
        raise FetchError("prea multe redirecturi")

    @staticmethod
    def _read(resp, max_bytes):
        declared = resp.headers.get("Content-Length")
        if declared and declared.isdigit() and int(declared) > max_bytes:
            raise FetchError("răspuns prea mare")
        body = resp.read(max_bytes + 1)
        if len(body) > max_bytes:
            raise FetchError("răspuns prea mare")
        return body


def safe_target(directory, image_id, ext):
    """Output path derived only from a validated ID and a Pillow-detected extension."""
    if not ID_RE.fullmatch(image_id) or ext not in FORMATS.values():
        raise FetchError("id sau extensie invalide")
    target = (directory / f"{image_id}.{ext}").resolve()
    if target.parent != directory.resolve():
        raise FetchError("cale în afara directorului de ieșire")
    return target


def inspect(path):
    """Open with Pillow (default pixel limit), verify, reload fully. Returns (format, (w, h) after EXIF)."""
    with Image.open(path, formats=PIL_FORMATS) as probe:
        fmt = probe.format
        probe.verify()
    if fmt not in FORMATS:
        raise FetchError("format nepermis")
    with Image.open(path, formats=PIL_FORMATS) as img:
        img.load()
        width, height = img.size
        orientation = img.getexif().get(274, 1)
    if orientation in (5, 6, 7, 8):
        width, height = height, width
    return fmt, (width, height)


def existing_file(directory, image_id):
    """A valid image <ID>.<ext> already in `directory` (original/ or preview/): (path, size) or (None, None)."""
    for ext in FORMATS.values():
        candidate = directory / f"{image_id}.{ext}"
        if candidate.exists():
            try:
                fmt, size = inspect(candidate)
                if FORMATS[fmt] == ext:
                    return candidate, size
            except (OSError, ValueError, SyntaxError, Image.DecompressionBombError):
                continue  # corrupt leftover: ignored, the file is downloaded again
    return None, None


def store(directory, image_id, body):
    """Validate the downloaded bytes and place them as <directory>/<ID>.<ext>. Returns (path, size)."""
    directory.mkdir(parents=True, exist_ok=True)
    if not ID_RE.fullmatch(image_id):
        raise FetchError("id invalid")
    tmp = (directory / f".{image_id}.part").resolve()
    if tmp.parent != directory.resolve():
        raise FetchError("cale în afara directorului de ieșire")
    tmp.write_bytes(body)
    try:
        fmt, size = inspect(tmp)
        target = safe_target(directory, image_id, FORMATS[fmt])
        tmp.replace(target)
        return target, size
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


# --- suppliers ---------------------------------------------------------------------------------------------

def mascot_bytes(client, entry):
    hosts = PROVIDER_HOSTS["M"]
    source_id = str(entry.get("id_sursa", ""))
    if not MASCOT_ID_RE.fullmatch(source_id):
        raise FetchError("id_sursa invalid")
    if not getattr(client, "mascot_ready", False):
        client.request(f"{MASCOT}/bff/silent-login", hosts, headers={"x-csrf": "1"})  # anonymous guest session
        client.mascot_ready = True
    return client.request(f"{MASCOT}/service/Contents/downloads/{source_id}/Original", hosts, headers={"x-csrf": "1"})


def portwest_bytes(client, entry):
    hosts = PROVIDER_HOSTS["P"]
    asset_id = str(entry.get("bynder_asset_id", ""))
    if not BYNDER_ID_RE.fullmatch(asset_id):
        raise FetchError("bynder_asset_id invalid")
    page_url, collection_id = client.pw_collection_page, client.pw_collection_id
    if not page_url or not collection_id:
        raise FetchError(
            "lipsește colecția Portwest: setează PW_COLLECTION_URL și PW_COLLECTION_ID "
            "(sau --collection-url / --collection-id); valorile sunt în .catalog-work/images/actiune/NOTE-folosire.md"
        )
    if not getattr(client, "pw_csrf", None):
        page = client.request(page_url, hosts).decode("utf-8", "replace")
        match = re.search(r'csrf = "([0-9a-f]{20,64})"', page)
        if not match:
            raise FetchError("token CSRF negăsit")
        client.pw_csrf = match.group(1)
    detail = client.request(f"{PORTWEST}/media/detail/?mediaId={asset_id}", hosts).decode("utf-8", "replace")
    item_id = None
    for tag in re.findall(r"<a\b[^>]*>", detail):
        attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', tag))
        if attrs.get("data-media-type") == "original" and attrs.get("data-media-id") == asset_id:
            item_id = attrs.get("data-id", "")
            break
    if not item_id or not BYNDER_ID_RE.fullmatch(item_id):
        raise FetchError("fișierul Original nu apare în Media Hub")
    form = urllib.parse.urlencode([
        ("type", "mediaItem"), ("iframe", "false"), ("includeArchive", "true"),
        ("collectionId", collection_id), ("addAdditionals", "true"),
        ("requestData", item_id), ("media_ids[]", item_id)]).encode()
    answer = client.request(f"{PORTWEST}/new_download/", hosts, data=form, max_bytes=1024 * 1024, headers={
        "X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": client.pw_csrf, "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "Referer": page_url})
    signed = json.loads(answer).get("signed_url")
    if not isinstance(signed, str):
        raise FetchError("Media Hub nu a returnat URL de descărcare")
    return client.request(signed, hosts, headers={"Referer": page_url})  # signed URL: host-checked, never logged


def sirsafety_bytes(client, entry):
    return client.request(entry.get("url_sursa", ""), PROVIDER_HOSTS["S"])


FETCHERS = {"M": mascot_bytes, "P": portwest_bytes, "S": sirsafety_bytes}


# --- main --------------------------------------------------------------------------------------------------

PROVIDER_NAMES = {"M": "mascot", "P": "portwest", "S": "sirsafety"}
SOURCE_KEY = {"M": "id_sursa", "P": "bynder_asset_id", "S": "url_sursa"}


def load_ids():
    """The photo IDs, in order, from src/data/poze-actiune.json (the single source); each must match ID_RE, no duplicates."""
    ids = [e.get("id") for e in json.loads(DATA.read_text(encoding="utf-8"))]
    if not ids or len(set(ids)) != len(ids) or not all(isinstance(i, str) and ID_RE.fullmatch(i) for i in ids):
        sys.exit("src/data/poze-actiune.json: id-uri lipsă, duplicate sau în format nepermis")
    return ids


def load_sources():
    """poze-actiune-surse.json, checked against src/data/poze-actiune.json (same IDs, same order, same pixel source)."""
    ids = load_ids()
    modes = {e["id"]: e["sursa"] for e in json.loads(DATA.read_text(encoding="utf-8"))}
    entries = json.loads(SOURCES.read_text(encoding="utf-8"))
    if [e.get("id") for e in entries] != ids:
        sys.exit("poze-actiune-surse.json nu conține exact id-urile (și ordinea) din src/data/poze-actiune.json")
    for entry in entries:
        image_id = entry["id"]
        px = entry.get("rezolutie_originala")
        if entry.get("furnizor") != PROVIDER_NAMES[image_id[0]]:
            sys.exit(f"{image_id}: furnizor în neconcordanță cu prefixul id-ului")
        if entry.get("pixeli_din") != modes[image_id] or entry["pixeli_din"] not in ("original", "preview"):
            sys.exit(f"{image_id}: pixeli_din diferă de „sursa” din src/data/poze-actiune.json")
        if not isinstance(entry.get(SOURCE_KEY[image_id[0]]), str):
            sys.exit(f"{image_id}: lipsește {SOURCE_KEY[image_id[0]]}")
        if not (isinstance(px, list) and len(px) == 2 and all(isinstance(n, int) and n > 0 for n in px)):
            sys.exit(f"{image_id}: rezolutie_originala trebuie să fie [lățime, înălțime]")
    return entries


def preview_file(client, entry):
    """The local preview file (preview/<ID>.<ext>). Sir Safety previews have a public URL and are fetched when
    missing; every other preview (P11) is a manual local source from Media Hub and is never downloaded."""
    image_id = entry["id"]
    path, size = existing_file(PREVIEW_DIR, image_id)
    if path is not None:
        return path, size, "preview local, revalidat cu Pillow"
    if image_id[0] != "S":
        raise FetchError(
            f"lipsește preview-ul local preview/{image_id}.jpg: e o sursă manuală (previzualizarea din Media Hub), "
            "fără descărcare automată; pune fișierul acolo"
        )
    path, size = store(PREVIEW_DIR, image_id, FETCHERS["S"](client, entry))
    time.sleep(PAUSE)
    return path, size, "preview descărcat de la URL-ul public al sursei și validat cu Pillow"


def original_file(client, entry):
    image_id = entry["id"]
    path, size = existing_file(ORIG_DIR, image_id)
    reason = "original existent, revalidat cu Pillow"
    if path is None:
        body = FETCHERS[image_id[0]](client, entry)
        time.sleep(PAUSE)
        path, size = store(ORIG_DIR, image_id, body)
        reason = "original descărcat și validat cu Pillow"
    if sorted(size) != sorted(entry["rezolutie_originala"]):
        raise FetchError(
            "rezoluția fișierului diferă de cea declarată în poze-actiune-surse.json: "
            f"șterge original/{image_id}.* și rulează din nou"
        )
    return path, size, reason


def process(client, entry):
    """Returns the local-manifest record of one photo. Raises FetchError (or another error; see reason_of)."""
    image_id = entry["id"]
    ORIG_DIR.mkdir(parents=True, exist_ok=True)
    if entry["pixeli_din"] == "preview":
        path, size, reason = preview_file(client, entry)
    else:
        path, size, reason = original_file(client, entry)
    return {
        "id": image_id,
        "sursa_folosita": entry["pixeli_din"],
        "motiv": reason,
        "rezolutie_efectiva": list(size),
        "fisier_efectiv": str(path.relative_to(BASE)),
        "dimensiune_bytes": path.stat().st_size,
    }


def collection_settings(argv=None, environ=None):
    """(url, id) of the Portwest collection from arguments, else PW_COLLECTION_URL / PW_COLLECTION_ID; each may be
    None (then it is needed only if a Portwest original has to be downloaded). A value that is present is validated
    now: https, host mediahub.portwest.com only, clean URL; the id in the 8-4-4-16 hex format."""
    environ = os.environ if environ is None else environ
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--collection-url", default=environ.get("PW_COLLECTION_URL"))
    parser.add_argument("--collection-id", default=environ.get("PW_COLLECTION_ID"))
    args = parser.parse_args(argv)
    url, collection_id = args.collection_url or None, args.collection_id or None
    if url:
        try:
            check_url(url, PROVIDER_HOSTS["P"])
        except FetchError as err:
            sys.exit(f"EROARE: PW_COLLECTION_URL / --collection-url nepermis: {err}")
    if collection_id and not BYNDER_ID_RE.fullmatch(collection_id):
        sys.exit("EROARE: PW_COLLECTION_ID / --collection-id invalid (format 8-4-4-16, hexazecimal majuscule)")
    return url, collection_id


def main():
    pw_url, pw_id = collection_settings()
    entries = load_sources()
    client = Client()
    client.pw_collection_page, client.pw_collection_id = pw_url, pw_id
    results, failed = [], []
    for entry in entries:
        try:
            record = process(client, entry)
        except Exception as err:  # fixed text or class name only: the exception text can hold a signed URL
            failed.append(entry["id"])
            print(f"{entry['id']}: EȘEC | {reason_of(err)}")
            continue
        results.append(record)
        print(f"{record['id']}: {record['sursa_folosita']} {record['rezolutie_efectiva'][0]}x{record['rezolutie_efectiva'][1]}"
              f" {record['dimensiune_bytes']} B | {record['motiv']}")
    if failed:
        sys.exit(f"EROARE: {' '.join(failed)} fără fișier valid; {EFFECTIVE.name} nu a fost scris")
    tmp = EFFECTIVE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(EFFECTIVE)


if __name__ == "__main__":
    main()
