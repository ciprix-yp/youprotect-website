"""Verifică opțiunea --only din scripts/images/build-poze-actiune.py și fetch-poze-actiune.py pe date sintetice.

Rulat de tests/build-poze-actiune.test.mjs. Usage: python -I tests/py/only_check.py <repo>
"""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

from PIL import Image

REPO = Path(sys.argv[1])


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, REPO / "scripts/images" / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bpa = load("bpa", "build-poze-actiune.py")
fetch = load("fetch", "fetch-poze-actiune.py")


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def expect_exit(label, fn):
    try:
        fn()
    except SystemExit:
        return
    raise AssertionError(f"{label}: trebuia să oprească scriptul")


ids = {"S97", "S98", "S99"}
expect_exit("id invalid", lambda: bpa.parse_only(["--only", "X1"], ids))
expect_exit("id necunoscut", lambda: bpa.parse_only(["--only", "S96"], ids))
expect_exit("id dublat", lambda: bpa.parse_only(["--only", "S99,S99"], ids))
check(bpa.parse_only([], ids) is None, "fără --only: None")
check(bpa.parse_only(["--only", "S98,S99"], ids) == {"S98", "S99"}, "--only cu două id-uri")

# merge: intrările neprocesate rămân neatinse, ordinea cheilor e cea din date
existing = {"S98": [{"width": 640, "file": "a.webp"}], "S97": [{"width": 640, "file": "b.webp"}]}
merged = bpa.merge_variants(["S97", "S98", "S99"], existing, {"S99": [{"width": 640, "file": "c.webp"}]})
check(list(merged) == ["S97", "S98", "S99"], f"ordinea cheilor: {list(merged)}")
check(merged["S97"] is existing["S97"] and merged["S98"] is existing["S98"], "intrările existente se păstrează")

# efectiv.json (fetch): aceleași reguli
entries = [{"id": i} for i in ("S97", "S98", "S99")]
old = [{"id": "S98", "v": "vechi"}, {"id": "S99", "v": "vechi"}]
recs = fetch.merge_records(entries, old, [{"id": "S99", "v": "nou"}])
check(recs == [{"id": "S98", "v": "vechi"}, {"id": "S99", "v": "nou"}], f"merge efectiv.json: {recs}")
check(fetch.only_ids(entries, ["--only", "S98"]) == {"S98"}, "fetch --only")
check(fetch.only_ids(entries, []) is None, "fetch fără --only")
expect_exit("fetch id necunoscut", lambda: fetch.only_ids(entries, ["--only", "S50"]))

# cap la cap: două poze în date, doar S99 are sursă locală; --only S99 nu atinge intrarea S98 din variante
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    (root / "original").mkdir()
    Image.new("RGB", (1600, 900), (10, 120, 200)).save(root / "original" / "S99.jpg", quality=90)
    data = [
        {"id": i, "furnizor": "sirsafety", "slug": slug, "sursa": "original", "latimi": [640, 960, 1440], "erou": False}
        for i, slug in (("S98", "doi-sir-safety"), ("S99", "unu-sir-safety"))
    ]
    (root / "data.json").write_text(json.dumps(data), encoding="utf-8")
    manifest = [{"id": "S99", "fisier_efectiv": "original/S99.jpg"}]  # S98 lipsește: nu trebuie cerut
    (root / "efectiv.json").write_text(json.dumps(manifest), encoding="utf-8")
    (root / "surse.json").write_text("[]", encoding="utf-8")
    before = '{\n  "S98": [\n    {"width": 640,   "file": "doi-sir-safety-640.webp"}\n  ]\n}\n'
    (root / "variante.json").write_text(before, encoding="utf-8")
    bpa.BASE, bpa.DATA, bpa.MANIFEST, bpa.SOURCES = root, root / "data.json", root / "efectiv.json", root / "surse.json"
    bpa.VARIANTS, bpa.OUT = root / "variante.json", root / "out"
    expect_exit("fără --only lipsește sursa S98", lambda: bpa.main([]))
    bpa.main(["--only", "S99"])
    after = json.loads(bpa.VARIANTS.read_text(encoding="utf-8"))
    check(list(after) == ["S98", "S99"], f"chei după --only: {list(after)}")
    check(after["S98"] == [{"width": 640, "file": "doi-sir-safety-640.webp"}], "S98 trebuie să rămână neatins")
    files = [v["file"] for v in after["S99"]]
    check(files == [f"unu-sir-safety-{w}.webp" for w in (640, 960, 1440)], "S99 generat")
    check(sorted(p.name for p in bpa.OUT.iterdir()) == sorted(v["file"] for v in after["S99"]), "doar fișierele S99 în out/")
print("ok")
