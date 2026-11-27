"""Verificări deterministe pentru scene de catalog: doar Pillow/numpy/stdlib (+ zones_lib, compose_lib).

Contractul: fiecare verificare întoarce {name, value, threshold, passed, detail}; funcțiile sunt pure (fără I/O, fără stare).
Fișa (fisa_lib) acceptă orice verificare cu aceeași formă (OCR, fețe, SigLIP2, VLM vin la T5).

Constante calibrate (valorile măsurate sunt în tests/py/scene_compose_check.py, ieșirea „CAL ...", și în README):
- identitatea masterului (lossless) se verifică pe L COMPLET, nu erodat: compunerea lipește tot L din referință, deci orice pixel
  schimbat chiar pe marginea lui L e o abatere reală; eroziunea de 1 px (disc) rămâne DOAR la identitatea exportului lossy
  (check_identity_export), unde reeșantionarea/compresia se amestecă cu E;
- HALO_DELTA, SPILL_MAX_FRAC, FLUO_MAX_FRAC, export: vezi mai jos.
"""
# ruff: noqa: E501
from __future__ import annotations

import math
from typing import Any, Callable

import numpy as np

import compose_lib as cl
import zones_lib as zl

L_ERODE_R = 1
HALO_DELTA = 12.0  # niveluri de luminanță (0..255), peste max(vecini decor, vecini produs); calibrat, vezi README
HALO_PCTL = 90  # percentila luminanței din inel (robust la câțiva pixeli, prinde un inel alb de 2 px din ~6)
SPILL_MAX_FRAC = 0.02  # fracția maximă din inelul 4-40 px care cade în paleta produsului
FLUO_MAX_FRAC = 0.005  # fracția maximă de pixeli galben/portocaliu fluo în decor
EXPORT_DE_MARGIN = 2.0  # ΔE2000 adăugat la p99 calibrat (≈ 2 × diferența abia sesizabilă de ~1)
EXPORT_SSIM_MARGIN = 0.02  # scăzut din SSIM-ul mediu calibrat


def result(name: str, value: Any, threshold: Any, passed: bool, detail: str) -> dict:
    return {"name": name, "value": value, "threshold": threshold, "passed": bool(passed), "detail": detail}


def eroded_L(L: np.ndarray) -> np.ndarray:  # noqa: N802,E741
    return zl.erode(np.asarray(L, dtype=bool), L_ERODE_R)


# ---------------------------------------------------------------- transformare

def check_transform(params: dict) -> dict:
    """scale în (0,1], dx/dy întregi, `flip` și `rotate_deg` prezente și neutre (False / 0)."""
    probs = []
    s = params.get("scale")
    if isinstance(s, bool) or not isinstance(s, (int, float, np.integer, np.floating)) or not math.isfinite(s):
        probs.append(f"scale invalid: {s!r}")
    elif not 0 < s <= 1:
        probs.append(f"scale={s} nu e în (0, 1]")
    for k in ("dx", "dy"):
        v = params.get(k)
        if not cl._is_int(v):
            probs.append(f"{k}={v!r} nu e întreg")
    if "flip" not in params:
        probs.append("flip lipsește")
    elif params["flip"] is not False:
        probs.append(f"flip={params['flip']!r} (trebuie False)")
    if "rotate_deg" not in params:
        probs.append("rotate_deg lipsește")
    elif isinstance(params["rotate_deg"], bool) or params["rotate_deg"] != 0:
        probs.append(f"rotate_deg={params['rotate_deg']!r} (trebuie 0)")
    return result("transform", s if not probs else probs[0], "scale<=1, dx/dy int, flip=False, rotate_deg=0",
                  not probs, "; ".join(probs) if probs else "ok")


# ---------------------------------------------------------------- identitate (master, lossless)

