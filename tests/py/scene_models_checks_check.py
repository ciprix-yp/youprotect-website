"""Verificări pentru scripts/scene/checks_models_lib.py (+ logica pură din models_runtime, fișa finală din fisa_lib), fără modele, doar Pillow + numpy.

Rulare: python -I tests/py/scene_models_checks_check.py <ROOT>
Fiecare NEG trebuie să pice cu mesajul exact; liniile „POS/NEG ..." pe stdout sunt căutate de testul mjs.
"""
# ruff: noqa: S101, S603, E501, E741, E702
import copy
import hashlib
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

import numpy as np

ROOT = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(ROOT / "scripts" / "scene"))
import calibrate_models as cal_m  # noqa: E402
import checks_models_lib as cm  # noqa: E402
import fisa_lib as fl  # noqa: E402
import models_runtime as mr  # noqa: E402

CAL_PATH = ROOT / "scripts" / "scene" / "calibrare_modele.json"
CAL = cm.load_calibration(CAL_PATH)
THR = CAL["praguri"]
SEG = THR["segment"]
rng = np.random.default_rng(7)


def show(tag, name, extra=""):
    print(f"{tag} {name}{(': ' + extra) if extra else ''}")


def neg(name, res, needle):
    assert res["passed"] is False, f"{name}: trebuia să pice, a trecut: {res}"
    assert needle in res["detail"] or needle in json.dumps(res["value"], ensure_ascii=False), f"{name}: lipsește {needle!r} în {res}"
    show("NEG", name, res["detail"])


def neg_raises(name, exc, needle, fn):
    try:
        fn()
    except exc as e:
        assert needle in str(e), f"{name}: mesaj {e!r} fără {needle!r}"
        show("NEG", name, str(e))
        return
    raise AssertionError(f"{name}: trebuia să ridice {exc.__name__}")


def patch(color, n=60, noise=3):
    base = np.array(color, dtype=np.float64)
    return np.clip(base + rng.normal(0, noise, (n, n, 3)), 0, 255).astype(np.uint8)


def seg(color):
    p = patch(color)
    return cm.segment_signals(p, np.ones(p.shape[:2], bool))


def clean_signals():
    return {"faces": {"max_score_1x": 0.0, "max_score_2x": 0.0}, "skin_whole": 0.0, "vlm": {"p_yes": 0.01},
            "siglip": {"pairs": [{"p_mannequin": 0.99, "p_person": 0.01}] * 6}, "segment": {"n": 5000, "skin_frac": 0.0, "c_p90": 3.0, "frac_chromatic": 0.0, "c_p50": 2.0, "sat_mean": 0.02}}


