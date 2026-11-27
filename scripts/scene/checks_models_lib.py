"""Logica pură a verificărilor cu modele (T5b): numpy/Pillow/stdlib, testabilă fără modele.

Fiecare verificare întoarce `{name, value, threshold, passed, detail}` (checks_lib.result). Modelele (models_runtime.py) produc doar
SEMNALE brute (scoruri, probabilități, text); aici se decide. Pragurile vin din `calibrare_modele.json` (calibrate_models.py).

Ton de piele (skin_mask): pixel de piele dacă SIMULTAN
  - YCbCr (BT.601, 0..255): 77 <= Cb <= 127 și 133 <= Cr <= 173 (intervalul clasic Chai-Ngan; gri neutru are Cb=Cr=128, deci cade sub Cr 133);
  - HSV: H în [0°, 50°] sau [340°, 360°), S în [0.10, 0.80], V >= 0.20 (exclude gri aproape neutru, roșu/portocaliu saturat, tonuri întunecate).
Acromatic (chroma_stats): croma CIELAB C* = hypot(a*, b*); un segment e acromatic dacă percentila 90 a lui C* <= prag (calibrat) și
fracția pixelilor cu C* > CHROMA_PIX nu depășește un prag (calibrat). Gri neutru cald/rece sub lumină colorată rămâne la C* mic.

Decizia „ne-uman” respinge dacă ORICE semnal e pozitiv: fețe > 0; segment cu piele sau cromatic; piele pe imaginea întreagă peste prag;
SigLIP2 cu P(persoană) >= P(manechin) − marjă; VLM zice că e om; VLM lipsă când calibrarea l-a inclus (fail-closed).
"""
# ruff: noqa: E501
from __future__ import annotations

import json
import math
import unicodedata
from pathlib import Path
from typing import Any

import numpy as np

import checks_lib as ck

CHROMA_PIX = 14.0  # C* peste care un pixel se numără drept „cromatic” în fracția cromatică
MIN_TEXT_LEN = 3
MIN_CONTROLS = 30


class CalibrationError(ValueError):
    pass


# ---------------------------------------------------------------- piele, croma

def skin_mask(rgb: np.ndarray) -> np.ndarray:
    x = np.asarray(rgb, dtype=np.float64)
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    ycc = (cb >= 77) & (cb <= 127) & (cr >= 133) & (cr <= 173)
    h, s, v = ck.hsv(x)
    hs = ((h <= 50) | (h >= 340)) & (s >= 0.10) & (s <= 0.80) & (v >= 0.20)
    return ycc & hs


def _sel(rgb: np.ndarray, mask: np.ndarray | None) -> np.ndarray:
    a = np.asarray(rgb)
    if mask is None:
        return a.reshape(-1, 3)
    m = np.asarray(mask, dtype=bool)
    if m.shape != a.shape[:2]:
        raise ValueError(f"mască {m.shape} față de imagine {a.shape[:2]}")
    return a[m]


def skin_fraction(rgb: np.ndarray, mask: np.ndarray | None = None) -> float:
    """Fracția pixelilor de piele din mască (sau din toată imaginea). Mască goală -> 0.0."""
    px = _sel(rgb, mask)
    if px.shape[0] == 0:
        return 0.0
    return float(skin_mask(px[None, :, :])[0].mean())


def chroma_stats(rgb: np.ndarray, mask: np.ndarray | None = None) -> dict:
    px = _sel(rgb, mask)
    if px.shape[0] == 0:
        return {"n": 0, "c_p50": 0.0, "c_p90": 0.0, "frac_chromatic": 0.0, "sat_mean": 0.0}
    lab = ck.rgb_to_lab(px.astype(np.float64))
    c = np.hypot(lab[:, 1], lab[:, 2])
    _, s, _ = ck.hsv(px)
    return {"n": int(px.shape[0]), "c_p50": float(np.percentile(c, 50)), "c_p90": float(np.percentile(c, 90)),
            "frac_chromatic": float((c > CHROMA_PIX).mean()), "sat_mean": float(s.mean())}


def segment_signals(rgb: np.ndarray, mask: np.ndarray) -> dict:
    return {**chroma_stats(rgb, mask), "skin_frac": skin_fraction(rgb, mask)}


