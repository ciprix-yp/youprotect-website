"""Descarcă datele de produs Portwest din linkurile de marketing ale contului You Protect.

Rulare (credențialele vin din Keychain, nu apar nicăieri):

    secret run youprotect-website -- python3 -I scripts/catalog/fetch_portwest.py
    secret run youprotect-website -- python3 -I scripts/catalog/fetch_portwest.py --docs C474 FW10

Fișierele ajung în .catalog-work/portwest/ (ignorat de git). Descrierea fiecărei surse e în
catalog/sources/portwest.md.

Ce NU descarcă, intenționat: listele de prețuri, stocul, lichidările, fișa de produs (are prețuri). Din
Daily Data (are prețuri și stoc) păstrează doar coloanele de produs: cod, culoare, mărime, poză, nume, dimensiuni.
Prețurile nu se scriu niciodată pe disc.
"""

from __future__ import annotations

import argparse
import csv
import http.cookiejar
import io
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / ".catalog-work" / "portwest"

ALLOWED_HOSTS = {"portwest.com", "d11ak7fd9ypfb7.cloudfront.net", "documents.portwest.com"}
# Nicio adresă cu prețuri, stoc sau date comerciale nu trece de aici, oricum ar ajunge în listă.
COMMERCIAL = re.compile(r"PriceList|simple_?soh|Clearance|ProductSheet|/promo|order", re.I)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36"
CDN = "https://d11ak7fd9ypfb7.cloudfront.net"

# cheie: (url, logare necesară, coloane obligatorii, rânduri minime)
SOURCES = {
    "descrieri-ro.csv": (f"{CDN}/marketing_files/desc/descRO.csv", False,
                         {"Style", "ProductType", "Range", "Collection", "Product", "Description", "Features"}, 1000),
    "descrieri-base-ro.csv": (f"{CDN}/marketing_files/desc/descbRO.csv", False,
                              {"Style", "Product", "Description", "Features"}, 100),
    "certificari.csv": (f"{CDN}/marketing_files/stds/stds.csv", False,
                        {"Style", "Test House", "Cert No.", "Standards (1)"}, 1000),
    "certificari-base.csv": (f"{CDN}/marketing_files/stds/base_stds.csv", False,
                             {"Style", "Test House", "Cert No.", "Standards (1)"}, 100),
    "coduri-bare.csv": (f"{CDN}/marketing_files/tech/techGB.csv", False,
                        {"Style", "Item", "Weight(Kg)", "EAN13"}, 10000),
    "coduri-bare-base.csv": ("https://portwest.com/account/base_tech_csv", True, {"Style", "Item", "EAN13"}, 1000),
    "materiale-imbracaminte.csv": ("https://portwest.com/account/materialsClothing", True,
                                   {"Style", "ProductName", "ShellComposition", "CareSymbolWash"}, 500),
    "materiale-incaltaminte.csv": ("https://portwest.com/account/materialsFootwear", True,
                                   {"Style", "ProductName", "Upper", "Outsole"}, 50),
    "materiale-incaltaminte-base.csv": ("https://portwest.com/account/materialsFootwearBase", True,
                                        {"Style", "ProductName", "Upper", "Outsole"}, 50),
    "materiale-epi.csv": ("https://portwest.com/account/materialsOther", True, {"Style", "ProductName", "Material1"}, 300),
}

# Daily Data: doar aceste coloane ajung pe disc (fără Price, UK_SoH, PL_SoH, Next_Delivery, Carton_Qty).
VARIANT_SOURCES = {
    "variante.csv": "https://portwest.com/account/downloadDailyData?name=LOG_DL_NAME_DAILY_DATA&file=sohRO.csv",
    "variante-base.csv": "https://portwest.com/account/downloadDailyData?name=LOG_DL_NAME_DAILY_DATA_BASE&file=sohROB.csv",
}
VARIANT_COLUMNS = ["Style", "Item", "Colour", "Size", "Fit", "Product_Name", "Image_Path", "Weight(Kg)", "EAN13",
                   "Unit_Of_Sale", "Description"]
NEVER_WRITE = {"Price", "UK_SoH", "PL_SoH", "SoH", "SOH", "Next_Delivery", "Carton_Qty", "Discount Price", "Stock"}
if NEVER_WRITE & set(VARIANT_COLUMNS):
    raise SystemExit(f"coloane comerciale în VARIANT_COLUMNS: {sorted(NEVER_WRITE & set(VARIANT_COLUMNS))}")


def opener_with_session() -> urllib.request.OpenerDirector:
    jar = http.cookiejar.CookieJar()  # doar în memorie: sesiunea nu se salvează pe disc
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [("User-Agent", UA)]
    return opener


def check_url(url: str) -> None:
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS:
        raise SystemExit(f"adresă nepermisă: {url}")
    if COMMERCIAL.search(url):
        raise SystemExit(f"adresă cu date comerciale, refuzată: {url}")


def get(opener, url: str, timeout: int = 120) -> tuple[str, bytes]:
    check_url(url)
    with opener.open(url, timeout=timeout) as r:  # noqa: S310  (schema și host validate în check_url)
        return r.geturl(), r.read()


