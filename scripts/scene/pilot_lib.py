"""Funcții comune pentru calibrare și generare (T5a): încărcarea produsului așezat și estimarea de foreground.

Pillow + numpy (+ pymatting, import târziu). Fără modele AI, fără rețea.
"""
# ruff: noqa: E501
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I nu pune directorul scriptului pe sys.path
import compose_lib as cl  # noqa: E402
import integrity_lib as ilib  # noqa: E402

CANVAS = (1100, 1100)


def load_source_rgb(source: Path) -> np.ndarray:
    with Image.open(source) as im:
        arr = np.asarray(im.convert("RGB"), dtype=np.uint8).copy()
    if arr.shape[:2] != (CANVAS[1], CANVAS[0]):
        raise ValueError(f"sursa trebuie să fie {CANVAS[0]}x{CANVAS[1]}, găsit {arr.shape[1]}x{arr.shape[0]}")
    return arr


def load_zones(zone_dir: Path) -> dict:
    """Zonele DOAR prin numele din zone.json, cu sha256 comparat la citire (nu prin glob: un fișier străin din director nu se încarcă)."""
    z = ilib.load_zone_checked(zone_dir)
    return {"alpha": z["alpha"], "L": z["L"], "E": z["E"], "I": z["I"], "critical": z["critical"]}


def place(source_rgb: np.ndarray, z: dict, scale: float = 1.0, dx: int = 0, dy: int = 0) -> dict:
    return cl.place_product(source_rgb, z["alpha"], z["L"], z["E"], z["I"], z["critical"], CANVAS, scale, dx, dy)


def estimate_foreground(placed: dict) -> np.ndarray:
    """F estimat cu pymatting (estimate_foreground_ml) pe referința așezată și alpha. Depinde doar de produs, nu de fundal,
    deci se calculează o dată per produs. În afara benzii E nu se folosește (compose le ia pe L din referință)."""
    from pymatting import estimate_foreground_ml  # import târziu

    img = placed["ref"].astype(np.float64) / 255.0
    a = placed["alpha"].astype(np.float64) / 255.0
    f = estimate_foreground_ml(img, a)
    return np.rint(np.clip(f, 0.0, 1.0) * 255.0).astype(np.uint8)


def gradient_bg(top: tuple[int, int, int], bottom: tuple[int, int, int]) -> np.ndarray:
    t = np.linspace(0.0, 1.0, CANVAS[1])[:, None, None]
    col = np.array(top, dtype=np.float64) * (1 - t) + np.array(bottom, dtype=np.float64) * t
    return np.rint(np.broadcast_to(col, (CANVAS[1], CANVAS[0], 3))).astype(np.uint8).copy()


def flat_bg(rgb: tuple[int, int, int]) -> np.ndarray:
    return np.broadcast_to(np.array(rgb, dtype=np.uint8), (CANVAS[1], CANVAS[0], 3)).copy()
