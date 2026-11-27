"""Verifică scripts/lib/safe_fetch.py și descărcătoarele de imagini, fără rețea (opener înlocuit cu unul fals).

Rulat de tests/safe-fetch.test.mjs. Usage: python -I tests/py/safe_fetch_check.py <repo>
"""
import email.message
import importlib.util
import io
import json
import sys
import tempfile
import urllib.error
from pathlib import Path

from PIL import Image, ImageCms, ImageDraw

REPO = Path(sys.argv[1])
sys.path.insert(0, str(REPO / "scripts" / "lib"))
sys.path.insert(0, str(REPO / "scripts" / "catalog"))
import safe_fetch  # noqa: E402
from safe_fetch import FetchError, NotRaster  # noqa: E402


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def expect(label, exc, fn):
    try:
        fn()
    except exc:
        return
    raise AssertionError(f"{label}: trebuia să arunce {exc.__name__}")


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, REPO / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def png(size=(8, 8), mode="RGB", color=(200, 30, 30)):
    buf = io.BytesIO()
    Image.new(mode, size, color).save(buf, "PNG")
    return buf.getvalue()


def jpeg(size=(40, 20), **kwargs):
    buf = io.BytesIO()
    Image.new("RGB", size, (20, 120, 220)).save(buf, "JPEG", **kwargs)
    return buf.getvalue()


# --- opener fals ----------------------------------------------------------------------------------------------------


class FakeResponse:
    def __init__(self, body, content_type="image/png", length=None, fail_read=False):
        self.headers = email.message.Message()
        self.headers["Content-Type"] = content_type
        if length is not None:
            self.headers["Content-Length"] = str(length)
        self._body, self._fail_read = body, fail_read

    def read(self, n=-1):
        if self._fail_read:
            raise AssertionError("corpul nu trebuia citit (Content-Length prea mare)")
        return self._body if n < 0 else self._body[:n]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def redirect(url, location, code=302):
    headers = email.message.Message()
    headers["Location"] = location
    return urllib.error.HTTPError(url, code, "redirect", headers, io.BytesIO(b""))


class FakeOpener:
    def __init__(self, routes):
        self.routes, self.calls = routes, []

    def open(self, req, timeout=None):
        self.calls.append((req.full_url, req.get_method(), dict(req.header_items())))
        result = self.routes[req.full_url]
        if isinstance(result, Exception):
            raise result
        return result


def client(routes, hosts=("cdn.example.com",)):
    opener = FakeOpener(routes)
    return safe_fetch.SafeClient(set(hosts), opener=opener), opener


# --- 1. hosturi și redirecturi ---------------------------------------------------------------------------------------

A = "https://cdn.example.com/a.png"
c, op = client({A: redirect(A, "https://evil.example.net/x.png"), "https://evil.example.net/x.png": FakeResponse(png())})
expect("redirect pe alt host", FetchError, lambda: c.request(A))
check(all("evil" not in url for url, _, _ in op.calls), "hostul din redirect nu trebuia cerut")

c, op = client({A: redirect(A, "/b.png"), "https://cdn.example.com/b.png": FakeResponse(png())})
check(c.request_image(A) == png(), "redirectul pe același host trebuie urmat")
check(len(op.calls) == 2, "două cereri (A apoi B)")

c, _ = client({A: redirect(A, "http://cdn.example.com/b.png")})
expect("redirect spre http", FetchError, lambda: c.request(A))

for bad in ("http://cdn.example.com/a.png", "https://cdn.example.com:8443/a.png", "https://u:p@cdn.example.com/a.png",
            "https://cdn.example.com/a b.png", "file:///etc/passwd", "https://cdn.example.com.evil.net/a.png"):
    c, _ = client({})
    expect(f"URL nepermis {bad}", FetchError, lambda bad=bad: c.request(bad))

c, _ = client({A: redirect(A, "https://other.example.com/x")}, hosts=("cdn.example.com", "other.example.com"))
expect("POST cu redirect pe alt host", FetchError, lambda: c.request(A, data=b"{}"))

loop = {A: redirect(A, A)}
c, _ = client(loop)
expect("redirect în buclă", FetchError, lambda: c.request(A))

# antetele cu secrete nu pleacă pe alt host (hostul nou e permis, dar antetul propriu nu trebuie să-l urmeze)
B = "https://other.example.com/x.png"
c, op = client({A: redirect(A, B), B: FakeResponse(png())}, hosts=("cdn.example.com", "other.example.com"))
c.request(A, headers={"x-csrf": "1"})
check("X-csrf" in op.calls[0][2], "antetul propriu trebuia trimis la primul host")
check("X-csrf" not in op.calls[1][2] and "x-csrf" not in op.calls[1][2], "antet propriu trimis pe alt host")

