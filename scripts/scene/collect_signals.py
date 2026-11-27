"""Colectează semnalele brute ale modelelor (T5b) pentru un set de imagini și le scrie într-un JSON NOU (nu suprascrie).

Seturi:
  controls   pozele reale cu oameni din src/data/poze-actiune.json (public/images/actiune, lățimea 960 și p960 dacă există),
             fără pozele fără oameni (M21 jachetă pe masă, M22 mașină de brodat, S17 bocanc pe tambur) + variantele derivate „mic”
             (aceeași poză la 35% pe gri, ca să fie oameni mici în cadru) și „jos” (jumătatea de jos, fără față; diagnostic);
  negatives  cele 3 packshot-uri (fără zone, fără OCR/SAM);
  candidates cei 90 de candidați din <scene>/cand/*/master.png (cu zone, sursă, OCR pe logo/decor, segment SAM).

Rulare (vezi README): python -I collect_signals.py --set controls --models-dir <m> --scene-dir <scene> --out <json nou> [--stages faces siglip qwen ...]
"""
# ruff: noqa: E501
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE))
import models_runtime as mr  # noqa: E402

NO_PEOPLE = {"M21", "M22", "S17"}  # poze de acțiune fără oameni (verificat din alt): nu sunt controale
PRODUCTS = ("S476YE", "BZ739OR", "FD25BK")


def label_set(product: str | None) -> str:
    return "bocanc" if product == "FD25BK" else "haine"


def control_items(derived_dir: Path) -> list[dict]:
    data = json.loads((REPO / "src/data/poze-actiune.json").read_text(encoding="utf-8"))
    img_dir = REPO / "public/images/actiune"
    items = []
    derived_dir.mkdir(parents=True, exist_ok=True)
    for d in data:
        if d["id"] in NO_PEOPLE:
            continue
        for tag in ("960", "p960"):
            f = img_dir / f"{d['slug']}-{tag}.webp"
            if not f.is_file():
                continue
            rel = f.relative_to(REPO).as_posix()
            items.append({"id": f"{d['id']}-{tag}", "path": str(f), "kind": "control", "rel": rel, "variant": "original"})
            if tag != "960":
                continue
            rgb = mr.load_rgb(f)
            h, w = rgb.shape[:2]
            small = np.asarray(Image.fromarray(rgb).resize((round(w * 0.35), round(h * 0.35)), Image.LANCZOS))
            canvas = np.full_like(rgb, 128)
            y0, x0 = (h - small.shape[0]) // 2, (w - small.shape[1]) // 2
            canvas[y0:y0 + small.shape[0], x0:x0 + small.shape[1]] = small
            low = rgb[int(h * 0.55):]
            for name, arr in (("mic", canvas), ("jos", low)):
                p = derived_dir / f"{d['id']}-{name}.png"
                if not p.exists():
                    Image.fromarray(arr).save(p)
                items.append({"id": f"{d['id']}-{name}", "path": str(p), "kind": "control", "rel": rel, "variant": name})
    return items


def negative_items(scene: Path) -> list[dict]:
    return [{"id": f"packshot-{p}", "path": str(scene.parent / "images/portwest" / f"{p}.jpg"), "kind": "packshot", "product": p} for p in PRODUCTS]


def candidate_items(scene: Path) -> list[dict]:
    items = []
    for d in sorted((scene / "cand").iterdir()):
        if d.is_dir() and (d / "master.png").is_file():
            p = d.name.split("-", 1)[0]
            items.append({"id": d.name, "path": str(d / "master.png"), "kind": "candidat", "product": p,
                          "zones_dir": str(scene / p / "zones"), "source": str(scene.parent / "images/portwest" / f"{p}.jpg")})
    return items


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True, choices=["controls", "negatives", "candidates"])
    ap.add_argument("--models-dir", required=True, type=Path)
    ap.add_argument("--scene-dir", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--derived-dir", type=Path, default=None)
    ap.add_argument("--stages", nargs="+", default=["faces", "siglip", "qwen"], choices=list(mr.STAGES))
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    if a.out.exists():
        raise SystemExit(f"{a.out} există: nu se suprascrie")
    if a.set == "controls":
        items = control_items(a.derived_dir or a.out.parent / "controls_derived")
    elif a.set == "negatives":
        items = negative_items(a.scene_dir)
    else:
        items = candidate_items(a.scene_dir)
    if a.limit:
        items = items[:a.limit]
    sig, models, times = mr.collect(a.models_dir, items, a.stages, lambda m: print(m, flush=True))
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps({"set": a.set, "items": items, "signals": sig, "models": models, "times_s": times}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"scris {a.out}: {len(items)} imagini, etape {a.stages}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
