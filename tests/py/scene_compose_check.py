"""Verificări pentru scripts/scene/{compose,checks,fisa}_lib.py pe imagini sintetice (Pillow + numpy, fără modele AI).

Rulare: python -I tests/py/scene_compose_check.py <ROOT>
POZITIV: compunere scale 1.0 pe 3 fundaluri, toate verificările trec, identitate 0, determinism, scale 0.75, export JPEG.
NEGATIV: fiecare încălcare trebuie să pice cu valoarea și mesajul exacte (linii „NEG ..." pe stdout, căutate de testul mjs).
Calibrare: liniile „CAL ..." arată valorile măsurate pe compuneri bune, după care s-au ales pragurile din checks_lib.
"""
# ruff: noqa: S101, E501, E741
import io
import json
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(ROOT / "scripts" / "scene"))
import checks_lib as ck  # noqa: E402
import compose_lib as cl  # noqa: E402
import fisa_lib as fl  # noqa: E402
import zones_lib as zl  # noqa: E402

N, CANVAS, DX, DY = 160, (320, 320), 80, 80
NAVY, ORANGE, GRAY, RED = (30, 50, 110), (255, 110, 0), (190, 190, 195), (200, 20, 30)


def make_product():
    """Produs sintetic: siluetă simetrică, conținut asimetric (logo în stânga), gât ghost (I), alpha moale."""
    poly = [(10, 30), (50, 15), (109, 15), (149, 30), (149, 60), (125, 60), (125, 145), (34, 145), (34, 60), (10, 60)]
    hard = Image.new("L", (N, N), 0)
    ImageDraw.Draw(hard).polygon(poly, fill=255)
    alpha = np.asarray(hard.filter(ImageFilter.GaussianBlur(0.7)), dtype=np.uint8).copy()
    fg = Image.new("RGB", (N, N), NAVY)
    d = ImageDraw.Draw(fg)
    d.rectangle([0, 90, N - 1, 100], fill=ORANGE)
    d.rectangle([0, 110, N - 1, 118], fill=GRAY)
    d.rectangle([40, 65, 60, 85], fill=RED)
    d.rectangle([44, 73, 56, 77], fill=(255, 255, 255))
    d.rectangle([66, 20, 93, 38], fill=(60, 60, 70))
    fg = np.asarray(fg, dtype=np.uint8).copy()
    a = alpha[..., None].astype(np.float64) / 255
    ref = np.rint(fg * a + 255 * (1 - a)).astype(np.uint8)
    interior = np.zeros((N, N), dtype=bool)
    interior[20:39, 66:94] = True
    crit = np.zeros((N, N), dtype=bool)
    crit[65:86, 40:61] = True
    crit, _ = zl.effective_critical(crit, alpha)
    L, E, I = zl.build_zones(alpha, interior, [crit], zl.DEFAULT_PARAMS)
    assert zl.validate_zones(alpha, L, E, I, {"logo": crit}, zl.DEFAULT_PARAMS) == []
    return ref, fg, alpha, L, E, I, {"logo": crit}


def backgrounds():
    dark = np.full((CANVAS[1], CANVAS[0], 3), (28, 28, 34), dtype=np.uint8)
    light = np.full_like(dark, (205, 205, 210))
    t = np.linspace(0, 1, CANVAS[1])[:, None, None]
    grad = np.rint(np.array((20, 40, 60)) * (1 - t) + np.array((200, 190, 170)) * t).astype(np.uint8)
    grad = np.broadcast_to(grad, dark.shape).copy()
    return {"intunecat": dark, "deschis": light, "gradient": grad}


def paste(arr):
    out = np.zeros((CANVAS[1], CANVAS[0], 3), dtype=np.uint8)
    out[DY : DY + N, DX : DX + N] = arr
    return out


def neg(name, res, needle):
    assert res["passed"] is False, f"NEGATIV {name}: ar fi trebuit să pice: {res}"
    assert needle in res["detail"] or needle in json.dumps(res["value"]), f"NEGATIV {name}: mesaj fără {needle!r}: {res}"
    print(f"NEG {name}: pică ca să fie corect | value={res['value']} threshold={res['threshold']} | {res['detail']}")


