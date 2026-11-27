"""Planșe pentru telefon (lățime EXACT 1170 px) per candidat de scenă: antet, original | scenă, zone + zoom pe margini,
zoom pe logo/benzi (vecin cel mai apropiat) și verdictul fișei. Doar Pillow + numpy + stdlib; fără modele, fără rețea.

Rulare (o planșă pe apel; `index.txt` se reface din toate JPG-urile din --out-dir):
  python -I make_planse.py --cand-dir <cand/PRODUS-context-sSEED> --source <packshot.jpg> --zones-dir <PRODUS/zones> \
      --out-dir <planse> --base-planse <planse>

Reguli: căi fără `..`; ieșirea trebuie să fie sub --base-planse; candidatul trebuie să aibă `rezultat_global` true în fișa
finală (altfel eroare, cod 2); un JPG existent NU se suprascrie (creare exclusivă). Planșele nu intră în git.
"""
# ruff: noqa: E501, E741
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I nu pune directorul scriptului pe sys.path
import fisa_lib as fl  # noqa: E402
import integrity_lib as ilib  # noqa: E402

FISA_NAME = "fisa_finala_v3.json"
WIDTH = 1170
HALF = 585
QUALITY = 88
GAP = 6
STRIP = 32  # înălțimea benzii de etichetă
EDGE_ZOOM = 2
EDGE_SRC = 146  # decupaj sursă pentru zoom pe margini (2x -> 292 px)
EDGE_K = 3
TILE_MAX_W = 570
TILE_MAX_H = 440
CAND_RE = re.compile(r"([A-Z0-9]+)-([a-z0-9_]+)-s(\d+)")  # cu fullmatch (nu `$`, care ar accepta și un \n final)
FONT_CANDIDATES = (
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)
PRODUCT_NAMES = {"S476YE": "vestă reflectorizantă", "BZ739OR": "geacă", "FD25BK": "bocanc"}
LABELS = {
    "transform": "transformare", "identity_master": "identitate L (max|Δ|)", "mirror": "oglindire",
    "scale_not_up": "fără mărire", "halo": "halo", "color_spill": "scurgere culoare (spill)", "decor_fluo": "decor fluo",
    "faces": "fețe", "siglip2_mannequin": "SigLIP manechin", "vlm_ne_uman": "VLM ne-uman", "skin_whole_image": "piele",
    "segment_achromatic_no_skin": "segment acromatic", "head_shape": "formă cap", "ne_uman": "ne-uman",
    "veto_manual": "veto manual", "ocr_decor_si_zona_I": "OCR decor/zonă I", "boots_two_info": "al doilea bocanc (info)",
}
GREEN, BLUE, RED, YELLOW = (0, 200, 0), (30, 90, 255), (255, 30, 30), (255, 220, 0)
BG, STRIP_BG, WHITE, OKC, BADC = (24, 24, 28), (52, 52, 60), (255, 255, 255), (90, 220, 110), (255, 90, 90)


class PlanseError(ValueError):
    pass


# ---------- căi ----------
def safe_path(p: str | Path) -> Path:
    path = Path(p)
    if ".." in path.parts:
        raise PlanseError(f"cale cu '..': {p}")
    return path.resolve()


def ensure_under(child: Path, base: Path) -> None:
    c, b = child.resolve(), base.resolve()
    if c != b and b not in c.parents:
        raise PlanseError(f"ieșirea {c} nu e sub {b}")


# ---------- funcții pure: geometrie ----------
def assert_width(w: int) -> None:
    if w != WIDTH:
        raise PlanseError(f"lățime {w} != {WIDTH}")


def clamp_window(x0: int, y0: int, w: int, h: int, W: int, H: int) -> tuple[int, int, int, int]:
    """Fereastra (x0, y0, x1, y1) de mărime cel mult w×h, mutată/redusă ca să încapă în imaginea W×H."""
    w, h = min(w, W), min(h, H)
    x0 = max(0, min(x0, W - w))
    y0 = max(0, min(y0, H - h))
    return x0, y0, x0 + w, y0 + h


def box_window(box: list[int], pad: int, W: int, H: int) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = box
    x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + 1 + pad), min(H, y1 + 1 + pad)
    if x1 <= x0 or y1 <= y0:
        raise PlanseError(f"cutie în afara imaginii: {box}")
    return x0, y0, x1, y1


