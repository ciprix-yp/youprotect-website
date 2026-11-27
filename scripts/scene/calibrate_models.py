"""Calibrarea judecătorului „ne-uman” și a pragurilor OCR (T5b), din semnalele brute colectate cu collect_signals.py.

Controale = pozele reale cu oameni (variantele „original” și „mic”): TREBUIE toate semnalate „om” (fețe OR SigLIP2 OR VLM OR piele pe
imaginea întreagă). „Ne-om” = packshot-urile + candidații marcați vizual buni (--good-ids): rata de respingere falsă. Variantele „jos”
(jumătatea de jos, fără față) sunt doar diagnostic. Parametrii (prag YuNet, subsetul de formulări și marja SigLIP2 per set, prag piele,
prag VLM) se aleg printr-o căutare pe grilă: recall 100% pe controale, apoi minimum de respingeri false pe ne-om.

Candidații etichetați „dom” sau „neclar” la T5c (calibrare_t5c.json, secțiunile `etichete_*`) NU sunt „buni” pentru rata de respingere falsă: `--exclude-labels
calibrare_t5c.json` îi scoate din `--good-ids` (cheile se pot schimba cu `--exclude-keys`). Cifrele „0 respinse fals” sunt pe setul de calibrare, nu pe date noi.

Rulare: python -I calibrate_models.py --controls <json..> --negatives <json..> --candidates <json..> [--good-ids <txt>] [--exclude-labels <calibrare_t5c.json>] --out <calibrare_modele.json>
Semnalele cu aceleași id-uri din mai multe fișiere se îmbină pe etape (ex. fețe+SigLIP dintr-un fișier, qwen din altul).
"""
# ruff: noqa: E501
from __future__ import annotations

import argparse
import datetime as dt
import itertools
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import checks_models_lib as cm  # noqa: E402
import collect_signals as cs  # noqa: E402
import fisa_lib as fl  # noqa: E402
import integrity_lib as ilib  # noqa: E402
import models_runtime as mr  # noqa: E402

# Valori fixe, alese după distribuțiile măsurate (vezi raportul T5b și README): segment, OCR.
SEGMENT = {"skin_frac_max": 0.05, "c_p90_max": 20.0, "frac_chromatic_max": 0.10, "min_px": 500}
OCR = {"logo_min_conf": 0.80, "logo_min_len": 2, "decor_min_len": 3, "decor_min_conf": 0.50}
CODE_FILES = ["checks_models_lib.py", "models_runtime.py", "collect_signals.py", "calibrate_models.py", "checks_lib.py"]


def merge(paths: list[str]) -> tuple[list[dict], dict, dict]:
    items, sig, models = {}, {}, {}
    for p in paths:
        d = json.loads(Path(p).read_text(encoding="utf-8"))
        for it in d["items"]:
            items[it["id"]] = it
        for k, v in d["signals"].items():
            sig.setdefault(k, {}).update(v)
        models.update(d["models"])
    return list(items.values()), sig, models


EXCLUDE_KEYS = ("dom", "neclar")


def labeled_ids(t5c: dict, keys: tuple[str, ...] = EXCLUDE_KEYS) -> set[str]:
    """Id-urile de candidat (`<PRODUS>-<context>-s<seed>`) din listele cu cheile `keys` ale secțiunilor `etichete_<tip>_<PRODUS>` din calibrare_t5c.json."""
    out: set[str] = set()
    for sec, val in t5c.items():
        if not sec.startswith("etichete_") or not isinstance(val, dict):
            continue
        product = sec.rsplit("_", 1)[-1]
        for k in keys:
            lst = val.get(k, [])
            if isinstance(lst, list):
                out |= {f"{product}-{x}" for x in lst if isinstance(x, str)}
    return out


def exclude_labeled(good: set[str], t5c: dict, keys: tuple[str, ...] = EXCLUDE_KEYS) -> tuple[set[str], set[str]]:
    """(buni rămași, scoși): scoate din `good` candidații etichetați cu `keys` (implicit „dom” și „neclar”)."""
    bad = labeled_ids(t5c, keys)
    return good - bad, good & bad


def judge_signals(item: dict, st: dict, ctx: mr.Ctx) -> dict:
    s = {"faces": st["faces"], "skin_whole": mr.skin_whole(item, ctx), "vlm": st.get("qwen")}
    s["siglip"] = st["siglip"]
    return s


def flagged(sg: dict, thr: dict, lset: str) -> tuple[bool, list[str]]:
    s = {"faces": sg["faces"], "siglip": sg["siglip"][lset], "skin_whole": sg["skin_whole"], "vlm": sg["vlm"]}
    return cm.is_flagged_human(s, thr, lset)