def segment_is_achromatic_no_skin(sig: dict | None, thr: dict, applicable: bool = True) -> dict:
    """Segmentul manechinului: fără ton de piele și acromatic. `sig` = segment_signals. Neaplicabil (natură moartă) -> N/A, trece."""
    name = "segment_achromatic_no_skin"
    t = {k: thr[k] for k in ("skin_frac_max", "c_p90_max", "frac_chromatic_max", "min_px")}
    if not applicable:
        return ck.result(name, None, t, True, "N/A: natură moartă, fără manechin (I gol)")
    if not sig or sig.get("n", 0) < t["min_px"]:
        return ck.result(name, sig.get("n") if sig else None, t, False, f"segment prea mic sau lipsă (< {t['min_px']} px): nu se poate verifica")
    strict = sig["skin_frac"] <= t["skin_frac_max"] and sig["c_p90"] <= t["c_p90_max"] and sig["frac_chromatic"] <= t["frac_chromatic_max"]
    # T5c: cale nuanțată pentru gri cu ton sub lumină colorată (geacă portocalie): mediana C* <= c_p50_max (mediana ignoră marginile și fundalul din I;
    # bej/carton/piele au mediana >= 17, griurile cu nuanță <= 14 în setul etichetat). Nu relaxează fără prag explicit (prag absent -> doar calea strictă).
    c50 = sig.get("c_p50")
    relaxed = "c_p50_max" in thr and c50 is not None and c50 <= thr["c_p50_max"]
    if "c_p50_max" in thr:
        t["c_p50_max"] = thr["c_p50_max"]
    ok = strict or relaxed
    return ck.result(name, {"skin_frac": round(sig["skin_frac"], 5), "c_p50": None if c50 is None else round(c50, 3), "c_p90": round(sig["c_p90"], 3), "frac_chromatic": round(sig["frac_chromatic"], 5)}, t, ok,
                     f"{sig['n']} px; piele {sig['skin_frac']:.4f} (max {t['skin_frac_max']}), C* p90 {sig['c_p90']:.2f} (max {t['c_p90_max']}), "
                     f"cromatici {sig['frac_chromatic']:.4f} (max {t['frac_chromatic_max']}); C* p50 {'n/a' if c50 is None else f'{c50:.2f}'}" + (f" (max {thr['c_p50_max']})" if "c_p50_max" in thr else "")
                     + (" [cale strictă]" if strict else " [cale nuanțată]" if relaxed else ""))


# ---------------------------------------------------------------- formă de cap (T5c)

HEAD_MIN_RUN = 12  # înălțimea minimă (px) a masei manechinului într-o coloană ca să conteze în profilul de sus
HEAD_FREE_ROWS = 6  # rânduri deasupra marginii de sus care trebuie să fie fundal vizibil (în I, nu guler/produs) ca marginea să fie „liberă”
HEAD_CROP_MARGIN = 0.35  # marja decupajului pentru VLM, față de latura mare a cutiei masei
HEAD_CROP_MIN = 200


