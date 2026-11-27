"""Legături de integritate între fișă, imagine, sursă, zone și registru (Fix-1a): numpy + Pillow + stdlib, fără modele.

- `load_zone_checked`: zonele se încarcă DOAR prin numele din `zone.json` (nu prin glob), cu sha256 comparat la citire pe aceiași octeți
  din care se decodează masca (fără fereastră între verificare și folosire);
- `verify_candidate_binding`: înainte să reutilizeze o fișă T3a/T5a sau să facă o planșă, re-hash-uiește `master.png` și `raw_768.png`
  (față de `sha256_master`/`sha256_raw`), sursa (față de `sha256_sursa`), zonele L/E/I și masca (față de `sha256_L/E/I/masca`) și compară
  sha256 al fișierului fișei cu `fisa_sha256` din ULTIMA linie a registrului pentru candidat. Orice nepotrivire = `IntegrityError`.
  Fișele vechi (T5a, fără `sha256_master`) sunt refuzate (fail-closed) sau, cu `legacy=True`, acceptate marcat (`legacy` în rezultat);
- `check_product_binding`: produsul cerut = produsul din `zone.json` = produsul din `zone_specs.json`, iar sursa din `zone.json` e a produsului.
"""
# ruff: noqa: E501
from __future__ import annotations

import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I nu pune directorul scriptului pe sys.path
import compose_lib as cl  # noqa: E402
import fisa_lib as fl  # noqa: E402
import zones_lib as zl  # noqa: E402

T3A_REQUIRED = ("transform", "identity_master", "mirror", "scale_not_up", "halo", "color_spill", "decor_fluo")
HERE = Path(__file__).resolve().parent


class IntegrityError(ValueError):
    pass


def sha_arr(a: np.ndarray) -> str:
    """Același hash ca în fișele T5a: biți împachetați + forma."""
    return hashlib.sha256(np.packbits(np.asarray(a, dtype=bool)).tobytes() + str(a.shape).encode()).hexdigest()


def write_new_text(path: str | Path, text: str) -> None:
    """Scriere cu mod EXCLUSIV (`"x"`): pică cu SystemExit dacă fișierul există (nu suprascrie nici dacă a apărut după o verificare anterioară)."""
    try:
        with open(path, "x", encoding="utf-8") as fh:
            fh.write(text)
    except FileExistsError as e:
        raise SystemExit(f"{path} există: nu se suprascrie") from e


