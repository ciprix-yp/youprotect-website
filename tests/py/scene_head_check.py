"""Verificări T5c pentru forma de cap (geometrie + combinator) și regula de croma nuanțată, fără modele, doar Pillow + numpy.

Rulare: python -I tests/py/scene_head_check.py <ROOT>
Liniile „POS/NEG ..." de pe stdout sunt căutate de testul mjs.
"""
# ruff: noqa: S101, E501, E741, E702
import copy
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(ROOT / "scripts" / "scene"))
import checks_models_lib as cm  # noqa: E402

CAL = cm.load_calibration(ROOT / "scripts" / "scene" / "calibrare_modele.json")
EXTRA = json.loads((ROOT / "scripts" / "scene" / "calibrare_t5c.json").read_text(encoding="utf-8"))
THR = cm.merge_overlay(CAL, EXTRA)["praguri"]
H, W = 300, 200
rng = np.random.default_rng(11)


def show(tag, name, extra=""):
    print(f"{tag} {name}{(': ' + extra) if extra else ''}")


def neg_raises_ov(name, needle, praguri):
    try:
        cm.merge_overlay(CAL, {"praguri": praguri})
    except cm.CalibrationError as e:
        assert needle in str(e), f"{name}: mesaj {e!r} fără {needle!r}"
        show("NEG", name, str(e)[:90])
        return
    raise AssertionError(f"{name}: overlay-ul trebuia respins")


def window():
    I = np.zeros((H, W), bool); I[20:280, 30:170] = True
    return I


def stump(top_fn, x0=60, x1=140, y_bottom=250):
    """Masă pe [x0, x1) cu rândul de sus dat de top_fn(x); jos plat."""
    m = np.zeros((H, W), bool)
    for x in range(x0, x1):
        m[int(top_fn(x)):y_bottom, x] = True
    return m


def geom(sam, L=None, E=None):
    z = np.zeros((H, W), bool)
    L = z if L is None else L; E = z if E is None else E
    return cm.head_geometry(sam, window() & ~(L | E), L, E)  # în zonele reale I e disjunct de L și E


def dome_fn(x0=60, x1=140, base=120):
    r = (x1 - x0) / 2.0
    return lambda x: base - np.sqrt(max(0.0, r * r - (x - (x0 + r)) ** 2))