def head_geometry(sam: np.ndarray, zi: np.ndarray, zl_: np.ndarray, ze: np.ndarray) -> dict | None:
    """Descriptor geometric al formei de sus a manechinului. Masa = SAM ∩ I \\ (L ∪ E) (zona generată, fără produs). Pentru fiecare coloană cu masă
    (>= HEAD_MIN_RUN px) se ia rândul de sus; marginea de sus e „liberă” dacă cele HEAD_FREE_ROWS rânduri de deasupra sunt fundal vizibil din I
    (un ciot al cărui vârf se pierde sub guler nu are vârf vizibil). Pe cea mai lungă secvență contiguă de coloane libere se potrivește o parabolă
    y = a*xn^2 + b*xn + c (xn în [-1, 1]); `sag_ratio` = a / lungime (înălțimea arcului raportată la lățime): ~0 la un vârf tăiat drept (chiar înclinat,
    pentru că b preia înclinarea), ~0.5 la o semisferă. `free_run` = lungimea secvenței libere raportată la lățimea masei (0 = vârful nu se vede).
    Întoarce None dacă nu există masă."""
    obj = np.asarray(sam, bool) & np.asarray(zi, bool) & ~(np.asarray(zl_, bool) | np.asarray(ze, bool))
    cols = np.nonzero(obj.sum(0) >= HEAD_MIN_RUN)[0]
    if cols.size < 20:
        return None
    top = obj[:, cols].argmax(0)
    free = np.array([bool(t >= HEAD_FREE_ROWS and zi[t - HEAD_FREE_ROWS:t, c].all() and not obj[t - HEAD_FREE_ROWS:t, c].any()) for t, c in zip(top, cols)])
    # cea mai lungă secvență contiguă de coloane libere
    best, cur, start, bstart = 0, 0, 0, 0
    for k in range(cols.size):
        if free[k] and (cur == 0 or cols[k] == cols[k - 1] + 1):
            if cur == 0:
                start = k
            cur += 1
            if cur > best:
                best, bstart = cur, start
        else:
            cur = 1 if free[k] else 0
            start = k
            if cur > best:
                best, bstart = cur, start
    ys, xs = np.nonzero(obj)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    out = {"n_px": int(obj.sum()), "width": int(cols.size), "free_run": round(best / cols.size, 4), "sag_ratio": 0.0, "bbox": [x0, y0, x1, y1]}
    if best >= 20:
        xn = np.linspace(-1.0, 1.0, best)
        a = float(np.polyfit(xn, top[bstart:bstart + best].astype(np.float64), 2)[0])
        out["sag_ratio"] = round(a / best, 4)
    m = int(max(HEAD_CROP_MIN, HEAD_CROP_MARGIN * max(x1 - x0, y1 - y0)))
    h, w = obj.shape
    out["crop_box"] = [max(0, x0 - m), max(0, y0 - m), min(w, x1 + m), min(h, y1 + m)]
    return out


def head_is_dome(geom: dict | None, thr: dict) -> bool:
    """Geometric: vârf liber și rotunjit (arc peste prag) pe o secvență liberă lungă."""
    return bool(geom) and geom["width"] >= thr.get("width_min", 0) and geom["free_run"] >= thr["free_run_min"] and geom["sag_ratio"] >= thr["sag_ratio_min"]


def check_head_shape(geom: dict | None, vlm: dict | None, thr: dict, applicable: bool = True, vlm_required: bool = False) -> dict:
    """Formă de cap: respinge dacă geometria SAU întrebarea închisă către VLM (P(da, are cap/dom rotund)) e pozitivă. Natură moartă -> N/A, trece.
    `vlm_required` (produsul e în `vlm_products` și calibrarea a inclus VLM): fără semnal VLM verificarea PICĂ (fail-closed)."""
    name = "head_shape"
    t = {"sag_ratio_min": thr["sag_ratio_min"], "free_run_min": thr["free_run_min"], "width_min": thr.get("width_min", 0), "vlm_p_yes": thr["vlm_p_yes"]}
    if not applicable:
        return ck.result(name, None, t, True, "N/A: natură moartă, fără manechin")
    dome = head_is_dome(geom, thr)
    p = None if vlm is None else float(vlm["p_yes"])
    vlm_pos = p is not None and p >= thr["vlm_p_yes"]
    vlm_missing = vlm_required and p is None
    ok = not dome and not vlm_pos and not vlm_missing
    val = {"sag_ratio": None if not geom else geom["sag_ratio"], "free_run": None if not geom else geom["free_run"], "vlm_p_yes": None if p is None else round(p, 4)}
    why = ("geometrie: vârf rotunjit liber" if dome else "") + ("; " if dome and (vlm_pos or vlm_missing) else "") + (f"VLM: P(cap/dom)={p:.3f}" if vlm_pos else "") \
        + ("VLM nerulat (fail-closed)" if vlm_missing else "")
    return ck.result(name, val, t, ok, "fără formă de cap" if ok else "formă de cap: " + why)


# ---------------------------------------------------------------- OCR

def normalize_text(s: str) -> str:
    """NFKD, fără diacritice, majuscule, doar litere/cifre."""
    d = unicodedata.normalize("NFKD", str(s))
    return "".join(ch for ch in d if ch.isalnum()).upper() if d else ""


def _norm_items(items: list[dict], min_conf: float, min_len: int = 1) -> list[str]:
    out = [normalize_text(i["text"]) for i in items if float(i.get("conf", 0.0)) >= min_conf]
    return sorted(t for t in out if len(t) >= max(1, min_len))


