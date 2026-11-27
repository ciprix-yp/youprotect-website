"""Descărcare sigură de imagini de la furnizori (MASCOT, Portwest, Sir Safety), folosită de scripts/catalog/fetch_*.py.

Tot ce vine de la furnizor e date neîncrezute. Ce garantează modulul:
  1. Doar https, port 443, fără user:parola, host din lista permisă, verificat pe FIECARE salt de redirect
     (redirecturile se urmează manual; un redirect pe alt host oprește descărcarea). Un POST nu trece pe alt host.
  2. Tipul real: Pillow deschide octeții cu formats=[JPEG, PNG, WEBP] (nu ne bazăm pe Content-Type); SVG e refuzat;
     DecompressionBombWarning e eroare; limită de pixeli; respingere timpurie după Content-Length; max 25 MB pe corp.
  3. Căile: numele (slug, model, stil, culoare) se verifică cu `fullmatch` în scripturile fetch_* (nu `match` + `$`,
     care acceptă un `\n` final; `check_name` face același lucru cu limită de lungime); orice cale de ieșire
     sau de cache trebuie să rămână sub directorul de bază (resolve().is_relative_to).
     Scrierile (WebP, cache) sunt atomice: fișier temporar + os.replace (write_atomic).
  4. Metadatele: exif_transpose, conversie ICC -> sRGB înainte de a arunca profilul (culoarea rămâne fidelă), pixelii
     copiați într-o imagine nouă, WebP salvat fără EXIF/XMP/ICC și verificat pe octeții scriși (webp_forbidden_chunks).
  5. Linkul colecției Media Hub (PW_COLLECTION_URL / PW_COLLECTION_ID) se dă doar prin variabile de mediu
     (`secret run <proiect> -- …`), nu pe linia de comandă (rămâne în istoricul shell-ului și în lista de procese).
  6. URL-urile semnate din Media Hub nu se scriu nicăieri de aici; în hărți și JSON stau doar ID-uri.

Import (Python rulează cu -I, deci scriptul nu vede singur acest folder; scriptul chemător e versionat, așa că
adaugă calea explicit):

    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
    import safe_fetch  # noqa: E402

Testele rulează fără rețea: SafeClient primește un `opener` înlocuibil (tests/py/safe_fetch_check.py).
"""
import http.cookiejar
import io
import os
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import warnings
from pathlib import Path

from PIL import Image, ImageCms, ImageOps

ALLOWED_FORMATS = ["JPEG", "PNG", "WEBP"]
MAX_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 50_000_000  # ~7000×7000; peste, refuzăm (bombă de decompresie sau poză de needitat)
MAX_HOPS = 5
MAX_NAME = 120
DEFAULT_UA = "Mozilla/5.0 (compatible; catalog-sync)"
FORBIDDEN_CHUNKS = {"EXIF", "XMP ", "ICCP"}


class FetchError(ValueError):
    """Eroare proprie: mesajul e text fix (fără URL-uri sau date din răspuns), deci sigur de afișat."""


class NotRaster(FetchError):
    """Răspunsul e o imagine vectorială (SVG): nu o găzduim pe domeniul nostru."""


# --- căi și nume -------------------------------------------------------------------------------------------------


def check_name(value, pattern, label="nume"):
    """Întoarce `value` dacă e text, are cel mult MAX_NAME caractere și se potrivește întreg cu `pattern` (regex compilat)."""
    if not isinstance(value, str) or not value or len(value) > MAX_NAME or not pattern.fullmatch(value):
        raise FetchError(f"{label} invalid")
    return value


def safe_join(base, *parts):
    """base/parts..., cu garanția că rezultatul rămâne sub `base` (fără `..`, fără căi absolute, fără symlink-uri în afară)."""
    root = Path(base).resolve()
    target = root.joinpath(*parts).resolve()
    if not target.is_relative_to(root) or target == root:
        raise FetchError("cale în afara directorului permis")
    return target


# --- rețea ---------------------------------------------------------------------------------------------------------


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # redirecturile se urmează manual, cu verificarea hostului
        return None


def check_url(url, hosts):
    """Doar https curat, port 443, fără user:parola, host exact din `hosts`."""
    if not isinstance(url, str) or re.search(r"[\x00-\x20\x7f]", url):
        raise FetchError("URL cu caractere de control sau spații")
    try:
        parsed = urllib.parse.urlparse(url)  # ValueError la ex. IPv6 cu paranteze nepotrivite
        port = parsed.port  # ValueError la port nenumeric
    except ValueError:
        raise FetchError("URL invalid sau port nepermis") from None
    if port not in (None, 443):
        raise FetchError("port nepermis")
    if parsed.scheme != "https" or parsed.hostname not in hosts or parsed.username or parsed.password:
        raise FetchError("schemă sau host nepermise")
    return url


