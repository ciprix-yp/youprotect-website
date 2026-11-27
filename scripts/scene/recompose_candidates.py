"""Recompunerea candidaților T5a din ieșirile EXISTENTE (fără regenerare, fără modele): `raw_768.png` + zonele produsului, cu umplerea benzii E
din decor (compose_lib.compose, band_fill=True) și identitate pe L complet.

Pentru fiecare candidat din `--cand-base` (directorul vechi, citit doar): citește `raw_768.png` și fișa T5a `fisa.json` (doar produs, context, seed,
prompt, model, timp, scală, deplasare), reface produsul așezat din sursă + zone (zonele se verifică cu verify_zones și hash-urile din zone.json),
recompune și scrie într-un director NOU `<out-base>/<PRODUS>-<context>-s<seed>/`: `master.png`, copia `raw_768.png`, `fisa.json` nouă
(`etapa` = „T5a-recompus-v3”, `fisa_t5a_sha256` = sha256 al fișei vechi; `sha256_master`/`sha256_raw` calculate pe fișierele SALVATE și recitite;
verificările T3a rulează pe master-ul RECITIT) și linie în `<out-base>/registru.jsonl`. `--out-base` trebuie să nu existe; nimic existent nu se
suprascrie; căile cu `..` sunt refuzate. Nu se încarcă niciun model (doar Pillow + numpy + pymatting pentru foreground).

Rulare (vezi scripts/scene/README.md):
  python -I recompose_candidates.py --cand-base <.catalog-work/scene/cand> --out-base <.catalog-work/scene/cand-v3> \\
     --images-dir <imagini> --scene-dir <scene> --calibrare <calibrare.json> [--only S476YE-hala_depozit-s100 ...]
"""
# ruff: noqa: E501
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # -I nu pune directorul scriptului pe sys.path
import checks_lib as ck  # noqa: E402
import compose_lib as cl  # noqa: E402
import fisa_lib as fl  # noqa: E402
import integrity_lib as ilib  # noqa: E402
import pilot_lib as pl  # noqa: E402
import verify_zones as vz  # noqa: E402

CODE_FILES = ["recompose_candidates.py", "pilot_lib.py", "compose_lib.py", "checks_lib.py", "fisa_lib.py", "zones_lib.py", "integrity_lib.py", "verify_zones.py"]
ETAPA = "T5a-recompus-v3"
NOTA = ("Recompus din raw_768.png existent (fără regenerare): banda E umplută din decor, identitate pe L complet. Lipsesc verificările de model "
        "(T5b/T5c); candidatul NU poate fi acceptat înainte de ele.")
NAME_RE = re.compile(r"^([A-Z0-9]+)-([a-z0-9_]+)-s([0-9]+)$")
GEN_RES_NOTE = "raw_768.png (ieșirea FLUX.2 klein) adus la 1100 cu LANCZOS, ca la generare"


class RecomposeError(ValueError):
    pass


def parse_name(name: str) -> tuple[str, str, int]:
    m = NAME_RE.fullmatch(name)
    if not m:
        raise RecomposeError(f"nume de candidat neașteptat: {name!r}")
    return m.group(1), m.group(2), int(m.group(3))


def clean_path(p: str | Path, what: str) -> Path:
    """Cale absolută fără `..` (altfel RecomposeError)."""
    q = Path(p)
    if not q.is_absolute() or ".." in q.parts:
        raise RecomposeError(f"{what}: cale absolută fără '..' necesară, primit {str(p)!r}")
    return q


def new_out_base(out_base: str | Path, cand_base: Path) -> Path:
    """`out_base` trebuie să NU existe, să nu fie `cand_base` și să nu stea sub el; se creează (părintele trebuie să existe)."""
    ob = clean_path(out_base, "out-base")
    cb = cand_base.resolve()
    if ob.exists() or ob.is_symlink():
        raise RecomposeError(f"out-base există deja, nu se suprascrie: {ob}")
    if not ob.parent.is_dir():
        raise RecomposeError(f"părintele lui out-base nu există: {ob.parent}")
    if ob.parent.resolve() == cb or cb in ob.parent.resolve().parents:
        raise RecomposeError("out-base nu poate sta în cand-base (directorul vechi rămâne neatins)")
    ob.mkdir()
    return ob


def recompose_master(placed: dict, raw_rgb: Image.Image, foreground: np.ndarray, band_fill: bool = True) -> np.ndarray:
    """Master-ul din memorie: fundalul = raw adus la canvas cu LANCZOS (ca la generare), apoi cl.compose."""
    bg = np.asarray(raw_rgb.convert("RGB").resize(pl.CANVAS, Image.LANCZOS), dtype=np.uint8).copy()
    return cl.compose(placed, bg, foreground, band_fill=band_fill)


