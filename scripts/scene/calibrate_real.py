"""Calibrarea pragurilor T3a pe produsele REALE (T5a): compuneri corecte pe fundaluri ne-AI, defecte artificiale, praguri alese.

Pentru fiecare produs: place_product (scale 1.0), foreground cu pymatting, compose pe 5 fundaluri (gradient deschis, gradient închis,
gri mediu, albastru închis, maro închis), apoi se măsoară halo (excesul peste max(decor, produs), fără delta), scurgere de culoare
și fluo. Defecte artificiale: inel alb în jurul siluetei (halo), pete cu culoarea dominantă a produsului în inelul 4-40 px
(scurgere), pete galben fluo în decor (fluo). Pragul ales = valoarea implicită din checks_lib dacă separă corect compunerile
bune de cele cu defect, altfel mijlocul intervalului dintre cele două. Export: calibrate_export (JPEG q90 și q85) pe packshot-ul singur.

Rulare: python -I calibrate_real.py --images-dir <dir> --scene-dir <dir> --out <calibrare.json nou>
"""
# ruff: noqa: E501
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import checks_lib as ck  # noqa: E402
import compose_lib as cl  # noqa: E402
import integrity_lib as ilib  # noqa: E402
import pilot_lib as pl  # noqa: E402
import zones_lib as zl  # noqa: E402

PRODUCTS = ("S476YE", "BZ739OR", "FD25BK")
BACKGROUNDS = {
    "gradient_deschis": lambda: pl.gradient_bg((246, 246, 249), (214, 217, 224)),
    "gradient_inchis": lambda: pl.gradient_bg((44, 46, 52), (12, 12, 16)),
    "gri_mediu": lambda: pl.flat_bg((128, 128, 128)),
    "albastru_inchis": lambda: pl.flat_bg((18, 38, 84)),
    "maro_inchis": lambda: pl.flat_bg((58, 38, 24)),
}
VISIBLE_HALO_BG = ("gradient_inchis", "gri_mediu", "albastru_inchis", "maro_inchis")  # un inel alb pe fond deschis nu se vede


def halo_excess(out: np.ndarray, placed: dict) -> float:
    r = ck.check_halo(out, placed, delta=0.0)
    return float(r["value"] - r["threshold"])


def spill_frac(out: np.ndarray, placed: dict) -> float:
    return float(ck.check_color_spill(out, placed, max_frac=1.0)["value"])


def fluo_frac(out: np.ndarray, placed: dict) -> float:
    return float(ck.check_decor_fluo(out, placed, max_frac=1.0)["value"])


def add_halo(out: np.ndarray, placed: dict) -> np.ndarray:
    P = zl.silhouette(placed["alpha"])
    res = out.copy()
    res[zl.dilate(P, 3) & ~P] = (250, 250, 250)
    return res


def dominant_palette_rgb(out: np.ndarray, placed: dict) -> tuple[int, int, int] | None:
    Lm = ck.eroded_L(placed["L"])
    cell, chroma = ck._cells(out[Lm])  # noqa: SLF001
    ch = cell[chroma]
    if ch.size == 0:
        return None
    top = int(np.bincount(ch, minlength=48).argmax())
    px = out[Lm][chroma & (cell == top)]
    return tuple(int(v) for v in np.median(px, axis=0))