def check_identity_master(output: np.ndarray, placed_ref: np.ndarray, L: np.ndarray) -> dict:  # noqa: N803
    """Diferența maximă absolută pe RGB pe L COMPLET (nu erodat; masterul e lossless și compunerea lipește tot L) = exact 0.
    Un pixel schimbat cu 1 nivel, chiar pe marginea lui L, pică. Garantează și identitatea pixelilor din logo (L ⊇ zonele critice)."""
    out, ref, m = np.asarray(output), np.asarray(placed_ref), np.asarray(L, dtype=bool)
    if out.shape != ref.shape or m.shape != ref.shape[:2]:
        return result("identity_master", None, 0, False, f"forme diferite: output {out.shape}, ref {ref.shape}, L {m.shape}")
    if not m.any():
        return result("identity_master", None, 0, False, "L e gol")
    d = np.abs(out.astype(np.int16) - ref.astype(np.int16))[m]
    mx, n = int(d.max()), int((d.max(axis=1) > 0).sum())
    return result("identity_master", mx, 0, mx == 0, f"max|Δ| în L = {mx}; {n} px diferiți din {int(m.sum())}")


def _mirror_err(out: np.ndarray, ref: np.ndarray, L: np.ndarray, x0: int, y0: int, x1: int, y1: int) -> tuple[float, float, float]:
    ys, xs = np.nonzero(L)
    o = out[ys, xs].astype(np.float64)
    e0 = np.abs(o - ref[ys, xs]).mean()
    eh = np.abs(o - ref[ys, x0 + x1 - 1 - xs]).mean()
    ev = np.abs(o - ref[y0 + y1 - 1 - ys, xs]).mean()
    return float(e0), float(eh), float(ev)


def detect_mirror(output: np.ndarray, placed_ref: np.ndarray, L: np.ndarray) -> dict:  # noqa: N803
    """Compară L din output cu referința, cu referința oglindită orizontal și vertical (în cutia lui L).
    Pică dacă o oglindă se potrivește strict mai bine decât originalul (la un produs simetric, egalitatea trece)."""
    out, ref, m = np.asarray(output), np.asarray(placed_ref), np.asarray(L, dtype=bool)
    if out.shape != ref.shape or m.shape != ref.shape[:2] or not m.any():
        return result("mirror", None, "orig <= min(oglinzi)", False, "forme diferite sau L gol")
    x0, y0, x1, y1 = zl.bbox_of(m)
    e0, eh, ev = _mirror_err(out, ref, m, x0, y0, x1, y1)
    bad = min(eh, ev) < e0
    which = "orizontal" if eh <= ev else "vertical"
    return result("mirror", round(e0, 4), f"<= {round(min(eh, ev), 4)}", not bad,
                  f"MAE orig={e0:.4f}, oglindit orizontal={eh:.4f}, vertical={ev:.4f}"
                  + (f"; OGLINDIRE {which} detectată" if bad else ""))


def check_scale_not_up(
    output: np.ndarray, source_rgb: np.ndarray, alpha: np.ndarray, L: np.ndarray, E: np.ndarray, I: np.ndarray,  # noqa: E741
    critical: dict, canvas_size: tuple[int, int], params: dict, zone_params: dict | None = None,
) -> dict:
    """Recalculează referința din sursă + parametrii DECLARAȚI și cere identitate exactă pe L complet.
    Un output făcut din produs mărit (>1) nu se potrivește cu referința recalculată la scale declarat 1.0 -> pică;
    la scale declarat > 1, place_product refuză și verificarea pică."""
    try:
        placed = cl.place_product(source_rgb, alpha, L, E, I, critical, canvas_size,
                                  params.get("scale"), params.get("dx"), params.get("dy"), zone_params)
    except (ValueError, TypeError) as e:
        return result("scale_not_up", None, 0, False, f"referința nu se poate recalcula din parametrii declarați: {e}")
    r = check_identity_master(output, placed["ref"], placed["L"])
    return result("scale_not_up", r["value"], 0, r["passed"], "identitate față de referința recalculată: " + r["detail"])


# ---------------------------------------------------------------- culoare: CIEDE2000, SSIM

