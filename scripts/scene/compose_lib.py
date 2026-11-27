"""Așezarea și compunerea produsului pe canvas: bibliotecă deterministă, doar Pillow + numpy (+ zones_lib).

Reguli (PROJECT_OS/10-SCENE-PRODUS.md):
- așezarea = DOAR scalare <= 1 și deplasare întreagă; nu există parametri de oglindire sau rotire;
- la scale == 1.0 nu se reeșantionează nimic (copie exactă a pixelilor);
- la scale < 1: reeșantionare Pillow LANCZOS (RGB, alpha, măști critice și interior), apoi zonele L/E/I se RECALCULEAZĂ
  cu zones_lib.build_zones din alpha și din măștile critice reeșantionate (nu se micșorează L cu nearest) și se validează;
- masca de inpainting = NOT(L ∪ E): include I, deci AI-ul poate acoperi interiorul ghost;
- compunerea: L = referința așezată EXACT; E = F·a + B·(1−a); restul (decor, I) = fundalul;
- B în banda E NU e reconstrucția VAE a packshot-ului (fundal alb: E nu se generează, masca de inpainting e NOT(L ∪ E)), ci decorul generat
  propagat din afara L ∪ E (fill_from_outside, vezi mai jos). Implicit `band_fill=True`; `band_fill=False` păstrează comportamentul vechi
  (doar pentru comparații).

Umplerea benzii (fill_from_outside): pixelii din `region_mask` se umplu prin dilatare iterativă cu media RGB a vecinilor 8-conectați deja
cunoscuți (sursele inițiale = `valid_mask` fără regiune). La fiecare iterație se completează un strat de 1 px; algoritmul e determinist
(float64, fără aleatoriu, fără dependență de ordine), iar pixelii din afara regiunii rămân neatinși. Regiunea implicită din compose =
dilate(L ∪ E, BAND_RING_PX) \\ L, adică E plus un inel de BAND_RING_PX px de decor, unde modelul vede încă contextul alb al packshot-ului.
"""
# ruff: noqa: E501
from __future__ import annotations

import math
from typing import Any

import numpy as np
from PIL import Image

import zones_lib as zl

RESAMPLING = "LANCZOS"  # Pillow Image.LANCZOS, determinist pentru aceeași versiune de Pillow și aceleași intrări
BAND_RING_PX = 3  # inel de decor de lângă E refăcut din exterior (acoperă și inelul de 3 px din check_halo)
MASK_THR = 128  # prag pentru măștile reeșantionate (0/255 -> 0..255 interpolat)


def _is_int(v: Any) -> bool:
    return isinstance(v, (int, np.integer)) and not isinstance(v, (bool, np.bool_))


def _check_rgb(a: np.ndarray, name: str) -> np.ndarray:
    a = np.asarray(a)
    if a.ndim != 3 or a.shape[2] != 3 or a.dtype != np.uint8:
        raise ValueError(f"{name}: se așteaptă uint8 (H,W,3), găsit {a.dtype}{a.shape}")
    return a


def _resize_u8(arr: np.ndarray, size: tuple[int, int], mode: str) -> np.ndarray:
    im = Image.fromarray(arr, mode=mode).resize(size, Image.LANCZOS)
    return np.asarray(im, dtype=np.uint8).copy()