def check_ocr_logo(name: str, original: list[dict], candidate: list[dict], min_conf: float, min_len: int = 2) -> dict:
    """Același text normalizat pe cutia critică în original și în candidat (la 3×). Comparăm output cu output, nu cu textul întreg
    al logo-ului (în original poate fi vizibilă doar o parte). Token-urile de un singur caracter se ignoră (zgomot OCR pe pictograme:
    măsurat 30/150 diferențe la min_len=1, 0/150 la min_len=2).

    Dacă OCR nu citește NIMIC în original, verificarea e NECONCLUDENTĂ: `passed=True`, `value="neconcludent"`, `informativ=True` (fișa și
    planșa o arată ca „informativ”, nu „OK”); un text apărut doar în candidat pică. Identitatea pixelilor din logo nu depinde de OCR:
    o garantează identitatea pe L complet (logo-ul e în L), vezi checks_lib.check_identity_master."""
    a, b = _norm_items(original, min_conf, min_len), _norm_items(candidate, min_conf, min_len)
    thr = f"identic, încredere >= {min_conf}, token >= {min_len} caractere"
    if not a and not b:
        r = ck.result(f"ocr_logo:{name}", "neconcludent", thr, True,
                      "informativ: OCR nu citește nimic în original și nici în candidat; identitatea logo-ului e garantată de identitatea L, nu de OCR")
        r["informativ"] = True
        return r
    ok = a == b
    return ck.result(f"ocr_logo:{name}", {"original": a, "candidat": b}, thr, ok,
                     "text identic" if ok else f"text diferit: original {a} vs candidat {b}")


def ocr_offenders(items: list[dict], min_len: int, min_conf: float) -> list[dict]:
    return [i for i in items if len(normalize_text(i["text"])) >= min_len and float(i.get("conf", 0.0)) >= min_conf]


def check_ocr_decor(name: str, items: list[dict], min_len: int, min_conf: float) -> dict:
    """Orice text >= min_len caractere (normalizate) cu încredere >= min_conf în decor sau în I (cu produsul mascat neutru) respinge."""
    bad = ocr_offenders(items, min_len, min_conf)
    return ck.result(name, [{"text": b["text"], "conf": round(float(b["conf"]), 3)} for b in bad], f"niciun text >= {min_len} caractere cu încredere >= {min_conf}",
                     not bad, "niciun text" if not bad else f"{len(bad)} text(e): " + ", ".join(repr(b["text"]) for b in bad[:5]))


# ---------------------------------------------------------------- semnale -> verificări de ne-uman

def check_faces(sig: dict, thr: dict) -> dict:
    """Fețe = detecții YuNet cu scor >= prag, la scara 1× și 2×. Semnalul: scorul maxim pe fiecare scară."""
    s1, s2 = float(sig.get("max_score_1x", 0.0)), float(sig.get("max_score_2x", 0.0))
    t = thr["yunet_score"]
    n = int(s1 >= t) + int(s2 >= t)
    return ck.result("faces", {"max_score_1x": round(s1, 4), "max_score_2x": round(s2, 4)}, f"scor YuNet < {t} la 1× și 2×", n == 0,
                     f"scor maxim 1×={s1:.3f}, 2×={s2:.3f}; prag {t}")


def siglip_d(sig: dict, idx: list[int] | None = None) -> float:
    """Media pe formulările alese (`idx`, implicit toate) a lui P(persoană) − P(manechin) (softmax pe perechea de etichete)."""
    prs = sig["pairs"] if idx is None else [sig["pairs"][i] for i in idx]
    return float(np.mean([float(p["p_person"]) - float(p["p_mannequin"]) for p in prs]))


def check_siglip(sig: dict, thr: dict, label_set: str) -> dict:
    idx = thr.get("siglip_pairs", {}).get(label_set)
    d = siglip_d(sig, idx)
    m = thr["siglip_margin"][label_set]
    return ck.result("siglip2_mannequin", round(d, 4), f"P(persoană) − P(manechin) < −{m} ({label_set})", not (d >= -m),
                     f"d={d:.3f} (media formulărilor {idx if idx is not None else 'toate'}); respins dacă d >= {-m}")