def search(controls: list[dict], negs: dict[str, list[dict]], yunet: float, have_vlm: bool) -> dict:
    """negs: set -> listă de semnale ne-om pentru acel set. Întoarce parametrii alese + statistici."""
    skins = [0.02, 0.05, 0.10, 0.20, 0.30, 0.5, 1.01]
    vlms = [0.2, 0.35, 0.5, 0.7, 0.9, 1.01] if have_vlm else [1.01]
    subs = [list(c) for r in (3, 4, 5, 6) for c in itertools.combinations(range(6), r)]
    best = None
    for sk, vp in itertools.product(skins, vlms):
        thr0 = {"yunet_score": yunet, "skin_whole_max": sk, "vlm_p_yes": vp, "siglip_margin": {"haine": 0, "bocanc": 0}}
        total_fp, pick = 0, {}
        for lset in ("haine", "bocanc"):
            # controalele nesemnalate de celelalte semnale trebuie prinse de SigLIP2
            need = []
            for c in controls:
                s = {"faces": c["faces"], "siglip": {"pairs": [{"p_mannequin": 0.5, "p_person": 0.5}]}, "skin_whole": c["skin_whole"], "vlm": c["vlm"]}
                others = [p["name"] for p in cm.decide_non_human(s, {**thr0, "siglip_margin": {lset: -2.0}}, lset, segment_applicable=False)[:-1] if not p["passed"] and p["name"] != "siglip2_mannequin"]
                if not others:
                    need.append(c)
            bestl = None
            for idx in subs:
                dc = np.array([cm.siglip_d(c["siglip"][lset], idx) for c in need]) if need else np.array([1.0])
                dn = np.array([cm.siglip_d(n["siglip"][lset], idx) for n in negs[lset]])
                theta = min(0.5, float(dc.min()) - 0.02)  # respinge d >= theta (marja = −theta; poate fi negativă: cere persoană peste manechin cu |marjă|)
                fp = int((dn >= theta).sum())
                key = (fp, -len(idx), -theta)
                if bestl is None or key < bestl[0]:
                    bestl = (key, idx, theta, fp)
            pick[lset] = bestl
            total_fp += bestl[3]
        # FP pe celelalte semnale (fețe, piele, VLM) la ne-om
        for lset in ("haine", "bocanc"):
            for n in negs[lset]:
                s = {"faces": n["faces"], "siglip": {"pairs": [{"p_mannequin": 1.0, "p_person": 0.0}]}, "skin_whole": n["skin_whole"], "vlm": n["vlm"]}
                if not cm.decide_non_human(s, {**thr0, "siglip_margin": {lset: 0.0}}, lset, segment_applicable=False)[-1]["passed"]:
                    total_fp += 1
        key = (total_fp, sk, vp)  # la FP egal: pragul cel mai sensibil
        if best is None or key < best[0]:
            best = (key, sk, vp, pick, total_fp)
    _, sk, vp, pick, fp = best
    return {"yunet_score": yunet, "skin_whole_max": sk, "vlm_p_yes": vp,
            "siglip_pairs": {k: pick[k][1] for k in pick}, "siglip_margin": {k: round(-pick[k][2], 4) for k in pick}, "fp_total_search": fp}


