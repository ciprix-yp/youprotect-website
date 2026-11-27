"""Verificările cu modele (T5b) pe candidații din <scene>/cand: fișă FINALĂ nouă (`fisa_finala.json`) lângă `fisa.json` T5a (care rămâne neatinsă),
linie în `registru.jsonl` (lanț de hash-uri), raport numeric.

Fiecare model se încarcă o singură dată pe lot (models_runtime.collect). Calibrarea (`calibrare_modele.json`) se încarcă validată:
dacă lipsesc controalele sau recall-ul pe controale < 100%, scriptul pică înainte de orice rulare.
Rezultatul global = toate verificările T3a (din fisa.json T5a) + toate cele de model trec.

Rulare: python -I run_model_checks.py --scene-dir <scene> --models-dir <models> --calibrare <calibrare_modele.json> --report-dir <director nou>
"""
# ruff: noqa: E501
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import checks_models_lib as cm  # noqa: E402
import collect_signals as cs  # noqa: E402
import fisa_lib as fl  # noqa: E402
import models_runtime as mr  # noqa: E402

ETAPA = "T5b-verificari-model"
FISA_FINALA = "fisa_finala.json"


def model_checks(item: dict, st: dict, thr: dict, ctx: mr.Ctx) -> list[dict]:
    lset = cs.label_set(item["product"])
    sam = st.get("sam") or {}
    applicable = bool(sam.get("applicable", True)) if "sam" in st else True
    sig = {"faces": st["faces"], "siglip": st["siglip"][lset], "vlm": st.get("qwen"), "skin_whole": mr.skin_whole(item, ctx),
           "segment": sam.get("segment") if applicable else None}
    out = cm.decide_non_human(sig, thr, lset, segment_applicable=applicable)
    o = thr["ocr"]
    for name, v in sorted(st["ocr"]["logo"].items()):
        out.append(cm.check_ocr_logo(name, v["original"], v["candidat"], o["logo_min_conf"], o["logo_min_len"]))
    out.append(cm.check_ocr_decor("ocr_decor_si_zona_I", st["ocr"]["decor"], o["decor_min_len"], o["decor_min_conf"]))
    return out


