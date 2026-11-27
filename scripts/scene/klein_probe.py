"""Probă T4: FLUX.2 klein (inpainting cu mască) pe MPS, pe un singur produs. Doar măsurare + imagini brute într-un director NOU.

Intrare: produsul sursă așezat pe canvas 1100x1100 la scale 1.0 (compose_lib.place_product), masca de umplere = NOT(L ∪ E).
Încărcare secvențială: textul se codează cu text encoder-ul, apoi acesta se eliberează înainte de a încărca transformerul.
Doar safetensors, `local_files_only=True`, fără `trust_remote_code`, fără pickle. Fără rețea.

Rulare (vezi scripts/scene/README.md):
  python -I klein_probe.py --models-dir <dir> --model-id flux2-klein-4b --source <jpg> --zone-dir <zones> --out-root <dir> \
      --resolution 768 --dtype bf16 --steps 4 --seeds 1 2
"""
# ruff: noqa: E501
from __future__ import annotations

import argparse
import datetime as dt
import gc
import json
import os
import resource
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

os.environ["HF_HUB_OFFLINE"] = "1"  # FORȚAT (nu setdefault): nicio cerere către Hub (torch/transformers/diffusers se importă în main)
os.environ["TRANSFORMERS_OFFLINE"] = "1"

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I nu pune directorul scriptului pe sys.path
import compose_lib as cl  # noqa: E402
import integrity_lib as ilib  # noqa: E402
import klein_lib as kl  # noqa: E402
import models_runtime as mr  # noqa: E402

CANVAS = (1100, 1100)
DEFAULT_PROMPT = (
    "A headless matte grey retail mannequin torso on a stand, no face, no hair, not human, "
    "standing on a construction site in daylight: soft haze, bare concrete, steel scaffolding in the distance, no people."
)


