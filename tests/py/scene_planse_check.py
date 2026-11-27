"""Verificări pentru scripts/scene/make_planse.py pe imagini sintetice (Pillow + numpy, fără modele AI).

Rulare: python -I tests/py/scene_planse_check.py <ROOT>
Liniile „POS ..." / „NEG ..." de pe stdout sunt căutate de testul mjs.
"""
# ruff: noqa: S101, E501, E741
import contextlib
import hashlib
import io
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(ROOT / "scripts" / "scene"))
import compose_lib as cl  # noqa: E402
import fisa_lib as fl  # noqa: E402
import integrity_lib as ilib  # noqa: E402
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


def make_cand(root: Path, glob_ok=True, name="ZZ1-test_ctx-s7", with_master_hash=True):
    """Fixture COMPLET și consistent: sursă, master, raw, zone cu zone.json (files + sha256), fișă finală v3 și registru (write_fisa)."""
    cand = root / "cand" / name
    cand.mkdir(parents=True)
    zones = root / "zones"
    zones.mkdir()
    src = rng.integers(0, 255, (N, N, 3), dtype=np.uint8)
    Image.fromarray(src).save(root / "src.jpg", quality=95)
    Image.fromarray(src).save(cand / "master.png")
    Image.fromarray(src).save(cand / "raw_768.png")
    L = np.zeros((N, N), dtype=np.uint8)
    L[60:240, 60:240] = 255
    E = np.zeros((N, N), dtype=np.uint8)
    E[56:60, 56:244] = 255
    E[240:244, 56:244] = 255
    E[56:244, 56:60] = 255
    I = np.zeros((N, N), dtype=np.uint8)
    files = {}
    for n, m in (("L", L), ("E", E), ("I", I)):
        Image.fromarray(m).save(zones / f"{n}.png")
        files[n] = {"file": f"{n}.png", "sha256": ilib.file_sha(zones / f"{n}.png")}
    (zones / "zone.json").write_text(json.dumps({"schema": 1, "product": "ZZ1", "files": files, "critical": [{"name": "logo_a", "bbox": [80, 80, 150, 120]}, {"name": "banda_b", "bbox": [0, 200, 299, 299]}]}), encoding="utf-8")
    ver = [{"name": "identity_master", "value": 0, "threshold": 0, "passed": glob_ok, "detail": ""},
           {"name": "halo", "value": 1.5, "threshold": 3.0, "passed": True, "detail": ""},
           {"name": "faces", "value": {"max_score_1x": 0.1, "max_score_2x": 0.2}, "threshold": "x", "passed": True, "detail": ""}]
    h = "a" * 64
    fields = dict(candidat=name, produs="ZZ1", sha256_sursa=ilib.file_sha(root / "src.jpg"), sha256_masca=hashlib.sha256(cl.inpaint_mask(L == 255, E == 255).tobytes()).hexdigest(),
                  sha256_L=ilib.sha_arr(L == 255), sha256_E=ilib.sha_arr(E == 255), sha256_I=ilib.sha_arr(I == 255), sha256_cod=h,
                  sha256_master=ilib.file_sha(cand / "master.png"), sha256_raw=ilib.file_sha(cand / "raw_768.png"),
                  model={"id": "m", "revizie": "r", "sha256": h}, seed=7, prompt="p", context="test_ctx", scara=1.0, deplasare={"dx": 0, "dy": 0}, flip=False,
                  rotate_deg=0, canvas={"w": N, "h": N}, verificari=ver, timp_generare_s=1.0)
    if not with_master_hash:
        del fields["sha256_master"], fields["sha256_raw"]
        fisa = {**fields, "data": "2026-01-01T00:00:00Z", "rezultat_global": fl.compute_global(ver)}  # fișă T5a veche, ocolește validarea
        (cand / mp.FISA_NAME).write_text(json.dumps(fisa), encoding="utf-8")
    else:
        fl.write_fisa(cand, fl.build_fisa(**fields), root / "registru.jsonl", root, filename=mp.FISA_NAME)
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


def fresh(**kw):
    td = tempfile.TemporaryDirectory()
    root = Path(td.name)
    return td, root, *make_cand(root, **kw), root / "planse"


