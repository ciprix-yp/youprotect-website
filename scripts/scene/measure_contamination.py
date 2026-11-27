"""Măsoară cât de lat se întinde albul packshot-ului din decor în jurul lui L ∪ E, pe `raw_768.png` al candidaților (Fix-4, review N1).

Pentru fiecare candidat din `<scene-dir>/<cand-name>/*/raw_768.png`: raw-ul e adus la canvas (LANCZOS, ca la compunere); pe benzi de 2 px la 2-32 px
în afara lui L ∪ E (fără I) se măsoară fracția aproape-albă (min(R,G,B) >= 235) și luminanța p90, față de referința 32-48 px. O bandă e „contaminată”
dacă fracția ei aproape-albă depășește referința cu mai mult de 0.10; extinderea = marginea exterioară a ultimei benzi contaminate contigue începând
de la prima (0 dacă prima bandă, 2-4 px, nu e contaminată). Se mai calculează statisticile verificării `check_band_contamination` (inel 4-24 vs 32-48).
Zonele L/E/I depind doar de produs (scală 1.0), deci inelele se calculează o dată pe produs. Scrie un JSON NOU (nu suprascrie).

Rulare: python -I measure_contamination.py --scene-dir <scene> --cand-name cand_v3 --out <.../raport_v4/contaminare.json>
"""
# ruff: noqa: E501
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import checks_lib as ck  # noqa: E402
import pilot_lib as pl  # noqa: E402

CAND_RE = re.compile(r"^[a-z0-9_]+$")
BANDS = [(a, a + 2) for a in range(2, 32, 2)]
BAND_WHITE_MARGIN = 0.10


def product_rings(scene: Path, product: str) -> dict:
    z = pl.load_zones(scene / product / "zones")
    placed = pl.place(pl.load_source_rgb(scene.parent / "images/portwest" / f"{product}.jpg"), z)
    le = placed["L"] | placed["E"]
    notI = ~placed["I"]
    radii = sorted({0, *[b for ab in BANDS for b in ab], *ck.CONTAM_NEAR, *ck.CONTAM_REF})
    dil = {r: ck.disc_dilate(le, r) for r in radii}
    return {"bands": [dil[b] & ~dil[a] & notI for a, b in BANDS], "ref": dil[ck.CONTAM_REF[1]] & ~dil[ck.CONTAM_REF[0]] & notI,
            "near": dil[ck.CONTAM_NEAR[1]] & ~dil[ck.CONTAM_NEAR[0]] & notI, "placed": placed}


def measure(raw_path: Path, rings: dict) -> dict:
    with Image.open(raw_path) as im:
        rgb = np.asarray(im.convert("RGB").resize(pl.CANVAS, Image.LANCZOS), dtype=np.uint8)
    ref = ck.ring_stats(rgb, rings["ref"])
    near = ck.ring_stats(rgb, rings["near"])
    bands = []
    extent, run = 0, True
    for (a, b), m in zip(BANDS, rings["bands"]):
        s = ck.ring_stats(rgb, m)
        hot = s is not None and ref is not None and s["white_frac"] > ref["white_frac"] + BAND_WHITE_MARGIN
        if run and hot:
            extent = b
        else:
            run = False
        bands.append({"px": [a, b], "n": 0 if s is None else s["n"], "white_frac": None if s is None else round(s["white_frac"], 4),
                      "p90": None if s is None else round(s["p90"], 2), "contaminata": bool(hot)})
    chk = ck.check_band_contamination(rgb, rings["placed"])
    return {"extindere_px": extent, "ref": {k: round(v, 4) for k, v in ref.items()} if ref else None,
            "near": {k: round(v, 4) for k, v in near.items()} if near else None, "benzi": bands, "check": chk["value"], "check_ok_la_praguri_curente": chk["passed"]}


def pct(vals: list[float], q: float) -> float:
    return round(float(np.percentile(vals, q)), 4)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scene-dir", required=True, type=Path)
    ap.add_argument("--cand-name", default="cand_v3")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--threshold-px", type=int, default=3, help="extinderea de la care contaminarea se numără ca reală")
    a = ap.parse_args()
    if not CAND_RE.fullmatch(a.cand_name):
        raise SystemExit(f"--cand-name invalid: {a.cand_name!r}")
    if a.out.exists():
        raise SystemExit(f"{a.out} există: nu se suprascrie")
    scene = a.scene_dir.resolve()
    rows, rings = {}, {}
    for d in sorted((scene / a.cand_name).iterdir()):
        if not (d.is_dir() and (d / "raw_768.png").is_file()):
            continue
        prod = d.name.split("-", 1)[0]
        if prod not in rings:
            rings[prod] = product_rings(scene, prod)
        rows[d.name] = {"produs": prod, **measure(d / "raw_768.png", rings[prod])}
        print(d.name, rows[d.name]["extindere_px"], rows[d.name]["check"]["delta_p90"], rows[d.name]["check"]["delta_alb"], flush=True)
    summary = {}
    for prod in sorted(rings):
        r = [v for v in rows.values() if v["produs"] == prod]
        ext = [v["extindere_px"] for v in r]
        dp, dw = [v["check"]["delta_p90"] for v in r], [v["check"]["delta_alb"] for v in r]
        summary[prod] = {"n": len(r), "extindere_px": {"mediana": statistics.median(ext), "p95": pct(ext, 95), "max": max(ext), f"n_peste_{a.threshold_px}px": sum(e > a.threshold_px for e in ext)},
                         "delta_p90": {"mediana": pct(dp, 50), "p95": pct(dp, 95), "max": max(dp)}, "delta_alb": {"mediana": pct(dw, 50), "p95": pct(dw, 95), "max": max(dw)}}
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps({"cand_name": a.cand_name, "n": len(rows), "definitie": {"benzi_px": BANDS, "alb": f"min(R,G,B) >= {ck.CONTAM_WHITE_MIN}", "contaminata": f"fracție albă > referință + {BAND_WHITE_MARGIN}",
                                 "referinta_px": list(ck.CONTAM_REF), "inel_check_px": list(ck.CONTAM_NEAR)}, "pe_produs": summary, "pe_candidat": rows}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
