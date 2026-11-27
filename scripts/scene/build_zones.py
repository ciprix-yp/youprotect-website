"""Construiește matte-ul și zonele L/E/I + cutiile critice pentru un produs (T2b).

Rulare (mediul uv din T2a, vezi README.md):
  python -I build_zones.py --source <poza.jpg> --spec zone_specs.json --product <id> --models-dir <dir> --out <director NOU>

Pași: sha256 sursă -> matte BiRefNet + matte prin prag pe alb (comparate) -> alegerea din spec -> SAM 2.1 pentru marcaje și I
-> L/E/I cu zones_lib -> scrie în --out: matte_birefnet.png, matte_prag.png, alpha.png, L.png, E.png, I.png, critical/*.png,
zone.json, zone_overlay.png. Fără rețea, fără pickle, fără remote code. Verificarea: verify_zones.py.
"""
from __future__ import annotations

import argparse
import gc
import hashlib
import importlib.util
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


zl = _load("zones_lib")


# ---------------------------------------------------------------- căi

def checked(p: Path) -> Path:
    if ".." in Path(p).parts:
        raise SystemExit(f"cale cu '..' refuzată: {p}")
    return Path(p).resolve()


def check_rel(rel: str) -> Path:
    r = Path(rel)
    if r.is_absolute() or ".." in r.parts or not r.parts:
        raise SystemExit(f"cale relativă nepermisă în spec: {rel!r}")
    return r


# ---------------------------------------------------------------- matte

def threshold_matte(rgb, lo: float):
    """Matte pe fond alb: deficitul față de alb, componenta conexă cea mai mare, găuri umplute.

    Alpha moale doar în inelul de margine (2 px în interior, 2 px în exterior)."""
    import numpy as np
    from scipy import ndimage as ndi

    d = (255 - rgb.astype(np.int16)).max(axis=2).astype(np.float32)
    H = d >= lo
    H = ndi.binary_fill_holes(H)
    lab, n = ndi.label(H)
    if n > 1:
        sizes = ndi.sum(H, lab, index=np.arange(1, n + 1))
        H = lab == (int(np.argmax(sizes)) + 1)
    H = ndi.binary_fill_holes(H)
    dl = ndi.maximum_filter(d, size=7)
    soft = np.clip(d / np.maximum(0.85 * dl, 1.0), 0.0, 1.0)
    ring = zl.dilate(H, 2) & ~zl.erode(H, 2)
    alpha = np.zeros(d.shape, dtype=np.float32)
    alpha[zl.erode(H, 2)] = 1.0
    alpha[ring] = soft[ring]
    a8 = np.round(alpha * 255).astype(np.uint8)
    return keep_largest(a8)


def keep_largest(a8):
    """Păstrează doar cea mai mare componentă (8-conexă) a siluetei și un inel de 1 px în jurul ei; restul devine 0."""
    import numpy as np
    from scipy import ndimage as ndi

    P = a8 >= zl.SILHOUETTE_THR
    lab, n = ndi.label(P, structure=np.ones((3, 3), dtype=bool))
    if n > 1:
        sizes = ndi.sum(P, lab, index=np.arange(1, n + 1))
        P = lab == (int(np.argmax(sizes)) + 1)
    out = a8.copy()
    out[~zl.dilate(P, 1)] = 0
    return out


def birefnet_solid(a_bire):
    """BiRefNet cu interiorul forțat opac: siluetă și margine moale din BiRefNet, pixelii la >= 2 px de margine devin 255."""
    out = a_bire.copy()
    out[zl.erode(a_bire >= zl.SILHOUETTE_THR, 2)] = 255
    return out