def log(msg: str) -> None:
    print(f"[{dt.datetime.now(dt.timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)


def rss_gb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e9  # macOS: octeți


def _run(argv: list[str]) -> str:
    # comenzi fixe de sistem macOS, cale absolută, fără input extern
    return subprocess.run(argv, capture_output=True, text=True, timeout=10, check=False).stdout.strip()  # noqa: S603


def sys_mem() -> dict:
    out = {}
    try:
        out["swapusage"] = _run(["/usr/sbin/sysctl", "-n", "vm.swapusage"])
        keep = ("Pageouts", "Swapins", "Swapouts", "Pages free", "Pages purgeable", "Pages occupied by compressor")
        vm = _run(["/usr/bin/vm_stat"])
        out["vm_stat"] = {ln.split(":")[0].strip(): ln.split(":")[1].strip() for ln in vm.splitlines() if ln.startswith(keep)}
        mp = _run(["/usr/bin/memory_pressure", "-Q"])
        out["memory_pressure"] = mp.splitlines()[-1] if mp else ""
    except (OSError, subprocess.SubprocessError) as e:
        out["eroare"] = str(e)
    return out


def mps_mem(torch) -> dict:
    return {
        "mps_driver_allocated_gb": round(torch.mps.driver_allocated_memory() / 1e9, 2),
        "mps_current_allocated_gb": round(torch.mps.current_allocated_memory() / 1e9, 2),
        "maxrss_gb": round(rss_gb(), 2),
    }


def build_input(source: Path, zone_dir: Path, res: tuple[int, int]) -> tuple[Image.Image, Image.Image, dict]:
    with Image.open(source) as im:
        src = np.asarray(im.convert("RGB"), dtype=np.uint8).copy()
    if src.shape[:2] != (CANVAS[1], CANVAS[0]):
        raise ValueError(f"sursa trebuie să fie {CANVAS[0]}x{CANVAS[1]}, găsit {src.shape[1]}x{src.shape[0]}")
    z = ilib.load_zone_checked(zone_dir)  # doar prin numele din zone.json, cu sha256 verificat
    placed = cl.place_product(src, z["alpha"], z["L"], z["E"], z["I"], z["critical"], CANVAS, 1.0, 0, 0)
    mask = cl.inpaint_mask(placed["L"], placed["E"])
    image = Image.fromarray(placed["ref"], "RGB").resize(res, Image.LANCZOS)
    m = Image.fromarray(mask, "L").resize(res, Image.NEAREST)
    info = {"mask_fill_frac_canvas": round(float((mask == 255).mean()), 4), "box": placed["box"]}
    return image, m, info


def main() -> int:  # noqa: C901
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--models-dir", required=True)
    ap.add_argument("--model-id", default="flux2-klein-4b")
    ap.add_argument("--source", required=True)
    ap.add_argument("--zone-dir", required=True)
    ap.add_argument("--out-root", required=True)
    ap.add_argument("--resolution", type=int, default=768)
    ap.add_argument("--dtype", choices=("bf16", "fp16"), default="bf16")
    ap.add_argument("--vae-fp32", action="store_true")
    ap.add_argument("--vae-tiling", action="store_true")
    ap.add_argument("--empty-cache", action="store_true", help="gc + torch.mps.empty_cache() după fiecare imagine")
    ap.add_argument("--steps", type=int, default=4)
    ap.add_argument("--guidance", type=float, default=1.0)
    ap.add_argument("--strength", type=float, default=1.0)
    ap.add_argument("--seeds", type=int, nargs="+", default=[1, 2])
    ap.add_argument("--prompt", default=DEFAULT_PROMPT)
    a = ap.parse_args()

    models_dir = kl.require_dir(a.models_dir, "models-dir")
    model_id = mr._fm().validate_rel_path(a.model_id)  # noqa: SLF001  # fără '..', cale absolută sau caractere ciudate
    if "/" in model_id:
        raise SystemExit(f"--model-id trebuie să fie un id simplu din manifest, nu o cale: {a.model_id!r}")
    model_dir = kl.require_dir(models_dir / model_id, "model")
    mr.verify_model(models_dir, model_id)  # mărime + sha256 reale ale fișierelor modelului, înainte de ORICE from_pretrained
    source = kl.require_file(a.source, "source", (".jpg", ".jpeg", ".png"))
    zone_dir = kl.require_dir(a.zone_dir, "zone-dir")
    res = kl.fit_resolution(CANVAS, a.resolution)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = kl.new_run_dir(a.out_root, stamp)

    import torch  # import târziu: validarea căilor nu cere torch
    from diffusers import Flux2KleinInpaintPipeline
    import transformers

    if not torch.backends.mps.is_available():
        raise SystemExit("MPS indisponibil")
    dtype = {"bf16": torch.bfloat16, "fp16": torch.float16}[a.dtype]
    dev = "mps"
    report: dict = {
        "device": dev, "dtype": a.dtype, "resolution": list(res), "steps": a.steps,
        "guidance": a.guidance, "strength": a.strength,
        "vae_fp32": a.vae_fp32, "empty_cache": a.empty_cache, "vae_tiling": a.vae_tiling, "model": a.model_id, "prompt": a.prompt,
        "torch": torch.__version__, "sys_before": sys_mem(), "images": [],
    }
    log(f"device={dev} dtype={a.dtype} res={res} steps={a.steps} guidance={a.guidance} strength={a.strength} seeds={a.seeds}")

    image, mask, info = build_input(source, zone_dir, res)
    image.save(run_dir / "input.png")
    mask.save(run_dir / "mask_used.png")
    report["input"] = info

    # 1) codare prompt, apoi eliberare text encoder
    t0 = time.perf_counter()
    tok = transformers.AutoTokenizer.from_pretrained(model_dir / "tokenizer", local_files_only=True, trust_remote_code=False)
    te = transformers.Qwen3ForCausalLM.from_pretrained(
        model_dir / "text_encoder", dtype=dtype, local_files_only=True, use_safetensors=True, trust_remote_code=False
    )
    te.to(dev)
    torch.mps.synchronize()
    t_load_te = time.perf_counter() - t0
    log(f"text encoder încărcat în {t_load_te:.1f}s {mps_mem(torch)}")
    t0 = time.perf_counter()
    with torch.no_grad():
        embeds = Flux2KleinInpaintPipeline._get_qwen3_prompt_embeds(text_encoder=te, tokenizer=tok, prompt=a.prompt, device=dev)
    torch.mps.synchronize()
    t_enc = time.perf_counter() - t0
    log(f"prompt codat în {t_enc:.1f}s, embeds {tuple(embeds.shape)} {embeds.dtype}, nan={bool(torch.isnan(embeds).any())}")
    embeds = embeds.to("cpu")
    report["mem_after_encode"] = mps_mem(torch)
    del te, tok
    gc.collect()
    torch.mps.empty_cache()
    report["mem_after_free_te"] = mps_mem(torch)

    # 2) pipeline fără text encoder
    t0 = time.perf_counter()
    pipe = Flux2KleinInpaintPipeline.from_pretrained(
        model_dir, text_encoder=None, tokenizer=None, torch_dtype=dtype, local_files_only=True, use_safetensors=True, trust_remote_code=False
    )
    pipe.to(dev)
    if a.vae_fp32:
        pipe.vae.to(torch.float32)
    if a.vae_tiling:
        pipe.vae.enable_tiling()
    torch.mps.synchronize()
    t_load_tr = time.perf_counter() - t0
    log(f"transformer+VAE încărcate în {t_load_tr:.1f}s, is_distilled={pipe.config.is_distilled} {mps_mem(torch)}")
    report["t_load_text_encoder_s"], report["t_encode_prompt_s"], report["t_load_transformer_vae_s"] = (
        round(t_load_te, 1), round(t_enc, 1), round(t_load_tr, 1))

    for seed in a.seeds:
        stamps: list[float] = []

        def cb(_p, _i, _t, kw):
            torch.mps.synchronize()
            stamps.append(time.perf_counter())
            return kw

        gen = torch.Generator("cpu").manual_seed(seed)
        t_start = time.perf_counter()
        out = pipe(
            prompt=None, prompt_embeds=embeds.to(dev), image=image, mask_image=mask, height=res[1], width=res[0],
            strength=a.strength, num_inference_steps=a.steps, guidance_scale=a.guidance, generator=gen,
            callback_on_step_end=cb, output_type="pil",
        ).images[0]
        torch.mps.synchronize()
        t_end = time.perf_counter()
        out.save(run_dir / f"raw_seed{seed}.png")
        arr = np.asarray(out.convert("RGB"), dtype=np.float32)
        rec = {
            "seed": seed, "total_s": round(t_end - t_start, 2),
            "pre_first_step_end_s": round(stamps[0] - t_start, 2) if stamps else None,
            "step_s": [round(b - a_, 2) for a_, b in zip(stamps, stamps[1:])],
            "decode_s": round(t_end - stamps[-1], 2) if stamps else None,
            "out_mean": round(float(arr.mean()), 1), "out_std": round(float(arr.std()), 1), "mem": mps_mem(torch),
        }
        report["images"].append(rec)
        log(f"seed {seed}: {json.dumps(rec)}")
        if a.empty_cache:
            del out
            gc.collect()
            torch.mps.empty_cache()

    report["sys_after"] = sys_mem()
    (run_dir / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"gata: {run_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