def neg_raises(name, exc, needle, fn):
    try:
        fn()
    except exc as e:
        assert needle in str(e), f"NEGATIV {name}: mesaj fără {needle!r}: {e}"
        print(f"NEG {name}: refuzat | {e}")
        return
    raise AssertionError(f"NEGATIV {name}: nu a ridicat {exc.__name__}")


def run_all(placed, output, src, alpha, L, E, I, crit, params):  # noqa: E741
    return [
        ck.check_transform(params),
        ck.check_identity_master(output, placed["ref"], placed["L"]),
        ck.detect_mirror(output, placed["ref"], placed["L"]),
        ck.check_scale_not_up(output, src, alpha, L, E, I, crit, CANVAS, params),
        ck.check_halo(output, placed),
        ck.check_color_spill(output, placed),
        ck.check_decor_fluo(output, placed),
    ]


def main():  # noqa: C901
    src, fg, alpha, L, E, I, crit = make_product()
    placed = cl.place_product(src, alpha, L, E, I, crit, CANVAS, 1.0, DX, DY)
    params = placed["params"]
    fg_placed = paste(fg)
    Lm = ck.eroded_L(placed["L"])

    # ---- pozitiv + calibrare pe 3 fundaluri
    outs = {}
    for name, bg in backgrounds().items():
        out = cl.compose(placed, bg, fg_placed)
        outs[name] = out
        res = run_all(placed, out, src, alpha, L, E, I, crit, params)
        assert all(r["passed"] for r in res), f"pozitiv {name}: {[r for r in res if not r['passed']]}"
        assert res[1]["value"] == 0
        out_ref_fg = cl.compose(placed, bg)  # F = referința (franjuri albe din alpha moale)
        h_good, h_ref = res[4], ck.check_halo(out_ref_fg, placed)
        print(f"CAL halo fundal={name}: F estimat -> p{ck.HALO_PCTL} inel={h_good['value']} prag={h_good['threshold']} "
              f"(exces {h_good['value'] - h_good['threshold'] + ck.HALO_DELTA:+.2f}); F=referință -> inel={h_ref['value']} "
              f"exces {h_ref['value'] - h_ref['threshold'] + ck.HALO_DELTA:+.2f} trece={h_ref['passed']}")
        print(f"CAL spill fundal={name}: frac={res[5]['value']} (prag {ck.SPILL_MAX_FRAC}); fluo frac={res[6]['value']} (prag {ck.FLUO_MAX_FRAC})")
        print(f"POS compunere fundal={name}: {len(res)} verificări trec, identitate max|Δ|={res[1]['value']}")
    # decor gri / albastru / maro închis nu declanșează fluo
    for nm, col in (("gri", (110, 110, 115)), ("albastru", (30, 60, 140)), ("maro-inchis", (60, 40, 25))):
        o = cl.compose(placed, np.full((CANVAS[1], CANVAS[0], 3), col, dtype=np.uint8), fg_placed)
        r = ck.check_decor_fluo(o, placed)
        assert r["passed"] and r["value"] == 0, r
        print(f"POS fluo: decor {nm} nu e respins (frac={r['value']})")
    # determinism
    a = cl.compose(placed, backgrounds()["gradient"], fg_placed)
    b = cl.compose(cl.place_product(src, alpha, L, E, I, crit, CANVAS, 1.0, DX, DY), backgrounds()["gradient"], fg_placed)
    assert a.tobytes() == b.tobytes()
    print("POS determinism: două rulări dau aceiași octeți")
    # ---- F2: umplerea benzii E din decor (bg în E/inel = reconstrucția albă a packshot-ului, ca la VAE)
    dark = backgrounds()["intunecat"]
    contaminated = dark.copy()
    zone_c = zl.dilate(placed["L"] | placed["E"], 1) & ~placed["L"]
    contaminated[zone_c] = 255  # E + 1 px în jur = alb (reconstrucția packshot-ului), restul decor închis
    new = cl.compose(placed, contaminated, fg_placed)  # band_fill=True implicit
    old = cl.compose(placed, contaminated, fg_placed, band_fill=False)
    h_new, h_old = ck.check_halo(new, placed), ck.check_halo(old, placed)
    assert h_new["passed"], h_new
    neg("F2 compunere VECHE (band_fill=False) pe bg cu E alb: halo", h_old, "p90 luminanță inel=")
    print(f"POS F2 compunere NOUĂ pe același bg cu E alb: halo trece | value={h_new['value']} threshold={h_new['threshold']} (vechi: {h_old['value']})")
    assert np.array_equal(new[placed["L"]], old[placed["L"]]) and np.array_equal(new[placed["L"]], placed["ref"][placed["L"]])
    assert ck.check_identity_master(new, placed["ref"], placed["L"])["value"] == 0
    print("POS F2: L rămâne identic (diferență 0) cu și fără umplere")
    assert cl.compose(placed, contaminated, fg_placed).tobytes() == new.tobytes()
    print("POS F2 determinism: umplerea dă aceiași octeți la două rulări")
    far = ~zl.dilate(placed["L"] | placed["E"], cl.BAND_RING_PX)
    assert np.array_equal(new[far], contaminated[far]), "decorul din afara inelului nu se atinge"
    prep = cl.prepare_background(contaminated, placed)
    assert np.abs(prep[zone_c].astype(int) - np.array(dark[0, 0], dtype=int)).max() == 0
    print("POS F2 prepare_background: banda E + inelul iau valoarea decorului din jur (fundal plat -> exact aceeași culoare)")
    # fundal cu gradient: valorile umplute rămân între valorile vecinilor (nu alb)
    gcont = backgrounds()["gradient"].copy()
    zone_r = zl.dilate(placed["L"] | placed["E"], cl.BAND_RING_PX) & ~placed["L"]
    gcont[zone_c] = 255
    gfill = cl.fill_from_outside(gcont, zone_r, ~zl.dilate(placed["L"] | placed["E"], cl.BAND_RING_PX))
    assert gfill[zone_c].max() < 255 and gfill[zone_c].min() >= backgrounds()["gradient"].min()
    print(f"POS F2 gradient: max în banda umplută = {int(gfill[zone_c].max())} (< 255)")
    neg_raises("F2 fill_from_outside fără nicio sursă validă", ValueError, "nicio sursă validă", lambda: cl.fill_from_outside(contaminated, zone_c, np.zeros(zone_c.shape, bool)))
    neg_raises("F2 fill_from_outside cu mască de altă formă", ValueError, "măști", lambda: cl.fill_from_outside(contaminated, zone_c[:10], ~zone_c))
    # scale 1.0 = copie exactă
    assert np.array_equal(placed["ref"][DY : DY + N, DX : DX + N], src) and placed["resampling"] == "none"
    assert np.array_equal(cl.inpaint_mask(placed["L"], placed["E"]) == 0, placed["L"] | placed["E"])
    assert (cl.inpaint_mask(placed["L"], placed["E"])[placed["I"]] == 255).all()
    print("POS scale 1.0: referința e copia exactă a pixelilor; masca de inpainting = NOT(L ∪ E), include I")
    # scale 0.75: zone recalculate și validate; identitate cu referința ei
    p75 = cl.place_product(src, alpha, L, E, I, crit, CANVAS, 0.75, 100, 100)
    o75 = cl.compose(p75, backgrounds()["intunecat"])
    r75 = ck.check_identity_master(o75, p75["ref"], p75["L"])
    assert r75["passed"] and p75["resampling"] == "LANCZOS" and p75["box"] == [100, 100, 220, 220]
    print(f"POS scale 0.75: zone recalculate cu build_zones și validate, L={int(p75['L'].sum())} px, identitate {r75['value']}")

    good = outs["intunecat"]
    # ---- negative: identitate
    px = good.copy()
    ys, xs = np.nonzero(Lm)
    y, x = ys[len(ys) // 2], xs[len(xs) // 2]
    px[y, x, 0] = px[y, x, 0] - 1 if px[y, x, 0] > 0 else 1
    neg("1 px schimbat cu 1 nivel în L", ck.check_identity_master(px, placed["ref"], placed["L"]), "max|Δ| în L = 1; 1 px diferiți")
    # F1: un pixel chiar pe MARGINEA lui L (în L, dar nu în L erodat), schimbat cu +40: pică pe L complet; verificarea veche pe L erodat îl rata
    edge_ys, edge_xs = np.nonzero(placed["L"] & ~Lm)
    assert edge_ys.size > 0
    ey, ex = edge_ys[edge_ys.size // 2], edge_xs[edge_xs.size // 2]
    px_edge = good.copy()
    px_edge[ey, ex] = np.clip(px_edge[ey, ex].astype(int) + 40, 0, 255).astype(np.uint8)
    assert (px_edge[ey, ex] != placed["ref"][ey, ex]).any()
    old_style = ck.check_identity_master(px_edge, placed["ref"], Lm)
    assert old_style["passed"], "demonstrație: verificarea pe L erodat ratează pixelul de margine"
    print(f"POS regresie F1: verificarea veche (pe L erodat) rata pixelul de margine ({ey},{ex}) schimbat cu +40: {old_style['detail']}")
    neg("F1 pixel de pe marginea lui L schimbat cu +40", ck.check_identity_master(px_edge, placed["ref"], placed["L"]), "max|Δ| în L = 40; 1 px diferiți")
    neg("F1 pixel de margine L, check_scale_not_up (referință recalculată)", ck.check_scale_not_up(px_edge, src, alpha, L, E, I, crit, CANVAS, params), "max|Δ| în L = 40")
    assert ck.check_identity_master(good, placed["ref"], placed["L"])["passed"]
    print("POS F1 compunere corectă: identitate 0 pe L complet")
    # ---- oglindire
    mir = good.copy()
    mir[DY : DY + N, DX : DX + N] = good[DY : DY + N, DX : DX + N, :][:, ::-1]
    r = ck.detect_mirror(mir, placed["ref"], placed["L"])
    neg("oglindire orizontală (detect_mirror)", r, "OGLINDIRE orizontal detectată")
    neg("oglindire orizontală (identitate)", ck.check_identity_master(mir, placed["ref"], Lm), "px diferiți")
    # ---- scalare 1.05
    big = Image.fromarray(src).resize((168, 168), Image.LANCZOS)
    biga = np.asarray(Image.fromarray(alpha).resize((168, 168), Image.LANCZOS))
    up = backgrounds()["intunecat"].copy()
    sl = (slice(DY - 4, DY + 164), slice(DX - 4, DX + 164))
    up[sl][biga >= 128] = np.asarray(big)[biga >= 128]
    neg("scalare 1.05, fișă pretinde 1.0 (identitate recalculată)", ck.check_scale_not_up(up, src, alpha, L, E, I, crit, CANVAS, params), "px diferiți")
    claimed = {**params, "scale": 1.05}
    neg("scalare 1.05 declarată (check_transform)", ck.check_transform(claimed), "scale=1.05 nu e în (0, 1]")
    neg("scalare 1.05 declarată (recalculare)", ck.check_scale_not_up(up, src, alpha, L, E, I, crit, CANVAS, claimed), "în afara (0, 1]")
    # ---- transform
    neg("dx neîntreg", ck.check_transform({**params, "dx": 80.5}), "dx=80.5 nu e întreg")
    neg("flip=True", ck.check_transform({**params, "flip": True}), "flip=True (trebuie False)")
    neg("rotate_deg=3", ck.check_transform({**params, "rotate_deg": 3}), "rotate_deg=3 (trebuie 0)")
    neg("flip lipsește", ck.check_transform({k: v for k, v in params.items() if k != "flip"}), "flip lipsește")
    neg_raises("place_product scale>1", ValueError, "în afara (0, 1]", lambda: cl.place_product(src, alpha, L, E, I, crit, CANVAS, 1.05, DX, DY))
    neg_raises("place_product dx float", ValueError, "dx/dy trebuie să fie întregi", lambda: cl.place_product(src, alpha, L, E, I, crit, CANVAS, 1.0, 80.5, DY))
    neg_raises("place_product nu încape", ValueError, "nu încape", lambda: cl.place_product(src, alpha, L, E, I, crit, CANVAS, 1.0, 200, DY))
    # ---- halo
    P = zl.silhouette(placed["alpha"])
    halo = good.copy()
    halo[zl.dilate(P, 2) & ~P] = 255
    neg("inel de halo alb 2 px pe fundal închis", ck.check_halo(halo, placed), "p90 luminanță inel=255.00")
    # ---- scurgere de culoare
    spill = good.copy()
    spill[(zl.dilate(P, 25) & ~zl.dilate(P, 4))] = NAVY
    neg("scurgere de culoare în inelul 4-40 px", ck.check_color_spill(spill, placed), "au culoarea produsului")
    # ---- fluo
    fluo = good.copy()
    fluo[0:60, 0:60] = (255, 235, 0)
    neg("decor galben fluo", ck.check_decor_fluo(fluo, placed), "sunt fluo")

    # ---- CIEDE2000 (Sharma, Wu, Dalal 2005, tabelul de date de test) și export lossy
    pairs = [((50, 2.6772, -79.7751), (50, 0, -82.7485), 2.0425), ((50, 3.1571, -77.2803), (50, 0, -82.7485), 2.8615),
             ((50, 2.8361, -74.0200), (50, 0, -82.7485), 3.4412), ((50, -1.3802, -84.2814), (50, 0, -82.7485), 1.0000),
             ((50, 2.5, 0), (73, 25, -18), 27.1492)]
    for l1, l2, want in pairs:
        got = float(ck.de2000(np.array(l1), np.array(l2)))
        assert abs(got - want) < 1e-4, (l1, l2, got, want)
    print("POS CIEDE2000: 5 perechi Sharma et al. 2005 potrivite la 1e-4 (2.0425, 2.8615, 3.4412, 1.0000, 27.1492)")
    assert abs(ck.ssim_masked(good, good, np.ones(good.shape[:2], bool)) - 1.0) < 1e-12

    def jpeg(rgb, q=90):
        buf = io.BytesIO()
        Image.fromarray(rgb).save(buf, format="JPEG", quality=q)
        return np.asarray(Image.open(io.BytesIO(buf.getvalue())).convert("RGB"), dtype=np.uint8).copy()

    cal = ck.calibrate_export(placed["ref"], Lm, jpeg)
    print(f"CAL export JPEG q90 pe packshot singur: ΔE2000 p99={cal['de2000_p99_cal']:.4f} SSIM={cal['ssim_mean_cal']:.6f} "
          f"ΔE bloc 8x8 max={cal['de2000_block_cal']:.4f} -> praguri ΔE p99<={cal['de2000_p99_max']:.4f}, "
          f"SSIM>={cal['ssim_mean_min']:.6f}, ΔE bloc<={cal['de2000_block_max']:.4f}")
    for name, o in outs.items():
        enc = jpeg(o)
        rr = ck.check_identity_export(enc, placed["ref"], Lm, cal)
        print(f"CAL export fundal={name}: ΔE p99={rr['value']['de2000_p99']} SSIM={rr['value']['ssim_mean']} trece={rr['passed']}")
        assert rr["passed"], rr
    patched = jpeg(good)
    patched[DY + 92 : DY + 116, DX + 60 : DX + 84] = np.clip(patched[DY + 92 : DY + 116, DX + 60 : DX + 84].astype(int) + 60, 0, 255).astype(np.uint8)
    rp = ck.check_identity_export(patched, placed["ref"], Lm, cal)
    neg("export: petic schimbat în L după codare", rp, "ΔE2000 bloc 8x8 max=")
    assert rp["value"]["de2000_block_max"] > cal["de2000_block_max"] * 4, rp  # peticul depășește clar pragul de bloc

    # ---- fișă și registru
    tmp = Path(tempfile.mkdtemp(prefix="scene-fisa-"))
    try:
        hx = lambda s: fl.sha256_bytes(s.encode())  # noqa: E731
        ok_checks = run_all(placed, good, src, alpha, L, E, I, crit, params)
        base = dict(
            candidat="c001", produs="S476YE", sha256_sursa=hx("src"), sha256_masca=hx("alpha"), sha256_L=hx("L"), sha256_E=hx("E"),
            sha256_I=hx("I"), sha256_cod=fl.sha256_code([ROOT / "scripts/scene/compose_lib.py"]), sha256_master=hx("master"), sha256_raw=hx("raw"),
            model={"id": "m/x", "revizie": "a" * 40, "sha256": hx("w")}, seed=7, prompt="p", prompt_negativ="n", context="constructii",
            scara=1.0, deplasare={"dx": DX, "dy": DY}, flip=False, rotate_deg=0, canvas={"w": CANVAS[0], "h": CANVAS[1]},
            verificari=ok_checks + [{"name": "ocr", "value": 0, "threshold": 0, "passed": True, "detail": "verificare externă"}],
            timp_generare_s=1.5,
        )
        f1 = fl.build_fisa(**base)
        assert f1["rezultat_global"] is True
        reg = tmp / "registru.jsonl"
        p1 = fl.write_fisa(tmp / "cand" / "c001", f1, reg, tmp)
        assert p1.name == "fisa.json" and json.loads(p1.read_text())["candidat"] == "c001"
        f2 = fl.build_fisa(**{**base, "candidat": "c002", "verificari": [{**ok_checks[0], "passed": False}] + ok_checks[1:]})
        assert f2["rezultat_global"] is False
        fl.write_fisa(tmp / "cand" / "c002", f2, reg, tmp)
        assert fl.verify_registry(reg) == [] and len(reg.read_bytes().splitlines()) == 2
        print("POS fișă + registru: 2 fișe scrise atomic, lanț valid, rezultat_global True/False calculat")
        assert fl.build_fisa(**{**base, "verificari": []})["rezultat_global"] is False
        # negative
        neg_raises("fișă cu câmp lipsă", fl.FisaError, "câmpuri obligatorii lipsă: seed",
                   lambda: fl.build_fisa(**{k: v for k, v in base.items() if k != "seed"}))
        neg_raises("fișă fără sha256_master (T5a veche) respinsă", fl.FisaError, "câmpuri obligatorii lipsă: sha256_master",
                   lambda: fl.build_fisa(**{k: v for k, v in base.items() if k != "sha256_master"}))
        neg_raises("fișă fără sha256_raw respinsă", fl.FisaError, "câmpuri obligatorii lipsă: sha256_raw",
                   lambda: fl.build_fisa(**{k: v for k, v in base.items() if k != "sha256_raw"}))
        neg_raises("sha256_master nu e hash hex", fl.FisaError, "sha256_master trebuie să fie sha256",
                   lambda: fl.build_fisa(**{**base, "sha256_master": "nu-e-hash"}))
        assert fl.FILENAME_RE.fullmatch("fisa_finala_v3.json") and not fl.FILENAME_RE.fullmatch("x.json\n")
        neg_raises("nume de fișă cu newline final (x.json\\n)", fl.FisaError, "filename invalid",
                   lambda: fl.write_fisa(tmp / "cand" / "c004", f1, reg, tmp, filename="x.json\n"))
        assert not (tmp / "cand" / "c004").exists() and len(reg.read_bytes().splitlines()) == 2
        neg_raises("rezultat_global fals contrazis", fl.FisaError, "contrazice verificările (calculat: False)",
                   lambda: fl.write_fisa(tmp / "cand" / "c003", {**f2, "candidat": "c003", "rezultat_global": True}, reg, tmp))
        neg_raises("verificare fără passed bool", fl.FisaError, "passed bool",
                   lambda: fl.build_fisa(**{**base, "verificari": [{**ok_checks[0], "passed": 1}]}))
        neg_raises("suprascriere fișă existentă", fl.FisaError, "fișa există deja",
                   lambda: fl.write_fisa(tmp / "cand" / "c001", f1, reg, tmp))
        assert json.loads(p1.read_text())["candidat"] == "c001" and len(reg.read_bytes().splitlines()) == 2
        neg_raises("cale cu ..", fl.FisaError, "cale cu '..'", lambda: fl.write_fisa(str(tmp / "cand" / ".." / ".." / "x"), f1, reg, tmp))
        neg_raises("cand_dir în afara bazei", fl.FisaError, "nu e sub", lambda: fl.write_fisa(Path(tempfile.gettempdir()) / "afara-scene", f1, reg, tmp))
        # registru alterat
        orig = reg.read_bytes()
        lines = orig.split(b"\n")
        reg.write_bytes(lines[0].replace(b'"c001"', b'"cXXX"') + b"\n" + b"\n".join(lines[1:]))
        errs = fl.verify_registry(reg)
        assert errs and "prev_sha256" in errs[0], errs
        print(f"NEG registru cu linie veche alterată: detectat | {errs}")
        reg.write_bytes(b"\n".join(lines[1:]))
        errs = fl.verify_registry(reg)
        assert errs, errs
        print(f"NEG registru cu linie veche ștearsă: detectat | {errs}")
        reg.write_bytes(orig)
        assert fl.verify_registry(reg) == []
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("ok")


main()