def main():  # noqa: C901
    ht = THR["head"]
    assert ht == EXTRA["praguri"]["head"] and THR["segment"]["c_p50_max"] == 14.0 and THR["segment"]["skin_frac_max"] == 0.05
    # ---- geometrie
    g_dome = geom(stump(dome_fn()))
    g_flat = geom(stump(lambda x: 100))
    g_tilt = geom(stump(lambda x: 90 + 0.2 * (x - 60)))  # vârf tăiat drept, înclinat (ca fereastra din guler)
    assert cm.head_is_dome(g_dome, ht), g_dome
    show("POS", "dom sintetic (semisferă liberă) detectat", f"sag={g_dome['sag_ratio']}, free_run={g_dome['free_run']}")
    assert not cm.head_is_dome(g_flat, ht) and abs(g_flat["sag_ratio"]) < 0.02, g_flat
    show("POS", "trunchi cu vârf tăiat drept acceptat", f"sag={g_flat['sag_ratio']}")
    assert not cm.head_is_dome(g_tilt, ht) and abs(g_tilt["sag_ratio"]) < 0.02, g_tilt
    show("POS", "vârf tăiat drept înclinat acceptat (înclinarea nu e curbură)", f"sag={g_tilt['sag_ratio']}")
    cov = np.zeros((H, W), bool); cov[:140, :] = True  # gulerul acoperă vârful domului: vârf nevăzut
    g_hid = geom(stump(dome_fn()), L=cov)
    assert g_hid is not None and not cm.head_is_dome(g_hid, ht) and g_hid["free_run"] == 0.0, g_hid
    show("POS", "vârf ascuns sub guler (free_run 0) nu e dom")
    assert geom(np.zeros((H, W), bool)) is None
    show("POS", "fără masă -> None (nu e semnal)")
    g_thin = geom(stump(dome_fn(95, 125, 120), 95, 125))  # arc îngust: sub width_min
    assert g_thin is not None and g_thin["width"] < ht["width_min"] and not cm.head_is_dome(g_thin, ht), g_thin
    show("POS", "arc îngust (< width_min) ignorat", f"width={g_thin['width']}")
    # dovada că testul pică pe un descriptor stricat: sag cu semn inversat nu mai detectează domul
    broken = dict(g_dome, sag_ratio=-g_dome["sag_ratio"])
    try:
        assert cm.head_is_dome(broken, ht)
    except AssertionError:
        show("NEG", "descriptor stricat (sag inversat) nu mai detectează domul: testul pozitiv ar pica")
    else:
        raise AssertionError("testul nu pică pe descriptor stricat")
    # ---- verificarea „head_shape”
    r = cm.check_head_shape(g_dome, None, ht)
    assert r["passed"] is False and "geometrie" in r["detail"]
    show("NEG", "head_shape: doar geometria e pozitivă", r["detail"])
    r = cm.check_head_shape(g_flat, {"p_yes": 0.97}, ht)
    assert r["passed"] is False and "VLM" in r["detail"]
    show("NEG", "head_shape: doar VLM e pozitiv", r["detail"])
    r = cm.check_head_shape(g_flat, {"p_yes": 0.51}, ht)
    assert r["passed"] is True
    show("POS", "head_shape: con/trunchi + VLM 0.51 (sub prag 0.9) trece")
    assert cm.check_head_shape(None, None, ht, applicable=False)["passed"] is True
    show("POS", "head_shape N/A pe natură moartă")
    # ---- combinator: semnalul „cap” singur respinge
    def sigs(geom_, vlm_):
        return {"faces": {"max_score_1x": 0.0, "max_score_2x": 0.0}, "skin_whole": 0.0, "vlm": {"p_yes": 0.01},
                "siglip": {"pairs": [{"p_mannequin": 0.99, "p_person": 0.01}] * 6},
                "segment": {"n": 5000, "skin_frac": 0.0, "c_p90": 3.0, "frac_chromatic": 0.0, "c_p50": 2.0, "sat_mean": 0.02}, "head": {"geom": geom_, "vlm": vlm_}}
    ok = cm.decide_non_human(sigs(g_flat, {"p_yes": 0.1}), THR, "haine")
    assert ok[-1]["passed"] and any(c["name"] == "head_shape" for c in ok)
    show("POS", "combinator: toate semnalele negative, head_shape prezent")
    bad = cm.decide_non_human(sigs(g_dome, {"p_yes": 0.1}), THR, "haine")
    assert bad[-1]["passed"] is False and bad[-1]["value"] == ["head_shape"], bad[-1]
    show("NEG", "combinator: doar semnalul „cap” (geometrie) e pozitiv", bad[-1]["detail"])
    bad = cm.decide_non_human(sigs(g_flat, {"p_yes": 0.99}), THR, "haine")
    assert bad[-1]["passed"] is False and bad[-1]["value"] == ["head_shape"]
    show("NEG", "combinator: doar semnalul „cap” (VLM) e pozitiv", bad[-1]["detail"])
    flagged, why = cm.is_flagged_human(sigs(g_dome, {"p_yes": 0.99}), THR, "haine")
    assert flagged is False and why == []
    show("POS", "judecătorul de imagine întreagă ignoră semnalul „cap”")
    # ---- croma nuanțată
    def seg(color, n=60, noise=3):
        p = np.clip(np.array(color, float) + rng.normal(0, noise, (n, n, 3)), 0, 255).astype(np.uint8)
        return cm.segment_signals(p, np.ones((n, n), bool))
    S = THR["segment"]
    legacy = {k: v for k, v in S.items() if k != "c_p50_max"}
    tint = seg((140, 130, 122))  # gri cu nuanță caldă sub lumină portocalie
    assert 3 < tint["c_p50"] < 14 and tint["skin_frac"] > 0.05, tint
    r = cm.segment_is_achromatic_no_skin(tint, S)
    assert r["passed"] and "nuanțată" in r["detail"], r
    show("POS", "gri cu nuanță moderată acceptat pe calea nuanțată", f"C* p50={tint['c_p50']:.1f}")
    r = cm.segment_is_achromatic_no_skin(tint, legacy)
    assert r["passed"] is False
    show("NEG", "aceeași nuanță cade pe regula veche (fără c_p50_max)", r["detail"])
    for name, col in (("piele", (224, 172, 105)), ("bej/carton", (200, 160, 110)), ("portocaliu puternic", (235, 110, 30)), ("albastru puternic", (40, 80, 200))):
        s = seg(col)
        assert s["c_p50"] > 14, (name, s)
        neg = cm.segment_is_achromatic_no_skin(s, S)
        assert neg["passed"] is False, (name, neg)
        show("NEG", f"segment {name} respins și cu regula nuanțată", f"C* p50={s['c_p50']:.1f}")
    assert cm.segment_is_achromatic_no_skin(seg((128, 128, 130)), S)["passed"]
    show("POS", "gri neutru acceptat (cale strictă)")
    # ---- VLM de cap doar pe produsul calibrat; veto manual
    assert cm.head_vlm_applies("S476YE", ht) and not cm.head_vlm_applies("BZ739OR", ht) and cm.head_vlm_applies("X", {})
    show("POS", "VLM de cap se aplică doar produsului calibrat (S476YE), nu gulerului BZ739OR")
    veto = THR["veto_manual"]
    (vsha, ventry), = veto.items()  # veto legat de IMAGINE: cheia = sha256 al masterului; id-ul e doar informativ
    assert ventry["id_informativ"] == "S476YE-platforma_logistica-s109" and ventry["autor"].startswith("agent T5c; neconfirmat de proprietar") and ventry["motiv"]
    r = cm.check_veto(vsha, veto)
    assert r["passed"] is False and "veto manual" in r["detail"] and "neconfirmat de proprietar" in r["detail"]
    show("NEG", "veto manual respinge masterul cu sha256 din veto (platforma_logistica-s109)", r["detail"][:60])
    other = hashlib.sha256(b"alt master, acelasi id S476YE-platforma_logistica-s109 regenerat").hexdigest()
    assert cm.check_veto(other, veto)["passed"] is True and cm.check_veto(vsha, None)["passed"] is True
    show("POS", "veto manual nu atinge conul bun hala_depozit-s101; același id cu ALT master nu e acoperit (veto legat de imagine, nu de id)")
    neg_raises_ov("veto cu cheie id (nu sha256) respins la îmbinare", "sha256 al masterului", {"veto_manual": {"S476YE-platforma_logistica-s109": {"motiv": "m", "autor": "a"}}})
    neg_raises_ov("veto fără autor respins la îmbinare", "motiv și autor", {"veto_manual": {vsha: {"motiv": "m"}}})
    # ---- informativ bocanci, overlay, etichete
    assert cm.check_boots_info({"p_yes": 0.9})["passed"] is True and "2 bocanci" in cm.check_boots_info({"p_yes": 0.9})["detail"]
    assert cm.check_boots_info(None)["passed"] is True
    show("POS", "boots_two_info e informativ: marchează, nu respinge")
    before = copy.deepcopy(CAL)
    cm.merge_overlay(CAL, EXTRA)
    assert CAL == before
    show("POS", "overlay-ul T5c nu modifică calibrarea originală")
    # înlocuiește testul tautologic „calibrarea îmbinată rămâne validă”: un overlay care RELAXEAZĂ un prag trebuie să pice
    neg_raises_ov("overlay care relaxează vlm_p_yes=1.01 respins", "nu e permisă", {"vlm_p_yes": 1.01})
    neg_raises_ov("overlay care relaxează yunet_score=1.01 respins", "nu e permisă", {"yunet_score": 1.01})
    neg_raises_ov("overlay care relaxează skin_whole_max=1.0 respins", "nu e permisă", {"skin_whole_max": 1.0})
    neg_raises_ov("overlay cu segment.skin_frac_max relaxat respins", "acceptă doar", {"segment": {"skin_frac_max": 1.0}})
    neg_raises_ov("overlay segment.c_p50_max=1e9 respins", "în afara intervalului", {"segment": {"c_p50_max": 1e9}})
    neg_raises_ov("overlay head.vlm_p_yes=2.0 respins", "în afara intervalului", {"head": {"vlm_p_yes": 2.0}})
    neg_raises_ov("overlay head.vlm_p_yes=0 respins", "în afara intervalului", {"head": {"vlm_p_yes": 0}})
    neg_raises_ov("overlay head.free_run_min=99 respins", "în afara intervalului", {"head": {"free_run_min": 99}})
    neg_raises_ov("overlay head.sag_ratio_min=99 respins", "în afara intervalului", {"head": {"sag_ratio_min": 99}})
    neg_raises_ov("overlay head.width_min=1e6 respins", "în afara intervalului", {"head": {"width_min": 1e6}})
    neg_raises_ov("overlay head.free_run_min=NaN respins", "în afara intervalului", {"head": {"free_run_min": float("nan")}})
    neg_raises_ov("overlay head cu cheie necunoscută respins", "head acceptă doar", {"head": {"altceva": 1}})
    show("POS", "overlay-ul T5c real comis încape în intervalele permise")
    relaxed = copy.deepcopy(CAL)
    relaxed["praguri"]["vlm_p_yes"] = 1.01
    try:
        cm.validate_calibration(relaxed)
        raise AssertionError("validate_calibration trebuia să pice pe vlm_p_yes=1.01")
    except cm.CalibrationError as e:
        assert "recall pe controale" in str(e) or "contrazice" in str(e), e
        show("NEG", "validate_calibration recalculează controalele: vlm_p_yes=1.01 nu mai semnalează 100%", str(e)[:80])
    dom, neclar = EXTRA["etichete_cap_S476YE"]["dom"], EXTRA["etichete_cap_S476YE"]["neclar"]
    assert "hala_depozit-s106" in dom and "platforma_logistica-s109" in dom and "hala_depozit-s101" not in dom + neclar and not set(dom) & set(neclar)
    e = EXTRA["etichete_croma_BZ739OR"]
    assert not (set(e["acceptabil_gri_cu_nuanta"]) & set(e["respins_bej_carton_piele"]))
    show("POS", "etichetele T5c sunt consistente (dom ≠ neclar, hala_depozit-s101 nu e dom, A ∩ R = ∅)")
    print("ok")


if __name__ == "__main__":
    main()
