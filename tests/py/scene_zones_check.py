"""Verificări pentru scripts/scene/zones_lib.py și verify_zones.py pe imagini sintetice mici (Pillow + numpy, fără modele AI).

Rulare: python -I tests/py/scene_zones_check.py <ROOT>
Teste pozitive (zonele construite trec verificarea) și NEGATIVE (fiecare încălcare de invariant trebuie să pice cu mesajul exact).
"""
# ruff: noqa: S101
# (S101: scriptul e un test, `assert` e mecanismul lui; rulat cu `python3 -I`, nu cu -O)
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(sys.argv[1]).resolve()
SCENE = ROOT / "scripts" / "scene"


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCENE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


zl = load("zones_lib")
vz = load("verify_zones")

N = 120
PARAMS = {"erode_r": 3, "band_in": 3, "band_out": 1, "i_inset": 3, "crit_dilate": 2}


def rect(x0, y0, x1, y1):
    m = np.zeros((N, N), dtype=bool)
    m[y0:y1, x0:x1] = True
    return m


def synthetic():
    alpha = np.zeros((N, N), dtype=np.uint8)
    alpha[rect(20, 20, 100, 100)] = 255
    # margine moale pe stânga: coloana x=19 cu alpha 100 (sub pragul siluetei), x=20 cu alpha 200 (siluetă, dar sub 0,99)
    alpha[20:100, 19] = 100
    alpha[20:100, 20] = 200
    crit_raw = {"banda": rect(40, 50, 70, 58), "logo_pe_margine": rect(20, 70, 30, 76)}
    interior = rect(60, 26, 90, 36)
    return alpha, crit_raw, interior


def write_dir(d: Path, alpha, crit_raw, interior, params=PARAMS):
    """Reface ce face build_zones.py, cu măști sintetice."""
    d.mkdir(parents=True)
    src = np.random.default_rng(1).integers(0, 255, (N, N, 3), dtype=np.uint8)
    Image.fromarray(src).save(d / "source.png")
    crit, lost = {}, {}
    for k, raw in crit_raw.items():
        crit[k], lost[k] = zl.effective_critical(raw, alpha)
    L, E, Iz = zl.build_zones(alpha, interior, list(crit.values()), params)
    files = {"alpha": {"file": "alpha.png", "sha256": zl.save_alpha_png(d / "alpha.png", alpha)}}
    for k, m in (("L", L), ("E", E), ("I", Iz)):
        files[k] = {"file": f"{k}.png", "sha256": zl.save_mask_png(d / f"{k}.png", m)}
    (d / "critical").mkdir()
    cj = []
    for k, m in crit.items():
        sha = zl.save_mask_png(d / "critical" / f"{k}.png", m)
        cj.append({
            "name": k, "file": f"critical/{k}.png", "sha256": sha, "bbox": zl.bbox_of(m),
            "pixels": int(m.sum()), "lost_alpha_lt_099": lost[k],
        })
    zj = {
        "schema": zl.SCHEMA, "product": "SINT",
        "source": {"path": "source.png", "sha256": hashlib.sha256((d / "source.png").read_bytes()).hexdigest(),
                   "width": N, "height": N},
        "params": params, "files": files, "critical": cj,
    }
    zl.write_zone_json(d / "zone.json", zj)
    return L, E, Iz, crit


def edit_zone_json(d: Path, fn):
    zj = json.loads((d / "zone.json").read_text())
    fn(zj)
    zl.write_zone_json(d / "zone.json", zj)


def replace_mask(d: Path, key: str, arr, rehash=True):
    """Înlocuiește fișierul unei zone; cu rehash=True actualizează hash-ul în zone.json (altfel hash-ul rămâne vechi)."""
    sha = zl.save_mask_png(d / f"{key}.png", arr)
    if rehash:
        edit_zone_json(d, lambda z: z["files"][key].__setitem__("sha256", sha))


def run_cli(d: Path):
    """verify_zones.py ca proces separat (cod de ieșire); argumentele sunt căi proprii ale testului, nu intrare externă."""
    cmd = [sys.executable, "-I", str(SCENE / "verify_zones.py"), "--zone-dir", str(d), "--source", str(d / "source.png")]
    return subprocess.run(cmd, capture_output=True, text=True, check=False)  # noqa: S603