def compare_mattes(a_bire, a_prag) -> dict:
    import numpy as np
    from scipy import ndimage as ndi

    pb, pt = a_bire >= zl.SILHOUETTE_THR, a_prag >= zl.SILHOUETTE_THR
    inter, union = int((pb & pt).sum()), int((pb | pt).sum())
    xor = pb ^ pt
    lab, n = ndi.label(xor)
    comps = []
    if n:
        sizes = ndi.sum(xor, lab, index=np.arange(1, n + 1))
        for idx in np.argsort(-sizes)[:5]:
            m = lab == (int(idx) + 1)
            comps.append({"px": int(sizes[idx]), "bbox": zl.bbox_of(m), "only": "birefnet" if bool((pb & m).any()) else "prag"})

    def soft_frac(a):
        return round(float(((a > 0) & (a < 255)).sum()) / max(int((a > 0).sum()), 1), 4)

    return {
        "iou_hard": round(inter / union, 5),
        "area_birefnet": int(pb.sum()),
        "area_prag": int(pt.sum()),
        "disagree_px": int(xor.sum()),
        "birefnet_only_px": int((pb & ~pt).sum()),
        "prag_only_px": int((pt & ~pb).sum()),
        "birefnet_interior_holes_px": int((ndi.binary_fill_holes(pb) & ~pb).sum()),
        "prag_interior_holes_px": int((ndi.binary_fill_holes(pt) & ~pt).sum()),
        "birefnet_interior_not_solid_px": int((zl.erode(pb, 2) & (a_bire < zl.SOLID_THR)).sum()),
        "prag_interior_not_solid_px": int((zl.erode(pt, 2) & (a_prag < zl.SOLID_THR)).sum()),
        "birefnet_components_8conn": int(ndi.label(pb, structure=np.ones((3, 3), dtype=bool))[1]),
        "prag_components_8conn": int(ndi.label(pt, structure=np.ones((3, 3), dtype=bool))[1]),
        "soft_edge_fraction_birefnet": soft_frac(a_bire),
        "soft_edge_fraction_prag": soft_frac(a_prag),
        "largest_disagreements": comps,
    }


def run_birefnet(models_dir: Path, image, device_arg: str):
    bl = _load("birefnet_load")
    model, torch = bl.build_model(models_dir)
    device = bl.pick_device(torch, device_arg)
    note = None
    try:
        model.to(device)
        mask = bl.predict(model, torch, image, device)
    except Exception as e:  # raportat, fără fallback tăcut
        note = f"{device} a eșuat ({type(e).__name__}: {e}); reluat pe cpu"
        print("AVERTISMENT:", note, file=sys.stderr)
        device = "cpu"
        model.to("cpu")
        mask = bl.predict(model, torch, image, "cpu")
    if device == "mps":
        torch.mps.synchronize()
    del model
    gc.collect()
    if device == "mps":
        torch.mps.empty_cache()
    return mask, device, note


# ---------------------------------------------------------------- SAM

class Sam:
    def __init__(self, models_dir: Path, device_arg: str):
        import torch
        from transformers import Sam2Model, Sam2Processor

        sl = _load("sam_load")
        mdir = sl.verified_model_dir(models_dir)
        kw = {"local_files_only": True, "use_safetensors": True, "trust_remote_code": False}
        self.torch = torch
        self.device = device_arg if device_arg != "auto" else ("mps" if torch.backends.mps.is_available() else "cpu")
        self.processor = Sam2Processor.from_pretrained(str(mdir), **kw)
        self.model = Sam2Model.from_pretrained(str(mdir), **kw).to(self.device).eval()

    def predict(self, image, box, pos, neg):
        import numpy as np

        torch = self.torch
        kw = {"input_boxes": [[[float(v) for v in box]]]}
        pts = [[float(x), float(y)] for x, y in list(pos) + list(neg)]
        if pts:
            kw["input_points"] = [[pts]]
            kw["input_labels"] = [[[1] * len(pos) + [0] * len(neg)]]
        batch = self.processor(images=image, return_tensors="pt", **kw).to(self.device)
        with torch.inference_mode():
            out = self.model(**batch, multimask_output=False)
        masks = self.processor.post_process_masks(out.pred_masks.cpu(), batch["original_sizes"])[0]
        if self.device == "mps":
            torch.mps.synchronize()
        return np.asarray(masks[0, 0].numpy()).astype(bool), float(out.iou_scores.flatten()[0])


def box_mask(shape, box, pad: int):
    import numpy as np

    h, w = shape
    x0, y0, x1, y1 = box
    m = np.zeros(shape, dtype=bool)
    m[max(0, int(y0) - pad) : min(h, int(y1) + pad), max(0, int(x0) - pad) : min(w, int(x1) + pad)] = True
    return m


