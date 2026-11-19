"""Download the Romanian EU declarations of conformity from the Sir Safety B2B portal (D-2026-11-19-11).

Usage:
  secret run youprotect-website -- uv run --no-project --with pypdf --with pikepdf --with pillow \\
      python -I scripts/catalog/fetch_declarations_sirsafety.py

- Logs in with SIRSAFETY_B2B_USER / SIRSAFETY_B2B_PASSWORD (Keychain, through `secret run`). Read-only: it only
  calls login and export/getCD; no prices, stock or orders.
- For every Sir Safety product in src/content/products whose declaration is Sir Safety's own (not a correspondence
  declaration for a product made by someone else), it asks for the Romanian declaration (langID 51).
- Checks before writing: a real PDF, in Romanian, naming the article code, with no customer data (the account's BP
  code, „You Protect”). The full-page letterhead image is downsampled to 150 dpi so each file stays under the
  pre-commit size limit; the text and the signature stay as they are.
- Writes public/documente/<slug>/declaratie-de-conformitate-ro.pdf; assemble_sirsafety.py links it on the product page.
"""
import base64
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API_HOST = "app.sirsafety.com"
API = f"https://{API_HOST}/sirapi/api/"
PRODUCTS = Path("src/content/products")
OUT_DIR = Path("public/documente")
FILE_NAME = "declaratie-de-conformitate-ro.pdf"
MAX_BYTES = 450 * 1024  # sub limita de 500 KB din pre-commit (check-added-large-files)
LANG_RO = 51
LANGUAGE_EN = {"code": "EN", "desc": "English", "languageID": 2, "sapRawValue": "E"}


def call(path, *, token=None, bp=None, body=None):
    url = API + path
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != API_HOST:
        raise ValueError(f"URL în afara portalului: {url}")
    headers = {"Accept": "application/json", "User-Agent": "Mozilla/5.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["sir-b2b-bp"] = base64.b64encode(str(bp).encode()).decode()
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")  # noqa: S310  (schema și host validate mai sus)
    # URL verificat mai sus: doar https://app.sirsafety.com.
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310  # nosemgrep
        return json.loads(resp.read())


def login():
    user, password = os.environ.get("SIRSAFETY_B2B_USER"), os.environ.get("SIRSAFETY_B2B_PASSWORD")
    if not user or not password:
        sys.exit("Lipsesc SIRSAFETY_B2B_USER / SIRSAFETY_B2B_PASSWORD: rulează prin `secret run youprotect-website --`.")
    res = call("login/login/", body={"language": LANGUAGE_EN, "remember": False, "username": user.lower().strip(),
                                     "password": password.strip(), "appCode": "B2B", "loginAs": ""})
    token, bp = res.get("net_token"), (res.get("uidata") or {}).get("bp")
    if not token or not bp:
        sys.exit("Login eșuat (fără token).")
    return token, str(bp)


def shrink(pdf_bytes):
    """Reduce la 150 dpi imaginile mari (antetul pe toată pagina); restul PDF-ului rămâne neschimbat."""
    import pikepdf
    from PIL import Image  # noqa: F401  (folosit de PdfImage.as_pil_image)

    pdf = pikepdf.open(io.BytesIO(pdf_bytes))
    for page in pdf.pages:
        for _, raw in page.images.items():
            if int(raw.Width) * int(raw.Height) < 2_000_000:
                continue
            img = pikepdf.PdfImage(raw).as_pil_image().convert("RGB")
            img = img.resize((img.width // 2, img.height // 2))
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=80, optimize=True)
            raw.write(buf.getvalue(), filter=pikepdf.Name.DCTDecode)
            raw.Width, raw.Height = img.width, img.height
            raw.ColorSpace, raw.BitsPerComponent = pikepdf.Name.DeviceRGB, 8
    out = io.BytesIO()
    pdf.save(out, compress_streams=True)
    return out.getvalue()


def text_of(pdf_bytes):
    from pypdf import PdfReader

    return re.sub(r"\s+", " ", " ".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(pdf_bytes)).pages))


def products():
    for path in sorted(PRODUCTS.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data["supplier"]["name"] != "Sir Safety":
            continue
        if any(d["type"] == "declaratie-corespondenta" for d in data["documents"]):
            continue  # fabricat de altcineva: declarația de corespondență nu are variantă în română
        code = data["supplier"]["model"]
        colour = data["colours"][0]["code"]
        if not colour:  # fără variante: codul din fișa tehnică (ex. FD114300 pentru hamuri, FB1328 pentru ochelari)
            sheet = next((d["url"] for d in data["documents"] if d["type"] == "fisa-tehnica"), "")
            stem = sheet.rsplit("/", 1)[-1].removesuffix("_EN.pdf")
            colour = stem[len(code):] if stem.startswith(code) else ""
        yield path.stem, code, code + colour


def main():
    token, bp = login()
    failed = False
    for slug, code, prod_id in products():
        try:
            res = call(f"export/getCD?{urllib.parse.urlencode({'prodID': prod_id, 'langID': LANG_RO})}", token=token, bp=bp)
            raw = base64.b64decode(res.get("file") or "")
            if not raw.startswith(b"%PDF-"):
                raise ValueError("răspunsul nu e PDF")
            text = text_of(raw)
            if not ("DECLARA" in text.upper() and "CONFORMITATE" in text.upper()):
                raise ValueError("declarația nu e în română")
            if code not in text:
                raise ValueError(f"declarația nu numește articolul {code}")
            if bp in text or bp.lstrip("0") in text or "you protect" in text.lower():
                raise ValueError("declarația conține date de client")
            small = shrink(raw)
            if len(small) > MAX_BYTES:
                raise ValueError(f"{len(small) // 1024} KB după micșorare (max {MAX_BYTES // 1024})")
            if "CONFORMITATE" not in text_of(small).upper():
                raise ValueError("textul s-a pierdut la micșorare")
            folder = OUT_DIR / slug
            folder.mkdir(parents=True, exist_ok=True)
            (folder / FILE_NAME).write_bytes(small)
            print(f"ok {prod_id} -> {folder / FILE_NAME} ({len(raw) // 1024} -> {len(small) // 1024} KB)")
        except Exception as exc:  # noqa: BLE001
            print(f"!! {prod_id}: {exc}", file=sys.stderr)
            failed = True
        time.sleep(0.5)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
