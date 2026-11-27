"""Așezarea și compunerea produsului pe canvas: bibliotecă deterministă, doar Pillow + numpy (+ zones_lib).

Reguli (PROJECT_OS/10-SCENE-PRODUS.md):
- așezarea = DOAR scalare <= 1 și deplasare întreagă; nu există parametri de oglindire sau rotire;
- la scale == 1.0 nu se reeșantionează nimic (copie exactă a pixelilor);
- la scale < 1: reeșantionare Pillow LANCZOS (RGB, alpha, măști critice și interior), apoi zonele L/E/I se RECALCULEAZĂ
  cu zones_lib.build_zones din alpha și din măștile critice reeșantionate (nu se micșorează L cu nearest) și se validează;
- masca de inpainting = NOT(L ∪ E): include I, deci AI-ul poate acoperi interiorul ghost;
- compunerea: L = referința așezată EXACT; E = F·a + B·(1−a); restul (decor, I) = fundalul.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
from PIL import Image

import zones_lib as zl

RESAMPLING = "LANCZOS"  # Pillow Image.LANCZOS, determinist pentru aceeași versiune de Pillow și aceleași intrări
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


def compose(placed: dict, background_rgb: np.ndarray, foreground: np.ndarray | None = None) -> np.ndarray:
    """RGB uint8 (H,W,3): L = referința așezată exact; E = F·a + B·(1−a); rest (decor, I) = fundal.

    `foreground` = RGB estimat extern (ex. pymatting); lipsă -> referința așezată. Determinist (float64, rint)."""
    ref = _check_rgb(placed["ref"], "placed.ref")
    bg = _check_rgb(background_rgb, "background_rgb")
    if bg.shape != ref.shape:
        raise ValueError(f"fundalul {bg.shape} diferă de canvas {ref.shape}")
    fg = ref if foreground is None else _check_rgb(foreground, "foreground")
    if fg.shape != ref.shape:
        raise ValueError(f"foreground {fg.shape} diferă de canvas {ref.shape}")
    Lm, Em = np.asarray(placed["L"], dtype=bool), np.asarray(placed["E"], dtype=bool)
    a = placed["alpha"].astype(np.float64)[..., None] / 255.0
    out = bg.astype(np.float64)
    blend = fg.astype(np.float64) * a + out * (1.0 - a)
    out[Em] = blend[Em]
    res = np.rint(out).astype(np.uint8)
    res[Lm] = ref[Lm]
    return res