def check_vlm(sig: dict | None, thr: dict) -> dict:
    """Semnal VLM. Fără semnal (etapă nerulată sau eșuată): PICĂ dacă calibrarea a inclus VLM (`thr["vlm_required"]`, derivat din
    `recall.vlm_inclus` de load/validate_calibration), altfel „ne-uman” ar trece fără ca VLM-ul să fi spus ceva."""
    if sig is None:
        if thr.get("vlm_required"):
            return ck.result("vlm_ne_uman", None, f"P(da, e o ființă umană) < {thr['vlm_p_yes']}", False,
                             "VLM nerulat: calibrarea a inclus VLM, deci semnalul e obligatoriu (fail-closed)")
        return ck.result("vlm_ne_uman", None, "auxiliar", True, "VLM nerulat (calibrarea fără VLM); nu contribuie")
    p = float(sig["p_yes"])
    return ck.result("vlm_ne_uman", round(p, 4), f"P(da, e o ființă umană) < {thr['vlm_p_yes']}", p < thr["vlm_p_yes"], f"P(da)={p:.3f}")


def check_skin_whole(frac: float, thr: dict) -> dict:
    return ck.result("skin_whole_image", round(float(frac), 5), f"fracție piele <= {thr['skin_whole_max']}", frac <= thr["skin_whole_max"],
                     f"{frac:.4f} din imagine are ton de piele")


def decide_non_human(signals: dict, thr: dict, label_set: str, segment_applicable: bool | None = None) -> list[dict]:
    """Respinge dacă ORICE semnal e pozitiv. `signals`: faces, siglip, vlm (sau None), skin_whole, segment (sau None).
    Întoarce verificările individuale + `ne_uman` (passed doar dacă toate trec). Segmentul contează doar dacă `segment_applicable`
    (implicit: segment prezent)."""
    if segment_applicable is None:
        segment_applicable = signals.get("segment") is not None
    parts = [check_faces(signals["faces"], thr), check_siglip(signals["siglip"], thr, label_set), check_vlm(signals.get("vlm"), thr),
             check_skin_whole(signals["skin_whole"], thr)]
    if segment_applicable or "segment" in signals:
        parts.append(segment_is_achromatic_no_skin(signals.get("segment"), thr["segment"], segment_applicable))
    if "head" in signals and "head" in thr:
        h = signals["head"]
        parts.append(check_head_shape(h.get("geom"), h.get("vlm"), thr["head"], segment_applicable, bool(h.get("vlm_required"))))
    pos = [p["name"] for p in parts if not p["passed"]]
    comb = ck.result("ne_uman", pos, "niciun semnal de om", not pos, "toate semnalele negative" if not pos else "semnal pozitiv: " + ", ".join(pos))
    return [*parts, comb]


def is_flagged_human(signals: dict, thr: dict, label_set: str) -> tuple[bool, list[str]]:
    """Judecătorul de imagine întreagă (fără segment): fețe OR SigLIP2 OR VLM OR piele pe imaginea întreagă."""
    s = {k: v for k, v in signals.items() if k not in ("segment", "head")}
    comb = decide_non_human(s, thr, label_set, segment_applicable=False)[-1]
    return (not comb["passed"]), list(comb["value"])


# ---------------------------------------------------------------- calibrare

REQUIRED_THR = ("yunet_score", "skin_whole_max", "siglip_margin", "vlm_p_yes", "segment", "ocr")


def recompute_flagged(c: dict, thr: dict, vlm_inclus: bool) -> dict[str, bool]:
    """Recalculează „semnalat ca om” pentru un control din valorile SALVATE (faces_max, d_haine/d_bocanc, vlm_p_yes, skin_whole) cu pragurile
    efective: faces_max >= yunet_score, d >= −marjă, vlm_p_yes >= prag (doar dacă VLM e inclus), skin_whole > skin_whole_max."""
    for k in ("faces_max", "skin_whole", "d_haine", "d_bocanc"):
        if not finite(c.get(k)):
            raise CalibrationError(f"controlul {c.get('id')!r}: valoarea {k} lipsește sau nu e număr finit")
    vlm = c.get("vlm_p_yes")
    if vlm_inclus and not finite(vlm):
        raise CalibrationError(f"controlul {c.get('id')!r}: calibrarea declară VLM inclus, dar vlm_p_yes lipsește")
    out = {}
    for ls in ("haine", "bocanc"):
        out[ls] = bool(c["faces_max"] >= thr["yunet_score"] or c[f"d_{ls}"] >= -thr["siglip_margin"][ls]
                       or (vlm_inclus and vlm >= thr["vlm_p_yes"]) or c["skin_whole"] > thr["skin_whole_max"])
    return out


