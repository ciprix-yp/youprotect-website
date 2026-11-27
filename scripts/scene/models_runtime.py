"""Rularea modelelor pentru verificările T5b: produce SEMNALE brute (decizia e în checks_models_lib).

Un model greu odată în memorie, eliberat înainte de următorul (`collect` rulează etapele pe rând, peste toate imaginile).
Totul local: `local_files_only=True`, safetensors, fără `trust_remote_code`, fără pickle; hash-urile modelelor sunt verificate
față de `models.lock.json` înainte de încărcare. Pozele nu pleacă de pe mașină.

Segmentul manechinului (definiție): (I ∪ (SAM ∩ REGIUNE)) \\ (L ∪ E), unde
  - I = zona de interior a produsului (zones), SAM = masca SAM 2.1 cu UN punct pozitiv în centroidul lui I (pixelul din I cel mai apropiat
    de centroid), REGIUNE = cutia siluetei produsului mărită cu 8% pe laterale/sus și 30% în jos (acolo apare suportul sub tiv);
  - se scad L și E (pixelii produsului real, care pot fi colorați: nu sunt manechin).
Produsul fără I (FD25BK, natură moartă): segmentul nu se aplică.

Item = {"id", "path", "kind": "control"|"candidat"|"packshot", "product"?, "zones_dir"?, "source"?}.
"""
# ruff: noqa: E501
from __future__ import annotations

import gc
import importlib.util
import sys
import time
from pathlib import Path
from typing import Any, Callable

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # -I nu pune directorul scriptului pe sys.path
import checks_models_lib as cm  # noqa: E402
import pilot_lib as pl  # noqa: E402
import zones_lib as zl  # noqa: E402

YUNET_ID, SAM_ID, SIGLIP_ID, QWEN_ID, OCR_ID = "yunet-2023mar", "sam2.1-hiera-large", "siglip2-so400m-patch14-384", "qwen3-vl-4b-instruct", "rapidocr-ppocrv5-onnx"
YUNET_FLOOR = 0.3  # scorul minim reținut în semnal; decizia se ia cu pragul calibrat
LOGO_PREFIX = ("logo", "eticheta", "emblema")

SIGLIP_SETS = {  # (manechin/obiect, persoană); primele trei = formulările inițiale, restul alternative pentru a alege subsetul care separă
    "haine": [
        ("a store mannequin or dress form displaying a garment", "a real person wearing the garment"),
        ("a headless plastic mannequin torso on a stand", "a real human being wearing clothes"),
        ("a dress form with no head in a showroom", "a photo of a man or woman dressed in work clothes"),
        ("a photo of a mannequin", "a photo of a person"),
        ("a plastic display torso on a pole stand", "a human torso with skin and a head"),
        ("a faceless grey dummy", "a human worker with a face"),
    ],
    "bocanc": [
        ("a boot placed on the ground with no people", "a person wearing the boot"),
        ("a single work boot standing alone on the floor", "a person standing in work boots"),
        ("a product photo of an empty boot", "a human leg wearing a boot"),
        ("a photo of a boot on a surface", "a photo of a person"),
        ("an empty boot with nothing inside", "a foot and leg inside a boot"),
        ("a still life of footwear", "a worker walking in boots"),
    ],
}
VLM_QUESTION = ("Is there any human being in this image (a face, a head, hands, a body or a human silhouette)? "
                "Answer with a single word: yes or no.")


