"""Funcții pure pentru proba FLUX.2 klein (fără torch, fără modele): rezoluție la multiplu de 16 și validarea căilor."""
from __future__ import annotations

import re
from pathlib import Path

MULTIPLE = 16
_TS_RE = re.compile(r"^\d{8}T\d{6}Z$")


def fit_resolution(canvas: tuple[int, int], target: int, multiple: int = MULTIPLE) -> tuple[int, int]:
    """(lățime, înălțime) pentru generare: latura mare ≈ `target`, păstrând raportul, ambele multipli de `multiple`."""
    cw, ch = canvas
    if min(cw, ch) <= 0 or target <= 0 or multiple <= 0:
        raise ValueError(f"valori invalide: canvas={canvas}, target={target}, multiple={multiple}")
    if target % multiple:
        raise ValueError(f"target={target} nu e multiplu de {multiple}")
    s = target / max(cw, ch)
    w = max(multiple, round(cw * s / multiple) * multiple)
    h = max(multiple, round(ch * s / multiple) * multiple)
    return int(w), int(h)


def require_dir(path: str | Path, what: str) -> Path:
    p = Path(path)
    if not p.is_absolute() or ".." in p.parts:
        raise ValueError(f"{what}: cale absolută fără '..' necesară, primit {str(path)!r}")
    if not p.is_dir():
        raise ValueError(f"{what}: director inexistent {p}")
    return p


def require_file(path: str | Path, what: str, suffixes: tuple[str, ...]) -> Path:
    p = Path(path)
    if not p.is_absolute() or ".." in p.parts:
        raise ValueError(f"{what}: cale absolută fără '..' necesară, primit {str(path)!r}")
    if p.suffix.lower() not in suffixes or not p.is_file():
        raise ValueError(f"{what}: fișier {suffixes} inexistent: {p}")
    return p


def new_run_dir(out_root: str | Path, utc_stamp: str) -> Path:
    """Director NOU `<out_root>/<UTC>`; refuză suprascrierea. `utc_stamp` = YYYYMMDDTHHMMSSZ."""
    if not _TS_RE.match(utc_stamp):
        raise ValueError(f"timestamp invalid: {utc_stamp!r}")
    root = require_dir(out_root, "out-root")
    d = root / utc_stamp
    d.mkdir(exist_ok=False)
    return d
