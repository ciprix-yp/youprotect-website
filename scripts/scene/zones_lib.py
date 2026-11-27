"""Zone L/E/I pentru scene de catalog: bibliotecă deterministă, doar Pillow + numpy.

Definiții (PROJECT_OS/10-SCENE-PRODUS.md, pasul 2):
- P: silueta hard a produsului, alpha >= 128 (0,5).
- I: interior de haină „ghost" (spate interior prin gât/deschideri, etichetă interioară); manechinul îl poate acoperi.
  Strict în interiorul siluetei (I inclus în P erodat cu `i_inset` >= 2 px) și la >= 1 px de orice marcaj critic.
- C (marcajele critice): fiecare mască este deja intersectată cu alpha >= 0,99 (>= 253 pe 8 biți); toate intră în L.
- L = (erode(P, erode_r) \\ I) U C       (nucleul blocat)
- E = (dilate(P, band_out) \\ erode(P, band_in)) \\ I \\ L   (banda de margine, alpha-blending la compunere)
- L, E, I sunt disjuncte.

Fără scipy/cv2/torch: rulează în teste cu `uv run --no-project --with pillow --with numpy`.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

SILHOUETTE_THR = 128  # alpha8 >= 128  <=> alpha >= 0,5
SOLID_THR = 253  # alpha8 >= 253  <=> alpha >= 0,99 (0,99 * 255 = 252,45)
SCHEMA = 1
MAX_BAND_IN = 3
MAX_BAND_OUT = 1
MIN_I_INSET = 2
MIN_I_CRIT_GAP = 1

DEFAULT_PARAMS = {"erode_r": 3, "band_in": 3, "band_out": 1, "i_inset": 3, "crit_dilate": 2}


# ---------------------------------------------------------------- morfologie (disc, numpy)

def disc_offsets(r: int) -> list[tuple[int, int]]:
    if r < 0:
        raise ValueError("raza trebuie să fie >= 0")
    return [(dx, dy) for dy in range(-r, r + 1) for dx in range(-r, r + 1) if dx * dx + dy * dy <= r * r]


def erode(mask: np.ndarray, r: int) -> np.ndarray:
    """Erodare cu nucleu disc de rază r; în afara imaginii = fundal."""
    m = np.asarray(mask, dtype=bool)
    if r == 0:
        return m.copy()
    h, w = m.shape
    p = np.pad(m, r, constant_values=False)
    out = np.ones_like(m)
    for dx, dy in disc_offsets(r):
        out &= p[r + dy : r + dy + h, r + dx : r + dx + w]
    return out


def dilate(mask: np.ndarray, r: int) -> np.ndarray:
    m = np.asarray(mask, dtype=bool)
    if r == 0:
        return m.copy()
    h, w = m.shape
    p = np.pad(m, r, constant_values=False)
    out = np.zeros_like(m)
    for dx, dy in disc_offsets(r):
        out |= p[r + dy : r + dy + h, r + dx : r + dx + w]
    return out


# ---------------------------------------------------------------- construcția zonelor

def silhouette(alpha8: np.ndarray) -> np.ndarray:
    return alpha8 >= SILHOUETTE_THR


def solid(alpha8: np.ndarray) -> np.ndarray:
    return alpha8 >= SOLID_THR


def effective_critical(raw: np.ndarray, alpha8: np.ndarray) -> tuple[np.ndarray, int]:
    """Masca critică efectivă (raw AND alpha >= 0,99) și numărul pixelilor critici cu alpha < 0,99 (raportați, nu ascunși)."""
    raw = np.asarray(raw, dtype=bool)
    eff = raw & solid(alpha8)
    return eff, int((raw & ~eff).sum())


def build_zones(
    alpha8: np.ndarray, interior: np.ndarray, critical: list[np.ndarray], params: dict,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(L, E, I) din alpha, I-regiunea brută, măștile critice efective și parametri."""
    p = {**DEFAULT_PARAMS, **params}
    P = silhouette(alpha8)
    crit = np.zeros_like(P)
    for c in critical:
        crit |= np.asarray(c, dtype=bool)
    Iz = np.asarray(interior, dtype=bool) & erode(P, p["i_inset"]) & ~dilate(crit, MIN_I_CRIT_GAP)
    L = (erode(P, p["erode_r"]) & ~Iz) | crit
    band = dilate(P, p["band_out"]) & ~erode(P, p["band_in"])
    E = band & ~Iz & ~L
    return L, E, Iz


# ---------------------------------------------------------------- validare

