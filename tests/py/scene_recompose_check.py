"""Verificări pentru scripts/scene/recompose_candidates.py pe imagini sintetice (Pillow + numpy, fără modele; foreground = stub, pymatting nu e necesar).

Rulare: python -I tests/py/scene_recompose_check.py <ROOT>
POZITIV: un candidat sintetic (raw_768.png cu fundal închis și alb lângă produs, ca reconstrucția packshot-ului) se recompune într-un director NOU:
master.png + raw copiat + fișă nouă (etapa T5a-recompus-v3, hash-uri pe fișierele salvate și recitite, trimitere la sha256 al fișei vechi), registru valid,
directorul vechi neatins, identitate 0 pe L complet, halo trece (și pică la comportamentul vechi band_fill=False).
NEGATIV: suprascriere, out-base existent/relativ/cu '..'/în cand-base, raw alterat, fișă pentru alt produs, nume neașteptat.
"""
# ruff: noqa: S101, E501, E741
import hashlib
import json
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(ROOT / "scripts" / "scene"))
import checks_lib as ck  # noqa: E402
import fisa_lib as fl  # noqa: E402
import pilot_lib as pl  # noqa: E402
import recompose_candidates as rc  # noqa: E402
import zones_lib as zl  # noqa: E402

NAME = "S476YE-hala_depozit-s100"
THR = {"halo_delta": 12.0, "spill_max_frac": 0.02, "fluo_max_frac": 0.005}
H = "a" * 64


def neg_raises(name, exc, needle, fn):
    try:
        fn()
    except exc as e:
        assert needle in str(e), f"NEGATIV {name}: mesaj fără {needle!r}: {e}"
        print(f"NEG {name}: refuzat | {e}")
        return
    raise AssertionError(f"NEGATIV {name}: nu a ridicat {exc.__name__}")


def make_prod():
    w, h = pl.CANVAS
    hard = Image.new("L", (w, h), 0)
    ImageDraw.Draw(hard).rectangle([350, 300, 749, 799], fill=255)
    alpha = np.asarray(hard.filter(ImageFilter.GaussianBlur(0.7)), dtype=np.uint8).copy()
    fg = np.zeros((h, w, 3), dtype=np.uint8)
    fg[:] = (30, 50, 110)
    fg[500:540] = (255, 110, 0)
    a = alpha[..., None].astype(np.float64) / 255
    src = np.rint(fg * a + 255 * (1 - a)).astype(np.uint8)
    interior = np.zeros((h, w), dtype=bool)
    interior[320:340, 500:600] = True
    crit = np.zeros((h, w), dtype=bool)
    crit[600:660, 400:520] = True
    crit, _ = zl.effective_critical(crit, alpha)
    L, E, I = zl.build_zones(alpha, interior, [crit], zl.DEFAULT_PARAMS)
    assert zl.validate_zones(alpha, L, E, I, {"logo": crit}, zl.DEFAULT_PARAMS) == []
    z = {"alpha": alpha, "L": L, "E": E, "I": I, "critical": {"logo": crit}}
    placed = pl.place(src, z)
    return {"product": "S476YE", "src": src, "z": z, "placed": placed, "sha_src": "b" * 64, "F": fg}, fg


