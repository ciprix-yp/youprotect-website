"""Generarea candidaților de scenă (T5a): așezare, umplere cu mască FLUX.2 klein 4B pe MPS, compunere deterministă, verificări T3a, fișă.

Pași: sha256 sursă; verificarea zonelor (verify_zones.verify); place_product scale 1.0, dx=dy=0; prompt din contexte.json (prompting);
prompt-urile distincte se codează o dată, text encoderul se eliberează, transformerul se încarcă o dată pe lot; per seed: inpainting la
768, fundalul se aduce la canvasul 1100 cu LANCZOS (produsul rămâne pixel-exact, la scale 1.0), compunere cu foreground pymatting
(calculat o dată per produs), master PNG lossless, verificările T3a cu pragurile din calibrare.json, fișă + linie în registru.
Un candidat = un director NOU `<PRODUS>-<context>-s<seed>`; un director existent se sare (nu se suprascrie).
Verificările de model (OCR, fețe, ne-uman SigLIP2/VLM) vin în T5b: fișa are `verificari_modele: []`, `etapa: "T5a-fara-verificari-model"`
și o verificare „verificari_model” cu passed=false, deci `rezultat_global` nu poate fi true până la T5b.

Rulare (vezi scripts/scene/README.md):
  python -I generate_candidates.py --product S476YE --context santier_constructii_zi hala_depozit --n 5 --seed-start 100 \
     --models-dir <models> --zones-dir <zones> --source <jpg> --out-base <.catalog-work/scene/cand> --calibrare <calibrare.json>
"""
# ruff: noqa: E501
from __future__ import annotations

import argparse
import datetime as dt
import gc
import hashlib
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

os.environ.setdefault("HF_HUB_OFFLINE", "1")  # apărare suplimentară: nicio cerere către Hub (torch/transformers/diffusers se importă mai jos, în main)
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # -I nu pune directorul scriptului pe sys.path
import checks_lib as ck  # noqa: E402
import compose_lib as cl  # noqa: E402
import fisa_lib as fl  # noqa: E402
import integrity_lib as ilib  # noqa: E402
import klein_lib as kl  # noqa: E402
import models_runtime as mr  # noqa: E402
import pilot_lib as pl  # noqa: E402
import prompting as pr  # noqa: E402
import verify_zones as vz  # noqa: E402

CODE_FILES = ["generate_candidates.py", "prompting.py", "contexte.json", "pilot_lib.py", "compose_lib.py", "checks_lib.py",
              "fisa_lib.py", "zones_lib.py", "klein_lib.py", "verify_zones.py", "integrity_lib.py", "models_runtime.py"]
WEIGHTS = "transformer/diffusion_pytorch_model.safetensors"
GEN_RES = 768
STEPS, GUIDANCE, STRENGTH = 4, 1.0, 1.0
MODEL_ID = "flux2-klein-4b"
ETAPA = "T5a-fara-verificari-model"
NOTA = ("Lipsesc verificările de model (OCR logo/decor/I, detector de fețe, SigLIP2/VLM ne-uman), planificate în T5b; "
        "candidatul NU poate fi acceptat înainte de ele.")