def validate_calibration(cal: dict) -> dict:
    """Validează calibrarea: praguri complete, >= MIN_CONTROLS controale și FIECARE control RECALCULAT din valorile salvate cu pragurile efective
    (nu din `flagged` stocat) trebuie semnalat pe ambele seturi de etichete (recall 100%); `flagged*` stocat trebuie să coincidă cu recalculul.
    Întoarce o COPIE cu `praguri.vlm_required` derivat din `recall.vlm_inclus` (nu poate fi setat din fișier)."""
    if not isinstance(cal, dict):
        raise CalibrationError("calibrarea trebuie să fie dict")
    cal = json.loads(json.dumps(cal))
    thr = cal.get("praguri")
    if not isinstance(thr, dict) or any(k not in thr for k in REQUIRED_THR):
        raise CalibrationError(f"praguri lipsă (necesare: {', '.join(REQUIRED_THR)})")
    ctl = cal.get("controale")
    if not isinstance(ctl, list) or len(ctl) < MIN_CONTROLS:
        raise CalibrationError(f"controale insuficiente: {len(ctl) if isinstance(ctl, list) else 0} < {MIN_CONTROLS}")
    rec = cal.get("recall")
    if not isinstance(rec, dict):
        raise CalibrationError("cifra de recall din fișă nu corespunde listei de controale")
    vlm_inclus = rec.get("vlm_inclus") is True
    flagged = 0
    for c in ctl:
        if not isinstance(c, dict):
            raise CalibrationError("control invalid (nu e dict)")
        r = recompute_flagged(c, thr, vlm_inclus)
        if c.get("flagged_haine") is not r["haine"] or c.get("flagged_bocanc") is not r["bocanc"] or c.get("flagged") is not (r["haine"] and r["bocanc"]):
            raise CalibrationError(f"controlul {c.get('id')!r}: flagged stocat contrazice recalculul din valorile salvate cu pragurile efective")
        flagged += int(r["haine"] and r["bocanc"])
    if flagged != len(ctl):
        raise CalibrationError(f"recall pe controale {flagged}/{len(ctl)} < 100%: judecătorul nu e bun")
    if rec.get("flagged") != flagged or rec.get("total") != len(ctl):
        raise CalibrationError("cifra de recall din fișă nu corespunde listei de controale")
    thr["vlm_required"] = vlm_inclus
    return cal


def required_stages(applicable: dict[str, bool], thr: dict) -> list[str]:
    """Etapele de model fără de care verdictul „ne-uman” nu poate fi dat pentru produsele din lot. `applicable`: produs -> are zonă de interior (manechin).
    faces/siglip/ocr mereu; sam dacă vreun produs are manechin; qwen dacă calibrarea a inclus VLM; qwen_head dacă un produs cu manechin are VLM de cap."""
    req = ["faces", "siglip", "ocr"]
    if any(applicable.values()):
        req.append("sam")
    if thr.get("vlm_required"):
        req.append("qwen")
        if "head" in thr and any(app and head_vlm_applies(p, thr["head"]) for p, app in applicable.items()):
            req.append("qwen_head")
    return req


def stage_problems(required: list[str], stages: list[str], models: dict) -> list[str]:
    """Probleme de rulare: etapă necesară absentă din `--stages`, în ordine greșită (qwen_head înaintea sam) sau cu `eroare` în rezultate."""
    out = [f"etapa necesară {s!r} lipsește din --stages" for s in required if s not in stages]
    if "qwen_head" in stages and "sam" in stages and stages.index("qwen_head") < stages.index("sam"):
        out.append("qwen_head trebuie să ruleze DUPĂ sam (folosește decupajul scris de sam)")
    out += [f"etapa {s!r} a eșuat: {models[s]['eroare']}" for s in required if s in stages and isinstance(models.get(s), dict) and "eroare" in models[s]]
    return out