# --- 2. tipul real, mărimi, pixeli -----------------------------------------------------------------------------------

c, _ = client({A: FakeResponse(b"<html>nu sunt o imagine</html>", "image/jpeg")})
expect("HTML cu Content-Type fals image/jpeg", FetchError, lambda: c.request_image(A))
c, _ = client({A: FakeResponse(b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml")})
expect("SVG", NotRaster, lambda: c.request_image(A))
c, _ = client({A: FakeResponse(png(), "text/html")})
expect("Content-Type care nu e imagine", FetchError, lambda: c.request_image(A))

gif = io.BytesIO()
Image.new("RGB", (4, 4)).save(gif, "GIF")
c, _ = client({A: FakeResponse(gif.getvalue(), "image/gif")})
expect("GIF (în afara JPEG/PNG/WebP)", FetchError, lambda: c.request_image(A))

c, _ = client({A: FakeResponse(b"x", "image/png", length=safe_fetch.MAX_BYTES + 1, fail_read=True)})
expect("Content-Length peste limită", FetchError, lambda: c.request(A))
c, _ = client({A: FakeResponse(b"x" * 500, "image/png")})
expect("corp peste limită fără Content-Length", FetchError, lambda: c.request(A, max_bytes=100))

expect("imagine cu prea mulți pixeli", FetchError, lambda: safe_fetch.open_image(png((8000, 8000), "L", 0)))
old = Image.MAX_IMAGE_PIXELS
Image.MAX_IMAGE_PIXELS = 100
try:
    expect("DecompressionBombWarning", FetchError, lambda: safe_fetch.open_image(png((20, 20))))
    expect("DecompressionBombWarning la decodare", FetchError, lambda: safe_fetch.clean_image(png((20, 20))))
finally:
    Image.MAX_IMAGE_PIXELS = old
check(safe_fetch.open_image(png()).size == (8, 8), "PNG valid trebuie să treacă")

# --- 3. nume și căi --------------------------------------------------------------------------------------------------

import re  # noqa: E402

SLUG = re.compile(r"^[a-z0-9-]{3,120}$")
check(safe_fetch.check_name("geaca-x-123", SLUG) == "geaca-x-123", "slug valid")
for bad in ("../x", "a/../b", "ABC", "x" * 200, "", "ab", None):
    expect(f"nume {bad!r}", FetchError, lambda bad=bad: safe_fetch.check_name(bad, SLUG))
with tempfile.TemporaryDirectory() as tmp:
    base = Path(tmp) / "public"
    base.mkdir()
    check(safe_fetch.safe_join(base, "slug", "a.webp").is_relative_to(base.resolve()), "cale validă")
    for parts in (("..", "x"), ("slug", "..", "..", "x"), ("/etc/passwd",), ("",)):
        expect(f"cale {parts}", FetchError, lambda parts=parts: safe_fetch.safe_join(base, *parts))
    outside = Path(tmp) / "outside"
    outside.mkdir()
    (base / "link").symlink_to(outside)
    expect("symlink în afara bazei", FetchError, lambda: safe_fetch.safe_join(base, "link", "x.webp"))
    img = safe_fetch.clean_image(png())
    expect("ieșire în afara bazei", FetchError, lambda: safe_fetch.save_webp(img, outside / "x.webp", 100, 80, base=base))
    check(not (outside / "x.webp").exists(), "nu trebuia scris nimic în afara bazei")
    check(safe_fetch.save_webp(img, base / "s" / "x.webp", 100, 80, base=base) > 0, "scriere validă")

# --- 4. metadate -----------------------------------------------------------------------------------------------------

srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
exif = Image.Exif()
exif[0x0112] = 6  # Orientation: rotit 90°
exif[0x010F] = "Camera secreta"
rich = io.BytesIO()
Image.new("RGB", (40, 20), (20, 120, 220)).save(rich, "JPEG", exif=exif.tobytes(), icc_profile=srgb)
cleaned = safe_fetch.clean_image(rich.getvalue())
check(cleaned.size == (20, 40), f"exif_transpose trebuia să rotească (e {cleaned.size})")
check(not cleaned.info, f"info rămas după curățare: {list(cleaned.info)}")
data = safe_fetch.encode_webp(cleaned, 1200, 80)
check(safe_fetch.webp_forbidden_chunks(data) == [], "WebP curat are metadate")

dirty = io.BytesIO()
Image.new("RGB", (8, 8), (1, 2, 3)).save(dirty, "WEBP", exif=exif.tobytes(), icc_profile=srgb, xmp=b"<x:xmpmeta/>")
check(safe_fetch.webp_forbidden_chunks(dirty.getvalue()) == ["EXIF", "ICCP", "XMP "], "trebuia să detecteze EXIF, ICCP și XMP")
expect("WebP trunchiat", FetchError, lambda: safe_fetch.webp_chunks(dirty.getvalue()[:-3]))
expect("ne-WebP", FetchError, lambda: safe_fetch.webp_chunks(png()))

# conversia ICC -> sRGB: un profil RGB care nu se numește sRGB se aplică; unul sRGB nu atinge pixelii
custom = srgb.replace("sRGB built-in".encode("utf-16-be"), "xRGB built-in".encode("utf-16-be"))
check(custom != srgb, "nu am putut crea profilul de test")
src = Image.new("RGB", (6, 6), (200, 100, 50))
buf = io.BytesIO()
src.save(buf, "PNG", icc_profile=custom)
out = safe_fetch.clean_image(buf.getvalue())
check(out.mode == "RGB" and all(abs(a - b) <= 2 for a, b in zip(out.getpixel((0, 0)), (200, 100, 50))),
      f"culoare schimbată de conversie: {out.getpixel((0, 0))}")
check(safe_fetch._usable_profile(Image.open(io.BytesIO(buf.getvalue())))[0] is not None, "profilul custom trebuia aplicat")
buf2 = io.BytesIO()
src.save(buf2, "PNG", icc_profile=srgb)
check(safe_fetch._usable_profile(Image.open(io.BytesIO(buf2.getvalue())))[0] is None, "profilul sRGB nu trebuia aplicat")
check(safe_fetch.clean_image(buf2.getvalue()).getpixel((0, 0)) == (200, 100, 50), "pixelii sRGB trebuiau să rămână")
cmyk = io.BytesIO()
Image.new("CMYK", (4, 4), (0, 0, 0, 0)).save(cmyk, "JPEG")
check(safe_fetch.clean_image(cmyk.getvalue()).mode == "RGB", "CMYK trebuia convertit în RGB")
rgba = safe_fetch.clean_image(png((4, 4), "RGBA", (10, 20, 30, 0)))
check(rgba.mode == "RGBA" and rgba.getpixel((0, 0))[3] == 0, "canalul alfa trebuia păstrat")
check(safe_fetch.clean_image(png((4, 4), "RGBA", (10, 20, 30, 0)), alpha=False).mode == "RGB", "alpha=False forțează RGB")

# buget: calitatea coboară până încape
noisy = Image.effect_noise((600, 600), 80).convert("RGB")
loose = safe_fetch.encode_webp(noisy, 600, 90)
tight = safe_fetch.encode_webp(noisy, 600, 90, budget=len(loose) // 2)
check(len(tight) < len(loose), "bugetul trebuia să reducă mărimea")

# --- 5. descărcătoarele ----------------------------------------------------------------------------------------------

mascot = load("fetch_images_mascot", "scripts/catalog/fetch_images_mascot.py")
mqc = "20254-230-010"
hit = lambda cid, name: {"id": cid, "displayValues": {"name": name}}  # noqa: E731
ID1, ID2 = "a" * 32, "b" * 32
results = [hit(ID1, f"{mqc}_M14.jpg"), hit(ID2, f"{mqc}_P01"), hit("c" * 32, "20254-230-011_PS.jpg"), hit("zz", f"{mqc}_P04")]
frames = mascot.parse_frames(results, mqc)
check(frames == {"M14": ID1, "P01": ID2}, f"parse_frames: {frames}")
check(mascot.find_card_item(results, mqc, ID1) == f"{mqc}_M14.jpg", "find_card_item: poza corectă")
expect("poză cu alt cod MQC", FetchError, lambda: mascot.find_card_item(results, mqc, "c" * 32))
expect("id absent din căutare", FetchError, lambda: mascot.find_card_item(results, mqc, "d" * 32))
expect("id care nu e hex de 32", FetchError, lambda: mascot.find_card_item(results, mqc, "../../etc"))

portwest = load("fetch_images_portwest", "scripts/catalog/fetch_images_portwest.py")
portwest.time.sleep = lambda _s: None
CDN = "https://d11ak7fd9ypfb7.cloudfront.net/styles1100px/C474YER.jpg"
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    public, cache = root / "public", root / "cache"
    photo = FakeResponse(jpeg(exif=exif.tobytes(), icc_profile=srgb), "image/jpeg")
    pc = safe_fetch.SafeClient({portwest.ALLOWED_HOST}, opener=FakeOpener({CDN: photo}))
    # fetch_style cu client implicit ar cere rețea: înlocuim SafeClient doar pentru acest apel
    original = portwest.safe_fetch.SafeClient
    portwest.safe_fetch.SafeClient = lambda *a, **k: pc
    try:
        source = {"style": "C474", "colours": [{"code": "YER", "image": CDN}]}
        errors = portwest.fetch_style(source, "slug-x", cache, public / "slug-x", public, "C474")
        check(errors == [], f"fetch_style: {errors}")
        ps = (public / "slug-x" / "YER-PS.webp").read_bytes()
        check(safe_fetch.webp_forbidden_chunks(ps) == [], "poza descărcată are metadate")
        check((cache / "C474YER.jpg").exists(), "originalul trebuia pus în cache")
        # stilul din sursă diferit de cel din text: nimic nu se scrie în cache
        bad = {"style": "../../x", "colours": [{"code": "YER", "image": CDN}]}
        errors = portwest.fetch_style(bad, "slug-y", cache, public / "slug-y", public, "C474")
        check(errors and not (public / "slug-y").exists(), "stil nepotrivit trebuia respins")
        errors = portwest.fetch_style({"style": "../../x", "colours": []}, "slug-y", cache, public / "slug-y", public, "../../x")
        check(errors, "stil invalid trebuia respins")
        # URL în afara CDN-ului permis
        evil = "https://evil.example.net/styles1100px/a.jpg"
        expect("URL în afara sursei", ValueError, lambda: portwest.download(evil, cache / "x.jpg"))
    finally:
        portwest.safe_fetch.SafeClient = original

# --- Portwest Media Hub (poza pe model, offline) ---------------------------------------------------------------------
HUB = "https://mediahub.portwest.com"
# Valori sintetice. Linkul real al colecției nu intră în repo public (regula din .gitleaks.toml);
# segmentul hex se compune la rulare, ca sursa să nu semene cu un link de colecție.
FAKE_HEX = "0123" * 4
PAGE = f"{HUB}/web/{FAKE_HEX}/test-collection/"
COLL, ASSET = "00000000-0000-0000-0000000000000000", "11111111-1111-1111-1111111111111111"
ITEM_OK = "675F00D3-1276-4DB4-88D9F12C60B9D026"
ITEM_SMALL = "C672BF9C-F36E-46EF-B32C455248FA5171"
ITEM_ORIG = "2E9B4943-4750-4E5B-8E91076B0D79D417"


def anchor(item, kind, size):
    return f'<a class="x" data-id="{item}" data-media-id="{ASSET}" data-media-type="{kind}" data-media-size="{size}">'


detail = anchor(ITEM_ORIG, "original", 40 * 1024 * 1024) + anchor(ITEM_SMALL, "web", 17000) + anchor(ITEM_OK, "web", 196000)
SIGNED = f"{HUB}/files/signed-abc"
routes = {
    f"{HUB}/media/detail/?mediaId={ASSET}": FakeResponse(detail.encode(), "text/html"),
    PAGE: FakeResponse(b'var csrf = "0123456789abcdef0123456789abcdef";', "text/html"),
    f"{HUB}/new_download/": FakeResponse(json.dumps({"signed_url": SIGNED}).encode(), "application/json"),
    SIGNED: FakeResponse(jpeg((30, 40)), "image/jpeg"),
}
opener = FakeOpener(routes)
hub = portwest.MediaHub(PAGE, COLL, safe_fetch.SafeClient({portwest.MEDIAHUB_HOST}, opener=opener))
check(hub.derivative_id(ASSET) == ITEM_OK, "trebuia derivata web cea mai mare, nu originalul peste plafon")
check(len(hub.download(ASSET)) > 0, "descărcarea derivatei")
post = [c for c in opener.calls if c[1] == "POST"]
check(post and "X-csrf-token" in post[0][2], "POST-ul trebuie să poarte tokenul CSRF")
expect("sourceId invalid", FetchError, lambda: hub.derivative_id("../x"))
expect("colecție lipsă", ValueError, lambda: portwest.MediaHub(None, None))
expect("pagină pe alt host", ValueError, lambda: portwest.MediaHub(f"https://evil.example/web/{FAKE_HEX}/x/", COLL))
side = Image.new("RGB", (100, 100), (255, 255, 255))
side.paste(Image.new("RGB", (60, 100), (90, 90, 90)), (20, 0))
check(portwest.strip_letterbox(side).size == (60, 100), "barele albe laterale trebuiau tăiate")
white = Image.new("RGB", (100, 100), (255, 255, 255))
ImageDraw.Draw(white).polygon([(50, 20), (65, 50), (50, 80), (35, 50)], fill=(20, 20, 90))  # subject: edges mostly white
check(portwest.strip_letterbox(white).size == (100, 100), "studioul alb rămâne neatins")

print("ok")