_M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
_WHITE = np.array([0.95047, 1.0, 1.08883])  # D65


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = lin @ _M.T / _WHITE
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def de2000(lab1: np.ndarray, lab2: np.ndarray) -> np.ndarray:
    """CIEDE2000 vectorizat (Sharma, Wu, Dalal 2005), kL=kC=kH=1."""
    l1, a1, b1 = (np.asarray(lab1, dtype=np.float64)[..., i] for i in range(3))
    l2, a2, b2 = (np.asarray(lab2, dtype=np.float64)[..., i] for i in range(3))
    cb = (np.hypot(a1, b1) + np.hypot(a2, b2)) / 2
    g = 0.5 * (1 - np.sqrt(cb**7 / (cb**7 + 25.0**7)))
    a1p, a2p = (1 + g) * a1, (1 + g) * a2
    c1p, c2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    dlp, dcp = l2 - l1, c2p - c1p
    prod0 = c1p * c2p == 0
    dh = h2p - h1p
    dh = np.where(np.abs(dh) <= 180, dh, dh - 360 * np.sign(dh))
    dh = np.where(prod0, 0.0, dh)
    dhp = 2 * np.sqrt(c1p * c2p) * np.sin(np.radians(dh / 2))
    lbp, cbp = (l1 + l2) / 2, (c1p + c2p) / 2
    hs = h1p + h2p
    hbp = np.where(np.abs(h1p - h2p) <= 180, hs / 2, np.where(hs < 360, (hs + 360) / 2, (hs - 360) / 2))
    hbp = np.where(prod0, hs, hbp)
    t = (1 - 0.17 * np.cos(np.radians(hbp - 30)) + 0.24 * np.cos(np.radians(2 * hbp))
         + 0.32 * np.cos(np.radians(3 * hbp + 6)) - 0.20 * np.cos(np.radians(4 * hbp - 63)))
    dth = 30 * np.exp(-(((hbp - 275) / 25) ** 2))
    rc = 2 * np.sqrt(cbp**7 / (cbp**7 + 25.0**7))
    sl = 1 + 0.015 * (lbp - 50) ** 2 / np.sqrt(20 + (lbp - 50) ** 2)
    sc, sh = 1 + 0.045 * cbp, 1 + 0.015 * cbp * t
    rt = -np.sin(np.radians(2 * dth)) * rc
    x, y, z = dlp / sl, dcp / sc, dhp / sh
    return np.sqrt(x * x + y * y + z * z + rt * y * z)


def _box_sum(x: np.ndarray, k: int) -> np.ndarray:
    """Suma pe ferestre kxk, doar poziții valide: forma (H-k+1, W-k+1)."""
    c = np.pad(np.cumsum(np.cumsum(x, axis=0), axis=1), ((1, 0), (1, 0)))
    return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]


def ssim_masked(a: np.ndarray, b: np.ndarray, mask: np.ndarray, k: int = 7) -> float:
    """SSIM mediu pe luminanță (Rec.601, 0..255), fereastră uniformă kxk (k=7), C1=(0.01·255)², C2=(0.03·255)².
    Se iau în calcul doar ferestrele ÎNTREGI conținute în `mask` (deci vecinătatea din afara L nu influențează)."""
    def gray(x):
        x = np.asarray(x, dtype=np.float64)
        return 0.299 * x[..., 0] + 0.587 * x[..., 1] + 0.114 * x[..., 2]
    ga, gb = gray(a), gray(b)
    n = k * k
    mu_a, mu_b = _box_sum(ga, k) / n, _box_sum(gb, k) / n
    var_a = _box_sum(ga * ga, k) / n - mu_a**2
    var_b = _box_sum(gb * gb, k) / n - mu_b**2
    cov = _box_sum(ga * gb, k) / n - mu_a * mu_b
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    s = ((2 * mu_a * mu_b + c1) * (2 * cov + c2)) / ((mu_a**2 + mu_b**2 + c1) * (var_a + var_b + c2))
    full = _box_sum(np.asarray(mask, dtype=np.float64), k) == n
    if not full.any():
        raise ValueError("nicio fereastră completă în mască")
    return float(s[full].mean())