def poly_mask(shape, poly):
    import numpy as np
    from PIL import Image, ImageDraw

    im = Image.new("L", (shape[1], shape[0]), 0)
    ImageDraw.Draw(im).polygon([tuple(p) for p in poly], fill=255)
    return np.asarray(im) == 255


# ---------------------------------------------------------------- overlay

def make_overlay(rgb, L, E, Iz, crit: list[dict]):
    import numpy as np
    from PIL import Image, ImageDraw

    base = rgb.astype(np.float32)
    for mask, color, a in ((L, (0, 200, 0), 0.35), (E, (0, 80, 255), 0.85), (Iz, (255, 0, 0), 0.5)):
        c = np.array(color, dtype=np.float32)
        base[mask] = base[mask] * (1 - a) + c * a
    im = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(im)
    for c in crit:
        if c["bbox"]:
            x0, y0, x1, y1 = c["bbox"]
            dr.rectangle([x0 - 1, y0 - 1, x1, y1], outline=(255, 230, 0), width=2)
            dr.text((x0 + 2, max(0, y0 - 12)), c["name"][:22], fill=(255, 230, 0))
    return im


# ---------------------------------------------------------------- principal

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True, type=Path)
    ap.add_argument("--spec", required=True, type=Path)
    ap.add_argument("--product", required=True)
    ap.add_argument("--models-dir", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path, help="director NOU (nu trebuie să existe)")
    ap.add_argument("--device", default="auto", choices=["auto", "mps", "cpu"])
    args = ap.parse_args()

    import numpy as np
    from PIL import Image

    source, spec_path, models_dir, out = (checked(p) for p in (args.source, args.spec, args.models_dir, args.out))
    if out.exists():
        raise SystemExit(f"--out există deja: {out} (alege un director nou)")
    spec_all = json.loads(spec_path.read_text(encoding="utf-8"))
    matches = [p for p in spec_all["products"] if p["id"] == args.product]
    if len(matches) != 1:
        raise SystemExit(f"produsul {args.product!r} nu apare exact o dată în spec")
    spec = matches[0]
    rel = check_rel(spec["source"])
    if source.parts[-len(rel.parts):] != rel.parts:
        raise SystemExit(f"--source ({source}) nu se potrivește cu {rel} din spec")
    params = {**zl.DEFAULT_PARAMS, **{k: v for k, v in spec["params"].items() if k in zl.DEFAULT_PARAMS}}
    thr_lo = float(spec["params"].get("threshold_lo", 8))

    t_start = time.perf_counter()
    src_bytes = source.read_bytes()
    src_sha = hashlib.sha256(src_bytes).hexdigest()
    with Image.open(source) as im:
        im.load()
        image = im.convert("RGB")
    rgb = np.asarray(image)
    h, w = rgb.shape[:2]
    out.mkdir(parents=True, exist_ok=False)
    (out / "critical").mkdir()

    # matte
    bire_img, device_bire, bire_note = run_birefnet(models_dir, image, args.device)
    a_bire = np.asarray(bire_img, dtype=np.uint8)
    a_prag = threshold_matte(rgb, thr_lo)
    metrics = compare_mattes(a_bire, a_prag)
    choice = spec["matte"]
    if choice not in ("prag", "birefnet", "birefnet_solid"):
        raise SystemExit("spec.matte trebuie să fie 'prag', 'birefnet' sau 'birefnet_solid'")
    alpha = {"prag": a_prag, "birefnet": a_bire, "birefnet_solid": birefnet_solid(a_bire)}[choice]
    files: dict[str, dict] = {}
    for key, arr in (("matte_birefnet", a_bire), ("matte_prag", a_prag), ("alpha", alpha)):
        files[key] = {"file": f"{key}.png", "sha256": zl.save_alpha_png(out / f"{key}.png", arr)}

    # SAM
    sam = Sam(models_dir, args.device)
    shape = (h, w)
    crit_info, crit_eff = [], {}
    for c in spec["critical"]:
        name = zl.safe_name(c["name"])
        raw_sam, iou = sam.predict(image, c["box"], c.get("points_pos", []), c.get("points_neg", []))
        limit = box_mask(shape, c["box"], int(c.get("pad", 4)))
        core = raw_sam & limit
        lost_core = int((core & ~zl.solid(alpha)).sum())
        grown = zl.dilate(core, int(c.get("dilate", params["crit_dilate"]))) & limit
        eff, lost_all = zl.effective_critical(grown, alpha)
        crit_eff[name] = eff
        fname = f"critical/{name}.png"
        info = {
            "name": name, "reason": c["reason"], "file": None, "sha256": None, "bbox": zl.bbox_of(eff), "pixels": int(eff.sum()),
            "sam_px": int(raw_sam.sum()), "sam_iou_score": round(iou, 4), "sam_px_clipped_to_box": int(core.sum()),
            "lost_alpha_lt_099": lost_core, "lost_dilation_halo_alpha_lt_099": lost_all - lost_core,
            "spec_box": c["box"],
        }
        info["file"] = fname
        crit_info.append((info, fname, eff))
    interior_raw = np.zeros(shape, dtype=bool)
    interior_info = []
    for r in spec["interior"]:
        raw_sam, iou = sam.predict(image, r["box"], r.get("points_pos", []), r.get("points_neg", []))
        kept = raw_sam & poly_mask(shape, r["clip"]) & box_mask(shape, r["box"], 0)
        interior_raw |= kept
        interior_info.append({
            "name": r["name"], "reason": r["reason"], "sam_px": int(raw_sam.sum()),
            "sam_iou_score": round(iou, 4), "kept_px": int(kept.sum()),
        })
    sam_device = sam.device

    # zone
    L, E, Iz = zl.build_zones(alpha, interior_raw, list(crit_eff.values()), params)
    for key, arr in (("L", L), ("E", E), ("I", Iz)):
        files[key] = {"file": f"{key}.png", "sha256": zl.save_mask_png(out / f"{key}.png", arr)}
    critical_json = []
    for info, fname, eff in crit_info:
        info["sha256"] = zl.save_mask_png(out / fname, eff)
        info["in_L_px"] = int((eff & L).sum())
        critical_json.append(info)
    interior_dropped = int((interior_raw & ~Iz).sum())

    overlay = make_overlay(rgb, L, E, Iz, critical_json)
    overlay.save(out / "zone_overlay.png", format="PNG")

    code_hashes = {n: zl.sha256_file(HERE / n) for n in ("zones_lib.py", "build_zones.py", "verify_zones.py")}
    code_sha = hashlib.sha256("\n".join(f"{k}:{v}" for k, v in sorted(code_hashes.items())).encode()).hexdigest()
    zone = {
        "schema": zl.SCHEMA,
        "product": args.product,
        "source": {"path": spec["source"], "sha256": src_sha, "width": w, "height": h},
        "matte": {
            "chosen": choice, "reason": spec["matte_reason"], "threshold_lo": thr_lo,
            "metrics": metrics, "birefnet_device_note": bire_note,
        },
        "params": params,
        "thresholds": {"silhouette_alpha8": zl.SILHOUETTE_THR, "solid_alpha8": zl.SOLID_THR},
        "files": files,
        "zones": {k: int(v.sum()) for k, v in (("L", L), ("E", E), ("I", Iz))},
        "critical": critical_json,
        "interior": {
            "regions": interior_info, "empty_reason": spec.get("interior_empty_reason"), "raw_px": int(interior_raw.sum()),
            "dropped_by_inset_or_critical_gap_px": interior_dropped,
        },
        "code_version": {
            "files": code_hashes, "sha256": code_sha,
            "spec_sha256": hashlib.sha256(spec_path.read_bytes()).hexdigest(),
        },
        "run": {"device_birefnet": device_bire, "device_sam": sam_device, "elapsed_s": round(time.perf_counter() - t_start, 1)},
    }
    zl.write_zone_json(out / "zone.json", zone)
    crit_summary = [(c["name"], c["pixels"], c["in_L_px"], c["lost_alpha_lt_099"]) for c in critical_json]
    summary = {"out": str(out), "matte": choice, "iou": metrics["iou_hard"], "zones": zone["zones"], "critical": crit_summary}
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
