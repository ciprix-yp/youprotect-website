"""Verificări pentru scripts/scene/checks_models_lib.py (+ logica pură din models_runtime, fișa finală din fisa_lib), fără modele, doar Pillow + numpy.

Rulare: python -I tests/py/scene_models_checks_check.py <ROOT>
Fiecare NEG trebuie să pice cu mesajul exact; liniile „POS/NEG ..." pe stdout sunt căutate de testul mjs.
"""
# ruff: noqa: S101, E501, E741, E702
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
    assert cm.check_ocr_logo("x", [], [], o["logo_min_conf"])["passed"]
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
    sv = clean_signals(); sv["vlm"] = None
    assert cm.decide_non_human(sv, THR, "haine")[-1]["passed"]
    show("POS", "VLM nerulat nu contribuie")
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
    neg_raises("calibrare cu recall < 100%", cm.CalibrationError, "recall pe controale", lambda: cm.validate_calibration(bad))
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
                            model={"id": "m", "revizie": "r", "sha256": h}, seed=1, prompt="p", context="c", scara=1.0, deplasare={"dx": 0, "dy": 0}, flip=False,
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
