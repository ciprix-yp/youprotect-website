"""Smoke SAM 2.1 (transformers `Sam2Model` + `Sam2Processor`): încarcă din safetensors și prezice o mască.

Fără remote code, fără rețea (`local_files_only`), după verificarea mărimii și sha256 din `models.lock.json`.
Rulare: python -I sam_load.py --models-dir <dir> --image <poza> --out <mask.png> [--box x0 y0 x1 y1 | --point x y]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import resource
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODEL_ID = "sam2.1-hiera-large"


def _fetch_module():
    spec = importlib.util.spec_from_file_location("fetch_models", HERE / "fetch_models.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def verified_model_dir(models_dir: Path) -> Path:
    fm = _fetch_module()
    manifest = fm.load_manifest(fm.DEFAULT_MANIFEST)
    model = next(m for m in manifest["models"] if m["id"] == MODEL_ID)
    for e in model["files"]:
        reason = fm.verify_file(fm.resolve_dest(models_dir, MODEL_ID, e["path"]), e["size"], e["sha256"])
        if reason:
            raise SystemExit(f"{MODEL_ID}/{e['path']} invalid: {reason}")
    return fm.resolve_dest(models_dir, MODEL_ID, "config.json").parent


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--models-dir", required=True, type=Path)
    ap.add_argument("--image", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--device", default="auto", choices=["auto", "mps", "cpu"])
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--box", nargs=4, type=float, metavar=("X0", "Y0", "X1", "Y1"))
    g.add_argument("--point", nargs=2, type=float, metavar=("X", "Y"))
    args = ap.parse_args()

    import numpy as np
    import torch
    from PIL import Image
    from transformers import Sam2Model, Sam2Processor

    if args.out.suffix.lower() != ".png":
        raise SystemExit("--out trebuie să fie .png")
    mdir = verified_model_dir(args.models_dir)
    with Image.open(args.image) as im:
        image = im.convert("RGB")
    w, h = image.size
    device = args.device if args.device != "auto" else ("mps" if torch.backends.mps.is_available() else "cpu")

    t0 = time.perf_counter()
    kw = dict(local_files_only=True, use_safetensors=True, trust_remote_code=False)
    processor = Sam2Processor.from_pretrained(str(mdir), **kw)
    model = Sam2Model.from_pretrained(str(mdir), **kw).to(device).eval()
    t_load = time.perf_counter() - t0

    inputs = {}
    if args.box:
        inputs["input_boxes"] = [[list(args.box)]]
    else:
        px, py = args.point if args.point else (w / 2, h / 2)
        inputs["input_points"] = [[[[px, py]]]]
        inputs["input_labels"] = [[[1]]]
    t1 = time.perf_counter()
    try:
        batch = processor(images=image, return_tensors="pt", **inputs).to(device)
        with torch.inference_mode():
            out = model(**batch, multimask_output=False)
        masks = processor.post_process_masks(out.pred_masks.cpu(), batch["original_sizes"])[0]
    except Exception as e:
        print(f"EROARE pe {device}: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    if device == "mps":
        torch.mps.synchronize()
    t_inf = time.perf_counter() - t1

    m = masks[0, 0].numpy().astype(np.uint8) * 255
    args.out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(m, mode="L").save(args.out, format="PNG")
    mem = {"maxrss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e6, 1)}
    if device == "mps":
        mem["mps_driver_allocated_mb"] = round(torch.mps.driver_allocated_memory() / 1e6, 1)
    print(json.dumps({
        "device": device,
        "image_size": [w, h],
        "pred_masks_shape": list(out.pred_masks.shape),
        "post_processed_masks_shape": list(masks.shape),
        "iou_scores": [round(float(v), 4) for v in out.iou_scores.flatten().cpu().tolist()],
        "mask_foreground_fraction": round(float((m > 0).mean()), 4),
        "load_s": round(t_load, 2),
        "inference_s": round(t_inf, 2),
        "memory": mem,
        "out": str(args.out),
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
