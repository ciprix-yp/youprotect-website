"""Verificările cu modele (T5b/T5c) pe candidații din <scene>/cand: fișă FINALĂ nouă (`fisa_finala_v3.json`) lângă `fisa.json` T5a (care rămâne neatinsă),
linie în `registru.jsonl` (lanț de hash-uri), raport numeric.

Fiecare model se încarcă o singură dată pe lot (models_runtime.collect). Calibrarea (`calibrare_modele.json`) se încarcă validată: fiecare control se
RECALCULEAZĂ din valorile salvate cu pragurile efective și trebuie semnalat 100%; overlay-ul T5c (`--calibrare-extra`, OBLIGATORIU) acceptă doar chei permise
și calibrarea îmbinată se revalidează. Înainte de orice rulare cu modele, pentru fiecare candidat: fisa.json trebuie să existe, produsul din nume = fișă =
zone.json, `master.png`/`raw_768.png` re-hash-uite = `sha256_master`/`sha256_raw` din fișă, sursa și zonele = hash-urile din fișă, iar sha256 al fișei = ultima
linie din registru. Fișele T5a vechi (fără sha256_master) sunt REFUZATE; `--legacy` le acceptă marcat (`legacy_fara_sha_master`, rezultat global fals).
O etapă de model necesară (faces, siglip, ocr, sam, qwen, qwen_head) care lipsește din --stages sau eșuează oprește rularea (nicio fișă scrisă).
Rezultatul global = toate verificările T3a (din fisa.json T5a) + toate cele de model trec.

Rulare: python -I run_model_checks.py --scene-dir <scene> --models-dir <models> --calibrare <calibrare_modele.json> --calibrare-extra <calibrare_t5c.json> --report-dir <director nou>
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
import integrity_lib as ilib  # noqa: E402
import models_runtime as mr  # noqa: E402

ETAPA = "T5c-verificari-model-v3"
FISA_FINALA = "fisa_finala_v3.json"  # același nume în make_planse.py, README și PROJECT_OS/10-SCENE-PRODUS.md
CODE_FILES = ("checks_models_lib.py", "models_runtime.py", "collect_signals.py", "run_model_checks.py", "integrity_lib.py", "fisa_lib.py", "pilot_lib.py")


def model_checks(item: dict, st: dict, thr: dict, ctx: mr.Ctx) -> list[dict]:
    lset = cs.label_set(item["product"])
    sam = st.get("sam") or {}
    applicable = bool(sam.get("applicable", True)) if "sam" in st else True
    sig = {"faces": st["faces"], "siglip": st["siglip"][lset], "vlm": st.get("qwen"), "skin_whole": mr.skin_whole(item, ctx),
           "segment": sam.get("segment") if applicable else None}
    if "head" in thr:  # T5c: semnalul „formă de cap” (geometrie + VLM pe decupajul gâtului)
        vlm_head = cm.head_vlm_applies(item["product"], thr["head"])
        sig["head"] = {"geom": sam.get("head") if applicable else None, "vlm": st.get("qwen_head") if vlm_head else None,
                       "vlm_required": vlm_head and bool(thr.get("vlm_required"))}
    out = cm.decide_non_human(sig, thr, lset, segment_applicable=applicable)
    if "veto_manual" in thr:  # veto legat de IMAGINE (sha256 al masterului de pe disc), nu de id
        out.append(cm.check_veto(hashlib.sha256(Path(item["path"]).read_bytes()).hexdigest(), thr["veto_manual"]))
    if item["product"] == "FD25BK":
        out.append(cm.check_boots_info(st.get("qwen_boots")))
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
    ap.add_argument("--calibrare-extra", required=True, type=Path, help="overlay T5c OBLIGATORIU (segment.c_p50_max, head, veto_manual); calea intră în etapa și în hash-ul de cod al fișei")
    ap.add_argument("--fisa-name", default=FISA_FINALA, help="numele fișei finale (nu se suprascrie niciodată)")
    ap.add_argument("--registry", type=Path, default=None)
    ap.add_argument("--stages", nargs="+", default=["faces", "ocr", "siglip", "sam", "qwen", "qwen_head", "qwen_boots"], choices=list(mr.STAGES))
    ap.add_argument("--cand-name", default="cand", help="subdirectorul cu candidați din --scene-dir (implicit cand; cand_v3 pentru candidații recompuși)")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--legacy", action="store_true", help="acceptă fișe T5a fără sha256_master, MARCATE (legacy_fara_sha_master) și cu rezultat global fals")
    a = ap.parse_args()
    if not fl.FILENAME_RE.fullmatch(a.fisa_name) or a.fisa_name.startswith(".") or a.fisa_name == "fisa.json":
        raise SystemExit(f"--fisa-name invalid: {a.fisa_name!r}")
    cal_bytes, extra_bytes = a.calibrare.read_bytes(), a.calibrare_extra.read_bytes()
    try:
        cal = cm.validate_calibration(json.loads(cal_bytes))  # pică dacă recalculul controalelor dă recall < 100% sau lipsesc controale
        cal = cm.merge_overlay(cal, json.loads(extra_bytes))  # doar chei permise; calibrarea îmbinată se revalidează
    except (cm.CalibrationError, ValueError) as e:
        raise SystemExit(f"calibrare respinsă: {e}") from e
    thr = cal["praguri"]
    if "qwen" in a.stages and not cal["recall"].get("vlm_inclus"):
        raise SystemExit("calibrarea s-a făcut fără VLM: nu se poate rula VLM pe candidați cu praguri neverificate; scoate qwen din --stages")
    scene = a.scene_dir
    registry = a.registry or scene / "registru.jsonl"
    try:
        items = [i for i in cs.candidate_items(scene, require_fisa=True, cand_name=a.cand_name) if not (Path(i["path"]).parent / a.fisa_name).exists()]
    except ilib.IntegrityError as e:
        raise SystemExit(f"candidați nepotriviți: {e}") from e
    if a.limit:
        items = items[:a.limit]
    if not items:
        raise SystemExit("niciun candidat de verificat")
    ctx = mr.Ctx()
    applicable = {}
    for it in items:
        applicable.setdefault(it["product"], bool(ctx.zones(it)["I"].any()))
    required = cm.required_stages(applicable, thr)
    probs = cm.stage_problems(required, a.stages, {})
    if probs:
        raise SystemExit("etape de model necesare lipsă: " + "; ".join(probs))
    bind, errs = {}, []
    for it in items:  # legături fișă <-> imagine/sursă/zone/registru, ÎNAINTE de orice model
        cdir = Path(it["path"]).parent
        try:
            bind[it["id"]] = ilib.verify_candidate_binding(cdir, "fisa.json", it["source"], it["zones_dir"], registry, legacy=a.legacy)
        except ilib.IntegrityError as e:
            errs.append(str(e))
            continue
        miss = ilib.missing_t3a(bind[it["id"]]["fisa"]["verificari"])
        if miss:
            errs.append(f"{it['id']}: fișa de intrare nu are verificările T3a obligatorii: {', '.join(miss)}")
    if errs:
        raise SystemExit("INTEGRITATE PICATĂ:\n  " + "\n  ".join(errs))
    try:
        a.report_dir.mkdir(parents=True, exist_ok=False)  # director NOU; dump-ul SAM stă înăuntru
    except FileExistsError as e:
        raise SystemExit(f"{a.report_dir} există: director nou cerut") from e
    mr.SAM_DUMP_DIR = a.report_dir / "sam_dump"  # masca SAM și decupajul gâtului (local, nu în git)
    print(f"{len(items)} candidați", flush=True)
    sig, models, times = mr.collect(a.models_dir, items, a.stages, lambda m: print(m, flush=True))
    probs = cm.stage_problems(required, a.stages, models)
    if probs:
        raise SystemExit("rulare oprită, nicio fișă scrisă: " + "; ".join(probs))
    for it in items:  # imaginea verificată = cea legată în fișă (nu s-a schimbat între timp)
        if ilib.file_sha(it["path"]) != bind[it["id"]]["sha256_master"]:
            raise SystemExit(f"{it['id']}: master.png s-a schimbat în timpul rulării; nicio fișă scrisă")
    cal_sha, extra_sha = hashlib.sha256(cal_bytes).hexdigest(), hashlib.sha256(extra_bytes).hexdigest()
    code_sha = fl.sha256_code([HERE / f for f in CODE_FILES] + [a.calibrare, a.calibrare_extra],
                              salt=f"calibrare={a.calibrare.resolve()}\ncalibrare_extra={a.calibrare_extra.resolve()}")
    rows = []
    for it in items:
        cdir = Path(it["path"]).parent
        b = bind[it["id"]]
        raw, f5a = b["raw"], b["fisa"]
        t3a = [c for c in f5a["verificari"] if c["name"] != "verificari_model"]
        mc = model_checks(it, sig[it["id"]], thr, ctx)
        fin = {k: v for k, v in f5a.items() if k not in ("verificari", "rezultat_global", "data", "etapa", "nota", "verificari_modele")}
        extra_checks = []
        if b["legacy"]:  # fișă T5a veche: hash-urile masterului/raw se iau de pe disc, dar rezultatul NU poate fi acceptat
            fin.update(sha256_master=b["sha256_master"], sha256_raw=b["sha256_raw"], legacy_fara_sha_master=True)
            extra_checks.append(cm.ck.result("legacy_fara_sha_master", None, "fișă cu sha256_master (v3+)", False,
                                             "fișa T5a nu leagă acceptarea de imagine (fără sha256_master): regenerare cu fișă v3 necesară"))
        fin.update(
            etapa=f"{ETAPA}[{a.calibrare_extra.name}]", fisa_t5a_sha256=hashlib.sha256(raw).hexdigest(), verificari=t3a + mc + extra_checks,
            verificari_modele=[c["name"] for c in mc], modele_verificare={k: v for k, v in models.items()}, praguri_modele=thr, calibrare_sha256=cal_sha,
            calibrare_extra={"cale": str(a.calibrare_extra.resolve()), "sha256": extra_sha}, calibrare_extra_sha256=extra_sha, sha256_cod_t5b=code_sha,
            recall_calibrare=cal["recall"], timpi_verificari_s={"total_etape": times, "pe_candidat": round(sum(times.values()) / len(items), 3)},
            rezultat_t3a=all(c["passed"] for c in t3a), rezultat_modele=all(c["passed"] for c in mc))
        final = fl.build_fisa(**fin)
        fl.write_fisa(cdir, final, registry, scene, filename=a.fisa_name)
        rows.append({"id": it["id"], "produs": it["product"], "global": final["rezultat_global"], "t3a": fin["rezultat_t3a"], "modele": fin["rezultat_modele"],
                     "picate": [c["name"] for c in final["verificari"] if not c["passed"]], "timp_generare_s": f5a["timp_generare_s"]})
    errs = fl.verify_registry(registry)
    print("registru:", "VALID" if not errs else errs, flush=True)

    # ---- raport
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
    (a.report_dir / "raport_t5c.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    lines = [f"Raport T5c: {len(rows)} candidați, registru {'VALID' if not errs else 'INVALID'}", ""]
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
    (a.report_dir / "rezumat_t5c.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if not errs else 3


if __name__ == "__main__":
    sys.exit(main())