# ---------------------------------------------------------------- identitate (export lossy)

BLOCK = 8  # latura blocurilor pentru ΔE2000 pe medii locale (zgomotul de compresie are medie ~0 pe bloc)


def _block_de_max(output: np.ndarray, ref: np.ndarray, m: np.ndarray) -> float:
    """Max ΔE2000 între mediile RGB pe blocuri 8x8 aflate ÎNTREGI în L erodat. Zgomotul JPEG/WebP se mediază pe bloc, un
    petic schimbat vizibil nu: p99 per pixel e dominat de marginile cu contrast (calibrat 20,7 la q90) și nu prinde peticul."""
    full = _box_sum(m.astype(np.float64), BLOCK)[::BLOCK, ::BLOCK] == BLOCK * BLOCK
    if not full.any():
        return 0.0
    means = [(_box_sum(x[..., c].astype(np.float64), BLOCK)[::BLOCK, ::BLOCK] / (BLOCK * BLOCK)) for x in (output, ref) for c in range(3)]
    a, b = np.stack(means[:3], axis=-1)[full], np.stack(means[3:], axis=-1)[full]
    return float(de2000(rgb_to_lab(a), rgb_to_lab(b)).max())


def _export_stats(output: np.ndarray, ref: np.ndarray, m: np.ndarray) -> tuple[float, float, float]:
    de = de2000(rgb_to_lab(output[m]), rgb_to_lab(ref[m]))
    return float(np.percentile(de, 99)), ssim_masked(output, ref, m), _block_de_max(output, ref, m)


def calibrate_export(placed_ref: np.ndarray, L_eroded: np.ndarray, encode_fn: Callable[[np.ndarray], np.ndarray]) -> dict:  # noqa: N803
    """Zgomotul de compresie măsurat pe packshot-ul SINGUR: referința codată/decodată cu encode_fn(rgb)->rgb.
    Praguri pentru candidați: ΔE2000 p99 calibrat + EXPORT_DE_MARGIN și SSIM mediu calibrat − EXPORT_SSIM_MARGIN."""
    ref, m = np.asarray(placed_ref), np.asarray(L_eroded, dtype=bool)
    dec = np.asarray(encode_fn(ref))
    if dec.shape != ref.shape or dec.dtype != np.uint8:
        raise ValueError("encode_fn trebuie să întoarcă uint8 cu aceeași formă")
    p99, ss, blk = _export_stats(dec, ref, m)
    return {"de2000_p99_cal": p99, "ssim_mean_cal": ss, "de2000_block_cal": blk,
            "de2000_p99_max": p99 + EXPORT_DE_MARGIN, "ssim_mean_min": ss - EXPORT_SSIM_MARGIN,
            "de2000_block_max": blk + EXPORT_DE_MARGIN,
            "margins": {"de2000": EXPORT_DE_MARGIN, "ssim": EXPORT_SSIM_MARGIN}}


def check_identity_export(output: np.ndarray, placed_ref: np.ndarray, L_eroded: np.ndarray, calibration: dict) -> dict:  # noqa: N803
    out, ref, m = np.asarray(output), np.asarray(placed_ref), np.asarray(L_eroded, dtype=bool)
    thr = {k: calibration[k] for k in ("de2000_p99_max", "ssim_mean_min", "de2000_block_max")}
    if out.shape != ref.shape or not m.any():
        return result("identity_export", None, thr, False, "forme diferite sau L erodat gol")
    p99, ss, blk = _export_stats(out, ref, m)
    ok = p99 <= thr["de2000_p99_max"] and ss >= thr["ssim_mean_min"] and blk <= thr["de2000_block_max"]
    return result("identity_export", {"de2000_p99": round(p99, 4), "ssim_mean": round(ss, 6), "de2000_block_max": round(blk, 4)}, thr, ok,
                  f"ΔE2000 p99={p99:.4f} (max {thr['de2000_p99_max']:.4f}), SSIM={ss:.6f} (min {thr['ssim_mean_min']:.6f}), "
                  f"ΔE2000 bloc 8x8 max={blk:.4f} (max {thr['de2000_block_max']:.4f})")


