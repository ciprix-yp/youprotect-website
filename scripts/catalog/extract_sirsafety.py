"""Extract Sir Safety product facts from the public website (www.sirsafety.com).

Usage:
  uv run --no-project --with pypdf python -I scripts/catalog/extract_sirsafety.py <out_dir> <CODE> [<CODE> ...]
  uv run --no-project --with pypdf python -I scripts/catalog/extract_sirsafety.py --declarations-only <out_dir> <CODE> ...
    (verifică doar declarațiile din JSON-urile existente: PDF real, conformitate sau corespondență + producător)

For every base code (e.g. MC2051) it:
  1. finds the product page through the site's own search (GET /ricerca/risultati?search=CODE);
  2. reads name, colours (code + name + image), sizes, description, standards and sectors;
  3. downloads the English datasheet (assets/schede/{CODE}{COL}_EN.pdf) and keeps its text;
  4. writes <out_dir>/<CODE>.json (local work data, .catalog-work/ is gitignored).

Only https://www.sirsafety.com is contacted, with a pause between requests (robots.txt allows /).
No prices or stock levels are taken. The texts on the site are in English; the Romanian copy is
written separately in catalog/texts/sirsafety/.
"""
import html
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ALLOWED_HOST = "www.sirsafety.com"
BASE = f"https://{ALLOWED_HOST}"
CODE_RE = re.compile(r"^[A-Z]{1,3}\d{2,5}$")
COLOUR_RE = re.compile(r"^[A-Z0-9]{2}$")
MAX_BYTES = 8 * 1024 * 1024
PAUSE_S = 1.0
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; catalog-sync)"}


def fetch(url, binary=False):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != ALLOWED_HOST:
        raise ValueError(f"URL în afara sursei permise: {url}")
    time.sleep(PAUSE_S)
    req = urllib.request.Request(url, headers=HEADERS)  # noqa: S310  (schema și host validate mai sus)
    # URL verificat mai sus: doar https://www.sirsafety.com.
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310  # nosemgrep
        data = resp.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError(f"răspuns prea mare: {url}")
    return data if binary else data.decode("utf-8", errors="replace")


def text_of(fragment):
    fragment = re.sub(r"<br\s*/?>", "\n", fragment)
    fragment = re.sub(r"</(p|li|div|tr)>", "\n", fragment)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    fragment = html.unescape(fragment)
    fragment = re.sub(r"[ \t\xa0]+", " ", fragment)
    fragment = re.sub(r"\n\s*\n+", "\n", fragment)
    return fragment.strip()


def product_section(page):
    i = page.find('<section class="content-product">')
    j = page.find('<section class="divider-title">', i)
    return page[i:j] if i >= 0 else ""


def page_code(section):
    m = re.search(r'id="codicedes">([^<]+)', section)
    return m.group(1).split()[0].strip() if m else None


def find_product_url(code):
    results = fetch(f"{BASE}/ricerca/risultati?search={urllib.parse.quote(code)}")
    links = []
    for href in re.findall(r'<a href="([^"]+)" class="single-product-card"', results):
        url = urllib.parse.urljoin(BASE, html.unescape(href))
        if urllib.parse.urlparse(url).hostname == ALLOWED_HOST and url not in links:
            links.append(url)
    for url in links[:6]:
        page = fetch(url)
        if page_code(product_section(page)) == code:
            return url, page
    raise LookupError(f"{code}: nu am găsit pagina produsului (candidați: {len(links)})")