def main():  # noqa: C901
    tmp = Path(tempfile.mkdtemp(prefix="scene-recompose-"))
    try:
        prod, fg = make_prod()
        placed = prod["placed"]
        # raw_768: decor închis, dar ALB în E și 2 px în jur (reconstrucția packshot-ului), ca la VAE
        bg = np.full((pl.CANVAS[1], pl.CANVAS[0], 3), (28, 28, 34), dtype=np.uint8)
        bg[zl.dilate(placed["L"] | placed["E"], 2) & ~placed["L"]] = 255
        raw_im = Image.fromarray(bg).resize((768, 768), Image.LANCZOS)

        cand_base = tmp / "cand"
        old_dir = cand_base / NAME
        old_dir.mkdir(parents=True)
        raw_im.save(old_dir / "raw_768.png")
        raw_sha = hashlib.sha256((old_dir / "raw_768.png").read_bytes()).hexdigest()
        old_checks = [{"name": "halo", "value": 211.5, "threshold": 99.0, "passed": False, "detail": "vechi"}]
        old = fl.build_fisa(candidat=NAME, produs="S476YE", sha256_sursa=H, sha256_masca=H, sha256_L=H, sha256_E=H, sha256_I=H, sha256_cod=H, sha256_master=H,
                            sha256_raw=raw_sha, model={"id": "m/x", "revizie": "a" * 40, "sha256": H}, seed=100, prompt="un prompt", context="hala_depozit",
                            scara=1.0, deplasare={"dx": 0, "dy": 0}, flip=False, rotate_deg=0, canvas={"w": 1100, "h": 1100}, verificari=old_checks,
                            timp_generare_s=12.5, etapa="T5a-fara-verificari-model")
        (old_dir / "fisa.json").write_text(json.dumps(old, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        old_snapshot = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in old_dir.iterdir()}

        # ---- pozitiv
        out_base = rc.new_out_base(tmp / "cand-v3", cand_base)
        reg = out_base / "registru.jsonl"
        code_sha = fl.sha256_code([ROOT / "scripts/scene/recompose_candidates.py"])
        row = rc.recompose_one(old_dir, out_base, prod, THR, code_sha, reg)
        nd = out_base / NAME
        assert sorted(p.name for p in nd.iterdir()) == ["fisa.json", "master.png", "raw_768.png"], list(nd.iterdir())
        f = json.loads((nd / "fisa.json").read_text(encoding="utf-8"))
        assert f["etapa"] == "T5a-recompus-v3" and f["candidat"] == NAME and f["seed"] == 100 and f["prompt"] == "un prompt" and f["model"] == old["model"]
        assert f["fisa_t5a_sha256"] == hashlib.sha256((old_dir / "fisa.json").read_bytes()).hexdigest()
        assert f["sha256_master"] == hashlib.sha256((nd / "master.png").read_bytes()).hexdigest()
        assert f["sha256_raw"] == hashlib.sha256((nd / "raw_768.png").read_bytes()).hexdigest() == raw_sha
        assert fl.verify_registry(reg) == [] and fl.registry_sha_for(reg, NAME) == fl.sha256_bytes((nd / "fisa.json").read_bytes())
        names = {c["name"]: c for c in f["verificari"]}
        assert names["identity_master"]["value"] == 0 and names["identity_master"]["passed"] and names["halo"]["passed"], names["halo"]
        assert names["verificari_model"]["passed"] is False and f["rezultat_global"] is False and f["generare"]["band_fill"] is True
        assert {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in old_dir.iterdir()} == old_snapshot
        print(f"POS recompunere: {sorted(p.name for p in nd.iterdir())} etapa={f['etapa']} T3a={row['t3a']} halo {row['halo_vechi']} -> {row['halo_nou']}")
        print("POS recompunere: hash-uri pe fișierele salvate, trimitere la fișa veche, registru valid, directorul vechi neatins")
        master = pl.load_source_rgb(nd / "master.png")
        assert ck.check_identity_master(master, placed["ref"], placed["L"])["value"] == 0
        # același raw cu comportamentul VECHI (fără umplere): halo pică; cu cel NOU: trece
        with Image.open(nd / "raw_768.png") as im:
            old_style = rc.recompose_master(placed, im, fg, band_fill=False)
        h_old, h_new = ck.check_halo(old_style, placed, THR["halo_delta"]), ck.check_halo(master, placed, THR["halo_delta"])
        assert h_old["passed"] is False and h_new["passed"] is True, (h_old, h_new)
        print(f"NEG band_fill=False pe același raw: halo pică | value={h_old['value']} threshold={h_old['threshold']}")
        print(f"POS band_fill=True pe același raw: halo trece | value={h_new['value']} threshold={h_new['threshold']}")
        # determinism: a doua recompunere în alt out-base dă același master
        ob2 = rc.new_out_base(tmp / "cand-v3b", cand_base)
        rc.recompose_one(old_dir, ob2, prod, THR, code_sha, ob2 / "registru.jsonl")
        assert (ob2 / NAME / "master.png").read_bytes() == (nd / "master.png").read_bytes()
        print("POS determinism: două recompuneri dau același master.png (octeți identici)")

        # ---- negative
        neg_raises("candidat deja recompus (fără suprascriere)", FileExistsError, "File exists", lambda: rc.recompose_one(old_dir, out_base, prod, THR, code_sha, reg))
        assert (nd / "master.png").read_bytes() == (ob2 / NAME / "master.png").read_bytes()
        neg_raises("out-base există", rc.RecomposeError, "out-base există deja", lambda: rc.new_out_base(out_base, cand_base))
        neg_raises("out-base cu ..", rc.RecomposeError, "fără '..'", lambda: rc.new_out_base(str(tmp / "x" / ".." / "y"), cand_base))
        neg_raises("out-base relativ", rc.RecomposeError, "cale absolută", lambda: rc.new_out_base("rel/out", cand_base))
        neg_raises("out-base în cand-base", rc.RecomposeError, "nu poate sta în cand-base", lambda: rc.new_out_base(cand_base / "nou", cand_base))
        assert not (cand_base / "nou").exists()
        neg_raises("nume de candidat neașteptat", rc.RecomposeError, "nume de candidat neașteptat", lambda: rc.parse_name("S476YE-hala-depozit"))
        assert rc.parse_name(NAME) == ("S476YE", "hala_depozit", 100)
        # raw alterat față de fișa veche
        bad = cand_base / "S476YE-hala_depozit-s101"
        shutil.copytree(old_dir, bad)
        fb = json.loads((bad / "fisa.json").read_text(encoding="utf-8"))
        fb.update(candidat=bad.name, seed=101)
        (bad / "fisa.json").write_text(json.dumps(fb), encoding="utf-8")
        with open(bad / "raw_768.png", "ab") as fh:
            fh.write(b"\0")
        ob3 = rc.new_out_base(tmp / "cand-v3c", cand_base)
        neg_raises("raw alterat față de sha256_raw din fișa veche", rc.RecomposeError, "nu corespunde sha256_raw", lambda: rc.recompose_one(bad, ob3, prod, THR, code_sha, ob3 / "registru.jsonl"))
        assert not (ob3 / bad.name).exists(), "nimic scris când citirea pică"
        # fișă pentru alt produs decât numele
        other = cand_base / "BZ739OR-hala_depozit-s100"
        shutil.copytree(old_dir, other)
        neg_raises("fișă pentru alt produs decât numele", rc.RecomposeError, "nu corespunde numelui", lambda: rc.read_old(other))
        # produs pregătit ≠ produs candidat
        fo = json.loads((other / "fisa.json").read_text(encoding="utf-8"))
        fo.update(candidat=other.name, produs="BZ739OR")
        (other / "fisa.json").write_text(json.dumps(fo), encoding="utf-8")
        neg_raises("produsul pregătit ≠ produsul candidatului", rc.RecomposeError, "pregătirea produsului", lambda: rc.recompose_one(other, ob3, prod, THR, code_sha, ob3 / "registru.jsonl"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("ok")


main()