# ---------------------------------------------------------------- halo, scurgere de culoare, fluo

def _lum(rgb: np.ndarray) -> np.ndarray:
    x = np.asarray(rgb, dtype=np.float64)
    return 0.299 * x[..., 0] + 0.587 * x[..., 1] + 0.114 * x[..., 2]


def check_halo(output: np.ndarray, placed: dict, delta: float = HALO_DELTA) -> dict:
    """Inelul = banda E ∪ (dilate(P,3) \\ P). Statistica = percentila 90 a luminanței din inel. Referința = max(aceeași percentilă
    a luminanței decorului din inelul exterior 4-12 px, a produsului din interiorul imediat 3-6 px) + delta. (Percentila,
    nu media: același estimator pe ambele părți, robust la fundaluri cu gradient, unde media decorului subestimează
    partea luminoasă a inelului.)
    Pică dacă inelul e mai luminos decât referința (inel alb în jurul produsului pe fundal închis)."""
    out = np.asarray(output)
    P = zl.silhouette(placed["alpha"])
    ring = np.asarray(placed["E"], dtype=bool) | (zl.dilate(P, 3) & ~P)
    decor = zl.dilate(P, 12) & ~zl.dilate(P, 3)
    prod = zl.erode(P, 3) & ~zl.erode(P, 6)
    if not (ring.any() and decor.any() and prod.any()):
        return result("halo", None, delta, False, "inel/decor/produs gol")
    lum = _lum(out)
    r, d, p = (float(np.percentile(lum[m], HALO_PCTL)) for m in (ring, decor, prod))
    ref_max = max(d, p) + delta
    return result("halo", round(r, 2), round(ref_max, 2), r <= ref_max,
                  f"p{HALO_PCTL} luminanță inel={r:.2f}, p decor 4-12px={d:.2f}, p produs interior={p:.2f}, delta={delta}")


def hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(H în grade 0..360, S 0..1, V 0..1) vectorizat."""
    x = np.asarray(rgb, dtype=np.float64) / 255.0
    mx, mn = x.max(axis=-1), x.min(axis=-1)
    dd = mx - mn
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    safe = np.where(dd == 0, 1, dd)
    h = np.where(mx == r, ((g - b) / safe) % 6, np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4)) * 60.0
    h = np.where(dd == 0, 0.0, h)
    s = np.where(mx == 0, 0.0, dd / np.where(mx == 0, 1, mx))
    return h, s, mx


# paletă: doar pixeli cromatici (S >= 0.35, V >= 0.25); celule = 12 intervale de nuanță (30°) × 2 de saturație × 2 de valoare
_CHROMA_S, _CHROMA_V, _PAL_MIN_SHARE = 0.35, 0.25, 0.02


def _cells(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    h, s, v = hsv(rgb)
    chroma = (s >= _CHROMA_S) & (v >= _CHROMA_V)
    cell = (np.floor(h / 30).astype(int) % 12) * 4 + (s >= 0.65).astype(int) * 2 + (v >= 0.6).astype(int)
    return cell, chroma


def check_color_spill(output: np.ndarray, placed: dict, max_frac: float = SPILL_MAX_FRAC) -> dict:
    """Paleta produsului = celulele (nuanță/saturație/valoare, vezi _cells) cu >= 2% din pixelii cromatici din L erodat.
    Se numără fracția pixelilor din inelul 4-40 px exterior (în afara siluetei) care sunt cromatici și în paletă."""
    out = np.asarray(output)
    P = zl.silhouette(placed["alpha"])
    Lm = eroded_L(placed["L"])
    ring = zl.dilate(P, 40) & ~zl.dilate(P, 3)
    if not Lm.any() or not ring.any():
        return result("color_spill", None, max_frac, False, "L sau inel gol")
    cell, chroma = _cells(out[Lm])
    ch = cell[chroma]
    if ch.size == 0:
        return result("color_spill", 0.0, max_frac, True, "produs fără pixeli cromatici: paletă goală, nimic de scurs")
    counts = np.bincount(ch, minlength=48)
    palette = np.nonzero(counts >= _PAL_MIN_SHARE * ch.size)[0]
    rcell, rchroma = _cells(out[ring])
    hit = rchroma & np.isin(rcell, palette)
    frac = float(hit.mean())
    return result("color_spill", round(frac, 5), max_frac, frac <= max_frac,
                  f"{int(hit.sum())} din {int(ring.sum())} px din inelul 4-40 px au culoarea produsului "
                  f"({len(palette)} celule de paletă)")


# fluo: nuanță 25..65° (portocaliu-galben), S >= 0.75, V >= 0.85
_FLUO_H, _FLUO_S, _FLUO_V = (25.0, 65.0), 0.75, 0.85


def check_decor_fluo(output: np.ndarray, placed: dict, max_frac: float = FLUO_MAX_FRAC) -> dict:
    """Fracția pixelilor galben/portocaliu fluo în decor (tot ce nu e L sau E: decor + I generat). Peste prag -> respins."""
    out = np.asarray(output)
    decor = ~(np.asarray(placed["L"], dtype=bool) | np.asarray(placed["E"], dtype=bool))
    if not decor.any():
        return result("decor_fluo", None, max_frac, False, "decor gol")
    h, s, v = hsv(out[decor])
    hit = (h >= _FLUO_H[0]) & (h <= _FLUO_H[1]) & (s >= _FLUO_S) & (v >= _FLUO_V)
    frac = float(hit.mean())
    return result("decor_fluo", round(frac, 5), max_frac, frac <= max_frac,
                  f"{int(hit.sum())} din {int(decor.sum())} px de decor sunt fluo (H {_FLUO_H[0]}-{_FLUO_H[1]}°, S>={_FLUO_S}, V>={_FLUO_V})")


# ---------------------------------------------------------------- contaminare albă în decor (Fix-4)

CONTAM_NEAR = (4, 24)  # inelul măsurat (px în afara lui L ∪ E): umplerea benzii refă doar primii BAND_RING_PX px, restul e decorul generat
CONTAM_REF = (32, 48)  # inelul de referință, în afara zonei în care packshot-ul alb poate „sângera” în decor
CONTAM_MIN_PX = 500
CONTAM_WHITE_MIN = 235  # „aproape alb”: min(R, G, B) >= 235
# Praguri calibrate pe măsurătoarea pe cei 110 raw_768.png din cand_v3 (measure_contamination.py; .catalog-work/scene/raport_v4/contaminare.json):
# delta fracției aproape-albe (inel 4-24 minus referință 32-48): max observat 0.0704 (S476YE), p95 0.0504 -> prag 0.15 (~2x maximul observat; o contaminare
# albă de 12 px acoperă ~0.4 din inel). delta p90 luminanță: max observat 66.81, mediana -0.86 (luminanța variază și cu decorul, deci pragul e larg, doar
# pentru ruptură grosolană) -> prag 80. Cei 110 trec; calibrare pe 110 măsurători ale aceluiași generator, deci avertisment de supra-reglaj.
CONTAM_P90_DELTA = 80.0
CONTAM_WHITE_DELTA = 0.15


def disc_dilate(mask: np.ndarray, r: int) -> np.ndarray:
    """Dilatare cu disc (identică cu zones_lib.dilate), dar rapidă: pe fiecare decalaj vertical dy, segmentul orizontal de semi-lățime
    floor(sqrt(r^2 - dy^2)) se aplică prin sume cumulate (O(H·W) pe dy în loc de O(H·W) pe fiecare pixel al discului)."""
    m = np.asarray(mask, dtype=bool)
    if r <= 0:
        return m.copy()
    h, w = m.shape
    out = np.zeros_like(m)
    padded = np.pad(m, ((r, r), (r, r)), constant_values=False)
    cs = np.cumsum(padded.astype(np.int32), axis=1)
    cs = np.pad(cs, ((0, 0), (1, 0)))
    for dy in range(-r, r + 1):
        hw = int(math.isqrt(r * r - dy * dy))
        rows = slice(r + dy, r + dy + h)
        lo = np.arange(w) + r - hw
        hi = np.arange(w) + r + hw + 1
        out |= (cs[rows][:, hi] - cs[rows][:, lo]) > 0
    return out


def contamination_rings(L: np.ndarray, E: np.ndarray, I: np.ndarray, near: tuple[int, int] = CONTAM_NEAR,  # noqa: E741
                        ref: tuple[int, int] = CONTAM_REF) -> tuple[np.ndarray, np.ndarray]:
    """(inel apropiat, inel de referință) în decor: la [a, b] px în afara lui L ∪ E, fără interiorul manechinului (I)."""
    le = np.asarray(L, dtype=bool) | np.asarray(E, dtype=bool)
    notI = ~np.asarray(I, dtype=bool)
    d = {r: disc_dilate(le, r) for r in {near[0], near[1], ref[0], ref[1]}}
    return (d[near[1]] & ~d[near[0]] & notI), (d[ref[1]] & ~d[ref[0]] & notI)


def ring_stats(rgb: np.ndarray, ring: np.ndarray) -> dict | None:
    if not ring.any():
        return None
    px = np.asarray(rgb)[ring]
    lum = _lum(px)
    return {"n": int(ring.sum()), "p90": float(np.percentile(lum, 90)), "white_frac": float((px.min(axis=-1) >= CONTAM_WHITE_MIN).mean())}


def check_band_contamination(output: np.ndarray, placed: dict, p90_delta: float = CONTAM_P90_DELTA, white_delta: float = CONTAM_WHITE_DELTA) -> dict:
    """Packshot-ul alb care „sângerează” în decor dincolo de inelul refăcut la compunere: luminanța p90 și fracția aproape-albă pe inelul 4-24 px
    în afara lui L ∪ E, față de decorul de referință 32-48 px (fără I). Respinge dacă p90 inelului depășește referința cu mai mult de `p90_delta`
    niveluri SAU fracția aproape-albă o depășește cu mai mult de `white_delta`. Inel gol sau sub CONTAM_MIN_PX px: respins (nu se poate verifica)."""
    near, ref = contamination_rings(placed["L"], placed["E"], placed["I"])
    sn, sr = ring_stats(output, near), ring_stats(output, ref)
    thr = {"p90_delta": p90_delta, "white_delta": white_delta, "inel": list(CONTAM_NEAR), "referinta": list(CONTAM_REF)}
    if sn is None or sr is None or sn["n"] < CONTAM_MIN_PX or sr["n"] < CONTAM_MIN_PX:
        return result("band_contamination", None, thr, False, f"inele prea mici ({0 if sn is None else sn['n']}/{0 if sr is None else sr['n']} px < {CONTAM_MIN_PX}): nu se poate verifica")
    dp, dw = sn["p90"] - sr["p90"], sn["white_frac"] - sr["white_frac"]
    val = {"p90_inel": round(sn["p90"], 2), "p90_ref": round(sr["p90"], 2), "delta_p90": round(dp, 2), "alb_inel": round(sn["white_frac"], 4),
           "alb_ref": round(sr["white_frac"], 4), "delta_alb": round(dw, 4)}
    return result("band_contamination", val, thr, dp <= p90_delta and dw <= white_delta,
                  f"p90 luminanță inel {CONTAM_NEAR[0]}-{CONTAM_NEAR[1]}px={sn['p90']:.2f} vs ref {CONTAM_REF[0]}-{CONTAM_REF[1]}px={sr['p90']:.2f} (delta {dp:+.2f}, max {p90_delta}); "
                  f"aproape-alb {sn['white_frac']:.4f} vs {sr['white_frac']:.4f} (delta {dw:+.4f}, max {white_delta})")