# ---- legătura fișă <-> imagine/sursă/zone/registru (R2): planșa NU se face din altceva decât ce a acceptat fișa ----
td, root, cand, zones, src, out = fresh()
Image.fromarray(rng.integers(0, 255, (N, N, 3), dtype=np.uint8)).save(cand / "master.png")  # master înlocuit după acceptare
rc, err = run_cli(cand, src, zones, out, out)
assert rc == 2 and "sha256_master" in err and "imaginea acceptată nu e cea de pe disc" in err and not list(out.glob("*.jpg")), err
print("NEG planșă refuzată: master.png de pe disc ≠ sha256_master din fișă")
td.cleanup()

td, root, cand, zones, src, out = fresh()
Image.fromarray(rng.integers(0, 255, (N, N, 3), dtype=np.uint8)).save(cand / "raw_768.png")
rc, err = run_cli(cand, src, zones, out, out)
assert rc == 2 and "sha256_raw" in err, err
print("NEG planșă refuzată: raw_768.png de pe disc ≠ sha256_raw din fișă")
td.cleanup()

td, root, cand, zones, src, out = fresh()
Image.fromarray(rng.integers(0, 255, (N, N, 3), dtype=np.uint8)).save(src, quality=95)  # altă sursă decât cea din fișă
rc, err = run_cli(cand, src, zones, out, out)
assert rc == 2 and "sha256_sursa" in err, err
print("NEG planșă refuzată: sursa reală ≠ sha256_sursa din fișă")
td.cleanup()

td, root, cand, zones, src, out = fresh()
m = np.zeros((N, N), np.uint8)
m[10:20, 10:20] = 255
Image.fromarray(m).save(zones / "L.png")  # zonă modificată după generare (zone.json păstrează sha vechi)
rc, err = run_cli(cand, src, zones, out, out)
assert rc == 2 and "sha256 L nu corespunde" in err, err
print("NEG planșă refuzată: zona L modificată față de zone.json")
td.cleanup()

td, root, cand, zones, src, out = fresh()
zj = json.loads((zones / "zone.json").read_text())
zj["files"]["L"]["sha256"] = ilib.file_sha(zones / "L.png")
m = np.zeros((N, N), np.uint8)
m[10:20, 10:20] = 255
Image.fromarray(m).save(zones / "L.png")
zj["files"]["L"]["sha256"] = ilib.file_sha(zones / "L.png")  # zone.json „reparat”: dar fișa are alt sha256_L
(zones / "zone.json").write_text(json.dumps(zj))
rc, err = run_cli(cand, src, zones, out, out)
assert rc == 2 and "sha256_L" in err and "zona încărcată" in err, err
print("NEG planșă refuzată: sha256_L din fișă ≠ zona încărcată")
td.cleanup()

td, root, cand, zones, src, out = fresh()
p = cand / mp.FISA_NAME
p.write_text(p.read_text().replace('"seed": 7', '"seed": 7 '), encoding="utf-8")  # fișă modificată după înregistrare (hash de fișier ≠ registru)
rc, err = run_cli(cand, src, zones, out, out)
assert rc == 2 and "registru" in err and "fișă modificată după înregistrare" in err, err
print("NEG planșă refuzată: sha256(fisa.json) ≠ fisa_sha256 din ultima linie a registrului")
td.cleanup()

td, root, cand, zones, src, out = fresh(with_master_hash=False)
rc, err = run_cli(cand, src, zones, out, out)
assert rc == 2 and "fișă veche" in err and "sha256_master" in err, err
print("NEG planșă refuzată: fișă veche fără sha256_master (fail-closed)")
td.cleanup()

td, root, cand, zones, src, out = fresh()
rc, err = run_cli(cand, src, zones, out, out)
assert rc == 0, err
print("POS planșă produsă doar când toate hash-urile se leagă (control pozitiv al testelor de mai sus)")
rc = mp.main(["--cand-dir", str(cand), "--source", str(src), "--zones-dir", str(zones), "--out-dir", str(out), "--base-planse", str(out), "--fisa-name", "x.json\n"])
assert rc == 2
print("NEG --fisa-name cu newline final (x.json\\n) refuzat")
td.cleanup()

print("ok")
