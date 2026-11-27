"""Inferență BiRefNet: poză -> mască soft (PNG 8 biți).

Încărcare doar din safetensors (`safetensors.torch.load_file`), după verificarea mărimii și sha256 din
`models.lock.json`; codul modelului e cel vendorizat în `vendor/birefnet` (MIT), fără `trust_remote_code`.

Rulare (vezi README.md): python -I birefnet_load.py --models-dir <dir> --image <poza> --out <mask.png> [--device auto|mps|cpu]
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import resource
import sys
import time
import os
from pathlib import Path

os.environ.setdefault("HF_HUB_OFFLINE", "1")  # apărare suplimentară: nicio cerere către Hub (torch se importă mai târziu)
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

HERE = Path(__file__).resolve().parent
MODEL_ID = "birefnet"
SIZE = 1024


def _load_fetch_module():
    spec = importlib.util.spec_from_file_location("fetch_models", HERE / "fetch_models.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def verified_weights(models_dir: Path) -> tuple[Path, dict]:
    fm = _load_fetch_module()
    manifest = fm.load_manifest(fm.DEFAULT_MANIFEST)
    model = next(m for m in manifest["models"] if m["id"] == MODEL_ID)
    entry = next(e for e in model["files"] if e["path"] == "model.safetensors")
    path = fm.resolve_dest(models_dir, MODEL_ID, entry["path"])
    reason = fm.verify_file(path, entry["size"], entry["sha256"])
    if reason:
        raise SystemExit(f"weights BiRefNet invalide: {reason}")
    return path, entry


def pick_device(torch, wanted: str) -> str:
    if wanted != "auto":
        return wanted
    return "mps" if torch.backends.mps.is_available() else "cpu"


def build_model(models_dir: Path):
    import torch
    from safetensors.torch import load_file

    sys.path.insert(0, str(HERE / "vendor" / "birefnet"))
    from models.birefnet import BiRefNet  # noqa: E402  (cod vendorizat, MIT)

    weights, _ = verified_weights(models_dir)
    model = BiRefNet(bb_pretrained=False)
    state = load_file(str(weights), device="cpu")
    model.load_state_dict(state, strict=True)
    model.eval()
    return model, torch


def predict(model, torch, image, device: str):
    import numpy as np
    from PIL import Image

    rgb = image.convert("RGB")
    w, h = rgb.size
    x = np.asarray(rgb.resize((SIZE, SIZE), Image.BILINEAR), dtype=np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    t = torch.from_numpy(((x - mean) / std).transpose(2, 0, 1)).unsqueeze(0).to(device)
    with torch.inference_mode():
        out = model(t)[-1]
        prob = out.sigmoid().float().cpu()[0, 0].numpy()
    m = Image.fromarray((np.clip(prob, 0, 1) * 255).round().astype("uint8"), mode="L")
    return m.resize((w, h), Image.BILINEAR)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--models-dir", required=True, type=Path)
    ap.add_argument("--image", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path, help="PNG de ieșire (mască 8 biți)")
    ap.add_argument("--device", default="auto", choices=["auto", "mps", "cpu"])
    args = ap.parse_args()

    from PIL import Image

    if args.out.suffix.lower() != ".png":
        raise SystemExit("--out trebuie să fie .png")
    src_bytes = args.image.read_bytes()
    src_sha = hashlib.sha256(src_bytes).hexdigest()
    with Image.open(args.image) as im:
        im.load()
        image = im.copy()

    t0 = time.perf_counter()
    model, torch = build_model(args.models_dir)
    device = pick_device(torch, args.device)
    model.to(device)
    t_load = time.perf_counter() - t0
    t1 = time.perf_counter()
    try:
        mask = predict(model, torch, image, device)
    except Exception as e:  # raportează eroarea exactă; fără fallback tăcut
        print(f"EROARE pe {device}: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    if device == "mps":
        torch.mps.synchronize()
    t_inf = time.perf_counter() - t1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    mask.save(args.out, format="PNG")
    mem = {"maxrss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e6, 1)}  # macOS: octeți
    if device == "mps":
        mem["mps_driver_allocated_mb"] = round(torch.mps.driver_allocated_memory() / 1e6, 1)
        mem["mps_current_allocated_mb"] = round(torch.mps.current_allocated_memory() / 1e6, 1)
    print(json.dumps({
        "device": device,
        "source_sha256": src_sha,
        "source_size": list(image.size),
        "mask_size": list(mask.size),
        "mask_mode": mask.mode,
        "mask_min_max": list(mask.getextrema()),
        "load_s": round(t_load, 2),
        "inference_s": round(t_inf, 2),
        "memory": mem,
        "out": str(args.out),
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