def _fm():
    spec = importlib.util.spec_from_file_location("fetch_models", HERE / "fetch_models.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def model_dir_verified(models_dir: Path, model_id: str) -> tuple[Path, dict]:
    """Verifică mărime + sha256 din manifest; întoarce (director, {id, revizie, sha256 = hash peste hash-urile fișierelor})."""
    import hashlib
    fm = _fm()
    man = fm.load_manifest(fm.DEFAULT_MANIFEST)
    m = next(x for x in man["models"] if x["id"] == model_id)
    h = hashlib.sha256()
    first = None
    for e in m["files"]:
        dest = fm.resolve_dest(models_dir, model_id, e["path"])
        reason = fm.verify_file(dest, e["size"], e["sha256"])
        if reason:
            raise SystemExit(f"{model_id}/{e['path']} invalid: {reason}")
        h.update(e["path"].encode() + b"\0" + e["sha256"].encode() + b"\0")
        first = first or dest
    return first.parent, {"id": model_id, "revizie": m["revision"], "sha256": h.hexdigest()}


def load_rgb(path: str | Path) -> np.ndarray:
    with Image.open(path) as im:
        return np.asarray(im.convert("RGB"), dtype=np.uint8).copy()


def _free() -> None:
    gc.collect()
    try:
        import torch
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
    except Exception:  # noqa: BLE001,S110
        pass


class Ctx:
    """Zone și sursă per produs, încărcate o dată."""

    def __init__(self) -> None:
        self.z: dict[str, dict] = {}
        self.ref: dict[str, np.ndarray] = {}

    def zones(self, item: dict) -> dict | None:
        if not item.get("zones_dir"):
            return None
        p = item["product"]
        if p not in self.z:
            self.z[p] = pl.load_zones(Path(item["zones_dir"]))
        return self.z[p]

    def placed_ref(self, item: dict) -> np.ndarray:
        p = item["product"]
        if p not in self.ref:
            self.ref[p] = pl.place(pl.load_source_rgb(Path(item["source"])), self.zones(item))["ref"]
        return self.ref[p]


# ---------------------------------------------------------------- fețe

def stage_faces(models_dir: Path, items: list[dict], ctx: Ctx) -> tuple[dict, dict]:
    import cv2
    mdir, info = model_dir_verified(models_dir, YUNET_ID)
    onnx = str(mdir / "face_detection_yunet_2023mar.onnx")
    out = {}
    for it in items:
        rgb = load_rgb(it["path"])
        res = {}
        for tag, scale in (("1x", 1), ("2x", 2)):
            im = rgb if scale == 1 else np.asarray(Image.fromarray(rgb).resize((rgb.shape[1] * 2, rgb.shape[0] * 2), Image.LANCZOS))
            bgr = np.ascontiguousarray(im[..., ::-1])
            det = cv2.FaceDetectorYN.create(onnx, "", (bgr.shape[1], bgr.shape[0]), YUNET_FLOOR, 0.3, 5000)
            _, faces = det.detect(bgr)
            res[f"max_score_{tag}"] = float(faces[:, -1].max()) if faces is not None and len(faces) else 0.0
            res[f"n_{tag}"] = 0 if faces is None else int(len(faces))
        out[it["id"]] = res
    return out, info


# ---------------------------------------------------------------- SigLIP2

def stage_siglip(models_dir: Path, items: list[dict], ctx: Ctx) -> tuple[dict, dict]:
    import torch
    from transformers import AutoModel, AutoProcessor
    mdir, info = model_dir_verified(models_dir, SIGLIP_ID)
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    proc = AutoProcessor.from_pretrained(str(mdir), local_files_only=True, trust_remote_code=False)
    model = AutoModel.from_pretrained(str(mdir), local_files_only=True, use_safetensors=True, trust_remote_code=False, dtype=torch.float32).to(dev).eval()
    out = {}
    labels, idx = [], {}
    for sname, pairs in SIGLIP_SETS.items():
        for k, (a, b) in enumerate(pairs):
            idx[(sname, k)] = (len(labels), len(labels) + 1)
            labels += [a, b]
    for it in items:
        img = Image.fromarray(load_rgb(it["path"]))
        inp = proc(text=labels, images=img, padding="max_length", max_length=64, return_tensors="pt").to(dev)
        with torch.inference_mode():
            lg = model(**inp).logits_per_image[0].float().cpu()
        res = {}
        for sname, pairs in SIGLIP_SETS.items():
            prs = []
            for k in range(len(pairs)):
                i, j = idx[(sname, k)]
                p = torch.softmax(lg[[i, j]], dim=0)
                prs.append({"p_mannequin": float(p[0]), "p_person": float(p[1])})
            res[sname] = {"pairs": prs}
        out[it["id"]] = res
    del model, proc
    _free()
    return out, info


# ---------------------------------------------------------------- Qwen3-VL (auxiliar)

def stage_qwen(models_dir: Path, items: list[dict], ctx: Ctx) -> tuple[dict, dict]:
    import torch
    from transformers import AutoProcessor, Qwen3VLForConditionalGeneration
    mdir, info = model_dir_verified(models_dir, QWEN_ID)
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    proc = AutoProcessor.from_pretrained(str(mdir), local_files_only=True, trust_remote_code=False)
    model = Qwen3VLForConditionalGeneration.from_pretrained(str(mdir), local_files_only=True, use_safetensors=True, trust_remote_code=False, dtype=torch.bfloat16).to(dev).eval()
    tok = proc.tokenizer
    yes = sorted({tok.encode(w, add_special_tokens=False)[0] for w in ("Yes", "yes", "YES")})
    no = sorted({tok.encode(w, add_special_tokens=False)[0] for w in ("No", "no", "NO")})
    out = {}
    for it in items:
        img = Image.fromarray(load_rgb(it["path"]))
        s = 768 / max(img.size)
        if s < 1:
            img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
        msgs = [{"role": "user", "content": [{"type": "image", "image": img}, {"type": "text", "text": VLM_QUESTION}]}]
        inp = proc.apply_chat_template(msgs, add_generation_prompt=True, tokenize=True, return_dict=True, return_tensors="pt").to(dev)
        with torch.inference_mode():
            lg = model(**inp).logits[0, -1].float().cpu()
        ly, ln = torch.logsumexp(lg[yes], 0), torch.logsumexp(lg[no], 0)
        py = float(torch.softmax(torch.stack([ly, ln]), 0)[0])
        top = tok.decode([int(lg.argmax())])
        out[it["id"]] = {"p_yes": py, "top_token": top}
    del model, proc
    _free()
    return out, info


# ---------------------------------------------------------------- SAM -> segment

def segment_region(alpha: np.ndarray) -> np.ndarray:
    x0, y0, x1, y1 = zl.bbox_of(alpha > 127)
    h, w = alpha.shape
    pw, ph = int(0.08 * (x1 - x0)), int(0.08 * (y1 - y0))
    reg = np.zeros((h, w), bool)
    reg[max(0, y0 - ph):min(h, y1 + int(0.30 * (y1 - y0))), max(0, x0 - pw):min(w, x1 + pw)] = True
    return reg


def interior_point(I: np.ndarray) -> tuple[float, float]:  # noqa: N803,E741
    ys, xs = np.nonzero(I)
    cy, cx = ys.mean(), xs.mean()
    k = int(np.argmin((ys - cy) ** 2 + (xs - cx) ** 2))
    return float(xs[k]), float(ys[k])


def build_segment(I: np.ndarray, sam: np.ndarray, region: np.ndarray, L: np.ndarray, E: np.ndarray) -> np.ndarray:  # noqa: N803,E741
    return (I | (sam & region)) & ~(L | E)


def stage_sam(models_dir: Path, items: list[dict], ctx: Ctx) -> tuple[dict, dict]:
    import torch
    from transformers import Sam2Model, Sam2Processor
    mdir, info = model_dir_verified(models_dir, SAM_ID)
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    kw = {"local_files_only": True, "use_safetensors": True, "trust_remote_code": False}
    proc = Sam2Processor.from_pretrained(str(mdir), **kw)
    model = Sam2Model.from_pretrained(str(mdir), **kw).to(dev).eval()
    out = {}
    for it in items:
        z = ctx.zones(it)
        if z is None:
            continue
        if not z["I"].any():
            out[it["id"]] = {"applicable": False, "segment": None}
            continue
        rgb = load_rgb(it["path"])
        px, py = interior_point(z["I"])
        batch = proc(images=Image.fromarray(rgb), input_points=[[[[px, py]]]], input_labels=[[[1]]], return_tensors="pt").to(dev)
        with torch.inference_mode():
            o = model(**batch, multimask_output=False)
        m = proc.post_process_masks(o.pred_masks.cpu(), batch["original_sizes"])[0][0, 0].numpy().astype(bool)
        seg = build_segment(z["I"], m, segment_region(z["alpha"]), z["L"], z["E"])
        out[it["id"]] = {"applicable": True, "segment": cm.segment_signals(rgb, seg), "sam_px": int(m.sum()), "seg_px": int(seg.sum())}
    del model, proc
    _free()
    return out, info


# ---------------------------------------------------------------- OCR

def make_ocr(models_dir: Path):
    from rapidocr import RapidOCR
    mdir, info = model_dir_verified(models_dir, OCR_ID)
    eng = RapidOCR(params={"Det.model_path": str(mdir / "ch_PP-OCRv5_det_mobile.onnx"), "Rec.model_path": str(mdir / "latin_PP-OCRv5_rec_mobile.onnx"),
                           "Global.use_cls": False, "Global.log_level": "error"})
    return eng, info


def ocr_items(eng, rgb: np.ndarray, scales: tuple[float, ...] = (1.0,)) -> list[dict]:
    res = []
    for s in scales:
        im = rgb if s == 1 else np.asarray(Image.fromarray(rgb).resize((round(rgb.shape[1] * s), round(rgb.shape[0] * s)), Image.LANCZOS))
        r = eng(np.ascontiguousarray(im[..., ::-1]), use_cls=False)
        if r is None or r.txts is None:
            continue
        res += [{"text": str(t), "conf": float(c), "scale": s} for t, c in zip(r.txts, r.scores)]
    return res


def neutral_fill(rgb: np.ndarray, hide: np.ndarray) -> np.ndarray:
    """Mascare neutră: pixelii `hide` primesc culoarea mediană a inelului de 4-24 px din jur (nu creează text nou)."""
    ring = zl.dilate(hide, 24) & ~zl.dilate(hide, 4)
    col = np.median(rgb[ring], axis=0) if ring.any() else np.array([128, 128, 128])
    out = rgb.copy()
    out[hide] = col.astype(np.uint8)
    return out


def stage_ocr(models_dir: Path, items: list[dict], ctx: Ctx) -> tuple[dict, dict]:
    eng, info = make_ocr(models_dir)
    out = {}
    for it in items:
        rgb = load_rgb(it["path"])
        z = ctx.zones(it)
        res: dict[str, Any] = {}
        if z is None:
            res["decor"] = ocr_items(eng, rgb, (1.0, 2.0))
        else:
            res["decor"] = ocr_items(eng, neutral_fill(rgb, z["L"] | z["E"]), (1.0, 2.0))
            ref = ctx.placed_ref(it)
            logos = {}
            for name, m in z["critical"].items():
                if not name.startswith(LOGO_PREFIX):
                    continue
                x0, y0, x1, y1 = zl.bbox_of(m)
                keep = zl.dilate(m, 3)
                pad = 8
                sl = (slice(max(0, y0 - pad), y1 + pad), slice(max(0, x0 - pad), x1 + pad))
                crops = []
                for src in (ref, rgb):
                    c = src.copy()
                    c[~keep] = 128  # doar logo + 3 px (incl. banda E); restul identic, neutru
                    crops.append(ocr_items(eng, c[sl], (3.0,)))
                logos[name] = {"original": crops[0], "candidat": crops[1]}
            res["logo"] = logos
        out[it["id"]] = res
    del eng
    _free()
    return out, info


def skin_whole(item: dict, ctx: Ctx) -> float:
    """Fracția de piele pe imaginea întreagă; la candidați, fără pixelii produsului real (L ∪ E), care pot avea culori calde."""
    rgb = load_rgb(item["path"])
    z = ctx.zones(item)
    return cm.skin_fraction(rgb, None if z is None else ~(z["L"] | z["E"]))


STAGES: dict[str, Callable] = {"faces": stage_faces, "ocr": stage_ocr, "siglip": stage_siglip, "sam": stage_sam, "qwen": stage_qwen}


def collect(models_dir: Path, items: list[dict], stages: list[str], log: Callable[[str], None] = print) -> tuple[dict, dict, dict]:
    """Rulează etapele pe rând peste toate imaginile. Întoarce (semnale[id][etapa], modele[etapa], timpi[etapa])."""
    ctx, sig, models, times = Ctx(), {it["id"]: {} for it in items}, {}, {}
    for st in stages:
        t0 = time.perf_counter()
        try:
            res, info = STAGES[st](models_dir, items, ctx)
        except Exception as e:  # noqa: BLE001
            log(f"etapa {st} EȘUATĂ: {type(e).__name__}: {e}")
            models[st] = {"eroare": f"{type(e).__name__}: {e}"}
            times[st] = round(time.perf_counter() - t0, 2)
            _free()
            continue
        for k, v in res.items():
            sig[k][st] = v
        models[st], times[st] = info, round(time.perf_counter() - t0, 2)
        log(f"etapa {st}: {len(res)} imagini în {times[st]}s")
        _free()
    return sig, models, times