class SafeClient:
    """Client HTTP cu cookie-uri care vorbește doar cu hosturile permise, pe fiecare salt de redirect."""

    def __init__(self, hosts, *, user_agent=DEFAULT_UA, opener=None, max_hops=MAX_HOPS):
        self.hosts = frozenset(hosts)
        self.user_agent = user_agent
        self.max_hops = max_hops
        self.opener = opener or urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), NoRedirect
        )

    def request(self, url, *, data=None, headers=None, max_bytes=MAX_BYTES, timeout=60):
        """(corp, Content-Type). `data` (bytes) face un POST. Aruncă FetchError la orice încălcare a regulilor."""
        base_headers = {"User-Agent": self.user_agent}
        hdrs = {**base_headers, **(headers or {})}
        method = "POST" if data is not None else "GET"
        for _ in range(self.max_hops + 1):
            check_url(url, self.hosts)
            req = urllib.request.Request(url, data=data, headers=hdrs, method=method)  # noqa: S310 (host verificat)
            try:
                # URL verificat mai sus (https, host din lista permisă); redirecturile nu se urmează automat.
                with self.opener.open(req, timeout=timeout) as resp:  # noqa: S310  # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
                    return self._read(resp, max_bytes)
            except urllib.error.HTTPError as err:
                location = err.headers.get("Location") if err.headers else None
                is_redirect = err.code in (301, 302, 303, 307, 308) and bool(location)
                err.close()
                if not is_redirect:
                    raise
                target = urllib.parse.urljoin(url, location)  # verificat la începutul buclei
                if urllib.parse.urlparse(target).hostname != urllib.parse.urlparse(url).hostname:
                    if data is not None:
                        raise FetchError("redirect pe alt host la o cerere cu corp") from None
                    hdrs = dict(base_headers)  # nimic în plus nu pleacă spre alt host
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
        return body, resp.headers.get("Content-Type", "")

    def request_image(self, url, **kwargs):
        """Octeții unei imagini raster validate (JPEG/PNG/WEBP reale, în limita de pixeli). SVG și restul: eroare."""
        body, content_type = self.request(url, **kwargs)
        if "svg" in content_type.lower():
            raise NotRaster("SVG")  # poate conține scripturi
        if not content_type.lower().startswith("image/"):
            raise FetchError("răspunsul nu e imagine")
        open_image(body)  # tipul real, nu cel declarat
        return body


# --- imagini -------------------------------------------------------------------------------------------------------