def login(opener) -> None:
    account, password = os.environ.get("PORTWEST_ACCOUNT"), os.environ.get("PORTWEST_PASSWORD")
    if not account or not password:
        raise SystemExit("lipsesc PORTWEST_ACCOUNT / PORTWEST_PASSWORD: rulează cu `secret run youprotect-website -- …`")
    get(opener, "https://portwest.com/main/login/")
    data = urllib.parse.urlencode({"email": account, "password": password}).encode()
    req = urllib.request.Request("https://portwest.com/main/login/", data=data,
                                 headers={"Referer": "https://portwest.com/main/login/"})
    with opener.open(req, timeout=60) as r:  # noqa: S310  (adresă fixă, https)
        r.read()
    final, _ = get(opener, "https://portwest.com/account")
    if "/main/login" in final:
        raise SystemExit("logarea Portwest a eșuat (număr de cont sau parolă greșite?)")


def read_csv(body: bytes) -> list[dict[str, str]]:
    # Unele fișiere Portwest au un BOM și în prima celulă de date, nu doar la început.
    text = body.decode("utf-8-sig", "replace").replace("\ufeff", "")
    return list(csv.DictReader(io.StringIO(text)))


def validate_csv(name: str, rows: list[dict[str, str]], required: set[str], min_rows: int) -> None:
    columns = set(rows[0].keys()) if rows else set()
    missing = required - columns
    if missing:
        raise SystemExit(f"{name}: lipsesc coloanele {sorted(missing)} (Portwest a schimbat formatul?)")
    if len(rows) < min_rows:
        raise SystemExit(f"{name}: doar {len(rows)} rânduri, mă așteptam la cel puțin {min_rows}")


def fetch_feeds(out: Path) -> None:
    opener = opener_with_session()
    logged_in = False
    for name, (url, needs_login, required, min_rows) in SOURCES.items():
        if needs_login and not logged_in:
            login(opener)
            logged_in = True
        _, body = get(opener, url)
        rows = read_csv(body)
        validate_csv(name, rows, required, min_rows)
        (out / name).write_bytes(body)
        print(f"{name:34} {len(rows):>6} rânduri")

    if not logged_in:
        login(opener)
    for name, url in VARIANT_SOURCES.items():
        _, body = get(opener, url, timeout=300)
        rows = read_csv(body)
        del body
        validate_csv(name, rows, set(VARIANT_COLUMNS), 1000)
        with (out / name).open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=VARIANT_COLUMNS, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
        print(f"{name:34} {len(rows):>6} rânduri (fără preț și stoc)")


def document_urls(style: str, item_colour: str) -> dict[str, str]:
    """Documentele publice ale unui model. item_colour = cod model + cod culoare (de ex. C474YER)."""
    q = urllib.parse.urlencode
    return {
        "declaratie-de-conformitate-ro.pdf":
            f"https://documents.portwest.com/declaration_eu.php?{q({'style': style, 'lang': 'RO', 'itemcol': style})}",
        "fisa-tehnica-ro.pdf":
            f"https://documents.portwest.com/datasheet.php?{q({'style': style, 'lang': 'RO', 'itemcol': item_colour})}",
        "tabel-marimi.pdf": f"{CDN}/com_images/sizecharts/{urllib.parse.quote(style)}.pdf",
    }


def clean_pdf(body: bytes) -> bytes | None:
    """Serverul Portwest pune uneori text înaintea PDF-ului și taie finalul: păstrăm doar un PDF întreg."""
    start = body.find(b"%PDF-")
    if start < 0 or start > 1024:
        return None
    pdf = body[start:]
    return pdf if b"%%EOF" in pdf[-1024:] else None


def item_colours(out: Path) -> dict[str, str]:
    """Codul primei culori a fiecărui model, din numele pozei: model + culoare + croială (C474YER)."""
    first: dict[str, str] = {}
    for variants_path in (out / "variante.csv", out / "variante-base.csv"):  # Base are fișierul lui
        if not variants_path.exists():
            continue
        for r in csv.DictReader(variants_path.open(encoding="utf-8")):
            m = re.search(r"/styles1100px/([A-Z0-9]+)\.jpg$", r["Image_Path"])
            if m and m.group(1).startswith(r["Style"]):
                first.setdefault(r["Style"], m.group(1))
    return first


def fetch_pdf(opener, url: str) -> tuple[bytes | None, bool]:
    """(PDF întreg, None) sau (None, True) dacă documentul nu există; reîncearcă de 4 ori."""
    for attempt in range(4):
        try:
            _, body = get(opener, url)
            pdf = clean_pdf(body)
            if pdf:
                return pdf, False
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return None, True
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(2 * (attempt + 1))
    return None, False


def fetch_documents(out: Path, styles: list[str]) -> None:
    first_colour = item_colours(out)
    opener = opener_with_session()
    for style in styles:
        if not re.fullmatch(r"[A-Z0-9]{2,8}", style):
            raise SystemExit(f"cod de model invalid: {style}")
        target = out / "documente" / style
        target.mkdir(parents=True, exist_ok=True)
        for name, url in document_urls(style, first_colour.get(style, style)).items():
            pdf, missing = fetch_pdf(opener, url)
            if pdf:
                (target / name).write_bytes(pdf)
                print(f"{style:8} {name:36} {len(pdf) // 1024:>5} KB")
            elif missing:
                print(f"{style:8} {name:36} nu există la Portwest")
            else:
                print(f"{style:8} {name:36} INDISPONIBIL după 4 încercări (verifică manual: {url})")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--docs", nargs="*", metavar="COD", help="descarcă și documentele publice ale acestor modele")
    p.add_argument("--skip-feeds", action="store_true", help="doar documentele, fără fișierele de date")
    args = p.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    if not args.skip_feeds:
        fetch_feeds(args.out)
    if args.docs:
        fetch_documents(args.out, args.docs)


if __name__ == "__main__":
    sys.exit(main())