def head_vlm_applies(product: str, head_thr: dict) -> bool:
    """VLM-ul de cap se aplică doar produselor pe care a fost calibrat (`vlm_products`); lipsa cheii = toate. Pe cilindrul gulerului BZ739OR dă fals pozitiv (P(da) >= 0,9 pe un cilindru plat)."""
    return product in head_thr.get("vlm_products", [product])


def check_veto(master_sha256: str, veto: dict | None) -> dict:
    """Veto manual legat de IMAGINE: cheia = sha256 al `master.png` (nu id-ul candidatului: același id regenerat e altă imagine). Valoarea:
    {motiv, autor, id_informativ?}; `autor` spune cine a pus veto-ul (decizia finală e a proprietarului)."""
    entry = (veto or {}).get(master_sha256)
    why = None if entry is None else f"{entry['motiv']} ({entry['autor']})"
    return ck.result("veto_manual", why, "sha256 master absent din lista de veto", entry is None, "fără veto" if entry is None else f"veto manual: {why}")


def _validate_veto(veto: object) -> None:
    if not isinstance(veto, dict):
        raise CalibrationError("veto_manual trebuie să fie dict {sha256_master: {motiv, autor}}")
    for k, v in veto.items():
        if not isinstance(k, str) or len(k) != 64 or any(ch not in "0123456789abcdef" for ch in k):
            raise CalibrationError(f"veto_manual: cheia trebuie să fie sha256 al masterului (64 hex), nu {k!r}")
        if not isinstance(v, dict) or not all(isinstance(v.get(f), str) and v[f].strip() for f in ("motiv", "autor")):
            raise CalibrationError(f"veto_manual[{k[:12]}…]: cere câmpurile motiv și autor (șiruri nenule)")


def check_boots_info(sig: dict | None) -> dict:
    """INFORMATIV (trece mereu): P(două bocanci vizibili) din VLM; marchează abaterea de produs (al doilea bocanc), fără să respingă."""
    p = None if sig is None else float(sig["p_yes"])
    return ck.result("boots_two_info", None if p is None else round(p, 4), "informativ (nu respinge)", True,
                     "VLM nerulat" if p is None else f"P(2 bocanci)={p:.3f}" + (" -> marcat: 2 bocanci" if p >= 0.5 else ""))


OVERLAY_ALLOWED = {"segment": {"c_p50_max"}, "head": None, "veto_manual": None}  # None = orice conținut (validat separat)


def merge_overlay(cal: dict, overlay: dict) -> dict:
    """Suprapune praguri T5c peste calibrarea validată. DOAR chei permise: `segment.c_p50_max`, `head`, `veto_manual` (orice alt prag, ex. `vlm_p_yes`,
    `yunet_score`, `skin_whole_max`, `siglip_margin`, ar putea relaxa judecătorul și e refuzat). Calibrarea îmbinată se revalidează. Nu modifică argumentele."""
    if not isinstance(overlay, dict) or not isinstance(overlay.get("praguri"), dict):
        raise CalibrationError("overlay fără `praguri`")
    out = json.loads(json.dumps(cal))
    for k, v in overlay["praguri"].items():
        if k not in OVERLAY_ALLOWED:
            raise CalibrationError(f"overlay: cheia de prag {k!r} nu e permisă (permise: {', '.join(OVERLAY_ALLOWED)})")
        allowed = OVERLAY_ALLOWED[k]
        if allowed is not None:
            if not isinstance(v, dict) or set(v) - allowed:
                raise CalibrationError(f"overlay: {k} acceptă doar {sorted(allowed)}, primit {sorted(v) if isinstance(v, dict) else v!r}")
        if k == "veto_manual":
            _validate_veto(v)
        if isinstance(v, dict) and isinstance(out["praguri"].get(k), dict):
            out["praguri"][k].update(v)
        else:
            out["praguri"][k] = v
    return validate_calibration(out)


def load_calibration(path: str | Path) -> dict:
    try:
        cal = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise CalibrationError(f"calibrare ilizibilă: {e}") from e
    return validate_calibration(cal)


def finite(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)