def read_old(old_dir: Path) -> tuple[dict, bytes, bytes]:
    """(fișa T5a veche, octeții fișei, octeții raw). Verifică numele, identitatea produs/context/seed și hash-ul raw din fișă (dacă există)."""
    name = old_dir.name
    product, context, seed = parse_name(name)
    try:
        fbytes = (old_dir / "fisa.json").read_bytes()
        raw_bytes = (old_dir / "raw_768.png").read_bytes()
        old = json.loads(fbytes)
    except (OSError, ValueError) as e:
        raise RecomposeError(f"{name}: fișă/raw ilizibile: {e}") from e
    if (old.get("candidat"), old.get("produs"), old.get("context"), old.get("seed")) != (name, product, context, seed):
        raise RecomposeError(f"{name}: fișa veche (candidat/produs/context/seed) nu corespunde numelui")
    want = old.get("sha256_raw")
    if want is not None and want != hashlib.sha256(raw_bytes).hexdigest():
        raise RecomposeError(f"{name}: raw_768.png nu corespunde sha256_raw din fișa veche")
    for k in ("prompt", "model", "scara", "deplasare", "timp_generare_s"):
        if k not in old:
            raise RecomposeError(f"{name}: fișa veche fără câmpul {k}")
    return old, fbytes, raw_bytes


def prepare_product(product: str, source: Path, zones_dir: Path, fg_fn: Callable[[dict], np.ndarray] | None = None, verify: bool = True) -> dict:
    """Sursa + zonele verificate (verify_zones + legătura produs<->zone.json<->zone_specs), produsul așezat o dată (scară 1.0) și foreground-ul."""
    if verify:
        errs, summary = vz.verify(zones_dir, source)
        if errs:
            raise RecomposeError(f"{product}: verificare zone picată: " + "; ".join(errs))
        zj = json.loads((zones_dir / "zone.json").read_text(encoding="utf-8"))
        errs = ilib.check_product_binding(product, zj, ilib.load_specs(), source)
        if summary.get("product") != product:
            errs.append(f"verify_zones raportează produsul {summary.get('product')!r}")
        if errs:
            raise RecomposeError(f"{product}: produs/zone nepotrivite: " + "; ".join(errs))
    src = pl.load_source_rgb(source)
    z = pl.load_zones(zones_dir)
    placed = pl.place(src, z)
    return {"product": product, "src": src, "z": z, "placed": placed, "sha_src": hashlib.sha256(source.read_bytes()).hexdigest(),
            "F": (fg_fn or pl.estimate_foreground)(placed)}


def jsonable(x):
    return json.loads(json.dumps(x, default=lambda o: o.item() if hasattr(o, "item") else str(o)))