def magnify_nearest(img: Image.Image, s: int) -> Image.Image:
    if s < 1:
        raise PlanseError("factor < 1")
    return img.resize((img.width * s, img.height * s), Image.Resampling.NEAREST)


def fit_scale(w: int, h: int, max_w: int = TILE_MAX_W, max_h: int = TILE_MAX_H) -> tuple[int, tuple[int, int]]:
    """Cel mai mare factor întreg din (3, 2, 1) la care w×h încape; altfel 1 și dimensiunea de decupaj (centrat)."""
    for s in (3, 2, 1):
        if w * s <= max_w and h * s <= max_h:
            return s, (w, h)
    return 1, (min(w, max_w), min(h, max_h))


def pick_edge_windows(mask: np.ndarray, size: int, k: int) -> list[tuple[int, int, int, int]]:
    """k ferestre size×size cu cele mai multe pixeli de mască (E), greedy, cu suprimare a vecinilor; toate în imagine."""
    H, W = mask.shape
    size = min(size, W, H)
    ii = np.pad(mask.astype(np.int64).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    ny, nx = H - size + 1, W - size + 1
    score = ii[size:size + ny, size:size + nx] - ii[0:ny, size:size + nx] - ii[size:size + ny, 0:nx] + ii[0:ny, 0:nx]
    score = score.astype(np.int64).copy()
    sup = int(size * 3)
    out = []
    for _ in range(k):
        if score.size == 0 or score.max() <= 0:
            break
        y, x = np.unravel_index(int(score.argmax()), score.shape)
        out.append((int(x), int(y), int(x) + size, int(y) + size))
        score[max(0, y - sup + 1):y + sup, max(0, x - sup + 1):x + sup] = -1
    return out


def shelf_layout(sizes: list[tuple[int, int]], width: int, gap: int) -> tuple[list[tuple[int, int]], int]:
    """Împachetare pe rafturi: poziții (x, y) pentru dreptunghiuri (w, h) pe lățimea `width`; întoarce și înălțimea."""
    pos, x, y, row_h = [], 0, 0, 0
    for w, h in sizes:
        if w > width:
            raise PlanseError(f"dreptunghi {w} > lățime {width}")
        if x and x + w > width:
            x, y, row_h = 0, y + row_h + gap, 0
        pos.append((x, y))
        x += w + gap
        row_h = max(row_h, h)
    return pos, (y + row_h if sizes else 0)


def validate_layout(layout: dict) -> None:
    """Pică dacă lățimea nu e exact 1170 sau vreun dreptunghi iese din planșă."""
    assert_width(layout["width"])
    for name, (x, y, w, h) in layout["rects"].items():
        if x < 0 or y < 0 or x + w > layout["width"] or y + h > layout["height"]:
            raise PlanseError(f"dreptunghiul {name} {(x, y, w, h)} iese din planșa {layout['width']}×{layout['height']}")


# ---------- fișă și verdict ----------
def fmt_value(v) -> str:
    if v is None:
        return "-"
    if isinstance(v, bool):
        return "da" if v else "nu"
    if isinstance(v, float):
        return f"{v:.4g}"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return v[:24]
    if isinstance(v, list):
        return "[]" if not v else f"{len(v)} elem."
    if isinstance(v, dict):
        parts = [f"{re.sub('^max_score_', '', str(k))}={fmt_value(x)}" for k, x in v.items() if isinstance(x, (int, float, str)) and not isinstance(x, bool)]
        return " ".join(parts[:3]) or "-"
    return str(v)[:24]


def verdict_lines(verificari: list[dict]) -> list[tuple[bool, str, bool]]:
    """(passed, text, informativ): o verificare `informativ` (ex. OCR logo neconcludent) se afișează „INFO”, nu „OK”."""
    out = []
    for v in verificari:
        name = v["name"]
        label = LABELS.get(name) or ("OCR logo " + name.split(":", 1)[1].replace("_", " ") if name.startswith("ocr_logo:") else name)
        thr = v.get("threshold")
        extra = f" ≤{fmt_value(thr)}" if isinstance(thr, (int, float)) and not isinstance(thr, bool) and name in ("halo", "color_spill", "decor_fluo", "mirror") else ""
        out.append((v.get("passed") is True, f"{label}: {fmt_value(v.get('value'))}{extra}", v.get("informativ") is True))
    return out


def load_candidate(cand_dir: Path, fisa_name: str) -> dict:
    m = CAND_RE.fullmatch(cand_dir.name)
    if not m:
        raise PlanseError(f"nume de candidat neașteptat: {cand_dir.name}")
    fp = cand_dir / fisa_name
    if not fp.is_file():
        raise PlanseError(f"fișa lipsește: {fp}")
    fisa = json.loads(fp.read_text(encoding="utf-8"))
    ver = fisa.get("verificari")
    if fisa.get("rezultat_global") is not True:
        raise PlanseError(f"{cand_dir.name}: rezultat_global nu e true în {fisa_name}")
    if not isinstance(ver, list) or not ver or not all(isinstance(v, dict) and v.get("passed") is True for v in ver):
        raise PlanseError(f"{cand_dir.name}: fișa are verificări picate sau lipsă")
    if fisa.get("produs") != m.group(1) or fisa.get("context") != m.group(2) or str(fisa.get("seed")) != m.group(3):
        raise PlanseError(f"{cand_dir.name}: fișa (produs/context/seed) nu corespunde numelui")
    return fisa


def model_id(fisa: dict) -> str:
    m = fisa.get("model")
    return str(m.get("id", "?") if isinstance(m, dict) else m)[:40]


def out_name(fisa: dict) -> str:
    return f"{fisa['produs']}_{fisa['context']}_s{fisa['seed']}.jpg"


# ---------- desen ----------
def load_font(size: int) -> ImageFont.ImageFont:
    for p in FONT_CANDIDATES:
        if Path(p).is_file():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default(size)


def fit_text(d: ImageDraw.ImageDraw, s: str, font, maxw: int) -> str:
    while len(s) > 1 and d.textlength(s, font=font) > maxw:
        s = s[:-2] + "…"
    return s


def mask_png(p: Path, shape: tuple[int, int]) -> np.ndarray:
    if not p.is_file():
        return np.zeros(shape, dtype=bool)
    a = np.asarray(Image.open(p).convert("L")) > 127
    if a.shape != shape:
        raise PlanseError(f"mască {p.name} {a.shape} != imagine {shape}")
    return a


def overlay(scene: Image.Image, L: np.ndarray, E: np.ndarray, I: np.ndarray, boxes: list[list[int]]) -> Image.Image:
    arr = np.asarray(scene.convert("RGB")).astype(np.float64)
    for m, col in ((L, GREEN), (E, BLUE), (I, RED)):
        arr[m] = arr[m] * 0.55 + np.array(col) * 0.45
    img = Image.fromarray(arr.astype(np.uint8))
    d = ImageDraw.Draw(img)
    for b in boxes:
        d.rectangle(b, outline=YELLOW, width=3)
    return img


def crop_pair(src: Image.Image, scene: Image.Image, win: tuple[int, int, int, int], s: int) -> tuple[Image.Image, Image.Image]:
    return magnify_nearest(src.crop(win), s), magnify_nearest(scene.crop(win), s)


def tag(d: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font) -> None:
    w = int(d.textlength(text, font=font)) + 8
    d.rectangle([xy[0], xy[1], xy[0] + w, xy[1] + 26], fill=(0, 0, 0))
    d.text((xy[0] + 4, xy[1] + 1), text, font=font, fill=WHITE)


def build_planse(cand_dir: Path, source: Image.Image, zones_dir: Path, fisa: dict, fisa_name: str = "", master: Image.Image | None = None,
                 masks: dict | None = None, zone_json: dict | None = None) -> Image.Image:
    """`master`/`masks`/`zone_json`: octeții deja verificați față de fișă (main); lipsă = se citesc din director (doar pentru teste cu fixturi)."""
    scene = master.convert("RGB") if master is not None else Image.open(cand_dir / "master.png").convert("RGB")
    src = source.convert("RGB")
    if scene.size != src.size:
        raise PlanseError(f"master {scene.size} != sursă {src.size}")
    Wd, Hd = scene.size
    zj = zone_json if zone_json is not None else json.loads((zones_dir / "zone.json").read_text(encoding="utf-8"))
    if masks is not None:
        L, E, I = masks["L"], masks["E"], masks["I"]
        for n, m in (("L", L), ("E", E), ("I", I)):
            if m.shape != (Hd, Wd):
                raise PlanseError(f"mască {n} {m.shape} != imagine {(Hd, Wd)}")
    else:
        L, E, I = (mask_png(zones_dir / f"{n}.png", (Hd, Wd)) for n in ("L", "E", "I"))
    crit = zj.get("critical", [])
    f24, f22, f34 = load_font(24), load_font(22), load_font(34)

    # --- calcul layout ---
    edge_wins = pick_edge_windows(E, EDGE_SRC, EDGE_K)
    tile = EDGE_SRC * EDGE_ZOOM
    row2_h = max(STRIP + HALF + 4 * 30, len(edge_wins) * (STRIP + tile + GAP))
    tiles = []
    for c in crit:
        x0, y0, x1, y1 = box_window(c["bbox"], 6, Wd, Hd)
        s, (cw, ch) = fit_scale(x1 - x0, y1 - y0)
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        win = clamp_window(cx - cw // 2, cy - ch // 2, cw, ch, Wd, Hd)
        label = c["name"].replace("_", " ") + f" {s}×"
        tiles.append((win, s, label))
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    sizes = []
    for win, s, label in tiles:
        tw = (win[2] - win[0]) * s
        pw = max(2 * tw + GAP, int(probe.textlength(label, font=f24)) + 20)
        sizes.append((pw, STRIP + (win[3] - win[1]) * s))
    pos3, h3 = shelf_layout(sizes, WIDTH, 12)
    vlines = verdict_lines(fisa["verificari"])
    nrows = (len(vlines) + 1) // 2
    head_h, sec = 150, STRIP + 6
    y_row1 = head_h
    y_row2 = y_row1 + STRIP + HALF + 14
    y_row3 = y_row2 + row2_h + 14
    y_row4 = y_row3 + sec + h3 + 14
    height = y_row4 + sec + nrows * 32 + 16
    rects = {"head": (0, 0, WIDTH, head_h), "orig": (0, y_row1 + STRIP, HALF, HALF), "scena": (HALF, y_row1 + STRIP, HALF, HALF),
             "zone": (0, y_row2 + STRIP, HALF, HALF), "verdict": (0, y_row4, WIDTH, height - y_row4)}
    for i, (p, sz) in enumerate(zip(pos3, sizes)):
        rects[f"crit{i}"] = (p[0], y_row3 + sec + p[1], sz[0], sz[1])
    for i in range(len(edge_wins)):
        rects[f"edge{i}"] = (HALF, y_row2 + i * (STRIP + tile + GAP), HALF, STRIP + tile)
    layout = {"width": WIDTH, "height": height, "rects": rects}
    validate_layout(layout)

    # --- desen ---
    im = Image.new("RGB", (WIDTH, height), BG)
    d = ImageDraw.Draw(im)

    def strip(x, y, w, text):
        d.rectangle([x, y, x + w - 1, y + STRIP - 1], fill=STRIP_BG)
        d.text((x + 8, y + 3), fit_text(d, text, f24, w - 16), font=f24, fill=WHITE)

    prod = fisa["produs"]
    d.text((16, 14), f"{prod}-{fisa['context']}-s{fisa['seed']}", font=f34, fill=WHITE)
    d.text((16, 62), f"{PRODUCT_NAMES.get(prod, prod)} · context: {fisa['context'].replace('_', ' ')}", font=f24, fill=WHITE)
    d.text((16, 98), f"model {model_id(fisa)} · rezultat global: OK", font=f22, fill=OKC)
    strip(0, y_row1, HALF, "ORIGINAL (packshot)")
    strip(HALF, y_row1, HALF, "SCENĂ (master)")
    im.paste(src.resize((HALF, HALF), Image.Resampling.LANCZOS), (0, y_row1 + STRIP))
    im.paste(scene.resize((HALF, HALF), Image.Resampling.LANCZOS), (HALF, y_row1 + STRIP))
    strip(0, y_row2, HALF, "ZONE peste scenă")
    ov = overlay(scene, L, E, I, [c["bbox"] for c in crit]).resize((HALF, HALF), Image.Resampling.LANCZOS)
    im.paste(ov, (0, y_row2 + STRIP))
    ly = y_row2 + STRIP + HALF + 4
    for i, (col, txt) in enumerate(((GREEN, "L = pixeli păstrați identic"), (BLUE, "E = margine (mixaj)"),
                                    (RED, "I = interior (gol)"), (YELLOW, "cutii critice (logo/benzi)"))):
        d.rectangle([8, ly + i * 30 + 4, 28, ly + i * 30 + 24], fill=col)
        d.text((38, ly + i * 30 + 1), txt, font=f22, fill=WHITE)
    for i, win in enumerate(edge_wins):
        ox, oy = HALF, y_row2 + i * (STRIP + tile + GAP)
        strip(ox, oy, HALF, f"margine 2× x{win[0]} y{win[1]}")
        a, b = crop_pair(src, scene, win, EDGE_ZOOM)
        im.paste(a, (ox, oy + STRIP))
        im.paste(b, (ox + tile + GAP, oy + STRIP))
        tag(d, (ox + 4, oy + STRIP + 4), "ORIG", f22)
        tag(d, (ox + tile + GAP + 4, oy + STRIP + 4), "SCENĂ", f22)
    strip(0, y_row3, WIDTH, "LOGO / BENZI critice (vecin cel mai apropiat)")
    for i, ((win, s, label), p, sz) in enumerate(zip(tiles, pos3, sizes)):
        x, y = p[0], y_row3 + sec + p[1]
        strip(x, y, sz[0], label)
        a, b = crop_pair(src, scene, win, s)
        im.paste(a, (x, y + STRIP))
        im.paste(b, (x + a.width + GAP, y + STRIP))
        tag(d, (x + 2, y + STRIP + 2), "ORIG", f22)
        tag(d, (x + a.width + GAP + 2, y + STRIP + 2), "SCENĂ", f22)
    strip(0, y_row4, WIDTH, "VERDICT fișă (toate trebuie OK)")
    for i, (ok, txt, info) in enumerate(vlines):
        col, row = divmod(i, nrows)
        x, y = 10 + col * HALF, y_row4 + sec + row * 32
        d.text((x, y), ("INFO" if info else "OK") if ok else "PICAT", font=f22, fill=(YELLOW if info else OKC) if ok else BADC)
        d.text((x + 76, y), fit_text(d, txt, f22, HALF - 90), font=f22, fill=WHITE)
    assert_width(im.width)
    return im


def jpeg_bytes(im: Image.Image) -> bytes:
    assert_width(im.width)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=QUALITY, subsampling=0, optimize=True)
    return buf.getvalue()


def write_index(out_dir: Path) -> list[str]:
    lines = []
    for p in sorted(out_dir.glob("*.jpg")):
        lines.append(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p}")
    tmp = out_dir / "index.txt.tmp"
    tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    tmp.replace(out_dir / "index.txt")
    return lines


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cand-dir", required=True)
    ap.add_argument("--source", required=True)
    ap.add_argument("--zones-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--base-planse", required=True)
    ap.add_argument("--fisa-name", default=FISA_NAME, help="fișa finală (același nume ca run_model_checks.py)")
    ap.add_argument("--registry", default=None, help="implicit: <cand-dir>/../../registru.jsonl; pe fluxul recompus (cand_v3/cand_v4) dați explicit <scene>/cand_vN/registru.jsonl")
    a = ap.parse_args(argv)
    try:
        if not fl.FILENAME_RE.fullmatch(a.fisa_name) or a.fisa_name.startswith("."):
            raise PlanseError(f"--fisa-name invalid: {a.fisa_name!r}")
        cand, source, zones = safe_path(a.cand_dir), safe_path(a.source), safe_path(a.zones_dir)
        out_dir, base = safe_path(a.out_dir), safe_path(a.base_planse)
        ensure_under(out_dir, base)
        registry = safe_path(a.registry) if a.registry else cand.parent.parent / "registru.jsonl"
        fisa = load_candidate(cand, a.fisa_name)
        try:  # imaginea din planșă = cea legată în fișă: re-hash master/raw/sursă/zone și fișa față de registru, ÎNAINTE de desen
            bound = ilib.verify_candidate_binding(cand, a.fisa_name, source, zones, registry)
        except ilib.IntegrityError as e:
            raise PlanseError(f"integritate: {e}") from e
        out_dir.mkdir(parents=True, exist_ok=True)
        data = jpeg_bytes(build_planse(cand, Image.open(source), zones, fisa, master=Image.open(io.BytesIO(bound["master_bytes"])),
                                       masks=bound["masks"], zone_json=bound["zone_json"]))
        target = out_dir / out_name(fisa)
        with open(target, "xb") as fh:  # creare exclusivă: nu suprascrie
            fh.write(data)
        write_index(out_dir)
    except (PlanseError, FileExistsError, FileNotFoundError, KeyError, json.JSONDecodeError) as e:
        print(f"EROARE: {type(e).__name__}: {e}", file=sys.stderr)
        return 2
    im = Image.open(target)
    print(f"{target} {im.width}x{im.height} {len(data) // 1024}KB sha256={hashlib.sha256(data).hexdigest()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