def add_spill(out: np.ndarray, placed: dict, rgb: tuple[int, int, int]) -> np.ndarray:
    P = zl.silhouette(placed["alpha"])
    ring = zl.dilate(P, 40) & ~zl.dilate(P, 3)
    yy, xx = np.mgrid[0:out.shape[0], 0:out.shape[1]]
    blocks = ((xx // 20 + yy // 20) % 4) == 0
    res = out.copy()
    res[ring & blocks] = rgb
    return res


def add_fluo(out: np.ndarray, placed: dict) -> np.ndarray:
    decor = ~(placed["L"] | placed["E"])
    yy, xx = np.mgrid[0:out.shape[0], 0:out.shape[1]]
    res = out.copy()
    res[decor & (((xx // 25 + yy // 25) % 12) == 0)] = (255, 215, 0)
    return res


def jpeg_encoder(q: int):
    def enc(rgb: np.ndarray) -> np.ndarray:
        buf = io.BytesIO()
        Image.fromarray(rgb).save(buf, format="JPEG", quality=q)
        return np.asarray(Image.open(io.BytesIO(buf.getvalue())).convert("RGB"), dtype=np.uint8).copy()
    return enc


def choose(default: float, good_max: float, bad_min: float) -> tuple[float, str]:
    if good_max < default < bad_min:
        return default, "valoarea implicită separă (bune < prag < defecte)"
    if good_max < bad_min:
        return round((good_max + bad_min) / 2, 5), "mijlocul intervalului bune/defecte (implicitul nu separa)"
    return default, "NU SEPARĂ: bune >= defecte, pragul implicit rămâne, de revăzut"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--images-dir", required=True, type=Path)
    ap.add_argument("--scene-dir", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    if a.out.exists():
        raise SystemExit(f"{a.out} există deja; nu se suprascrie")
    rec: dict = {"schema": 1, "data": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "produse": {}}
    good = {"halo": [], "spill": [], "fluo": []}
    bad = {"halo": [], "spill": [], "fluo": []}
    for prod in PRODUCTS:
        src = pl.load_source_rgb(a.images_dir / f"{prod}.jpg")
        z = pl.load_zones(a.scene_dir / prod / "zones")
        placed = pl.place(src, z)
        F = pl.estimate_foreground(placed)
        pr: dict = {"fundaluri": {}, "export": {}}
        for name, mk in BACKGROUNDS.items():
            out = cl.compose(placed, mk(), F)
            row = {
                "identity_master_max": ck.check_identity_master(out, placed["ref"], placed["L"])["value"],
                "halo_exces": round(halo_excess(out, placed), 3),
                "spill_frac": round(spill_frac(out, placed), 5),
                "fluo_frac": round(fluo_frac(out, placed), 5),
            }
            good["halo"].append(row["halo_exces"])
            good["spill"].append(row["spill_frac"])
            good["fluo"].append(row["fluo_frac"])
            bh = halo_excess(add_halo(out, placed), placed)
            row["halo_exces_cu_inel_alb"] = round(bh, 3)
            if name in VISIBLE_HALO_BG:
                bad["halo"].append(round(bh, 3))
            rgb = dominant_palette_rgb(out, placed)
            if rgb is not None:
                row["spill_frac_artificial"] = round(spill_frac(add_spill(out, placed, rgb), placed), 5)
                row["spill_culoare_artificiala"] = list(rgb)
                bad["spill"].append(row["spill_frac_artificial"])
            else:
                row["spill_frac_artificial"] = None
            row["fluo_frac_artificial"] = round(fluo_frac(add_fluo(out, placed), placed), 5)
            bad["fluo"].append(row["fluo_frac_artificial"])
            pr["fundaluri"][name] = row
        for q in (90, 85):
            pr["export"][f"jpeg_q{q}"] = ck.calibrate_export(placed["ref"], ck.eroded_L(placed["L"]), jpeg_encoder(q))
        rec["produse"][prod] = pr
        print(f"{prod}: {json.dumps(pr['fundaluri'], ensure_ascii=False)}", flush=True)
    d_halo, why_h = choose(ck.HALO_DELTA, max(good["halo"]), min(bad["halo"]))
    d_spill, why_s = choose(ck.SPILL_MAX_FRAC, max(good["spill"]), min(bad["spill"]))
    d_fluo, why_f = choose(ck.FLUO_MAX_FRAC, max(good["fluo"]), min(bad["fluo"]))
    rec["praguri"] = {"halo_delta": d_halo, "spill_max_frac": d_spill, "fluo_max_frac": d_fluo}
    rec["alegere"] = {
        "halo": {"bune_max": max(good["halo"]), "defecte_min": min(bad["halo"]), "motiv": why_h,
                 "nota": "defectul de halo se evaluează doar pe fundalurile unde inelul alb se vede (nu pe gradientul deschis)"},
        "spill": {"bune_max": max(good["spill"]), "defecte_min": min(bad["spill"]), "motiv": why_s,
                  "nota": "Nicio compunere corectă nu a dat scurgere pe cele 5 fundaluri (inclusiv albastru/maro închis). Riscul de fals "
                          "pozitiv rămâne pentru decoruri cu nuanță apropiată de produs: ajunge în celulele paletei; dacă o "
                          "compunere corectă pică, se revede manual, nu se relaxează pragul."},
        "fluo": {"bune_max": max(good["fluo"]), "defecte_min": min(bad["fluo"]), "motiv": why_f},
    }
    ilib.write_new_text(a.out, json.dumps(rec, indent=2, ensure_ascii=False, sort_keys=True) + "\n")  # mod exclusiv "x": nu suprascrie
    print(json.dumps({"praguri": rec["praguri"], "alegere": rec["alegere"]}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