def main() -> int:  # noqa: C901
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--controls", nargs="+", required=True)
    ap.add_argument("--negatives", nargs="+", required=True)
    ap.add_argument("--candidates", nargs="+", required=True)
    ap.add_argument("--good-ids", type=Path, default=None, help="fișier text: un id de candidat vizual bun pe linie (ne-om pentru rata de respingere falsă)")
    ap.add_argument("--exclude-labels", type=Path, default=None, help="calibrare_t5c.json: candidații etichetați dom/neclar se scot din --good-ids (nu sunt „buni”)")
    ap.add_argument("--exclude-keys", nargs="+", default=list(EXCLUDE_KEYS), help="cheile de etichetă excluse (implicit: dom neclar)")
    ap.add_argument("--yunet", type=float, nargs="+", default=[0.5, 0.6, 0.7, 0.8, 0.9, 0.95], help="grila de praguri YuNet")
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    if a.out.exists():
        raise SystemExit(f"{a.out} există: nu se suprascrie")
    ctx = mr.Ctx()
    c_items, c_sig, c_models = merge(a.controls)
    n_items, n_sig, _ = merge(a.negatives)
    k_items, k_sig, _ = merge(a.candidates)
    good = set(a.good_ids.read_text().split()) if a.good_ids else set()
    if a.exclude_labels:
        good, removed = exclude_labeled(good, json.loads(a.exclude_labels.read_text(encoding="utf-8")), tuple(a.exclude_keys))
        print(f"ne-om „buni”: {len(good)} (scoși {len(removed)} etichetați {'/'.join(a.exclude_keys)}: {sorted(removed)})")
    have_vlm = all("qwen" in v for v in c_sig.values()) and all("qwen" in v for v in k_sig.values())

    ctl = []
    for it in c_items:
        s = judge_signals(it, c_sig[it["id"]], ctx)
        ctl.append({"item": it, **s})
    mand = [c for c in ctl if c["item"]["variant"] in ("original", "mic")]
    diag = [c for c in ctl if c["item"]["variant"] == "jos"]

    negs = {"haine": [], "bocanc": []}
    neg_items = []
    for it in n_items + [i for i in k_items if i["id"] in good]:
        st = (n_sig if it["id"] in n_sig else k_sig)[it["id"]]
        s = judge_signals(it, st, ctx)
        ls = cs.label_set(it.get("product"))
        negs[ls].append(s)
        neg_items.append((it, ls, s))
    for ls in negs:
        if not negs[ls]:
            raise SystemExit(f"nicio imagine ne-om pentru setul {ls}")
    cands = [search(mand, negs, y, have_vlm) for y in a.yunet]
    thr = min(cands, key=lambda t: (t["fp_total_search"], t["yunet_score"]))  # la FP egal: pragul YuNet cel mai sensibil
    print("căutare YuNet (prag: FP total):", {t["yunet_score"]: t["fp_total_search"] for t in cands})
    thr.pop("fp_total_search")
    thr["segment"] = SEGMENT
    thr["ocr"] = OCR

    def rec(group):
        rows = []
        for c in group:
            r = {}
            for ls in ("haine", "bocanc"):
                f, by = flagged(c, thr, ls)
                r[ls] = (f, by)
            f_all = r["haine"][0] and r["bocanc"][0]
            rows.append({"id": c["item"]["id"], "rel": c["item"]["rel"], "variant": c["item"]["variant"], "flagged": f_all,
                         "flagged_haine": r["haine"][0], "flagged_bocanc": r["bocanc"][0], "by_haine": r["haine"][1], "by_bocanc": r["bocanc"][1],
                         "faces_max": round(max(c["faces"]["max_score_1x"], c["faces"]["max_score_2x"]), 3), "skin_whole": round(c["skin_whole"], 4),
                         "d_haine": round(cm.siglip_d(c["siglip"]["haine"], thr["siglip_pairs"]["haine"]), 3),
                         "d_bocanc": round(cm.siglip_d(c["siglip"]["bocanc"], thr["siglip_pairs"]["bocanc"]), 3),
                         "vlm_p_yes": None if c["vlm"] is None else round(c["vlm"]["p_yes"], 3)})
        return rows

    rows, drows = rec(mand), rec(diag)
    by_sig = {}
    for r in rows:
        for lset in ("by_haine", "by_bocanc"):
            for k in r[lset]:
                by_sig[f"{lset[3:]}:{k}"] = by_sig.get(f"{lset[3:]}:{k}", 0) + 1
    nrows = []
    for it, ls, s in neg_items:
        f, by = cm.is_flagged_human({"faces": s["faces"], "siglip": s["siglip"][ls], "skin_whole": s["skin_whole"], "vlm": s["vlm"]}, thr, ls)
        nrows.append({"id": it["id"], "set": ls, "respins_fals": f, "by": by})
    n_flag = sum(1 for r in rows if r["flagged"])
    out = {
        "schema": 1, "data": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "versiune_cod": {"sha256": fl.sha256_code([HERE / f for f in CODE_FILES]), "fisiere": CODE_FILES},
        "praguri": thr, "controale": rows,
        "recall": {"flagged": n_flag, "total": len(rows), "pe_semnal": by_sig,
                   "haine": sum(r["flagged_haine"] for r in rows), "bocanc": sum(r["flagged_bocanc"] for r in rows),
                   "vlm_inclus": have_vlm},
        "diagnostic_jos": {"flagged": sum(1 for r in drows if r["flagged"]), "total": len(drows), "ne_semnalate": [r["id"] for r in drows if not r["flagged"]]},
        "ne_om": {"total": len(nrows), "respinse_fals": sum(r["respins_fals"] for r in nrows), "randuri": nrows},
        "modele_controale": c_models,
        "nota": "Controalele sunt cale relativă în repo + rezultat; imaginile nu sunt în git. Controalele „original” și „mic” sunt obligatorii (100%); „jos” e diagnostic.",
    }
    ilib.write_new_text(a.out, json.dumps(out, ensure_ascii=False, indent=1) + "\n")  # mod exclusiv "x": nu suprascrie
    print(json.dumps({"recall": out["recall"], "diagnostic_jos": out["diagnostic_jos"], "ne_om": {k: v for k, v in out["ne_om"].items() if k != "randuri"}, "praguri": thr}, indent=1, ensure_ascii=False))
    try:
        cm.validate_calibration(out)
        print("VALID: recall 100%")
    except cm.CalibrationError as e:
        print("NEVALID:", e)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
