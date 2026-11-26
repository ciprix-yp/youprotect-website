"""Verifică decupajul portret 4:5 din build-poze-actiune.py pe o imagine sintetică.

Rulat de tests/build-poze-actiune.test.mjs. Usage: python -I tests/py/portret_crop_check.py <repo>
"""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

from PIL import Image

spec = importlib.util.spec_from_file_location("bpa", Path(sys.argv[1]) / "scripts/images/build-poze-actiune.py")
bpa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bpa)


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def expect_exit(label, fn):
    try:
        fn()
    except SystemExit as err:
        check("EROARE" in str(err.code), f"{label}: mesaj neașteptat {err.code!r}")
        return
    raise AssertionError(f"{label}: trebuia să oprească scriptul")


# Original 2000x1500: banda de sus (y < 300) roșie, restul alb. Decupajul de desktop 16:9 (1600x900) pornește la y=300,
# deci banda roșie e DIN AFARA lui; decupajul portret 4:5 (1200x1500, y 0..1) trebuie să o conțină.
full = Image.new("RGB", (2000, 1500), (255, 255, 255))
full.paste((255, 0, 0), (0, 0, 2000, 300))
desktop_box = {"x": 100, "y": 300, "latime": 1600, "inaltime": 900}
desktop = bpa.apply_crop({"id": "S99"}, full, desktop_box)
check(desktop.size == (1600, 900), "decupajul de desktop are altă dimensiune")
check(desktop.getpixel((10, 10)) == (255, 255, 255), "decupajul de desktop nu trebuie să conțină banda")

crop = bpa.portrait_crop(full, [0.2, 0, 0.8, 1])
check(crop.size == (1200, 1500), f"fracțiile sunt relative la originalul întreg, nu la decupajul de desktop: {crop.size}")
check(crop.getpixel((600, 10)) == (255, 0, 0), "decupajul portret trebuie să iasă din cel de desktop (banda roșie)")
check(crop.getpixel((600, 1400)) == (255, 255, 255), "partea de jos a decupajului portret trebuie să fie albă")

# aceleași fracții pe imaginea decupată (comportamentul vechi) nu mai sunt 4:5: 960x900
expect_exit("fracții pe imaginea decupată", lambda: bpa.portrait_crop(desktop, [0.2, 0, 0.8, 1]))

# validările rămân
expect_exit("nu e 4:5", lambda: bpa.portrait_crop(full, [0, 0, 1, 1]))
expect_exit("prea mic (upscaling)", lambda: bpa.portrait_crop(Image.new("RGB", (800, 1000)), [0, 0, 1, 1]))
expect_exit("fracții în afara [0,1]", lambda: bpa.portrait_crop(full, [-0.1, 0, 0.7, 1]))
expect_exit("fracții în afara [0,1] (x1 > 1)", lambda: bpa.portrait_crop(full, [0.5, 0, 1.1, 1]))
expect_exit("x0 >= x1", lambda: bpa.portrait_crop(full, [0.8, 0, 0.2, 1]))
expect_exit("format greșit", lambda: bpa.portrait_crop(full, [0.2, 0, 0.8]))

# lățimile eroului pe desktop se calculează pe imaginea de desktop (nu pe originalul întreg, nu pe portret)
check(bpa.planned_widths({"erou": True}, *desktop.size) == [768, 960, 1440, 1600], "lățimi pe imaginea de desktop")
check(bpa.planned_widths({"erou": True}, *full.size) == [768, 960, 1440, 1920], "lățimi pe originalul întreg")

# cap la cap prin main(): original sintetic cu `decupaj` de desktop și `portret` care iese din el
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    (root / "original").mkdir()
    full.save(root / "original" / "S99.jpg", quality=95)
    entry = {
        "id": "S99", "furnizor": "sirsafety", "slug": "test-sintetic-sir-safety", "sursa": "original",
        "latimi": [768, 960, 1440, 1600], "erou": True, "portret": {"decupaj": [0.2, 0, 0.8, 1]},
    }
    (root / "data.json").write_text(json.dumps([entry]), encoding="utf-8")
    manifest = [{"id": "S99", "fisier_efectiv": "original/S99.jpg"}]
    (root / "efectiv.json").write_text(json.dumps(manifest), encoding="utf-8")
    (root / "surse.json").write_text(json.dumps([{"id": "S99", "decupaj": desktop_box}]), encoding="utf-8")
    bpa.BASE, bpa.DATA, bpa.MANIFEST, bpa.SOURCES = root, root / "data.json", root / "efectiv.json", root / "surse.json"
    bpa.VARIANTS, bpa.OUT = root / "variante.json", root / "out"
    bpa.main([])
    variants = json.loads(bpa.VARIANTS.read_text(encoding="utf-8"))["S99"]
    widths = [v["width"] for v in variants if not v.get("portret")]
    check(widths == [768, 960, 1440, 1600], f"lățimile pe imaginea de desktop: {widths}")
    portrait = [v for v in variants if v.get("portret")]
    check([(v["width"], v["height"]) for v in portrait] == [(768, 960), (960, 1200)], "variantele portret")
    with Image.open(bpa.OUT / "test-sintetic-sir-safety-p960.webp") as img:
        r, g, b = img.convert("RGB").getpixel((480, 20))
        check(r > 200 and g < 80 and b < 80, f"portretul începe în banda roșie din afara decupajului de desktop: {(r, g, b)}")
    with Image.open(bpa.OUT / "test-sintetic-sir-safety-1600.webp") as img:
        r, g, b = img.convert("RGB").getpixel((800, 10))
        check(r > 200 and g > 200 and b > 200, "decupajul de desktop nu trebuie să conțină banda")
print("ok")
