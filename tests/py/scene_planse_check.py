"""Verificări pentru scripts/scene/make_planse.py pe imagini sintetice (Pillow + numpy, fără modele AI).

Rulare: python -I tests/py/scene_planse_check.py <ROOT>
Liniile „POS ..." / „NEG ..." de pe stdout sunt căutate de testul mjs.
"""
# ruff: noqa: S101, E501, E741
import contextlib
import io
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(ROOT / "scripts" / "scene"))
import make_planse as mp  # noqa: E402

N = 300
rng = np.random.default_rng(7)


def must_raise(fn, needle, label):
    try:
        fn()
    except mp.PlanseError as e:
        assert needle in str(e), f"{label}: mesaj {e!r} fără {needle!r}"
        print(f"{label}: {e}")
        return
    raise AssertionError(f"{label}: nu a picat")


def make_cand(root: Path, glob_ok=True, name="ZZ1-test_ctx-s7"):
    cand = root / "cand" / name
    cand.mkdir(parents=True)
    zones = root / "zones"
    zones.mkdir()
    src = rng.integers(0, 255, (N, N, 3), dtype=np.uint8)
    Image.fromarray(src).save(root / "src.jpg", quality=95)
    Image.fromarray(src).save(cand / "master.png")
    L = np.zeros((N, N), dtype=np.uint8)
    L[60:240, 60:240] = 255
    E = np.zeros((N, N), dtype=np.uint8)
    E[56:60, 56:244] = 255
    E[240:244, 56:244] = 255
    E[56:244, 56:60] = 255
    I = np.zeros((N, N), dtype=np.uint8)
    for n, m in (("L", L), ("E", E), ("I", I)):
        Image.fromarray(m).save(zones / f"{n}.png")
    (zones / "zone.json").write_text(json.dumps({"critical": [{"name": "logo_a", "bbox": [80, 80, 150, 120]}, {"name": "banda_b", "bbox": [0, 200, 299, 299]}]}), encoding="utf-8")
    ver = [{"name": "identity_master", "value": 0, "threshold": 0, "passed": True, "detail": ""},
           {"name": "halo", "value": 1.5, "threshold": 3.0, "passed": True, "detail": ""},
           {"name": "faces", "value": {"max_score_1x": 0.1, "max_score_2x": 0.2}, "threshold": "x", "passed": True, "detail": ""}]
    fisa = {"produs": "ZZ1", "context": "test_ctx", "seed": 7, "model": {"id": "m"}, "rezultat_global": glob_ok, "verificari": ver}
    (cand / "fisa_finala_v2b.json").write_text(json.dumps(fisa), encoding="utf-8")
    return cand, zones, root / "src.jpg"


def run_cli(cand, src, zones, out, base):
    err = io.StringIO()
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
        rc = mp.main(["--cand-dir", str(cand), "--source", str(src), "--zones-dir", str(zones), "--out-dir", str(out), "--base-planse", str(base)])
    return rc, err.getvalue()


# ---- funcții pure ----
a = np.arange(12, dtype=np.uint8).reshape(3, 4)
im = Image.fromarray(np.stack([a] * 3, -1))
big = mp.magnify_nearest(im, 3)
arr = np.asarray(big)
assert big.size == (12, 9)
assert all((arr[y, x] == np.asarray(im)[y // 3, x // 3]).all() for y in range(9) for x in range(12))
print("POS mărire pe vecin cel mai apropiat: fiecare pixel replicat exact 3×3")

for _ in range(300):
    W, H = int(rng.integers(50, 400)), int(rng.integers(50, 400))
    x0, y0, w, h = (int(v) for v in rng.integers(-50, 500, 4))
    w, h = abs(w) + 1, abs(h) + 1
    r = mp.clamp_window(x0, y0, w, h, W, H)
    assert 0 <= r[0] < r[2] <= W and 0 <= r[1] < r[3] <= H, (r, W, H)
print("POS decupajele (clamp_window) cad în interiorul imaginii, 300 de cazuri aleatorii")
for box in ([0, 0, 10, 10], [290, 290, 299, 299], [-5, -5, 20, 20]):
    r = mp.box_window(box, 6, N, N)
    assert 0 <= r[0] < r[2] <= N and 0 <= r[1] < r[3] <= N
must_raise(lambda: mp.box_window([400, 400, 450, 450], 6, N, N), "în afara imaginii", "NEG cutie în afara imaginii")

m = np.zeros((N, N), dtype=bool)
m[100:104, 20:280] = True
wins = mp.pick_edge_windows(m, 100, 3)
assert wins and all(0 <= w[0] and w[2] <= N and 0 <= w[1] and w[3] <= N for w in wins)
print(f"POS pick_edge_windows: {len(wins)} ferestre în imagine")

assert mp.fit_scale(50, 40) == (3, (50, 40)) and mp.fit_scale(250, 100)[0] == 2 and mp.fit_scale(75, 514) == (1, (75, 440))
pos, h = mp.shelf_layout([(500, 10), (500, 20), (500, 5)], 1170, 10)
assert pos == [(0, 0), (510, 0), (0, 30)] and h == 35, (pos, h)
print("POS fit_scale și shelf_layout")

good = {"width": 1170, "height": 100, "rects": {"a": (0, 0, 1170, 50)}}
mp.validate_layout(good)
must_raise(lambda: mp.validate_layout({**good, "width": 1000}), "lățime 1000", "NEG layout cu lățime greșită (1000)")
must_raise(lambda: mp.validate_layout({**good, "rects": {"a": (100, 0, 1100, 50)}}), "iese din planșa", "NEG dreptunghi care iese din planșă")

# ---- CLI ----
with tempfile.TemporaryDirectory() as td:
    root = Path(td)
    cand, zones, src = make_cand(root)
    out = root / "planse"
    rc, err = run_cli(cand, src, zones, out, out)
    assert rc == 0, err
    jp = out / "ZZ1_test_ctx_s7.jpg"
    img = Image.open(jp)
    assert img.format == "JPEG" and img.width == 1170, (img.format, img.size)
    img.load()
    print(f"POS planșă JPG valid, lățime exactă {img.width}, înălțime {img.height}")
    idx = (out / "index.txt").read_text(encoding="utf-8").splitlines()
    assert len(idx) == 1 and len(idx[0].split("  ")[0]) == 64
    print("POS index.txt cu sha256")
    rc, err = run_cli(cand, src, zones, out, out)
    assert rc == 2 and "FileExistsError" in err
    print("NEG nu suprascrie o planșă existentă")
    rc, err = run_cli(cand, src, zones, root / "alta", out)
    assert rc == 2 and "nu e sub" in err, err
    print("NEG ieșire în afara bazei refuzată")
    rc, err = run_cli(cand, src, zones, root / "planse" / ".." / "x", out)
    assert rc == 2 and "'..'" in err, err
    print("NEG cale cu '..' refuzată")

with tempfile.TemporaryDirectory() as td:
    root = Path(td)
    cand, zones, src = make_cand(root, glob_ok=False)
    out = root / "planse"
    rc, err = run_cli(cand, src, zones, out, out)
    assert rc == 2 and "rezultat_global nu e true" in err, err
    assert not list(out.glob("*.jpg")) if out.exists() else True
    print("NEG candidat cu rezultat_global false refuzat")

print("ok")