def main():  # noqa: C901
    # ---- segment: piele / cromatic / gri
    for tone in [(224, 172, 105), (198, 134, 66), (255, 219, 172), (141, 85, 36)]:
        s = seg(tone)
        assert s["skin_frac"] > 0.9, (tone, s)
        neg(f"segment cu ton de piele {tone}", cm.segment_is_achromatic_no_skin(s, SEG), "piele")
    neg("segment cromatic portocaliu", cm.segment_is_achromatic_no_skin(seg((235, 110, 30)), SEG), "cromatici")
    neg("segment cromatic albastru", cm.segment_is_achromatic_no_skin(seg((40, 80, 200)), SEG), "cromatici")
    g = cm.segment_is_achromatic_no_skin(seg((128, 128, 130)), SEG)
    assert g["passed"], g
    show("POS", "segment gri acceptat", g["detail"])
    neg("segment prea mic", cm.segment_is_achromatic_no_skin({"n": 10, "skin_frac": 0, "c_p90": 0, "frac_chromatic": 0}, SEG), "prea mic")
    na = cm.segment_is_achromatic_no_skin(None, SEG, applicable=False)
    assert na["passed"] and "N/A" in na["detail"]
    show("POS", "segment N/A natură moartă", na["detail"])
    assert cm.skin_fraction(patch((128, 128, 128))) < 0.01
    assert cm.skin_fraction(np.zeros((4, 4, 3), np.uint8), np.zeros((4, 4), bool)) == 0.0
    show("POS", "skin_fraction gri neutru = 0, mască goală = 0")

    # ---- construcția segmentului: produsul real (L ∪ E) nu e manechin
    H = W = 100
    I = np.zeros((H, W), bool); I[20:50, 30:70] = True
    L = np.zeros((H, W), bool); L[45:90, 20:80] = True
    E = np.zeros((H, W), bool); E[44, 20:80] = True
    sam = np.zeros((H, W), bool); sam[15:95, 25:75] = True
    alpha = np.zeros((H, W), np.uint8); alpha[10:80, 20:80] = 255
    reg = mr.segment_region(alpha)
    sg = mr.build_segment(I, sam, reg, L, E)
    assert not (sg & (L | E)).any() and sg[20:44, 30:70].all() and not sg[0:5].any()
    assert reg[90, 50] and not reg[2, 50] and reg[40, 17] and not reg[40, 10]
    assert mr.interior_point(I) == (49.0, 34.0) or I[int(mr.interior_point(I)[1]), int(mr.interior_point(I)[0])]
    show("POS", "segmentul scade L ∪ E și rămâne în regiune")

    # ---- OCR: normalizare, decor, zona I, logo (stub de motor)
    assert cm.normalize_text("Pörtwest ®-9") == "PORTWEST9"
    show("POS", "normalizare text OCR", "'Pörtwest ®-9' -> PORTWEST9")
    o = THR["ocr"]
    ok = cm.check_ocr_decor("ocr_decor_si_zona_I", [{"text": "ab", "conf": 0.99}, {"text": "XYZ", "conf": o["decor_min_conf"] - 0.1}], o["decor_min_len"], o["decor_min_conf"])
    assert ok["passed"]
    show("POS", "text scurt sau cu încredere mică în decor: trece")
    neg("text în decor", cm.check_ocr_decor("ocr_decor_si_zona_I", [{"text": "SALE", "conf": 0.97}], o["decor_min_len"], o["decor_min_conf"]), "SALE")
    gray = np.full((100, 100, 3), 120, np.uint8)

    class StubOCR:  # „citește” un cuvânt dacă în imagine există un petic alb (stand-in pentru text)
        def __call__(self, img, use_cls=False):
            white = (np.asarray(img)[..., 0] > 250).sum() > 30
            return SimpleNamespace(txts=("WARNING",) if white else None, scores=(0.95,) if white else None)

    zL = np.zeros((100, 100), bool); zL[60:95, 10:90] = True
    zI = np.zeros((100, 100), bool); zI[10:40, 30:70] = True
    prod = gray.copy(); prod[70:80, 20:60] = 255  # „logo” alb în L (produsul real): nu trebuie să conteze
    r_prod = mr.ocr_items(StubOCR(), mr.neutral_fill(prod, zL))
    assert not r_prod, r_prod
    show("POS", "text din produs (L) mascat neutru: nu e citit")
    inI = gray.copy(); inI[15:25, 35:60] = 255
    items_i = mr.ocr_items(StubOCR(), mr.neutral_fill(inI, zL))
    neg("text în zona I", cm.check_ocr_decor("ocr_decor_si_zona_I", items_i, o["decor_min_len"], o["decor_min_conf"]), "WARNING")
    orig = [{"text": "ORTWEST", "conf": 0.99}, {"text": "9", "conf": 0.91}]
    assert cm.check_ocr_logo("eticheta_guler", orig, [{"text": "ORTWEST", "conf": 0.98}], o["logo_min_conf"], o["logo_min_len"])["passed"]
    show("POS", "logo identic (ignoră token-uri de 1 caracter)")
    r_ng = cm.check_ocr_logo("x", [], [], o["logo_min_conf"])
    assert r_ng["passed"] is True and r_ng["value"] == "neconcludent" and r_ng["informativ"] is True, r_ng
    r_low = cm.check_ocr_logo("x", [{"text": "ABC", "conf": 0.2}], [{"text": "XYZ", "conf": 0.3}], o["logo_min_conf"])  # sub prag de încredere: tot nimic citit
    assert r_low["informativ"] is True and r_low["value"] == "neconcludent"
    show("POS", "F4 OCR logo gol/gol = neconcludent informativ", f"value={r_ng['value']} informativ={r_ng['informativ']} | {r_ng['detail']}")
    import make_planse as mp  # noqa: E402
    vl = mp.verdict_lines([r_ng, cm.check_ocr_logo("y", [{"text": "POR", "conf": 0.99}], [{"text": "POR", "conf": 0.99}], o["logo_min_conf"])])
    assert vl[0][0] is True and vl[0][2] is True and vl[1][2] is False, vl
    assert "neconcludent" in vl[0][1], vl
    show("POS", "F4 planșa marchează verificarea ca informativ (INFO), nu OK", f"{vl[0]}")
    assert "informativ" not in cm.check_ocr_logo("y", [{"text": "POR", "conf": 0.99}], [{"text": "POR", "conf": 0.99}], o["logo_min_conf"])
    show("POS", "F4 logo cu text citit și identic rămâne verificare normală (fără informativ)")
    t5c = json.loads((ROOT / "scripts" / "scene" / "calibrare_t5c.json").read_text(encoding="utf-8"))
    good_ids = {"S476YE-hala_depozit-s106", "S476YE-hala_depozit-s101", "S476YE-santier_constructii_zi-s103", "BZ739OR-hala_productie-s200", "BZ739OR-hala_productie-s202"}
    kept, removed = cal_m.exclude_labeled(good_ids, t5c)
    assert removed == {"S476YE-hala_depozit-s106", "S476YE-santier_constructii_zi-s103"} and "S476YE-hala_depozit-s101" in kept and "BZ739OR-hala_productie-s200" in kept, (kept, removed)
    show("POS", "F5 dom/neclar scoși din „buni”; con bun și gri acceptabil rămân", f"scoși={sorted(removed)}")
    assert cal_m.labeled_ids(t5c, ("respins_bej_carton_piele",)) >= {"BZ739OR-hala_productie-s202"}
    assert cal_m.exclude_labeled(good_ids, t5c, ())[1] == set()
    show("NEG", "F5 fără chei de excludere nu scoate nimic (comportamentul vechi doar explicit)")
    h4 = "a" * 64
    fb = dict(candidat="S476YE-test-s1", produs="S476YE", sha256_sursa=h4, sha256_masca=h4, sha256_L=h4, sha256_E=h4, sha256_I=h4, sha256_cod=h4, sha256_master=h4,
              sha256_raw=h4, model={"id": "m/x", "revizie": "a" * 40, "sha256": h4}, seed=1, prompt="p", context="c", scara=1.0, deplasare={"dx": 0, "dy": 0},
              flip=False, rotate_deg=0, canvas={"w": 1100, "h": 1100}, timp_generare_s=1.0)
    assert fl.build_fisa(**fb, verificari=[r_ng])["verificari"][0]["informativ"] is True
    neg_raises("F4 fișă cu informativ non-bool", fl.FisaError, "informativ trebuie să fie bool", lambda: fl.build_fisa(**fb, verificari=[{**r_ng, "informativ": "da"}]))
    neg("text logo diferit de original", cm.check_ocr_logo("logo_maneca", [{"text": "POR", "conf": 0.99}], [{"text": "PQR", "conf": 0.99}], o["logo_min_conf"]), "PQR")
    neg("logo dispărut în candidat", cm.check_ocr_logo("logo_maneca", [{"text": "POR", "conf": 0.99}], [], o["logo_min_conf"]), "POR")
    neg("text nou în zona logo", cm.check_ocr_logo("logo_maneca", [], [{"text": "SALE", "conf": 0.99}], o["logo_min_conf"]), "SALE")

    # ---- combinatorul: un singur semnal pozitiv respinge
    base = cm.decide_non_human(clean_signals(), THR, "haine")
    assert base[-1]["passed"] and base[-1]["name"] == "ne_uman" and all(set(p) >= set(cm.ck.result("a", 0, 0, True, "").keys()) for p in base)
    show("POS", "combinator: niciun semnal pozitiv -> ne_uman trece", f"{len(base)} verificări")
    for tag, mut, needle in [
        ("fețe", lambda s: s["faces"].update(max_score_2x=0.99), "faces"),
        ("segment (piele)", lambda s: s.update(segment={"n": 5000, "skin_frac": 0.9, "c_p90": 10.0, "frac_chromatic": 0.0}), "segment_achromatic_no_skin"),
        ("segment (cromatic)", lambda s: s.update(segment={"n": 5000, "skin_frac": 0.0, "c_p90": 60.0, "frac_chromatic": 0.9}), "segment_achromatic_no_skin"),
        ("SigLIP2", lambda s: s.update(siglip={"pairs": [{"p_mannequin": 0.05, "p_person": 0.95}] * 6}), "siglip2_mannequin"),
        ("VLM", lambda s: s.update(vlm={"p_yes": 0.99}), "vlm_ne_uman"),
        ("piele pe imaginea întreagă", lambda s: s.update(skin_whole=0.95), "skin_whole_image"),
    ]:
        s = clean_signals()
        mut(s)
        res = cm.decide_non_human(s, THR, "haine")
        assert res[-1]["passed"] is False and needle in res[-1]["value"], (tag, res[-1])
        others = [p["name"] for p in res[:-1] if not p["passed"]]
        assert others == [needle], (tag, others)
        neg(f"combinator: doar semnalul {tag} e pozitiv", res[-1], needle)
    s = clean_signals(); s["segment"] = None
    assert cm.decide_non_human(s, THR, "bocanc", segment_applicable=False)[-1]["passed"]
    show("POS", "FD25BK: segment N/A, restul semnalelor negative -> trece")
    assert THR["vlm_required"] is True and CAL["recall"]["vlm_inclus"] is True  # calibrarea reală a inclus VLM
    sv = clean_signals(); sv["vlm"] = None
    res = cm.decide_non_human(sv, THR, "haine")
    assert res[-1]["passed"] is False and "vlm_ne_uman" in res[-1]["value"]
    neg("VLM nerulat NU trece când calibrarea a inclus VLM (ne_uman picat)", res[-1], "vlm_ne_uman")
    neg("check_vlm(None) cu calibrare cu VLM", cm.check_vlm(None, THR), "VLM nerulat")
    nov = copy.deepcopy(THR); nov["vlm_required"] = False
    assert cm.check_vlm(None, nov)["passed"] is True and cm.decide_non_human(sv, nov, "haine")[-1]["passed"]
    show("POS", "VLM nerulat nu contribuie doar când calibrarea însăși a fost fără VLM")
    ht = {"sag_ratio_min": 0.15, "free_run_min": 0.3, "width_min": 60, "vlm_p_yes": 0.9, "vlm_products": ["S476YE"]}
    neg("check_head_shape(vlm=None) pe produs cu VLM de cap", cm.check_head_shape(None, None, ht, True, vlm_required=True), "VLM nerulat")
    assert cm.check_head_shape(None, None, ht, True, vlm_required=False)["passed"] is True
    show("POS", "check_head_shape fără VLM trece doar când VLM-ul nu e cerut (produs în afara vlm_products)")

    # ---- compunerea verificărilor per produs (model_checks) cu un `st` FĂRĂ qwen / qwen_head
    import run_model_checks as rmc  # noqa: E402
    with tempfile.TemporaryDirectory() as td:
        img = Path(td) / "master.png"
        from PIL import Image
        Image.fromarray(np.full((64, 64, 3), 128, np.uint8)).save(img)
        sha_img = hashlib.sha256(img.read_bytes()).hexdigest()
        ctx0 = mr.Ctx()
        thr_h = copy.deepcopy(THR)
        thr_h["head"] = dict(ht)
        thr_h["veto_manual"] = {sha_img: {"motiv": "test", "autor": "agent de test"}}
        clean = {"faces": {"max_score_1x": 0.0, "max_score_2x": 0.0}, "siglip": {"haine": {"pairs": [{"p_mannequin": 0.99, "p_person": 0.01}] * 6}},
                 "ocr": {"logo": {}, "decor": []}, "sam": {"applicable": False}}
        for prod in ("S476YE", "BZ739OR"):
            it = {"id": f"{prod}-x-s1", "path": str(img), "product": prod, "kind": "candidat"}
            thr_nv = copy.deepcopy(thr_h); thr_nv.pop("veto_manual")
            full = rmc.model_checks(it, {**clean, "qwen": {"p_yes": 0.01}, "qwen_head": {"p_yes": 0.01}}, thr_nv, ctx0)
            assert next(c for c in full if c["name"] == "ne_uman")["passed"] is True, full  # control pozitiv: cu VLM-urile prezente trece
            no_vlm = rmc.model_checks(it, clean, thr_nv, ctx0)
            ne = next(c for c in no_vlm if c["name"] == "ne_uman")
            assert ne["passed"] is False and "vlm_ne_uman" in ne["value"], (prod, ne)
            neg(f"model_checks {prod}: st fără qwen -> ne_uman respins", ne, "vlm_ne_uman")
        it = {"id": "S476YE-x-s1", "path": str(img), "product": "S476YE", "kind": "candidat"}
        app = {**clean, "sam": {"applicable": True, "segment": clean_signals()["segment"], "head": None}}  # manechin aplicabil, segment curat, fără vârf rotunjit
        only_head = rmc.model_checks(it, {**app, "qwen": {"p_yes": 0.01}}, thr_nv, ctx0)  # lipsește doar qwen_head (produs cu VLM de cap)
        hs = next(c for c in only_head if c["name"] == "head_shape")
        neg("model_checks S476YE: st fără qwen_head -> head_shape respins", hs, "VLM nerulat")
        assert next(c for c in rmc.model_checks(it, {**app, "qwen": {"p_yes": 0.01}, "qwen_head": {"p_yes": 0.01}}, thr_nv, ctx0) if c["name"] == "ne_uman")["passed"]
        bz = rmc.model_checks({**it, "id": "BZ739OR-x-s1", "product": "BZ739OR"}, {**app, "qwen": {"p_yes": 0.01}}, thr_nv, ctx0)
        assert next(c for c in bz if c["name"] == "head_shape")["passed"] is True  # BZ739OR nu e în vlm_products: fără qwen_head nu pică
        show("POS", "model_checks BZ739OR: fără qwen_head head_shape trece (produsul nu are VLM de cap)")
        vetoed = rmc.model_checks(it, {**clean, "qwen": {"p_yes": 0.01}, "qwen_head": {"p_yes": 0.01}}, thr_h, ctx0)
        neg("model_checks: master cu sha256 din veto -> veto_manual respins", next(c for c in vetoed if c["name"] == "veto_manual"), "veto manual")

    # ---- etape necesare: lipsă din --stages / eșuate în rulare
    req = cm.required_stages({"S476YE": True, "BZ739OR": True, "FD25BK": False}, thr_h)
    assert req == ["faces", "siglip", "ocr", "sam", "qwen", "qwen_head"], req
    assert cm.required_stages({"FD25BK": False}, thr_h) == ["faces", "siglip", "ocr", "qwen"]
    probs = cm.stage_problems(req, ["faces", "ocr", "siglip", "sam"], {})
    assert probs == ["etapa necesară 'qwen' lipsește din --stages", "etapa necesară 'qwen_head' lipsește din --stages"], probs
    show("NEG", "--stages fără qwen/qwen_head: rularea trebuie oprită", "; ".join(probs))
    probs = cm.stage_problems(req, ["faces", "ocr", "siglip", "sam", "qwen", "qwen_head"], {"qwen": {"eroare": "RuntimeError: MPS out of memory"}, "faces": {"id": "yunet"}})
    assert probs == ["etapa 'qwen' a eșuat: RuntimeError: MPS out of memory"], probs
    show("NEG", "etapă necesară cu 'eroare' în rezultate: rularea trebuie oprită", probs[0])
    assert cm.stage_problems(req, ["qwen_head", "sam", "faces", "ocr", "siglip", "qwen"], {})[0].startswith("qwen_head trebuie")
    show("NEG", "qwen_head înaintea sam: ordine greșită")
    assert cm.stage_problems(req, ["faces", "ocr", "siglip", "sam", "qwen", "qwen_head", "qwen_boots"], {"qwen_boots": {"eroare": "x"}}) == []
    show("POS", "qwen_boots (informativ) eșuat nu oprește rularea")
    import subprocess
    r = subprocess.run([sys.executable, "-I", str(ROOT / "scripts/scene/run_model_checks.py"), "--scene-dir", "/nu/exista", "--models-dir", "/nu/exista",
                        "--calibrare", str(CAL_PATH), "--report-dir", "/nu/exista/r", "--calibrare-extra", str(CAL_PATH)],  # calibrarea de bază folosită drept „overlay”: relaxează praguri
                       capture_output=True, text=True, timeout=120, check=False)
    out = r.stdout + r.stderr
    assert r.returncode != 0 and "calibrare respinsă" in out and "nu e permisă" in out, (r.returncode, out)
    show("NEG", "run_model_checks (CLI): overlay care atinge praguri non-permise se oprește înainte de orice rulare", out.strip().splitlines()[-1][:90])
    s = clean_signals(); s["siglip"] = {"pairs": [{"p_mannequin": 0.5, "p_person": 0.5}] * 6}
    t0 = copy.deepcopy(THR); t0["siglip_margin"]["haine"] = 0.0; t0["siglip_pairs"] = {}
    assert cm.check_siglip(s["siglip"], t0, "haine")["passed"] is False
    show("NEG", "SigLIP2 P(persoană) = P(manechin), marjă 0 -> respins")

    # ---- calibrarea: încărcare validată
    assert len(CAL["controale"]) >= cm.MIN_CONTROLS and CAL["recall"]["flagged"] == CAL["recall"]["total"]
    for c in CAL["controale"]:
        assert (ROOT / c["rel"]).is_file(), c["rel"]
    show("POS", "calibrare reală validă", f"{CAL['recall']['flagged']}/{CAL['recall']['total']} controale semnalate; căile există în repo")
    bad = copy.deepcopy(CAL); bad["controale"] = bad["controale"][:10]
    neg_raises("calibrare cu prea puține controale", cm.CalibrationError, "controale insuficiente", lambda: cm.validate_calibration(bad))
    bad = copy.deepcopy(CAL); bad["controale"][3]["flagged"] = False
    neg_raises("calibrare cu `flagged` stocat contrazis de valorile salvate", cm.CalibrationError, "contrazice recalculul", lambda: cm.validate_calibration(bad))
    # recall 100% se RECALCULEAZĂ din valorile salvate: un prag relaxat pică chiar dacă `flagged` stocat rămâne true
    # (semnalele sunt redundante — un control semnalat de mai multe — deci unele praguri relaxate singure nu schimbă verdictul; vlm_p_yes singur și toate odată da)
    for tag, mut in (("vlm_p_yes=1.01", lambda t: t.update(vlm_p_yes=1.01)),
                     ("toate pragurile relaxate", lambda t: (t.update(vlm_p_yes=1.01, yunet_score=1.01, skin_whole_max=1.0), t["siglip_margin"].update(haine=-1.0, bocanc=-1.0)))):
        bad = copy.deepcopy(CAL); mut(bad["praguri"])
        try:
            cm.validate_calibration(bad)
            raise AssertionError(f"{tag}: trebuia să pice")
        except cm.CalibrationError as e:
            assert "contrazice recalculul" in str(e) or "recall pe controale" in str(e), e
            show("NEG", f"calibrare cu prag relaxat ({tag}): controalele recalculate nu mai sunt semnalate", str(e)[:70])
    bad = copy.deepcopy(CAL); bad["controale"][0]["faces_max"] = None
    neg_raises("control fără valori salvate", cm.CalibrationError, "nu e număr finit", lambda: cm.validate_calibration(bad))
    assert "RECALCULAT" in cm.validate_calibration.__doc__ and "valorile salvate" in cm.validate_calibration.__doc__  # docstring-ul descrie ce face codul
    # `vlm_required` e derivat din recall.vlm_inclus: nu poate fi setat din fișier
    forged = copy.deepcopy(CAL); forged["praguri"]["vlm_required"] = False
    assert cm.validate_calibration(forged)["praguri"]["vlm_required"] is True
    show("POS", "vlm_required derivat din recall.vlm_inclus (valoarea din fișier e ignorată)")
    bad = copy.deepcopy(CAL); del bad["controale"]
    neg_raises("calibrare fără controale", cm.CalibrationError, "controale insuficiente", lambda: cm.validate_calibration(bad))
    bad = copy.deepcopy(CAL); del bad["praguri"]["vlm_p_yes"]
    neg_raises("calibrare fără prag", cm.CalibrationError, "praguri lipsă", lambda: cm.validate_calibration(bad))
    bad = copy.deepcopy(CAL); bad["recall"]["flagged"] = 1
    neg_raises("recall declarat ≠ controale", cm.CalibrationError, "nu corespunde", lambda: cm.validate_calibration(bad))
    neg_raises("calibrare lipsă pe disc", cm.CalibrationError, "ilizibilă", lambda: cm.load_calibration(ROOT / "nu-exista.json"))
    # judecătorul de imagine întreagă semnalează fiecare control din fișă (recalculat din valorile salvate)
    for c in CAL["controale"]:
        assert c["flagged"] and c["flagged_haine"] and c["flagged_bocanc"]
    show("POS", "toate controalele marcate „om” pe ambele seturi de etichete")

    # ---- fișa finală lângă fisa.json, registru valid
    with tempfile.TemporaryDirectory() as td:
        base_dir = Path(td)
        cdir = base_dir / "cand" / "S476YE-test-s1"
        h = "a" * 64
        f5a = fl.build_fisa(candidat="S476YE-test-s1", produs="S476YE", sha256_sursa=h, sha256_masca=h, sha256_L=h, sha256_E=h, sha256_I=h, sha256_cod=h,
                            sha256_master=h, sha256_raw=h, model={"id": "m", "revizie": "r", "sha256": h}, seed=1, prompt="p", context="c", scara=1.0, deplasare={"dx": 0, "dy": 0}, flip=False,
                            rotate_deg=0, canvas={"w": 10, "h": 10}, verificari=[cm.ck.result("transform", 1.0, "x", True, "ok")], timp_generare_s=1.0)
        reg = base_dir / "registru.jsonl"
        p5a = fl.write_fisa(cdir, f5a, reg, base_dir)
        sha5a = hashlib.sha256(p5a.read_bytes()).hexdigest()
        fin = dict(f5a)
        fin.update(etapa="T5b-verificari-model", verificari=f5a["verificari"] + [cm.ck.result("faces", 0.0, "<0.9", True, "ok")])
        pf = fl.write_fisa(cdir, fl.build_fisa(**{k: v for k, v in fin.items() if k != "rezultat_global"}), reg, base_dir, filename="fisa_finala.json")
        assert pf.name == "fisa_finala.json" and hashlib.sha256(p5a.read_bytes()).hexdigest() == sha5a and not fl.verify_registry(reg)
        last = json.loads(reg.read_text().splitlines()[-1])
        assert last["fisier"] == "fisa_finala.json" and last["fisa_sha256"] == hashlib.sha256(pf.read_bytes()).hexdigest()
        show("POS", "fisa_finala.json scrisă lângă fisa.json (neatinsă), registru valid, linia spune fișierul")
        neg_raises("fișa finală nu se suprascrie", fl.FisaError, "fișa există deja", lambda: fl.write_fisa(cdir, fl.build_fisa(**{k: v for k, v in fin.items() if k != "rezultat_global"}), reg, base_dir, filename="fisa_finala.json"))
        neg_raises("nume de fișă cu cale", fl.FisaError, "filename invalid", lambda: fl.write_fisa(cdir, f5a, reg, base_dir, filename="../x.json"))
        bad_chk = fin["verificari"] + [cm.ck.result("vlm_ne_uman", 0.9, "<0.2", False, "da")]
        assert fl.build_fisa(**{**{k: v for k, v in fin.items() if k != "rezultat_global"}, "verificari": bad_chk})["rezultat_global"] is False
        show("NEG", "rezultat_global false dacă o verificare de model pică")
    print("ok")


if __name__ == "__main__":
    main()