def parse_page(code, url, page):
    sec = product_section(page)
    title = re.search(r'<p class="title-small des">(.*?)</p>', sec, re.S)
    crumbs = [text_of(x) for x in re.findall(r'<div class="breadcrumb small">(.*?)</div>', sec, re.S)]
    details = re.search(r'<div class="details-block">(.*?)<div class="accordion-list">', sec, re.S)
    general = {}
    if details:
        for a, b in re.findall(r'<div class="general[^"]*"><strong>(.*?)</strong><span>(.*?)</span>', details.group(1), re.S):
            general[text_of(a)] = text_of(b)
    colours = []
    for t, stock, c, prod, lang, img in re.findall(
        r'<a title="([^"]*)"[^>]*data-magazzino="([^"]*)" data-codice="([^"]*)" data-prodotto="([^"]*)" '
        r'data-lingua="([^"]*)" data-immagine="([^"]*)"', sec):
        if prod != code or not COLOUR_RE.match(c):
            continue
        colours.append({"code": c, "name": html.unescape(t).strip(), "image": img, "inStock": stock == "1"})
    tables = {}
    for a, b in re.findall(r'<div class="product-table-header general"><strong>(.*?)</strong></div>\s*'
                           r'<div class="product-table-content general">(.*?)</div>\s*</div>', sec, re.S):
        tables[text_of(a)] = text_of(b)
    if not colours:
        m = re.search(rf"/assets/img/prodotti/{code}([A-Z0-9]{{2}})\.png", sec)
        if m:
            colours.append({"code": m.group(1), "name": None,
                            "image": f"{BASE}/assets/img/prodotti/{code}{m.group(1)}.png", "inStock": True})
        elif re.search(rf"/assets/img/prodotti/{code}\.png", sec):
            # Produs fără variante de culoare (ochelari, viziere, antifoane): poza și PDF-urile n-au sufix de culoare.
            colours.append({"code": "", "name": None,
                            "image": f"{BASE}/assets/img/prodotti/{code}.png", "inStock": True})
    return {
        "code": code,
        "url": url,
        "name": text_of(title.group(1)) if title else None,
        "breadcrumb": crumbs,
        "general": general,
        "colours": colours,
        "description": tables.get("Description and features"),
        "technical": tables.get("Technical info"),
        "recommendedFor": [s.strip() for s in (tables.get("Recommended for") or "").split("\n") if s.strip()],
        "pdfLinks": sorted(set(re.findall(r'href="(https://www\.sirsafety\.com/assets/[^"]+\.pdf)"', sec))),
    }


def datasheet(code, colour):
    from pypdf import PdfReader  # instalat de uv (--with pypdf)

    url = f"{BASE}/assets/schede/{code}{colour}_EN.pdf"
    try:
        data = fetch(url, binary=True)
    except Exception as exc:  # noqa: BLE001
        return {"url": url, "text": None, "error": str(exc)}
    if not data.startswith(b"%PDF"):
        return {"url": url, "text": None, "error": "nu e PDF"}
    reader = PdfReader(io.BytesIO(data))
    text = "\n".join((p.extract_text() or "") for p in reader.pages)
    return {"url": url, "text": re.sub(r"[ \t]+", " ", text).strip()}