def recompose_one(old_dir: Path, out_base: Path, prod: dict, thr: dict, code_sha: str, registry: Path) -> dict:  # noqa: C901
    """Un candidat: scrie `<out_base>/<nume>/` NOU (master.png, raw_768.png, fisa.json) și o linie în registru. Întoarce rezumatul."""
    t0 = time.perf_counter()
    name = old_dir.name
    old, fbytes, raw_bytes = read_old(old_dir)
    if prod["product"] != old["produs"]:
        raise RecomposeError(f"{name}: pregătirea produsului ({prod['product']}) ≠ produsul candidatului ({old['produs']})")
    placed = prod["placed"]
    p = placed["params"]
    if old["scara"] != p["scale"] or old["deplasare"] != {"dx": p["dx"], "dy": p["dy"]}:
        raise RecomposeError(f"{name}: scara/deplasarea din fișa veche ({old['scara']}, {old['deplasare']}) ≠ produsul așezat ({p['scale']}, {p['dx']},{p['dy']})")
    out_dir = out_base / name
    out_dir.mkdir(exist_ok=False)  # director NOU: un candidat deja recompus nu se suprascrie
    with open(out_dir / "raw_768.png", "xb") as fh:  # copia exactă a raw-ului vechi
        fh.write(raw_bytes)
    with Image.open(out_dir / "raw_768.png") as im:
        master_mem = recompose_master(placed, im, prod["F"])
    Image.fromarray(master_mem, "RGB").save(out_dir / "master.png")
    master = pl.load_source_rgb(out_dir / "master.png")  # verificările rulează pe fișierul RECITIT
    if not np.array_equal(master, master_mem):
        raise RecomposeError(f"{name}: master.png recitit diferă de array-ul din memorie (salvare coruptă)")
    sha_master, sha_raw = ilib.file_sha(out_dir / "master.png"), ilib.file_sha(out_dir / "raw_768.png")
    if sha_raw != hashlib.sha256(raw_bytes).hexdigest():
        raise RecomposeError(f"{name}: copia raw_768.png diferă de original")
    checks = pl.run_checks(master, placed, prod["src"], prod["z"], thr)
    t3a_ok = fl.compute_global(checks)
    checks.append(ck.result("verificari_model", None, "OCR + fețe + ne-uman (T5b)", False,
                            "nerulate în T5a: OCR logo/decor/I, detector de fețe, SigLIP2/VLM"))
    mask = cl.inpaint_mask(placed["L"], placed["E"])
    fisa = fl.build_fisa(
        candidat=name, produs=old["produs"], sha256_sursa=prod["sha_src"], sha256_masca=hashlib.sha256(mask.tobytes()).hexdigest(),
        sha256_L=ilib.sha_arr(placed["L"]), sha256_E=ilib.sha_arr(placed["E"]), sha256_I=ilib.sha_arr(placed["I"]), sha256_cod=code_sha,
        sha256_master=sha_master, sha256_raw=sha_raw, model=old["model"], seed=old["seed"], prompt=old["prompt"], context=old["context"],
        scara=old["scara"], deplasare=old["deplasare"], flip=False, rotate_deg=0, canvas={"w": pl.CANVAS[0], "h": pl.CANVAS[1]},
        verificari=jsonable(checks), timp_generare_s=old["timp_generare_s"], etapa=ETAPA, verificari_modele=[], nota=NOTA,
        rezultat_t3a=t3a_ok, variant=old.get("variant"), fisa_t5a_sha256=hashlib.sha256(fbytes).hexdigest(),
        generare={"recompus_din": {"fisa_t5a_sha256": hashlib.sha256(fbytes).hexdigest(), "etapa_veche": old.get("etapa"),
                                   "sha256_raw_in_fisa_veche": old.get("sha256_raw")},
                  "fundal_upscale": GEN_RES_NOTE, "foreground": "pymatting.estimate_foreground_ml", "band_fill": True,
                  "band_ring_px": cl.BAND_RING_PX, "identitate": "pe L complet (nu erodat)", "praguri": thr,
                  "timp_recompunere_s": round(time.perf_counter() - t0, 2)},
    )
    fl.write_fisa(out_dir, fisa, registry, out_base)
    failed = [c["name"] for c in checks if not c["passed"] and c["name"] != "verificari_model"]
    halo_old = next((c.get("value") for c in old.get("verificari", []) if c.get("name") == "halo"), None)
    halo_new = next((c["value"] for c in checks if c["name"] == "halo"), None)
    return {"candidat": name, "t3a": t3a_ok, "picate": failed, "halo_vechi": halo_old, "halo_nou": halo_new}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cand-base", required=True, type=Path, help="directorul VECHI cu candidați (se citește doar)")
    ap.add_argument("--out-base", required=True, type=Path, help="director NOU (nu există) pentru candidații recompuși")
    ap.add_argument("--images-dir", required=True, type=Path, help="<images-dir>/<PRODUS>.jpg = sursa")
    ap.add_argument("--scene-dir", required=True, type=Path, help="<scene-dir>/<PRODUS>/zones = zonele")
    ap.add_argument("--calibrare", required=True, type=Path)
    ap.add_argument("--only", nargs="*", default=None, help="doar aceste nume de candidat")
    ap.add_argument("--registry", type=Path, default=None, help="implicit: <out-base>/registru.jsonl (sub out-base)")
    a = ap.parse_args()
    try:
        cand_base = clean_path(a.cand_base, "cand-base")
        if not cand_base.is_dir():
            raise RecomposeError(f"cand-base inexistent: {cand_base}")
        images_dir, scene_dir = clean_path(a.images_dir, "images-dir"), clean_path(a.scene_dir, "scene-dir")
        calib = clean_path(a.calibrare, "calibrare")
        thr = json.loads(calib.read_text(encoding="utf-8"))["praguri"]
        names = sorted(d.name for d in cand_base.iterdir() if d.is_dir() and NAME_RE.fullmatch(d.name))
        if a.only is not None:
            bad = [n for n in a.only if n not in names]
            if bad:
                raise RecomposeError(f"candidați inexistenți în cand-base: {bad}")
            names = sorted(set(a.only))
        if not names:
            raise RecomposeError("niciun candidat de recompus")
        out_base = new_out_base(a.out_base, cand_base)
        registry = clean_path(a.registry, "registry") if a.registry else out_base / "registru.jsonl"
        code_sha = fl.sha256_code([HERE / f for f in CODE_FILES] + [calib])
        prods: dict[str, dict] = {}
        rows = []
        for n in names:
            product = parse_name(n)[0]
            if product not in prods:
                t0 = time.perf_counter()
                prods[product] = prepare_product(product, images_dir / f"{product}.jpg", scene_dir / product / "zones")
                print(f"{product}: zone OK, foreground în {time.perf_counter() - t0:.1f}s", flush=True)
            r = recompose_one(cand_base / n, out_base, prods[product], thr, code_sha, registry)
            rows.append(r)
            print(f"{n}: T3a={'OK' if r['t3a'] else 'PICAT ' + ','.join(r['picate'])} halo {r['halo_vechi']} -> {r['halo_nou']}", flush=True)
        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        (out_base / f"_recompunere-{stamp}.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"gata: {len(rows)} candidați, T3a OK {sum(r['t3a'] for r in rows)}")
    except (RecomposeError, ilib.IntegrityError, fl.FisaError, OSError, ValueError, KeyError) as e:
        raise SystemExit(f"RECOMPUNERE OPRITĂ: {e}") from e
    return 0


if __name__ == "__main__":
    sys.exit(main())