def open_image(raw):
    """Deschide (fără decodare completă) octeții ca JPEG/PNG/WEBP; verifică dimensiunile. Aruncă FetchError."""
    if len(raw) > MAX_BYTES:
        raise FetchError("imagine prea mare")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            img = Image.open(io.BytesIO(raw), formats=ALLOWED_FORMATS)
            width, height = img.size
    except (Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise FetchError("imagine prea mare (bombă de decompresie)") from None
    except Exception:  # noqa: BLE001  (UnidentifiedImageError, OSError, SyntaxError din Pillow: mesajul nu se afișează)
        raise FetchError("fișierul nu e JPEG, PNG sau WebP") from None
    if width < 1 or height < 1 or width * height > MAX_PIXELS:
        raise FetchError("imagine peste limita de pixeli")
    return img


def _srgb_profile():
    return ImageCms.createProfile("sRGB")


def _usable_profile(img):
    """(profil sursă, spațiu) dacă imaginea are un profil ICC de RGB sau CMYK pe care merită să-l aplicăm; altfel (None, "").
    Profilurile deja sRGB nu se aplică: pixelii rămân exact cum sunt."""
    icc = img.info.get("icc_profile")
    if not icc:
        return None, ""
    try:
        profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        space = profile.profile.xcolor_space.strip()
        desc = (ImageCms.getProfileDescription(profile) or "").strip()
    except (ImageCms.PyCMSError, OSError, ValueError, AttributeError):
        return None, ""
    if space not in ("RGB", "CMYK") or (space == "RGB" and desc.startswith("sRGB")):
        return None, ""
    return profile, space


def _to_srgb(img, target_mode):
    """Aplică profilul ICC încorporat (dacă e util) ca imaginea să ajungă în sRGB; întoarce o imagine `target_mode` (RGB/RGBA)."""
    profile, space = _usable_profile(img)
    if profile is None:
        return img.convert(target_mode)
    try:
        if space == "CMYK":
            rgb = ImageCms.profileToProfile(img.convert("CMYK"), profile, _srgb_profile(), outputMode="RGB")
            return rgb.convert(target_mode)
        alpha = img.convert("RGBA").getchannel("A") if target_mode == "RGBA" else None
        rgb = ImageCms.profileToProfile(img.convert("RGB"), profile, _srgb_profile(), outputMode="RGB")
        if alpha is not None:
            rgb = rgb.convert("RGBA")
            rgb.putalpha(alpha)
        return rgb
    except ImageCms.PyCMSError:
        return img.convert(target_mode)  # profil stricat: păstrăm pixelii, fără conversie


def clean_image(raw, alpha=None):
    """Octeți de imagine -> Image RGB/RGBA nouă: orientare aplicată, culori în sRGB, fără EXIF/XMP/ICC (pixeli copiați).
    alpha=True forțează RGBA, False forțează RGB; None păstrează regula veche (RGBA pentru RGBA/LA/P, altfel RGB)."""
    img = open_image(raw)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            img.load()
    except Exception:  # noqa: BLE001
        raise FetchError("imagine coruptă sau prea mare") from None
    img = ImageOps.exif_transpose(img)  # întoarce imaginea după EXIF, înainte să aruncăm EXIF
    if alpha is None:
        alpha = img.mode in ("RGBA", "LA", "P")
    img = _to_srgb(img, "RGBA" if alpha else "RGB")
    fresh = Image.new(img.mode, img.size)
    fresh.paste(img)  # doar pixelii: niciun `info` (EXIF, ICC, XMP) nu trece mai departe
    return fresh


# --- WebP fără metadate --------------------------------------------------------------------------------------------


def webp_chunks(data):
    """Numele chunk-urilor RIFF dintr-un WebP (ex. ["VP8X", "ALPH", "VP8 "]); FetchError dacă nu e RIFF/WEBP întreg."""
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise FetchError("nu e WebP")
    names, pos = [], 12
    while pos + 8 <= len(data):
        size = int.from_bytes(data[pos + 4:pos + 8], "little")
        names.append(data[pos:pos + 4].decode("ascii", "replace"))
        pos += 8 + size + (size & 1)
    if pos != len(data):
        raise FetchError("WebP cu chunk-uri trunchiate")
    return names


def webp_forbidden_chunks(data):
    """Chunk-urile de metadate (EXIF, XMP, ICCP) prezente într-un WebP; listă goală = curat."""
    return sorted(FORBIDDEN_CHUNKS & set(webp_chunks(data)))


def encode_webp(img, max_side, quality, *, budget=None):
    """Octeții WebP ai lui `img` redusă la max_side px pe latura lungă, fără metadate. Cu `budget` (octeți), calitatea
    coboară în trepte de 6 până încape (minim 50)."""
    im = img.copy()
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    while True:
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=quality, method=6, exif=b"", icc_profile=None)
        data = buf.getvalue()
        if budget is None or len(data) <= budget or quality <= 50:
            break
        quality = max(50, quality - 6)
    leftover = webp_forbidden_chunks(data)
    if leftover:
        raise FetchError(f"metadate rămase în WebP: {leftover}")
    return data


def save_webp(img, path, max_side, quality, *, base, budget=None):
    """Scrie WebP-ul curat la `path`, care trebuie să rămână sub `base`. Întoarce numărul de octeți."""
    target = Path(path).resolve()
    root = Path(base).resolve()
    if not target.is_relative_to(root) or target == root:
        raise FetchError("cale de ieșire în afara directorului permis")
    data = encode_webp(img, max_side, quality, budget=budget)
    write_atomic(target, data)
    return len(data)


def write_atomic(path, data):
    """Scrie `data` (bytes) la `path` printr-un fișier temporar din același director + os.replace: un proces oprit la
    mijloc nu lasă fișiere pe jumătate scrise (nici în cache, nici în public/)."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=f".{target.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        # mkstemp creează 0600; 0640 (proprietar + grup), nu world-readable (CodeQL py/overly-permissive-file).
        os.chmod(tmp, 0o640)
        os.replace(tmp, target)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