def validate_zones(
    alpha8: np.ndarray, L: np.ndarray, E: np.ndarray, Iz: np.ndarray, critical: dict[str, np.ndarray], params: dict,
) -> list[str]:
    """Lista erorilor (goală = valid). Mesajele încep cu un cod stabil în MAJUSCULE."""
    errs: list[str] = []
    shapes = {alpha8.shape, L.shape, E.shape, Iz.shape, *(m.shape for m in critical.values())}
    if len(shapes) != 1:
        return [f"DIMENSIUNI: formele diferă: {sorted(shapes)}"]
    L, E, Iz = (np.asarray(m, dtype=bool) for m in (L, E, Iz))
    P = silhouette(alpha8)

    for a, b, name in ((L, E, "L/E"), (L, Iz, "L/I"), (E, Iz, "E/I")):
        n = int((a & b).sum())
        if n:
            errs.append(f"SUPRAPUNERE {name}: {n} px comuni")

    crit_union = np.zeros_like(P)
    for name, m in critical.items():
        m = np.asarray(m, dtype=bool)
        crit_union |= m
        not_solid = int((m & ~solid(alpha8)).sum())
        if not_solid:
            errs.append(f"MARCAJ CRITIC '{name}': {not_solid} px cu alpha < 0,99 în masca efectivă")
        out = int((m & ~L).sum())
        if out:
            errs.append(f"MARCAJ CRITIC IESE DIN L '{name}': {out} px din {int(m.sum())} în afara L")

    if int((L & ~P).sum()):
        errs.append(f"L IN AFARA SILUETEI: {int((L & ~P).sum())} px")
    if int((Iz & ~P).sum()):
        errs.append(f"I IN AFARA SILUETEI: {int((Iz & ~P).sum())} px")

    inset = int(params.get("i_inset", -1))
    if inset < MIN_I_INSET:
        errs.append(f"PARAMETRU i_inset={inset} < {MIN_I_INSET}")
    inner = erode(P, MIN_I_INSET)
    bad = int((Iz & ~inner).sum())
    if bad:
        errs.append(f"I ATINGE MARGINEA SILUETEI: {bad} px la < {MIN_I_INSET} px de marginea exterioară")
    touch = int((Iz & dilate(crit_union, MIN_I_CRIT_GAP)).sum())
    if touch:
        errs.append(f"I ATINGE MASCA CRITICA: {touch} px la < {MIN_I_CRIT_GAP + 1} px de un marcaj critic")

    band_in, band_out = int(params.get("band_in", -1)), int(params.get("band_out", -1))
    if not (1 <= band_in <= MAX_BAND_IN) or not (0 <= band_out <= MAX_BAND_OUT):
        errs.append(f"PARAMETRI BANDA E: band_in={band_in} (1..{MAX_BAND_IN}), band_out={band_out} (0..{MAX_BAND_OUT})")
    else:
        band = dilate(P, band_out) & ~erode(P, band_in)
        n = int((E & ~band).sum())
        if n:
            errs.append(f"E IN AFARA BANDEI: {n} px în afara benzii [-{band_in}, +{band_out}] px față de siluetă")
    if not E.any():
        errs.append("E GOALA")
    if not L.any():
        errs.append("L GOALA")

    if not errs:
        # reconstrucție: L/E/I trebuie să fie exact ce produce biblioteca din (alpha, I, critice, parametri)
        L2, E2, I2 = build_zones(alpha8, Iz, list(critical.values()), params)
        for nm, a, b in (("L", L, L2), ("E", E, E2), ("I", Iz, I2)):
            n = int((a != b).sum())
            if n:
                errs.append(f"RECONSTRUCTIE {nm}: {n} px diferă de rezultatul build_zones")
    return errs


# ---------------------------------------------------------------- I/O

def safe_name(name: str) -> str:
    """Nume de fișier relativ simplu (fără separatori, fără ..); ridică ValueError altfel."""
    if not isinstance(name, str) or not name or name in (".", "..") or "/" in name or "\\" in name or "\0" in name:
        raise ValueError(f"nume de fișier nepermis: {name!r}")
    return name


def child(base: Path, name: str) -> Path:
    """Cale relativă (componente simple separate cu '/') care rămâne sub `base`, simbolurile rezolvate."""
    if not isinstance(name, str) or not name:
        raise ValueError(f"nume de fișier nepermis: {name!r}")
    root = Path(base).resolve()
    p = root.joinpath(*[safe_name(part) for part in name.split("/")]).resolve()
    if root not in p.parents:
        raise ValueError(f"cale în afara directorului: {name!r}")
    return p


def sha256_file(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save_mask_png(path: Path, mask: np.ndarray) -> str:
    """Salvează o mască booleană ca PNG 8 biți (0/255); întoarce sha256 al fișierului."""
    arr = (np.asarray(mask, dtype=bool).astype(np.uint8)) * 255
    Image.fromarray(arr, mode="L").save(path, format="PNG")
    return sha256_file(path)


def save_alpha_png(path: Path, alpha8: np.ndarray) -> str:
    Image.fromarray(np.asarray(alpha8, dtype=np.uint8), mode="L").save(path, format="PNG")
    return sha256_file(path)


def load_gray_png(path: Path) -> np.ndarray:
    with Image.open(path) as im:
        if im.format != "PNG" or im.mode != "L":
            raise ValueError(f"{path}: se așteaptă PNG 8 biți (L), găsit {im.format}/{im.mode}")
        im.load()
        return np.asarray(im, dtype=np.uint8).copy()


def load_mask_png(path: Path) -> np.ndarray:
    a = load_gray_png(path)
    if np.any((a != 0) & (a != 255)):
        raise ValueError(f"{path}: masca trebuie să conțină doar 0/255")
    return a == 255


def bbox_of(mask: np.ndarray) -> list[int] | None:
    """[x0, y0, x1, y1) sau None dacă masca e goală."""
    ys, xs = np.nonzero(mask)
    if ys.size == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def load_zone_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if data.get("schema") != SCHEMA:
        raise ValueError(f"zone.json: schema {data.get('schema')!r} != {SCHEMA}")
    return data


def write_zone_json(path: Path, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, sort_keys=True)
        f.write("\n")