def _resize_mask(mask: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    m8 = np.asarray(mask, dtype=bool).astype(np.uint8) * 255
    return _resize_u8(m8, size, "L") >= MASK_THR


def _paste(shape: tuple[int, int], arr: np.ndarray, dx: int, dy: int) -> np.ndarray:
    out = np.zeros(shape + arr.shape[2:], dtype=arr.dtype)
    h, w = arr.shape[:2]
    out[dy : dy + h, dx : dx + w] = arr
    return out


def place_product(
    source_rgb: np.ndarray, alpha: np.ndarray, L: np.ndarray, E: np.ndarray, I: np.ndarray,  # noqa: E741
    critical_masks: dict[str, np.ndarray] | list[np.ndarray], canvas_size: tuple[int, int],
    scale: float, dx: int, dy: int, zone_params: dict | None = None,
) -> dict:
    """Produsul (tot cadrul sursă) așezat pe un canvas (lățime, înălțime), fără flip și fără rotire.

    Întoarce {ref, alpha, L, E, I, critical, params, zone_params, box, resampling}. `ref` e referința așezată (RGB uint8,
    zero în afara cadrului): la verificarea identității se compară cu ea. `zone_params` = parametrii cu care au fost
    construite zonele (implicit zones_lib.DEFAULT_PARAMS)."""
    src = _check_rgb(source_rgb, "source_rgb")
    h, w = src.shape[:2]
    alpha = np.asarray(alpha)
    if alpha.dtype != np.uint8 or alpha.shape != (h, w):
        raise ValueError(f"alpha: se așteaptă uint8 {(h, w)}, găsit {alpha.dtype}{alpha.shape}")
    if isinstance(critical_masks, dict):
        crit_in = {str(k): np.asarray(v, dtype=bool) for k, v in critical_masks.items()}
    else:
        crit_in = {f"critic{i}": np.asarray(v, dtype=bool) for i, v in enumerate(critical_masks)}
    masks = {"L": L, "E": E, "I": I, **crit_in}
    for n, m in masks.items():
        if np.asarray(m).shape != (h, w):
            raise ValueError(f"masca {n}: formă {np.asarray(m).shape} != {(h, w)}")
    if isinstance(scale, bool) or not isinstance(scale, (int, float, np.floating, np.integer)) or not math.isfinite(scale):
        raise ValueError(f"scale invalid: {scale!r}")
    if not (0 < scale <= 1):
        raise ValueError(f"scale={scale} în afara (0, 1]: produsul nu se mărește niciodată")
    if not _is_int(dx) or not _is_int(dy):
        raise ValueError(f"dx/dy trebuie să fie întregi: dx={dx!r}, dy={dy!r}")
    cw, ch = canvas_size
    if not _is_int(cw) or not _is_int(ch) or cw <= 0 or ch <= 0:
        raise ValueError(f"canvas_size invalid: {canvas_size!r}")
    dx, dy = int(dx), int(dy)
    nw, nh = (w, h) if scale == 1 else (max(1, round(w * scale)), max(1, round(h * scale)))
    if dx < 0 or dy < 0 or dx + nw > cw or dy + nh > ch:
        raise ValueError(f"produsul ({nw}x{nh}) la ({dx},{dy}) nu încape în canvas {cw}x{ch}")
    zp = {**zl.DEFAULT_PARAMS, **(zone_params or {})}

    if scale == 1:
        rgb, a8 = src.copy(), alpha.copy()
        Lz, Ez, Iz = (np.asarray(m, dtype=bool).copy() for m in (L, E, I))
        crit = {n: m.copy() for n, m in crit_in.items()}
        resampling = "none"
    else:
        rgb = _resize_u8(src, (nw, nh), "RGB")
        a8 = _resize_u8(alpha, (nw, nh), "L")
        crit = {n: zl.effective_critical(_resize_mask(m, (nw, nh)), a8)[0] for n, m in crit_in.items()}
        Lz, Ez, Iz = zl.build_zones(a8, _resize_mask(I, (nw, nh)), list(crit.values()), zp)
        resampling = RESAMPLING
    errs = zl.validate_zones(a8, Lz, Ez, Iz, crit, zp)
    if errs:
        raise ValueError("zonele așezate nu sunt valide: " + "; ".join(errs))

    shape = (ch, cw)
    return {
        "ref": _paste(shape, rgb, dx, dy), "alpha": _paste(shape, a8, dx, dy),
        "L": _paste(shape, Lz, dx, dy), "E": _paste(shape, Ez, dx, dy), "I": _paste(shape, Iz, dx, dy),
        "critical": {n: _paste(shape, m, dx, dy) for n, m in crit.items()},
        "params": {"scale": scale, "dx": dx, "dy": dy, "flip": False, "rotate_deg": 0},
        "zone_params": zp, "box": [dx, dy, dx + nw, dy + nh], "resampling": resampling,
    }


def inpaint_mask(L: np.ndarray, E: np.ndarray) -> np.ndarray:  # noqa: E741
    """Masca de umplere AI = NOT(L ∪ E), uint8 0/255, de dimensiunea canvasului (include I)."""
    L, E = np.asarray(L, dtype=bool), np.asarray(E, dtype=bool)
    if L.shape != E.shape:
        raise ValueError("L și E au forme diferite")
    return (~(L | E)).astype(np.uint8) * 255


_SHIFTS = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0)]


