"""Verifică un director de zone (zone.json + măști) față de pozele sursă. Doar Pillow + numpy.

Rulare: python -I verify_zones.py --zone-dir <director> --source <poza.jpg>
Iese cu 0 doar dacă TOATE condițiile sunt îndeplinite; orice abatere -> cod 1 și mesaj exact pe stderr.
Condiții: sha256 sursă; hash-urile fișierelor din zone.json; L/E/I/alpha de aceeași mărime cu sursa; L/E/I disjuncte;
fiecare marcaj critic (alpha >= 0,99) 100% în L; I strict în interior (>= 2 px de margine) și la >= 1 px de marcajele critice;
E în banda de 1-3 px; reconstrucția identică cu zones_lib.build_zones.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _lib():
    spec = importlib.util.spec_from_file_location("zones_lib", HERE / "zones_lib.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["zones_lib"] = mod
    spec.loader.exec_module(mod)
    return mod


def verify(zone_dir: Path, source: Path) -> tuple[list[str], dict]:
    """(erori, rezumat). Funcție separată de CLI ca testele să o poată apela direct."""
    zl = _lib()
    from PIL import Image

    errs: list[str] = []
    summary: dict = {}
    zone_dir = Path(zone_dir).resolve()
    try:
        zj = zl.load_zone_json(zone_dir / "zone.json")
    except (OSError, ValueError) as e:
        return [f"ZONE.JSON: {e}"], summary

    src_bytes = Path(source).read_bytes()
    sha = hashlib.sha256(src_bytes).hexdigest()
    if sha != zj.get("source", {}).get("sha256"):
        errs.append(f"SHA256 SURSA: zone.json are {zj.get('source', {}).get('sha256')}, sursa reală {sha}")
    with Image.open(source) as im:
        size = im.size  # (w, h)
    if list(size) != [zj["source"].get("width"), zj["source"].get("height")]:
        declared = f"{zj['source'].get('width')}x{zj['source'].get('height')}"
        errs.append(f"DIMENSIUNI SURSA: zone.json {declared}, reală {size[0]}x{size[1]}")

    loaded: dict = {}
    files = zj.get("files", {})
    for key in ("alpha", "L", "E", "I"):
        if key not in files:
            errs.append(f"LIPSA fișier '{key}' în zone.json")
            continue
        try:
            path = zl.child(zone_dir, files[key]["file"])
            real = zl.sha256_file(path)
        except (OSError, ValueError, KeyError) as e:
            errs.append(f"FISIER {key}: {e}")
            continue
        if real != files[key].get("sha256"):
            errs.append(f"HASH {key}: zone.json {files[key].get('sha256')}, fișier {real}")
            continue
        try:
            loaded[key] = zl.load_gray_png(path) if key == "alpha" else zl.load_mask_png(path)
        except ValueError as e:
            errs.append(f"FISIER {key}: {e}")

    crit_masks: dict = {}
    for c in zj.get("critical", []):
        name = c.get("name", "?")
        try:
            path = zl.child(zone_dir, c["file"])
            real = zl.sha256_file(path)
        except (OSError, ValueError, KeyError) as e:
            errs.append(f"MARCAJ CRITIC '{name}': {e}")
            continue
        if real != c.get("sha256"):
            errs.append(f"HASH marcaj critic '{name}': zone.json {c.get('sha256')}, fișier {real}")
            continue
        try:
            m = zl.load_mask_png(path)
        except ValueError as e:
            errs.append(f"MARCAJ CRITIC '{name}': {e}")
            continue
        if int(m.sum()) != c.get("pixels"):
            errs.append(f"MARCAJ CRITIC '{name}': {int(m.sum())} px în fișier, {c.get('pixels')} în zone.json")
        if c.get("bbox") != zl.bbox_of(m):
            errs.append(f"MARCAJ CRITIC '{name}': bbox din zone.json {c.get('bbox')} != {zl.bbox_of(m)}")
        crit_masks[name] = m
    if not zj.get("critical"):
        errs.append("MARCAJE CRITICE: lista este goală")

    expected = (size[1], size[0])
    for key, arr in loaded.items():
        if arr.shape != expected:
            errs.append(f"DIMENSIUNI {key}: {arr.shape[::-1]} != sursa {expected[::-1]}")
    for name, m in crit_masks.items():
        if m.shape != expected:
            errs.append(f"DIMENSIUNI marcaj '{name}': {m.shape[::-1]} != sursa {expected[::-1]}")

    if not errs and {"alpha", "L", "E", "I"} <= loaded.keys():
        errs += zl.validate_zones(loaded["alpha"], loaded["L"], loaded["E"], loaded["I"], crit_masks, zj.get("params", {}))
        L = loaded["L"]
        lost_by_name = {c["name"]: c.get("lost_alpha_lt_099") for c in zj["critical"]}
        summary = {
            "product": zj.get("product"),
            "size": list(size),
            "L_px": int(L.sum()),
            "E_px": int(loaded["E"].sum()),
            "I_px": int(loaded["I"].sum()),
            "critical": {
                n: {"px": int(m.sum()), "in_L_px": int((m & L).sum()), "alpha_lt_099_px_reported": lost_by_name.get(n)}
                for n, m in crit_masks.items()
            },
        }
    return errs, summary


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zone-dir", required=True, type=Path)
    ap.add_argument("--source", required=True, type=Path)
    args = ap.parse_args()
    errs, summary = verify(args.zone_dir, args.source)
    if errs:
        for e in errs:
            print(f"EROARE: {e}", file=sys.stderr)
        print(f"VERIFICARE ZONE: PICAT ({len(errs)} erori)", file=sys.stderr)
        return 1
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print("VERIFICARE ZONE: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