def file_sha(p: str | Path) -> str:
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load_zone_checked(zone_dir: str | Path, keys: tuple[str, ...] = ("alpha", "L", "E", "I"), critical: bool = True) -> dict:
    """Încarcă zonele numite în `zone.json["files"]` (și, cu `critical`, `zone.json["critical"]`), fiecare cu sha256 verificat pe octeții citiți.
    Fișierele din director care nu sunt în zone.json NU se încarcă. Întoarce {alpha, L, E, I, critical{nume: mască}, zone_json}."""
    zdir = Path(zone_dir).resolve()
    try:
        zj = json.loads((zdir / "zone.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise IntegrityError(f"zone.json ilizibil în {zdir}: {e}") from e
    out: dict = {"zone_json": zj}

    def read(entry: object, what: str) -> bytes:
        if not isinstance(entry, dict) or not isinstance(entry.get("file"), str) or not isinstance(entry.get("sha256"), str):
            raise IntegrityError(f"zone.json: intrarea {what} fără file/sha256")
        try:
            data = zl.child(zdir, entry["file"]).read_bytes()
        except (OSError, ValueError) as e:
            raise IntegrityError(f"zone.json: {what}: {e}") from e
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise IntegrityError(f"zone.json: sha256 {what} nu corespunde fișierului {entry['file']}")
        return data

    files = zj.get("files", {})
    for k in keys:
        if k not in files:
            raise IntegrityError(f"zone.json: lipsește fișierul {k!r}")
        data = read(files[k], k)
        try:
            out[k] = zl.load_gray_png(io.BytesIO(data)) if k == "alpha" else zl.load_mask_png(io.BytesIO(data))
        except ValueError as e:
            raise IntegrityError(f"zone.json: {k}: {e}") from e
    if critical:
        crit: dict = {}
        for c in zj.get("critical", []):
            name = c.get("name")
            if not isinstance(name, str) or not name:
                raise IntegrityError("zone.json: marcaj critic fără nume")
            try:
                crit[name] = zl.load_mask_png(io.BytesIO(read(c, f"critic {name}")))
            except ValueError as e:
                raise IntegrityError(f"zone.json: critic {name}: {e}") from e
        out["critical"] = crit
    return out


def check_product_binding(product: str, zone_json: dict, specs: dict, source_path: str | Path | None = None) -> list[str]:
    """Erori (listă goală = legat corect): `product` = zone.json["product"] și există în zone_specs.json, iar sursa din zone.json
    (`source.path`) = sursa produsului din specificații (și, dacă e dat, numele fișierului sursă real = acela)."""
    errs: list[str] = []
    if zone_json.get("product") != product:
        errs.append(f"produs cerut {product!r} ≠ produs din zone.json {zone_json.get('product')!r}")
    spec = next((p for p in specs.get("products", []) if p.get("id") == product), None)
    if spec is None:
        errs.append(f"produsul {product!r} nu există în zone_specs.json")
        return errs
    zpath = (zone_json.get("source") or {}).get("path")
    if zpath != spec.get("source"):
        errs.append(f"sursa din zone.json {zpath!r} ≠ sursa produsului {product} din zone_specs.json {spec.get('source')!r}")
    if source_path is not None and Path(source_path).name != Path(str(spec.get("source"))).name:
        errs.append(f"fișierul sursă {Path(source_path).name!r} nu e sursa produsului {product} ({spec.get('source')!r})")
    return errs


def load_specs() -> dict:
    return json.loads((HERE / "zone_specs.json").read_text(encoding="utf-8"))


def verify_candidate_binding(cdir: str | Path, fisa_name: str, source: str | Path, zones_dir: str | Path, registry: str | Path,
                             legacy: bool = False) -> dict:
    """Verifică legăturile fișă <-> master/raw/sursă/zone/registru. Întoarce {fisa, raw (octeții fișei), master_bytes, masks, zone_json, legacy,
    sha256_master, sha256_raw}; ridică `IntegrityError` cu TOATE nepotrivirile. Orice fișier e citit o singură dată (octeții verificați sunt cei folosiți)."""
    cdir = Path(cdir)
    errs: list[str] = []
    if not fl.FILENAME_RE.fullmatch(fisa_name):
        raise IntegrityError(f"nume de fișă invalid: {fisa_name!r}")
    try:
        raw = (cdir / fisa_name).read_bytes()
        fisa = json.loads(raw)
    except (OSError, ValueError) as e:
        raise IntegrityError(f"{cdir.name}: fișa {fisa_name} ilizibilă: {e}") from e
    name = cdir.name
    if fisa.get("candidat") != name:
        errs.append(f"fișa e a candidatului {fisa.get('candidat')!r}, directorul e {name!r}")
    # registru: lanț valid + hash-ul fișei = ultima linie a candidatului
    rerr = fl.verify_registry(registry)
    if rerr:
        errs.append("registru invalid: " + "; ".join(rerr[:3]))
    reg_sha = fl.registry_sha_for(registry, str(fisa.get("candidat")), fisa_name)
    if reg_sha is None:
        errs.append(f"{fisa_name}: nicio linie în registru pentru {name}")
    elif reg_sha != fl.sha256_bytes(raw):
        errs.append(f"{fisa_name}: sha256 al fișei ≠ fisa_sha256 din registru (fișă modificată după înregistrare)")
    # master / raw
    try:
        master_bytes = (cdir / "master.png").read_bytes()
    except OSError as e:
        raise IntegrityError(f"{name}: master.png ilizibil: {e}") from e
    sha_master = fl.sha256_bytes(master_bytes)
    try:
        sha_raw = file_sha(cdir / "raw_768.png")
    except OSError:
        sha_raw = None
    is_legacy = False
    for field, got in (("sha256_master", sha_master), ("sha256_raw", sha_raw)):
        want = fisa.get(field)
        if want is None:
            if legacy:
                is_legacy = True
            else:
                errs.append(f"fișă veche: lipsește {field} (refuzat; --legacy o acceptă marcat, cu rezultat global fals)")
        elif want != got:
            errs.append(f"{field}: fișa {str(want)[:12]}… ≠ fișierul de pe disc {str(got)[:12]}… (imaginea acceptată nu e cea de pe disc)")
    # sursa
    try:
        src_sha = file_sha(source)
    except OSError as e:
        raise IntegrityError(f"{name}: sursa ilizibilă: {e}") from e
    if fisa.get("sha256_sursa") != src_sha:
        errs.append(f"sha256_sursa: fișa {str(fisa.get('sha256_sursa'))[:12]}… ≠ sursa reală {src_sha[:12]}…")
    # zone: L/E/I (+ masca) comparate cu cele încărcate din zone.json
    masks: dict = {}
    zone_json: dict = {}
    try:
        z = load_zone_checked(zones_dir, ("L", "E", "I"), critical=False)
        zone_json = z.pop("zone_json")
        masks = z
    except IntegrityError as e:
        errs.append(str(e))
    if masks:
        if fisa.get("scara") != 1.0 or fisa.get("deplasare") != {"dx": 0, "dy": 0} or fisa.get("flip") is not False:
            errs.append("plasare nestandard (scara≠1, deplasare≠0 sau flip): hash-urile zonelor nu se pot lega de zonele încărcate")
        for k in "LEI":
            if fisa.get(f"sha256_{k}") != sha_arr(masks[k]):
                errs.append(f"sha256_{k}: fișa ≠ zona încărcată din zone.json")
        if fisa.get("sha256_masca") != hashlib.sha256(cl.inpaint_mask(masks["L"], masks["E"]).tobytes()).hexdigest():
            errs.append("sha256_masca: fișa ≠ masca de umplere recalculată din zonele încărcate")
    if errs:
        raise IntegrityError(f"{name}: " + " | ".join(errs))
    return {"fisa": fisa, "raw": raw, "master_bytes": master_bytes, "masks": masks, "zone_json": zone_json, "legacy": is_legacy,
            "sha256_master": sha_master, "sha256_raw": sha_raw}


def missing_t3a(verificari: list[dict]) -> list[str]:
    have = {c.get("name") for c in verificari if isinstance(c, dict)}
    return [n for n in T3A_REQUIRED if n not in have]