def verify(d: Path):
    return vz.verify(d, d / "source.png")[0]


def expect_fail(label, d, needle):
    errs = verify(d)
    assert errs, f"{label}: verificarea a TRECUT deși intrarea e stricată"
    assert any(needle in e for e in errs), f"{label}: așteptam '{needle}', primit {errs}"
    print(f"  negativ ok: {label} -> {needle}")


def main():
    tmp = Path(tempfile.mkdtemp(prefix="scene-zones-"))
    try:
        # --- morfologie
        a = rect(10, 10, 21, 21)
        e = zl.erode(a, 3)
        assert e[15, 15] and not e[10, 10] and not e[12, 15]
        d1 = zl.dilate(rect(50, 50, 51, 51), 2)
        assert d1[50, 52] and d1[52, 50] and not d1[52, 52] and d1.sum() == len(zl.disc_offsets(2))
        assert not zl.erode(rect(0, 0, 10, 10), 1)[0, 5], "marginea imaginii e fundal"
        assert (zl.dilate(a, 0) == a).all() and (zl.erode(a, 0) == a).all()
        print("morfologie ok")

        alpha, crit_raw, interior = synthetic()
        # marcaj critic pe margine: pixelii cu alpha < 0,99 se raportează, nu se ascund
        eff, lost = zl.effective_critical(crit_raw["logo_pe_margine"], alpha)
        assert lost == 6 and int(eff.sum()) == int(crit_raw["logo_pe_margine"].sum()) - 6, (lost, int(eff.sum()))
        print("pixeli critici cu alpha < 0,99 raportați:", lost)

        # --- pozitiv
        good = tmp / "good"
        L, E, Iz, crit = write_dir(good, alpha, crit_raw, interior)
        assert Iz.any() and L.any() and E.any()
        assert not (L & E).any() and not (L & Iz).any() and not (E & Iz).any(), "L/E/I disjuncte"
        for m in crit.values():
            assert (m & L).sum() == m.sum(), "critice 100% în L"
        assert not (Iz & ~zl.erode(zl.silhouette(alpha), 2)).any()
        errs = verify(good)
        assert errs == [], errs
        cli = run_cli(good)
        assert cli.returncode == 0 and "VERIFICARE ZONE: OK" in cli.stdout, cli.stdout + cli.stderr
        print("pozitiv ok")

        def fresh(name):
            d = tmp / name
            shutil.copytree(good, d)
            return d

        # 1. un marcaj critic iese din L cu 1 pixel
        d = fresh("n1")
        l2 = L.copy()
        ys, xs = np.nonzero(crit["banda"])
        l2[ys[0], xs[0]] = False
        replace_mask(d, "L", l2)
        expect_fail("marcaj critic iese din L cu 1 px", d, "MARCAJ CRITIC IESE DIN L 'banda': 1 px")
        # 2. I atinge L (suprapunere)
        d = fresh("n2")
        i2 = Iz.copy()
        i2[60, 60] = True  # în L
        assert L[60, 60]
        replace_mask(d, "I", i2)
        expect_fail("I atinge L", d, "SUPRAPUNERE L/I")
        # 3. I atinge marginea siluetei
        d = fresh("n3")
        i2 = Iz.copy()
        i2[50, 20] = True
        l2, e2 = L.copy(), E.copy()
        l2[50, 20] = e2[50, 20] = False
        replace_mask(d, "I", i2)
        replace_mask(d, "L", l2)
        replace_mask(d, "E", e2)
        expect_fail("I atinge marginea siluetei", d, "I ATINGE MARGINEA SILUETEI")
        # 4. E depășește banda
        d = fresh("n4")
        e2 = E.copy()
        e2[40, 60] = True  # adânc în interior
        l2 = L.copy()
        l2[40, 60] = False
        replace_mask(d, "E", e2)
        replace_mask(d, "L", l2)
        expect_fail("E depășește banda", d, "E IN AFARA BANDEI")
        # 5. hash de mască nepotrivit
        d = fresh("n5")
        replace_mask(d, "L", L & ~rect(60, 60, 61, 61), rehash=False)
        expect_fail("hash mască nepotrivit", d, "HASH L")
        d = fresh("n5b")
        edit_zone_json(d, lambda z: z["critical"][0].__setitem__("sha256", "0" * 64))
        expect_fail("hash marcaj critic nepotrivit", d, "HASH marcaj critic")
        # 6. sha256 sursă diferit
        d = fresh("n6")
        with open(d / "source.png", "ab") as f:
            f.write(b"x")
        expect_fail("sha256 sursă diferit", d, "SHA256 SURSA")
        # 7. L/E suprapuse
        d = fresh("n7")
        e2 = E.copy()
        e2[60, 60] = True
        replace_mask(d, "E", e2)
        expect_fail("L/E suprapuse", d, "SUPRAPUNERE L/E")
        # 8. I lipit de un marcaj critic
        d = fresh("n8")
        i2 = Iz.copy()
        i2[49, 50] = True  # imediat deasupra benzii critice (y 50..57)
        l2 = L.copy()
        l2[49, 50] = False
        replace_mask(d, "I", i2)
        replace_mask(d, "L", l2)
        expect_fail("I atinge masca critică", d, "I ATINGE MASCA CRITICA")
        # 9. mască critică cu pixeli alpha < 0,99 (ar ascunde pixeli neacoperiți)
        d = fresh("n9")
        bad = crit["logo_pe_margine"].copy()
        bad[72, 20] = True  # alpha 200
        sha = zl.save_mask_png(d / "critical" / "logo_pe_margine.png", bad)
        edit_zone_json(d, lambda z: z["critical"][1].update({"sha256": sha, "pixels": int(bad.sum()), "bbox": zl.bbox_of(bad)}))
        expect_fail("mască critică cu alpha < 0,99", d, "alpha < 0,99")
        # 10. dimensiuni diferite față de sursă
        d = fresh("n10")
        Image.fromarray(np.zeros((N - 1, N), dtype=np.uint8) + 255, mode="L").save(d / "E.png")
        edit_zone_json(d, lambda z: z["files"]["E"].__setitem__("sha256", zl.sha256_file(d / "E.png")))
        expect_fail("mască de altă mărime", d, "DIMENSIUNI E")
        # 11. cale din zone.json care iese din director
        d = fresh("n11")
        edit_zone_json(d, lambda z: z["files"]["L"].__setitem__("file", "../good/L.png"))
        expect_fail("cale cu ..", d, "FISIER L")
        # 12. fișier cu valori diferite de 0/255
        d = fresh("n12")
        arr = np.asarray(Image.open(d / "L.png")).copy()
        arr[0, 0] = 77
        Image.fromarray(arr, mode="L").save(d / "L.png")
        edit_zone_json(d, lambda z: z["files"]["L"].__setitem__("sha256", zl.sha256_file(d / "L.png")))
        expect_fail("mască cu valori != 0/255", d, "doar 0/255")
        # 13. CLI: cod != 0 pe intrare stricată
        cli = run_cli(tmp / "n1")
        assert cli.returncode != 0 and "PICAT" in cli.stderr, cli.stderr
        print("  negativ ok: CLI iese cu cod", cli.returncode)

        # --- invariante ale build_zones pe intrări aleatorii
        rng = np.random.default_rng(7)
        for t in range(20):
            al = np.zeros((N, N), dtype=np.uint8)
            x0, y0 = rng.integers(5, 30, 2)
            x1, y1 = rng.integers(80, 115, 2)
            al[y0:y1, x0:x1] = 255
            def ri(lo, hi):
                return int(rng.integers(lo, hi))

            raw = rect(ri(x0, x0 + 20), ri(y0, y0 + 20), ri(x0 + 25, x1), ri(y0 + 25, y1))
            inter = rect(ri(x0, x0 + 40), ri(y0, y0 + 40), ri(x0 + 41, x1 + 5), ri(y0 + 41, y1 + 5))
            c, _ = zl.effective_critical(raw, al)
            Lr, Er, Ir = zl.build_zones(al, inter, [c], PARAMS)
            assert zl.validate_zones(al, Lr, Er, Ir, {"c": c}, PARAMS) == [], t
        print("invariante pe 20 intrări aleatorii ok")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("ok")


if __name__ == "__main__":
    main()