def main() -> int:  # noqa: C901
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scene-dir", required=True, type=Path)
    ap.add_argument("--models-dir", required=True, type=Path)
    ap.add_argument("--calibrare", required=True, type=Path)
    ap.add_argument("--report-dir", required=True, type=Path)
    ap.add_argument("--registry", type=Path, default=None)
    ap.add_argument("--stages", nargs="+", default=["faces", "ocr", "siglip", "sam", "qwen"], choices=list(mr.STAGES))
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    cal = cm.load_calibration(a.calibrare)  # pică dacă recall < 100% sau lipsesc controale
    thr = cal["praguri"]
    if "qwen" in a.stages and not cal["recall"].get("vlm_inclus"):
        raise SystemExit("calibrarea s-a făcut fără VLM: nu se poate rula VLM pe candidați cu praguri neverificate; scoate qwen din --stages")
    if a.report_dir.exists():
        raise SystemExit(f"{a.report_dir} există: director nou cerut")
    scene = a.scene_dir
    registry = a.registry or scene / "registru.jsonl"
    items = [i for i in cs.candidate_items(scene) if not (Path(i["path"]).parent / FISA_FINALA).exists()]
    if a.limit:
        items = items[:a.limit]
    if not items:
        raise SystemExit("niciun candidat de verificat")
    print(f"{len(items)} candidați", flush=True)
    sig, models, times = mr.collect(a.models_dir, items, a.stages, lambda m: print(m, flush=True))
    ctx = mr.Ctx()
    cal_sha = hashlib.sha256(a.calibrare.read_bytes()).hexdigest()
    code_sha = fl.sha256_code([HERE / f for f in ("checks_models_lib.py", "models_runtime.py", "collect_signals.py", "run_model_checks.py", "calibrare_modele.json")])
    rows = []
    for it in items:
        cdir = Path(it["path"]).parent
        raw = (cdir / "fisa.json").read_bytes()
        f5a = json.loads(raw)
        t3a = [c for c in f5a["verificari"] if c["name"] != "verificari_model"]
        mc = model_checks(it, sig[it["id"]], thr, ctx)
        fin = {k: v for k, v in f5a.items() if k not in ("verificari", "rezultat_global", "data", "etapa", "nota", "verificari_modele")}
        fin.update(
            etapa=ETAPA, fisa_t5a_sha256=hashlib.sha256(raw).hexdigest(), verificari=t3a + mc, verificari_modele=[c["name"] for c in mc],
            modele_verificare={k: v for k, v in models.items()}, praguri_modele=thr, calibrare_sha256=cal_sha, sha256_cod_t5b=code_sha,
            recall_calibrare=cal["recall"], timpi_verificari_s={"total_etape": times, "pe_candidat": round(sum(times.values()) / len(items), 3)},
            rezultat_t3a=all(c["passed"] for c in t3a), rezultat_modele=all(c["passed"] for c in mc))
        final = fl.build_fisa(**fin)
        fl.write_fisa(cdir, final, registry, scene, filename=FISA_FINALA)
        rows.append({"id": it["id"], "produs": it["product"], "global": final["rezultat_global"], "t3a": fin["rezultat_t3a"], "modele": fin["rezultat_modele"],
                     "picate": [c["name"] for c in final["verificari"] if not c["passed"]], "timp_generare_s": f5a["timp_generare_s"]})
    errs = fl.verify_registry(registry)
    print("registru:", "VALID" if not errs else errs, flush=True)

    # ---- raport
    a.report_dir.mkdir(parents=True)
    prods = sorted({r["produs"] for r in rows})
    per_check = collections.defaultdict(lambda: collections.defaultdict(int))
    for r in rows:
        for n in set(r["picate"]):
            key = "ocr_logo" if n.startswith("ocr_logo:") else n
            per_check[key][r["produs"]] += 1
            per_check[key]["TOTAL"] += 1
    rep = {
        "data": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "n_candidati": len(rows), "registru_valid": not errs, "registru_erori": errs,
        "n_per_produs": {p: sum(1 for r in rows if r["produs"] == p) for p in prods},
        "respingeri_per_verificare": {k: dict(v) for k, v in sorted(per_check.items())},
        "trec_toate": {p: sorted(r["id"] for r in rows if r["produs"] == p and r["global"]) for p in prods},
        "doar_t3a_ok": {p: sum(1 for r in rows if r["produs"] == p and r["t3a"]) for p in prods},
        "doar_modele_ok": {p: sum(1 for r in rows if r["produs"] == p and r["modele"]) for p in prods},
        "motive_combinate": {" + ".join(sorted(k)) or "(niciunul)": v for k, v in collections.Counter(tuple(sorted(set(("ocr_logo" if n.startswith("ocr_logo:") else n) for n in r["picate"]))) for r in rows).items()},
        "timp_generare_total_s": round(sum(r["timp_generare_s"] for r in rows), 1), "timp_verificari_s": times,
        "modele": models, "randuri": rows,
    }
    (a.report_dir / "raport_t5b.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    lines = [f"Raport T5b: {len(rows)} candidați, registru {'VALID' if not errs else 'INVALID'}", ""]
    for p in prods:
        n = rep["n_per_produs"][p]
        lines.append(f"{p}: {n} candidați; T3a OK {rep['doar_t3a_ok'][p]}; modele OK {rep['doar_modele_ok'][p]}; TREC TOT {len(rep['trec_toate'][p])}")
        lines += [f"   trece: {i}" for i in rep["trec_toate"][p]]
    lines.append("")
    lines.append("Respingeri per verificare (pe produs, TOTAL):")
    for k, v in rep["respingeri_per_verificare"].items():
        lines.append(f"  {k}: " + ", ".join(f"{p}={v.get(p, 0)}" for p in [*prods, "TOTAL"]))
    lines += ["", "Motive combinate:"] + [f"  {v:3d}  {k}" for k, v in sorted(rep["motive_combinate"].items(), key=lambda x: -x[1])]
    lines += ["", f"Timp generare total (din fișele T5a): {rep['timp_generare_total_s']} s", f"Timp verificări pe etapă (s): {times}"]
    (a.report_dir / "rezumat_t5b.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if not errs else 3


if __name__ == "__main__":
    sys.exit(main())