def _neighbor_sum(x: np.ndarray) -> np.ndarray:
    """Suma celor 8 vecini (zero în afara imaginii), pe primele două axe."""
    p = np.pad(x, ((1, 1), (1, 1)) + ((0, 0),) * (x.ndim - 2))
    h, w = x.shape[:2]
    out = np.zeros(x.shape, dtype=np.float64)
    for dy, dx in _SHIFTS:
        out += p[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
    return out


def fill_from_outside(bg: np.ndarray, region_mask: np.ndarray, valid_mask: np.ndarray) -> np.ndarray:
    """Copie a lui `bg` (uint8 H,W,3) în care pixelii din `region_mask` sunt umpluți din vecinătatea lor VALIDĂ (`valid_mask` \\ regiune),
    prin dilatare iterativă: la fiecare pas, fiecare pixel încă necunoscut din regiune cu cel puțin un vecin 8-conectat cunoscut primește
    media RGB a vecinilor cunoscuți. Pixelii din afara regiunii rămân identici. Determinist. ValueError dacă regiunea nu are nicio sursă."""
    bg = _check_rgb(bg, "bg")
    region = np.asarray(region_mask, dtype=bool)
    valid = np.asarray(valid_mask, dtype=bool)
    if region.shape != bg.shape[:2] or valid.shape != bg.shape[:2]:
        raise ValueError(f"măști {region.shape}/{valid.shape} față de imagine {bg.shape[:2]}")
    if not region.any():
        return bg.copy()
    known = valid & ~region
    if not known.any():
        raise ValueError("fill_from_outside: nicio sursă validă în afara regiunii")
    vals = bg.astype(np.float64) * known[..., None]
    left = region.copy()
    for _ in range(max(bg.shape[:2])):
        kf = known.astype(np.float64)
        cnt = _neighbor_sum(kf)
        new = left & (cnt > 0)
        if not new.any():
            # Buzunare închise (ochiuri, spații între degete): regiunea nu atinge decorul prin vecini 8-conectați. Valorile trec prin pixelii
            # nici-regiune-nici-valizi (L, doar ca tranzit, nu se scriu în rezultat) până ajung la buzunar; se oprește imediat ce `left` e gol.
            if not left.any():
                break
            transit = ~known & ~region
            new = (left | transit) & (cnt > 0)
            if not new.any():
                break
        sm = _neighbor_sum(vals)
        vals[new] = sm[new] / cnt[new][:, None]
        known = known | new
        left = left & ~new
    if left.any():
        raise ValueError(f"fill_from_outside: {int(left.sum())} px nealiniați la nicio sursă")
    res = bg.copy()
    res[region] = np.rint(vals[region]).astype(np.uint8)
    return res


def prepare_background(bg: np.ndarray, placed: dict, ring_px: int = BAND_RING_PX) -> np.ndarray:
    """Fundalul fără contaminarea packshot-ului: E și un inel de `ring_px` px în jurul lui L ∪ E se refac din decorul din afara inelului.
    L nu se atinge (rămâne referința la compunere)."""
    Lm, Em = np.asarray(placed["L"], dtype=bool), np.asarray(placed["E"], dtype=bool)
    zone = zl.dilate(Lm | Em, ring_px)
    return fill_from_outside(bg, zone & ~Lm, ~zone)


def compose(placed: dict, background_rgb: np.ndarray, foreground: np.ndarray | None = None, band_fill: bool = True) -> np.ndarray:
    """RGB uint8 (H,W,3): L = referința așezată exact; E = F·a + B·(1−a); rest (decor, I) = fundal.

    `foreground` = RGB estimat extern (ex. pymatting); lipsă -> referința așezată. `band_fill=True` (implicit): B = fundalul cu E și
    inelul din jur refăcute din decorul exterior (prepare_background); `False` = comportamentul vechi (B = fundalul brut, care în E
    conține reconstrucția albă a packshot-ului), doar pentru comparații. Determinist (float64, rint)."""
    ref = _check_rgb(placed["ref"], "placed.ref")
    bg = _check_rgb(background_rgb, "background_rgb")
    if bg.shape != ref.shape:
        raise ValueError(f"fundalul {bg.shape} diferă de canvas {ref.shape}")
    fg = ref if foreground is None else _check_rgb(foreground, "foreground")
    if fg.shape != ref.shape:
        raise ValueError(f"foreground {fg.shape} diferă de canvas {ref.shape}")
    if band_fill:
        bg = prepare_background(bg, placed)
    Lm, Em = np.asarray(placed["L"], dtype=bool), np.asarray(placed["E"], dtype=bool)
    a = placed["alpha"].astype(np.float64)[..., None] / 255.0
    out = bg.astype(np.float64)
    blend = fg.astype(np.float64) * a + out * (1.0 - a)
    out[Em] = blend[Em]
    res = np.rint(out).astype(np.uint8)
    res[Lm] = ref[Lm]
    return res
