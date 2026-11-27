"""Fișa per candidat + registrul append-only cu lanț de hash-uri: doar stdlib.

- `build_fisa(...)` construiește fișa și calculează `rezultat_global` (acceptat doar dacă TOATE verificările au passed is True
  și există cel puțin una);
- `write_fisa(cand_dir, fisa, registry_path, base_dir)` validează, scrie `<cand_dir>/fisa.json` atomic (fișier temporar +
  hard link fără suprascriere), REFUZĂ o fișă existentă, apoi adaugă O linie în registru;
- `registru.jsonl`: o linie JSON compactă pe candidat, cu `prev_sha256` = sha256 al liniei anterioare (fără newline;
  64 de zerouri la prima). `verify_registry` pică dacă o linie veche e modificată sau ștearsă. Limită: alterarea sau
  ștergerea ULTIMEI linii nu rupe lanțul (nu mai există o linie următoare); se prinde comparând cu fisa.json (`fisa_sha256`).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any

try:  # fcntl există pe macOS/Linux; fără el scrierea rămâne corectă pentru un singur proces
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None  # type: ignore[assignment]

ZERO = "0" * 64
HEX64 = re.compile(r"^[0-9a-f]{64}$")
CHECK_KEYS = ("name", "value", "threshold", "passed", "detail")
SHA_FIELDS = ("sha256_sursa", "sha256_masca", "sha256_L", "sha256_E", "sha256_I", "sha256_cod")
REQUIRED = (
    "candidat", "produs", *SHA_FIELDS, "model", "seed", "prompt", "context", "scara", "deplasare", "flip",
    "rotate_deg", "canvas", "verificari", "timp_generare_s", "data", "rezultat_global",
)


class FisaError(ValueError):
    pass


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_code(files: list[str | Path]) -> str:
    """Hash peste fișierele scripturilor: pentru fiecare, în ordinea numelor de bază, nume + 0x00 + conținut + 0x00."""
    h = hashlib.sha256()
    for p in sorted((Path(f) for f in files), key=lambda x: (x.name, str(x))):
        h.update(p.name.encode() + b"\0" + p.read_bytes() + b"\0")
    return h.hexdigest()


def compute_global(verificari: Any) -> bool:
    if not isinstance(verificari, list) or not verificari:
        return False
    return all(isinstance(v, dict) and v.get("passed") is True for v in verificari)


def build_fisa(**fields: Any) -> dict:
    """Fișa din câmpuri (vezi REQUIRED, `prompt_negativ` opțional). `data` implicit = acum, UTC. `rezultat_global` se
    calculează mereu (orice valoare dată e ignorată)."""
    f = dict(fields)
    f.setdefault("data", dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    f["rezultat_global"] = compute_global(f.get("verificari"))
    validate_fisa(f)
    return f


def validate_fisa(f: dict) -> None:
    if not isinstance(f, dict):
        raise FisaError("fișa trebuie să fie dict")
    missing = [k for k in REQUIRED if k not in f]
    if missing:
        raise FisaError(f"câmpuri obligatorii lipsă: {', '.join(missing)}")
    for k in ("candidat", "produs", "prompt", "context"):
        if not isinstance(f[k], str) or not f[k]:
            raise FisaError(f"câmpul {k} trebuie să fie un șir nenul")
    for k in SHA_FIELDS:
        if not isinstance(f[k], str) or not HEX64.match(f[k]):
            raise FisaError(f"câmpul {k} trebuie să fie sha256 (64 hex minuscule)")
    m = f["model"]
    if not isinstance(m, dict) or not all(isinstance(m.get(k), str) and m.get(k) for k in ("id", "revizie", "sha256")):
        raise FisaError("model trebuie să aibă id, revizie, sha256 (șiruri nenule)")
    if not HEX64.match(m["sha256"]):
        raise FisaError("model.sha256 (weights) trebuie să fie 64 hex minuscule")
    if "prompt_negativ" in f and not isinstance(f["prompt_negativ"], str):
        raise FisaError("prompt_negativ trebuie să fie șir")
    for k in ("seed", "scara", "rotate_deg", "timp_generare_s"):
        if isinstance(f[k], bool) or not isinstance(f[k], (int, float)):
            raise FisaError(f"câmpul {k} trebuie să fie număr")
    if isinstance(f["seed"], float):
        raise FisaError("seed trebuie să fie întreg")
    d = f["deplasare"]
    if not isinstance(d, dict) or not all(isinstance(d.get(k), int) and not isinstance(d.get(k), bool) for k in ("dx", "dy")):
        raise FisaError("deplasare trebuie să fie {dx, dy} întregi")
    if not isinstance(f["flip"], bool):
        raise FisaError("flip trebuie să fie bool")
    c = f["canvas"]
    if not isinstance(c, dict) or not all(isinstance(c.get(k), int) and c[k] > 0 for k in ("w", "h")):
        raise FisaError("canvas trebuie să fie {w, h} întregi pozitivi")
    v = f["verificari"]
    if not isinstance(v, list):
        raise FisaError("verificari trebuie să fie listă")
    for i, item in enumerate(v):
        if not isinstance(item, dict) or any(k not in item for k in CHECK_KEYS):
            raise FisaError(f"verificari[{i}] trebuie să aibă cheile {CHECK_KEYS}")
        if not isinstance(item["name"], str) or not isinstance(item["passed"], bool):
            raise FisaError(f"verificari[{i}]: name șir, passed bool")
    try:
        dt.datetime.strptime(f["data"], "%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError) as e:
        raise FisaError("data trebuie să fie UTC ISO 'YYYY-MM-DDTHH:MM:SSZ'") from e
    if f["rezultat_global"] is not compute_global(v):
        raise FisaError(f"rezultat_global={f['rezultat_global']!r} contrazice verificările (calculat: {compute_global(v)})")


def _under(base: Path, p: str | Path, what: str) -> Path:
    if ".." in Path(p).parts or "\0" in str(p):
        raise FisaError(f"{what}: cale cu '..' sau NUL refuzată: {str(p)!r}")
    root = Path(base).resolve()
    r = Path(p).resolve()
    if root not in r.parents:
        raise FisaError(f"{what}: {str(p)!r} nu e sub {str(base)!r}")
    return r


def _line_for(fisa: dict, fisa_sha: str, seq: int, prev: str) -> str:
    rec = {"seq": seq, "candidat": fisa["candidat"], "produs": fisa["produs"], "data": fisa["data"],
           "rezultat_global": fisa["rezultat_global"], "fisa_sha256": fisa_sha, "prev_sha256": prev}
    return json.dumps(rec, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def write_fisa(cand_dir: str | Path, fisa: dict, registry_path: str | Path, base_dir: str | Path) -> Path:
    """Scrie fișa atomic și o înregistrează. `cand_dir` și `registry_path` trebuie să fie sub `base_dir`."""
    validate_fisa(fisa)
    cdir = _under(base_dir, cand_dir, "cand_dir")
    reg = _under(base_dir, registry_path, "registry_path")
    cdir.mkdir(parents=True, exist_ok=True)
    final = cdir / "fisa.json"
    if final.exists() or final.is_symlink():
        raise FisaError(f"fișa există deja, nu se suprascrie: {final}")
    data = (json.dumps(fisa, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
    fd, tmp = tempfile.mkstemp(prefix=".fisa-", suffix=".tmp", dir=cdir)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        try:
            os.link(tmp, final)  # atomic și fără suprascriere (eșuează dacă între timp a apărut o fișă)
        except FileExistsError as e:
            raise FisaError(f"fișa există deja, nu se suprascrie: {final}") from e
    finally:
        os.unlink(tmp)
    append_registry(reg, fisa, sha256_bytes(data))
    return final


def append_registry(reg: Path, fisa: dict, fisa_sha: str) -> None:
    reg.parent.mkdir(parents=True, exist_ok=True)
    with open(reg, "ab+") as fh:  # mod append: nu rescrie niciodată liniile vechi
        if fcntl is not None:
            fcntl.flock(fh, fcntl.LOCK_EX)
        fh.seek(0)
        lines = [ln for ln in fh.read().split(b"\n") if ln]
        prev = sha256_bytes(lines[-1]) if lines else ZERO
        line = _line_for(fisa, fisa_sha, len(lines) + 1, prev)
        fh.write(line.encode("utf-8") + b"\n")
        fh.flush()
        os.fsync(fh.fileno())


def verify_registry(path: str | Path) -> list[str]:
    """Lista erorilor (goală = lanț valid). Un registru lipsă e eroare."""
    p = Path(path)
    if not p.is_file():
        return [f"registru lipsă: {p}"]
    errs: list[str] = []
    prev = ZERO
    for i, raw in enumerate([ln for ln in p.read_bytes().split(b"\n") if ln], start=1):
        try:
            rec = json.loads(raw)
        except ValueError:
            errs.append(f"linia {i}: JSON invalid")
            prev = sha256_bytes(raw)
            continue
        if rec.get("seq") != i:
            errs.append(f"linia {i}: seq={rec.get('seq')!r}, așteptat {i} (linie ștearsă sau inserată)")
        if rec.get("prev_sha256") != prev:
            errs.append(f"linia {i}: prev_sha256 nu corespunde liniei {i - 1} (linie anterioară modificată sau ștearsă)")
        prev = sha256_bytes(raw)
    return errs