def declaration(url):
    """Verifică declarația: e un PDF și ce fel de declarație e.

    Sir Safety are două feluri: declarația UE de conformitate emisă de ei („conformity”) și, la produsele fabricate de
    alții, o „dichiarazione di corrispondenza” în italiană cu declarația UE a producătorului atașată („correspondence”,
    cu numele producătorului). Unele linkuri de pe sirsafety.com întorc o pagină HTML sau 404 în loc de PDF (MC1111,
    MC3014 pe 19.11.2026): atunci întoarce None și fișa de pe site nu mai pune linkul.
    """
    from pypdf import PdfReader  # instalat de uv (--with pypdf)

    try:
        data = fetch(url, binary=True)
    except Exception:  # noqa: BLE001  (404 sau eroare de rețea: fără link)
        return None
    if not data.startswith(b"%PDF"):
        return None
    pages = [re.sub(r"\s+", " ", p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages]
    first = pages[0] if pages else ""
    if "CORRISPONDENZA" in first.upper():
        m = re.search(r"Fabbricato da (.+?) Indicato", first)
        return {"url": url, "kind": "correspondence", "manufacturer": m.group(1).strip() if m else None, "standards": []}
    # Standardele din declarație: asamblarea refuză o certificare care nu e aici (MC3422 avea EN 13034 doar în fișă).
    # „EN 1149- 5” apare rupt pe rând în unele PDF-uri: lipim cratima.
    text = re.sub(r"-\s+(\d)", r"-\1", " ".join(pages))
    standards = sorted(set(re.findall(r"\b(EN(?: ISO| IEC)? \d{3,5}(?:-\d+)*|IEC \d{4,5}(?:-\d+)*)", text)))
    return {"url": url, "kind": "conformity", "manufacturer": None, "standards": standards}


def refresh_declarations(out_dir, codes):
    """--declarations-only: reface doar câmpul `declaration` în JSON-urile existente, fără să re-extragă restul."""
    failed = False
    for code in codes:
        path = out_dir / f"{code}.json"
        facts = json.loads(path.read_text(encoding="utf-8"))
        primary = facts["colours"][0]["code"] if facts["colours"] else None
        if primary == "" and facts["datasheet"] and "00_EN.pdf" in facts["datasheet"]["url"]:
            primary = "00"  # hamuri și lonje: PDF-urile păstrează sufixul „00”
        doc = f"{BASE}/assets/dichiarazioni-conformita/{code}{primary}_EN.pdf" if primary is not None else None
        facts["declaration"] = declaration(doc) if doc in facts["pdfLinks"] else None
        facts["declarationUrl"] = facts["declaration"]["url"] if facts["declaration"] else None
        path.write_text(json.dumps(facts, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        d = facts["declaration"]
        print(f"ok {code}: DoC {d['kind'] + (' ' + (d['manufacturer'] or '')[:40] if d['manufacturer'] else '') if d else 'NU'}")
    sys.exit(1 if failed else 0)


def main(argv):
    if argv and argv[0] == "--declarations-only":
        refresh_declarations(Path(argv[1]), [c.strip().upper() for c in argv[2:]])
    out_dir = Path(argv[0])
    codes = [c.strip().upper() for c in argv[1:]]
    out_dir.mkdir(parents=True, exist_ok=True)
    failed = False
    for code in codes:
        if not CODE_RE.match(code):
            print(f"!! cod invalid: {code}", file=sys.stderr)
            failed = True
            continue
        try:
            url, page = find_product_url(code)
            facts = parse_page(code, url, page)
            # "" = produs fără variante de culoare; None = nicio poză găsită.
            primary = facts["colours"][0]["code"] if facts["colours"] else None
            facts["datasheet"] = datasheet(code, primary) if primary is not None else None
            doc = f"{BASE}/assets/dichiarazioni-conformita/{code}{primary}_EN.pdf" if primary is not None else None
            facts["declaration"] = declaration(doc) if doc in facts["pdfLinks"] else None
            facts["declarationUrl"] = facts["declaration"]["url"] if facts["declaration"] else None
            # Hamurile și lonjele au poza și PDF-urile cu sufixul „00” și lista de culori goală în fișă: „00” înseamnă
            # „fără culoare”. Le tratăm ca produsele fără variante (cod gol); URL-urile rămân cele cu „00”.
            if [c["code"] for c in facts["colours"]] == ["00"] and not facts["colours"][0]["name"]:
                facts["colours"][0]["code"] = ""
            facts["source"] = {"site": BASE, "fetchedAt": date.today().isoformat()}
        except Exception as exc:  # noqa: BLE001
            print(f"!! {code}: {exc}", file=sys.stderr)
            failed = True
            continue
        (out_dir / f"{code}.json").write_text(json.dumps(facts, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        ds = facts["datasheet"] or {}
        print(f"ok {code}: {facts['name']} | culori {len(facts['colours'])} | mărimi {facts['general']} | "
              f"fișă {'da' if ds.get('text') else 'NU'} | DoC {'da' if facts['declarationUrl'] else 'NU'}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
