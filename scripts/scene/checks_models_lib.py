"""Logica pură a verificărilor cu modele (T5b): numpy/Pillow/stdlib, testabilă fără modele.

Fiecare verificare întoarce `{name, value, threshold, passed, detail}` (checks_lib.result). Modelele (models_runtime.py) produc doar
SEMNALE brute (scoruri, probabilități, text); aici se decide. Pragurile vin din `calibrare_modele.json` (calibrate_models.py).

Ton de piele (skin_mask): pixel de piele dacă SIMULTAN
  - YCbCr (BT.601, 0..255): 77 <= Cb <= 127 și 133 <= Cr <= 173 (intervalul clasic Chai-Ngan; gri neutru are Cb=Cr=128, deci cade sub Cr 133);
  - HSV: H în [0°, 50°] sau [340°, 360°), S în [0.10, 0.80], V >= 0.20 (exclude gri aproape neutru, roșu/portocaliu saturat, tonuri întunecate).
Acromatic (chroma_stats): croma CIELAB C* = hypot(a*, b*); un segment e acromatic dacă percentila 90 a lui C* <= prag (calibrat) și
fracția pixelilor cu C* > CHROMA_PIX nu depășește un prag (calibrat). Gri neutru cald/rece sub lumină colorată rămâne la C* mic.

Decizia „ne-uman” respinge dacă ORICE semnal e pozitiv: fețe > 0; segment cu piele sau cromatic; piele pe imaginea întreagă peste prag;
SigLIP2 cu P(persoană) >= P(manechin) − marjă; VLM (dacă a rulat) zice că e om.
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
    ok = sig["skin_frac"] <= t["skin_frac_max"] and sig["c_p90"] <= t["c_p90_max"] and sig["frac_chromatic"] <= t["frac_chromatic_max"]
    return ck.result(name, {"skin_frac": round(sig["skin_frac"], 5), "c_p90": round(sig["c_p90"], 3), "frac_chromatic": round(sig["frac_chromatic"], 5)}, t, ok,
                     f"{sig['n']} px; piele {sig['skin_frac']:.4f} (max {t['skin_frac_max']}), C* p90 {sig['c_p90']:.2f} (max {t['c_p90_max']}), "
                     f"cromatici {sig['frac_chromatic']:.4f} (max {t['frac_chromatic_max']})")


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
    măsurat 30/150 diferențe la min_len=1, 0/150 la min_len=2)."""
    a, b = _norm_items(original, min_conf, min_len), _norm_items(candidate, min_conf, min_len)
    ok = a == b
    return ck.result(f"ocr_logo:{name}", {"original": a, "candidat": b}, f"identic, încredere >= {min_conf}, token >= {min_len} caractere", ok,
                     "text identic" + (" (niciun text lizibil în ambele)" if ok and not a else "") if ok else f"text diferit: original {a} vs candidat {b}")


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
    if sig is None:
        return ck.result("vlm_ne_uman", None, "auxiliar", True, "VLM nerulat (semnal auxiliar); nu contribuie")
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
    pos = [p["name"] for p in parts if not p["passed"]]
    comb = ck.result("ne_uman", pos, "niciun semnal de om", not pos, "toate semnalele negative" if not pos else "semnal pozitiv: " + ", ".join(pos))
    return [*parts, comb]


def is_flagged_human(signals: dict, thr: dict, label_set: str) -> tuple[bool, list[str]]:
    """Judecătorul de imagine întreagă (fără segment): fețe OR SigLIP2 OR VLM OR piele pe imaginea întreagă."""
    s = {k: v for k, v in signals.items() if k != "segment"}
    comb = decide_non_human(s, thr, label_set, segment_applicable=False)[-1]
    return (not comb["passed"]), list(comb["value"])


# ---------------------------------------------------------------- calibrare

REQUIRED_THR = ("yunet_score", "skin_whole_max", "siglip_margin", "vlm_p_yes", "segment", "ocr")


def validate_calibration(cal: dict) -> dict:
    """Încarcă/validează calibrarea: praguri complete, >= MIN_CONTROLS controale, recall recalculat din rezultatele per control = 100%."""
    if not isinstance(cal, dict):
        raise CalibrationError("calibrarea trebuie să fie dict")
    thr = cal.get("praguri")
    if not isinstance(thr, dict) or any(k not in thr for k in REQUIRED_THR):
        raise CalibrationError(f"praguri lipsă (necesare: {', '.join(REQUIRED_THR)})")
    ctl = cal.get("controale")
    if not isinstance(ctl, list) or len(ctl) < MIN_CONTROLS:
        raise CalibrationError(f"controale insuficiente: {len(ctl) if isinstance(ctl, list) else 0} < {MIN_CONTROLS}")
    flagged = sum(1 for c in ctl if isinstance(c, dict) and c.get("flagged") is True)
    if flagged != len(ctl):
        raise CalibrationError(f"recall pe controale {flagged}/{len(ctl)} < 100%: judecătorul nu e bun")
    rec = cal.get("recall")
    if not isinstance(rec, dict) or rec.get("flagged") != flagged or rec.get("total") != len(ctl):
        raise CalibrationError("cifra de recall din fișă nu corespunde listei de controale")
    return cal


def load_calibration(path: str | Path) -> dict:
    try:
        cal = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise CalibrationError(f"calibrare ilizibilă: {e}") from e
    return validate_calibration(cal)


def finite(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)