def log(msg: str) -> None:
    print(f"[{dt.datetime.now(dt.timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)


sha_arr = ilib.sha_arr


def model_info(models_dir: Path) -> dict:
    """Verifică mărimea + sha256 ale TUTUROR fișierelor flux2-klein-4b (recalculate pe disc) ÎNAINTE de orice from_pretrained; hash-ul din fișă
    e cel VERIFICAT al transformerului, nu cel copiat din manifest."""
    _root, info, _first = mr.verify_model(models_dir, MODEL_ID, WEIGHTS)
    return info


def check_product_binding(product: str, zones_dir: Path, source: Path, summary: dict) -> None:
    """Produsul cerut = zone.json = zone_specs.json = rezultatul verify_zones; sursa din zone.json = sursa produsului. Altfel SystemExit."""
    zj = json.loads((zones_dir / "zone.json").read_text(encoding="utf-8"))
    errs = ilib.check_product_binding(product, zj, ilib.load_specs(), source)
    if summary.get("product") != product:
        errs.append(f"verify_zones raportează produsul {summary.get('product')!r}, cerut {product!r}")
    if errs:
        raise SystemExit("PRODUS/ZONE NEPOTRIVITE: " + "; ".join(errs))


def run_checks(master: np.ndarray, placed: dict, src: np.ndarray, z: dict, thr: dict) -> list[dict]:
    Lm = ck.eroded_L(placed["L"])
    return [
        ck.check_transform(placed["params"]),
        ck.check_identity_master(master, placed["ref"], Lm),
        ck.detect_mirror(master, placed["ref"], placed["L"]),
        ck.check_scale_not_up(master, src, z["alpha"], z["L"], z["E"], z["I"], z["critical"], pl.CANVAS, placed["params"]),
        ck.check_halo(master, placed, thr["halo_delta"]),
        ck.check_color_spill(master, placed, thr["spill_max_frac"]),
        ck.check_decor_fluo(master, placed, thr["fluo_max_frac"]),
    ]


def jsonable(x):
    return json.loads(json.dumps(x, default=lambda o: o.item() if hasattr(o, "item") else str(o)))


def main() -> int:  # noqa: C901
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--product", required=True)
    ap.add_argument("--context", required=True, nargs="+", help="unul sau mai multe contexte permise; --n candidați pe context")
    ap.add_argument("--n", type=int, required=True)
    ap.add_argument("--seed-start", type=int, required=True)
    ap.add_argument("--models-dir", required=True)
    ap.add_argument("--zones-dir", required=True)
    ap.add_argument("--source", required=True)
    ap.add_argument("--out-base", required=True)
    ap.add_argument("--calibrare", required=True)
    ap.add_argument("--registry", default=None, help="implicit: <out-base>/../registru.jsonl")
    a = ap.parse_args()
    if a.n < 1 or a.seed_start < 0:
        raise SystemExit("--n >= 1 și --seed-start >= 0")

    models_dir = kl.require_dir(a.models_dir, "models-dir")
    model_dir = kl.require_dir(models_dir / MODEL_ID, "model")
    zones_dir = kl.require_dir(a.zones_dir, "zones-dir")
    source = kl.require_file(a.source, "source", (".jpg", ".jpeg", ".png"))
    out_base = kl.require_dir(a.out_base, "out-base")
    calib = kl.require_file(a.calibrare, "calibrare", (".json",))
    base_dir = out_base.parent
    registry = Path(a.registry) if a.registry else base_dir / "registru.jsonl"
    thr = json.loads(calib.read_text(encoding="utf-8"))["praguri"]
    cx = pr.load_contexte()
    allowed = pr.allowed_contexts(a.product, cx)
    for c in a.context:
        if c not in allowed:
            raise SystemExit(f"context {c!r} nu e permis pentru {a.product}; permise: {', '.join(allowed)}")

    sha_src = hashlib.sha256(source.read_bytes()).hexdigest()
    errs, summary = vz.verify(zones_dir, source)
    if errs:
        raise SystemExit("VERIFICARE ZONE PICATĂ: " + "; ".join(errs))
    check_product_binding(a.product, zones_dir, source, summary)
    log(f"sursa sha256={sha_src[:12]}…, zone OK")

    src = pl.load_source_rgb(source)
    z = pl.load_zones(zones_dir)
    placed = pl.place(src, z)  # scale 1.0, dx=dy=0: produsul rămâne pixel-exact; fără deplasare
    mask = cl.inpaint_mask(placed["L"], placed["E"])
    res = kl.fit_resolution(pl.CANVAS, GEN_RES)
    image_in = Image.fromarray(placed["ref"], "RGB").resize(res, Image.LANCZOS)
    mask_in = Image.fromarray(mask, "L").resize(res, Image.NEAREST)
    t0 = time.perf_counter()
    F = pl.estimate_foreground(placed)
    log(f"foreground pymatting în {time.perf_counter() - t0:.1f}s")

    jobs = []  # (context, seed, variant, prompt)
    for c in a.context:
        for i in range(a.n):
            jobs.append((c, a.seed_start + i, i, pr.build_prompt(a.product, c, i, cx)))
    todo = [j for j in jobs if not (out_base / f"{a.product}-{j[0]}-s{j[1]}").exists()]
    if len(todo) < len(jobs):
        log(f"{len(jobs) - len(todo)} candidați există deja: se sar (nu se suprascriu)")
    if not todo:
        return 0

    minfo = model_info(models_dir)  # mărime + sha256 reale ale fișierelor modelului, înainte de ORICE from_pretrained

    import torch
    import transformers
    from diffusers import Flux2KleinInpaintPipeline

    if not torch.backends.mps.is_available():
        raise SystemExit("MPS indisponibil")
    dtype, dev = torch.bfloat16, "mps"

    t0 = time.perf_counter()
    tok = transformers.AutoTokenizer.from_pretrained(model_dir / "tokenizer", local_files_only=True, trust_remote_code=False)
    te = transformers.Qwen3ForCausalLM.from_pretrained(model_dir / "text_encoder", dtype=dtype, local_files_only=True, use_safetensors=True,
                                                       trust_remote_code=False)
    te.to(dev)
    embeds: dict[str, torch.Tensor] = {}
    with torch.no_grad():
        for p in sorted({j[3] for j in todo}):
            e = Flux2KleinInpaintPipeline._get_qwen3_prompt_embeds(text_encoder=te, tokenizer=tok, prompt=p, device=dev)
            embeds[p] = e.to("cpu")
    del te, tok
    gc.collect()
    torch.mps.empty_cache()
    log(f"{len(embeds)} prompt-uri codate, text encoder eliberat ({time.perf_counter() - t0:.1f}s)")
    pipe = Flux2KleinInpaintPipeline.from_pretrained(
        model_dir, text_encoder=None, tokenizer=None, torch_dtype=dtype, local_files_only=True, use_safetensors=True, trust_remote_code=False)
    pipe.to(dev)
    torch.mps.synchronize()
    log("transformer + VAE încărcate")

    code_sha = fl.sha256_code([HERE / f for f in CODE_FILES] + [calib])
    summary = []
    for ctx, seed, variant, prompt in todo:
        name = f"{a.product}-{ctx}-s{seed}"
        cdir = out_base / name
        cdir.mkdir(exist_ok=False)
        t_start = time.perf_counter()
        gen = torch.Generator("cpu").manual_seed(seed)
        out = pipe(prompt=None, prompt_embeds=embeds[prompt].to(dev), image=image_in, mask_image=mask_in, height=res[1], width=res[0],
                   strength=STRENGTH, num_inference_steps=STEPS, guidance_scale=GUIDANCE, generator=gen, output_type="pil").images[0]
        torch.mps.synchronize()
        raw = out.convert("RGB")
        bg = np.asarray(raw.resize(pl.CANVAS, Image.LANCZOS), dtype=np.uint8).copy()
        master_mem = cl.compose(placed, bg, F)
        t_gen = time.perf_counter() - t_start
        raw.save(cdir / "raw_768.png")
        Image.fromarray(master_mem, "RGB").save(cdir / "master.png")
        # fișierul SALVAT e cel acceptat: se recitește de pe disc, verificările rulează pe el, iar hash-urile se iau din octeții lui
        master = pl.load_source_rgb(cdir / "master.png")
        if not np.array_equal(master, master_mem):
            raise SystemExit(f"{name}: master.png recitit diferă de array-ul din memorie (salvare coruptă)")
        sha_master, sha_raw = ilib.file_sha(cdir / "master.png"), ilib.file_sha(cdir / "raw_768.png")
        checks = run_checks(master, placed, src, z, thr)
        t3a_ok = fl.compute_global(checks)
        checks.append(ck.result("verificari_model", None, "OCR + fețe + ne-uman (T5b)", False,
                                "nerulate în T5a: OCR logo/decor/I, detector de fețe, SigLIP2/VLM"))
        fisa = fl.build_fisa(
            candidat=name, produs=a.product, sha256_sursa=sha_src, sha256_masca=hashlib.sha256(mask.tobytes()).hexdigest(),
            sha256_L=sha_arr(placed["L"]), sha256_E=sha_arr(placed["E"]), sha256_I=sha_arr(placed["I"]), sha256_cod=code_sha, sha256_master=sha_master, sha256_raw=sha_raw,
            model=minfo, seed=seed, prompt=prompt, context=ctx, scara=1.0, deplasare={"dx": 0, "dy": 0}, flip=False, rotate_deg=0,
            canvas={"w": pl.CANVAS[0], "h": pl.CANVAS[1]}, verificari=jsonable(checks), timp_generare_s=round(t_gen, 2),
            etapa=ETAPA, verificari_modele=[], nota=NOTA, rezultat_t3a=t3a_ok, variant=variant,
            generare={"rezolutie": list(res), "pasi": STEPS, "guidance": GUIDANCE, "strength": STRENGTH, "dtype": "bf16", "device": "mps",
                      "fundal_upscale": "LANCZOS 768->1100 (fundalul e mai moale decât produsul, care e pixel-exact)",
                      "foreground": "pymatting.estimate_foreground_ml", "praguri": thr},
        )
        fl.write_fisa(cdir, fisa, registry, base_dir)
        failed = [c["name"] for c in checks if not c["passed"] and c["name"] != "verificari_model"]
        summary.append({"candidat": name, "t_s": round(t_gen, 1), "t3a": t3a_ok, "picate": failed})
        log(f"{name}: {t_gen:.1f}s T3a={'OK' if t3a_ok else 'PICAT ' + ','.join(failed)}")
        del out, raw
        gc.collect()
        torch.mps.empty_cache()
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    (out_base / f"_lot-{a.product}-{stamp}.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"gata: {len(summary)} candidați, T3a OK {sum(s['t3a'] for s in summary)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
