"""Verificări Fix-1a pentru legăturile de integritate și apărările de securitate din scripts/scene (fără modele, Pillow + numpy + stdlib).

Rulare: python -I tests/py/scene_integrity_check.py <ROOT>
Acoperă: produs ≠ zone (R3), fișă veche / legacy (R2), verificarea modelului înainte de from_pretrained și trust_remote_code=False (R4), etape/overlay
obligatorii și nume unic de fișă (R7), zone încărcate doar prin zone.json, scriere exclusivă, model-id (R9), prompt și fetch_models (R10).
Fiecare NEG trebuie să pice cu mesajul exact; liniile „POS/NEG ..." de pe stdout sunt căutate de testul mjs.
"""
# ruff: noqa: S101, S603, E501, E741
import ast
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(sys.argv[1]).resolve()
SC = ROOT / "scripts" / "scene"
sys.path.insert(0, str(SC))
import collect_signals as cs  # noqa: E402
import fetch_models as fm  # noqa: E402
import fisa_lib as fl  # noqa: E402
import generate_candidates as gc  # noqa: E402
import integrity_lib as ilib  # noqa: E402
import models_runtime as mr  # noqa: E402
import pilot_lib as pl  # noqa: E402
import prompting as pr  # noqa: E402

N = 64


def show(tag, name, extra=""):
    print(f"{tag} {name}{(': ' + extra) if extra else ''}")


def neg_raises(name, exc, needle, fn):
    try:
        fn()
    except exc as e:
        assert needle in str(e), f"{name}: mesaj {e!r} fără {needle!r}"
        show("NEG", name, str(e)[:110])
        return
    raise AssertionError(f"{name}: trebuia să ridice {exc.__name__}")


def zone_json(product, src_path):
    return {"schema": 1, "product": product, "source": {"path": src_path}}


def main():  # noqa: C901
    specs = ilib.load_specs()
    # ---- R3: produs ≠ zone
    assert ilib.check_product_binding("S476YE", zone_json("S476YE", "portwest/S476YE.jpg"), specs, Path("/x/S476YE.jpg")) == []
    show("POS", "produs, zone.json și zone_specs.json coincid")
    errs = ilib.check_product_binding("S476YE", zone_json("BZ739OR", "portwest/BZ739OR.jpg"), specs)
    assert any("≠ produs din zone.json 'BZ739OR'" in e for e in errs) and any("sursa din zone.json" in e for e in errs), errs
    show("NEG", "produs S476YE cu zone BZ739OR respins", "; ".join(errs)[:120])
    errs = ilib.check_product_binding("S476YE", zone_json("S476YE", "portwest/BZ739OR.jpg"), specs)
    assert errs and "sursa din zone.json 'portwest/BZ739OR.jpg'" in errs[0], errs
    show("NEG", "calea sursei din zone.json nu corespunde produsului din zone_specs.json", errs[0][:110])
    errs = ilib.check_product_binding("S476YE", zone_json("S476YE", "portwest/S476YE.jpg"), specs, Path("/x/BZ739OR.jpg"))
    assert errs and "nu e sursa produsului" in errs[0], errs
    show("NEG", "fișierul sursă real al altui produs respins", errs[0][:110])
    assert "nu există în zone_specs.json" in ilib.check_product_binding("ZZ9", zone_json("ZZ9", "x"), specs)[0]
    show("NEG", "produs absent din zone_specs.json respins")
    with tempfile.TemporaryDirectory() as td:
        zd = Path(td)
        (zd / "zone.json").write_text(json.dumps(zone_json("BZ739OR", "portwest/BZ739OR.jpg")), encoding="utf-8")
        neg_raises("generate_candidates: --product S476YE cu zone BZ739OR", SystemExit, "PRODUS/ZONE NEPOTRIVITE",
                   lambda: gc.check_product_binding("S476YE", zd, Path("/x/S476YE.jpg"), {"product": "BZ739OR"}))
        (zd / "zone.json").write_text(json.dumps(zone_json("S476YE", "portwest/S476YE.jpg")), encoding="utf-8")
        neg_raises("generate_candidates: verify_zones raportează alt produs", SystemExit, "verify_zones raportează",
                   lambda: gc.check_product_binding("S476YE", zd, Path("/x/S476YE.jpg"), {"product": "BZ739OR"}))
        gc.check_product_binding("S476YE", zd, Path("/x/S476YE.jpg"), {"product": "S476YE"})
        show("POS", "generate_candidates: produs, zone.json, verify_zones și zone_specs coincid")

    # ---- R3: collect_signals.candidate_items (nume director ≠ fișă ≠ zone.json)
    def scene(td, name="S476YE-ctx-s1", fisa_prod="S476YE", zone_prod="S476YE", with_fisa=True):
        sc = Path(td)
        c = sc / "cand" / name
        c.mkdir(parents=True)
        Image.fromarray(np.zeros((8, 8, 3), np.uint8)).save(c / "master.png")
        if with_fisa:
            (c / "fisa.json").write_text(json.dumps({"produs": fisa_prod, "candidat": name}), encoding="utf-8")
        p = name.split("-", 1)[0]
        (sc / p / "zones").mkdir(parents=True, exist_ok=True)
        (sc / p / "zones" / "zone.json").write_text(json.dumps({"product": zone_prod}), encoding="utf-8")
        return sc

    with tempfile.TemporaryDirectory() as td:
        assert [i["id"] for i in cs.candidate_items(scene(td), require_fisa=True)] == ["S476YE-ctx-s1"]
        show("POS", "candidate_items: nume director, fișă și zone.json coincid")
    with tempfile.TemporaryDirectory() as td:
        neg_raises("candidate_items: director S476YE cu zone.json BZ739OR", ilib.IntegrityError, "zone.json['product']", lambda: cs.candidate_items(scene(td, zone_prod="BZ739OR")))
    with tempfile.TemporaryDirectory() as td:
        neg_raises("candidate_items: director S476YE cu fișă BZ739OR", ilib.IntegrityError, "fisa.json (produs 'BZ739OR'", lambda: cs.candidate_items(scene(td, fisa_prod="BZ739OR")))
    with tempfile.TemporaryDirectory() as td:
        neg_raises("candidate_items: director de candidat fără fisa.json", ilib.IntegrityError, "lipsește fisa.json", lambda: cs.candidate_items(scene(td, with_fisa=False), require_fisa=True))

    # ---- R2: fișă veche (fără sha256_master): refuzată; cu legacy = marcată
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        cand = root / "cand" / "ZZ1-c-s1"
        cand.mkdir(parents=True)
        zones = root / "zones"
        zones.mkdir()
        src = np.random.default_rng(1).integers(0, 255, (N, N, 3), dtype=np.uint8)
        Image.fromarray(src).save(root / "src.png")
        Image.fromarray(src).save(cand / "master.png")
        Image.fromarray(src).save(cand / "raw_768.png")
        masks = {k: np.zeros((N, N), np.uint8) for k in "LEI"}
        masks["L"][10:50, 10:50] = 255
        masks["E"][8:10, 8:52] = 255
        files = {}
        for k, m in masks.items():
            Image.fromarray(m).save(zones / f"{k}.png")
            files[k] = {"file": f"{k}.png", "sha256": ilib.file_sha(zones / f"{k}.png")}
        (zones / "zone.json").write_text(json.dumps({"schema": 1, "product": "ZZ1", "files": files, "critical": []}), encoding="utf-8")
        import compose_lib as cl
        h = "b" * 64
        names = ilib.T3A_REQUIRED
        fields = dict(candidat="ZZ1-c-s1", produs="ZZ1", sha256_sursa=ilib.file_sha(root / "src.png"), sha256_masca=hashlib.sha256(cl.inpaint_mask(masks["L"] == 255, masks["E"] == 255).tobytes()).hexdigest(),
                      sha256_L=ilib.sha_arr(masks["L"] == 255), sha256_E=ilib.sha_arr(masks["E"] == 255), sha256_I=ilib.sha_arr(masks["I"] == 255), sha256_cod=h,
                      model={"id": "m", "revizie": "r", "sha256": h}, seed=1, prompt="p", context="c", scara=1.0, deplasare={"dx": 0, "dy": 0}, flip=False, rotate_deg=0,
                      canvas={"w": N, "h": N}, verificari=[{"name": n, "value": 0, "threshold": 0, "passed": True, "detail": ""} for n in names], timp_generare_s=1.0)
        old = {**fields, "data": "2026-01-01T00:00:00Z", "rezultat_global": True}  # T5a veche: fără sha256_master/sha256_raw
        reg = root / "registru.jsonl"
        fl.append_registry(reg, old, hashlib.sha256((json.dumps(old, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()).hexdigest())
        (cand / "fisa.json").write_text(json.dumps(old, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        neg_raises("fișă T5a veche fără sha256_master refuzată (fail-closed)", ilib.IntegrityError, "fișă veche: lipsește sha256_master",
                   lambda: ilib.verify_candidate_binding(cand, "fisa.json", root / "src.png", zones, reg))
        b = ilib.verify_candidate_binding(cand, "fisa.json", root / "src.png", zones, reg, legacy=True)
        assert b["legacy"] is True and b["sha256_master"] == ilib.file_sha(cand / "master.png")
        show("POS", "--legacy: fișa veche e acceptată doar marcat (legacy=True, hash-urile masterului luate de pe disc)")
        assert ilib.missing_t3a(old["verificari"]) == []
        assert ilib.missing_t3a(old["verificari"][:-2]) == ["color_spill", "decor_fluo"]
        show("NEG", "fișă de intrare fără color_spill/decor_fluo: verificări T3a obligatorii lipsă", str(ilib.missing_t3a(old["verificari"][:-2])))
        # pilot_lib.load_zones: doar prin zone.json
        (zones / "critical").mkdir()
        Image.fromarray(masks["L"]).save(zones / "critical" / "banda.png")
        Image.fromarray(masks["L"]).save(zones / "critical" / "straina.png")  # nu e în zone.json: NU se încarcă
        Image.fromarray(np.full((N, N), 255, np.uint8)).save(zones / "alpha.png")
        zj = json.loads((zones / "zone.json").read_text())
        zj["files"]["alpha"] = {"file": "alpha.png", "sha256": ilib.file_sha(zones / "alpha.png")}
        zj["critical"] = [{"name": "banda", "file": "critical/banda.png", "sha256": ilib.file_sha(zones / "critical" / "banda.png")}]
        (zones / "zone.json").write_text(json.dumps(zj), encoding="utf-8")
        z = pl.load_zones(zones)
        assert sorted(z["critical"]) == ["banda"], sorted(z["critical"])
        show("POS", "load_zones încarcă doar marcajele critice din zone.json (fișierul străin din director e ignorat)")
        Image.fromarray(masks["E"]).save(zones / "critical" / "banda.png")  # alterat după hash
        neg_raises("load_zones: marcaj critic alterat față de sha256 din zone.json", ilib.IntegrityError, "sha256 critic banda", lambda: pl.load_zones(zones))
        zj["critical"][0]["sha256"] = ilib.file_sha(zones / "critical" / "banda.png")
        zj["files"]["L"]["sha256"] = "0" * 64
        (zones / "zone.json").write_text(json.dumps(zj), encoding="utf-8")
        neg_raises("load_zones: L alterat față de sha256 din zone.json", ilib.IntegrityError, "sha256 L nu corespunde", lambda: pl.load_zones(zones))
        zj["files"]["L"]["sha256"] = ilib.file_sha(zones / "L.png")
        del zj["files"]["I"]
        (zones / "zone.json").write_text(json.dumps(zj), encoding="utf-8")
        neg_raises("load_zones: fișier lipsă din zone.json (nu se caută prin glob)", ilib.IntegrityError, "lipsește fișierul 'I'", lambda: pl.load_zones(zones))

    # ---- R9: scriere exclusivă
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "cal.json"
        ilib.write_new_text(p, "v1\n")
        neg_raises("scriere exclusivă: --out existent nu se suprascrie", SystemExit, "nu se suprascrie", lambda: ilib.write_new_text(p, "v2\n"))
        assert p.read_text() == "v1\n"
    for f in ("calibrate_models.py", "calibrate_real.py"):
        src = (SC / f).read_text(encoding="utf-8")
        assert "ilib.write_new_text(a.out" in src and "a.out.write_text" not in src, f
    show("POS", "calibrate_models.py / calibrate_real.py scriu --out doar prin write_new_text (mod exclusiv)")

    # ---- R9: model-id
    fm2 = mr._fm()  # noqa: SLF001  # modul încărcat separat (clasa FetchError e alta decât a lui `import fetch_models`)
    neg_raises("klein_probe: --model-id cu '..' respins de validate_rel_path", fm2.FetchError, "segment interzis", lambda: fm2.validate_rel_path("../etc"))
    with tempfile.TemporaryDirectory() as td:
        r = subprocess.run([sys.executable, "-I", str(SC / "klein_probe.py"), "--models-dir", td, "--model-id", "../x", "--source", "/x.jpg", "--zone-dir", td, "--out-root", td],
                           capture_output=True, text=True, timeout=120, check=False)
        assert r.returncode != 0 and "segment interzis" in r.stderr, (r.returncode, r.stderr[-300:])
        show("NEG", "klein_probe (CLI) cu --model-id ../x se oprește înainte de orice model", r.stderr.strip().splitlines()[-1][:100])

    # ---- R4: verificare model înainte de from_pretrained; hash VERIFICAT în fișă
    real = fm.load_manifest(fm.DEFAULT_MANIFEST)
    ent = copy.deepcopy(next(m for m in real["models"] if m["id"] == "flux2-klein-4b"))
    with tempfile.TemporaryDirectory() as td:
        md = Path(td) / "models"
        w = md / "flux2-klein-4b" / "transformer"
        w.mkdir(parents=True)
        (md / "flux2-klein-4b" / "model_index.json").write_bytes(b"{}")
        (w / "diffusion_pytorch_model.safetensors").write_bytes(b"greutati-reale")
        wsha = hashlib.sha256(b"greutati-reale").hexdigest()
        ent["files"] = [{"path": "model_index.json", "size": 2, "sha256": hashlib.sha256(b"{}").hexdigest()},
                        {"path": "transformer/diffusion_pytorch_model.safetensors", "size": len(b"greutati-reale"), "sha256": wsha}]
        man = {**real, "models": [ent]}
        mpath = Path(td) / "manifest.json"
        mpath.write_text(json.dumps(man), encoding="utf-8")
        fm_ = fm
        old_manifest, old_fm = fm_.DEFAULT_MANIFEST, mr._fm  # noqa: SLF001
        fm_.DEFAULT_MANIFEST = mpath
        mr._fm = lambda: fm_  # noqa: SLF001
        try:
            _root, info, _first = mr.verify_model(md, "flux2-klein-4b", gc.WEIGHTS)
            assert info["sha256"] == wsha and info["id"] == "flux2-klein-4b" and _root == md / "flux2-klein-4b"
            assert gc.model_info(md)["sha256"] == wsha
            show("POS", "verify_model: hash-ul din fișă = sha256 recalculat al transformerului (nu cel din manifest)")
            (w / "diffusion_pytorch_model.safetensors").write_bytes(b"greutati-FALSE")  # aceeași mărime, alt conținut
            neg_raises("model alterat (aceeași mărime): verificarea sha256 înainte de from_pretrained", SystemExit, "sha256", lambda: gc.model_info(md))
            (w / "diffusion_pytorch_model.safetensors").write_bytes(b"scurt")
            neg_raises("model cu mărime greșită respins", SystemExit, "mărime", lambda: gc.model_info(md))
            (w / "diffusion_pytorch_model.safetensors").write_bytes(b"greutati-reale")
            ent["files"][1]["sha256"] = "0" * 64  # manifest cu hash greșit
            mpath.write_text(json.dumps({**real, "models": [ent]}), encoding="utf-8")
            neg_raises("fișier bun dar manifest cu alt hash respins", SystemExit, "sha256", lambda: gc.model_info(md))
            neg_raises("model necunoscut în manifest respins", SystemExit, "model necunoscut", lambda: mr.verify_model(md, "nu-exista"))
        finally:
            fm_.DEFAULT_MANIFEST, mr._fm = old_manifest, old_fm  # noqa: SLF001

    def trc_violations(src: str) -> list[str]:
        """Apeluri `.from_pretrained(` fără trust_remote_code=False (explicit sau prin **dict care îl conține)."""
        tree = ast.parse(src)
        dicts = {}
        for n in ast.walk(tree):
            if isinstance(n, ast.Assign) and isinstance(n.value, ast.Call) and getattr(n.value.func, "id", "") == "dict":
                for t in n.targets:
                    dicts[getattr(t, "id", "")] = {k.arg: k.value for k in n.value.keywords}
            if isinstance(n, ast.Assign) and isinstance(n.value, ast.Dict):  # kw = {"trust_remote_code": False, ...}
                for t in n.targets:
                    dicts[getattr(t, "id", "")] = {k.value: v for k, v in zip(n.value.keys, n.value.values) if isinstance(k, ast.Constant)}
        bad = []
        for n in ast.walk(tree):
            if isinstance(n, ast.Call) and getattr(n.func, "attr", "") == "from_pretrained":
                kws = {k.arg: k.value for k in n.keywords if k.arg}
                for k in n.keywords:
                    if k.arg is None and isinstance(k.value, ast.Name):
                        kws.update(dicts.get(k.value.id, {}))
                v = kws.get("trust_remote_code")
                if not (isinstance(v, ast.Constant) and v.value is False):
                    bad.append(f"linia {n.lineno}")
        return bad

    assert trc_violations("x = Foo.from_pretrained(p, local_files_only=True)") == ["linia 1"]
    show("NEG", "scanare AST: from_pretrained fără trust_remote_code=False e prins")
    assert trc_violations("kw = dict(trust_remote_code=False)\nx = Foo.from_pretrained(p, **kw)") == []
    for f in ("generate_candidates.py", "klein_probe.py", "models_runtime.py", "sam_load.py"):
        assert trc_violations((SC / f).read_text(encoding="utf-8")) == [], f
    show("POS", "toate apelurile from_pretrained din generate_candidates/klein_probe/models_runtime/sam_load au trust_remote_code=False")

    def has_offline(src: str) -> bool:
        t = ast.parse(src)
        got = {n.value.args[0].value for n in t.body if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and getattr(n.value.func, "attr", "") == "setdefault"
               and n.value.args and isinstance(n.value.args[0], ast.Constant)}
        return {"HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE"} <= got
    assert not has_offline("import os\nimport torch\n")
    show("NEG", "scanare AST: script cu modele fără HF_HUB_OFFLINE/TRANSFORMERS_OFFLINE setate e prins")
    for f in ("generate_candidates.py", "klein_probe.py", "models_runtime.py", "sam_load.py", "birefnet_load.py"):
        assert has_offline((SC / f).read_text(encoding="utf-8")), f
    show("POS", "scripturile cu modele setează HF_HUB_OFFLINE și TRANSFORMERS_OFFLINE (setdefault, la nivel de modul)")
    for f, call in (("generate_candidates.py", "model_info(models_dir)"), ("klein_probe.py", "mr.verify_model(models_dir, model_id)")):
        s = (SC / f).read_text(encoding="utf-8")
        assert 0 < s.index(call) < s.index(".from_pretrained("), f
    show("POS", "generate_candidates și klein_probe verifică fișierele modelului (mărime+sha256) înainte de primul from_pretrained")

    # ---- R7: overlay obligatoriu, un singur nume de fișă finală, report-dir nou, calibrare extra în hash
    r = subprocess.run([sys.executable, "-I", str(SC / "run_model_checks.py"), "--scene-dir", "/x", "--models-dir", "/x", "--calibrare", "/x", "--report-dir", "/x/r"],
                       capture_output=True, text=True, timeout=120, check=False)
    assert r.returncode == 2 and "--calibrare-extra" in r.stderr, r.stderr
    show("NEG", "run_model_checks fără --calibrare-extra (overlay T5c obligatoriu) refuzat", r.stderr.strip().splitlines()[-1][:100])
    import make_planse as mp
    import run_model_checks as rmc
    assert rmc.FISA_FINALA == mp.FISA_NAME == "fisa_finala_v3.json"
    for doc in (SC / "README.md", ROOT / "PROJECT_OS" / "10-SCENE-PRODUS.md"):
        t = doc.read_text(encoding="utf-8")
        assert "fisa_finala_v3.json" in t and "fisa_finala_v2b" not in t and "fisa_finala_v2.json" not in t, doc
    show("POS", "run_model_checks, make_planse, README și PROJECT_OS folosesc același nume: fisa_finala_v3.json")
    src = (SC / "run_model_checks.py").read_text(encoding="utf-8")
    assert "report_dir.mkdir(parents=True, exist_ok=False)" in src and 'mr.SAM_DUMP_DIR = a.report_dir / "sam_dump"' in src and "calibrare_extra_sha256" in src
    show("POS", "run_model_checks: report-dir nou (exist_ok=False), dump SAM înăuntru, calibrare_extra_sha256 în fișă")
    f1 = SC / "integrity_lib.py"
    assert fl.sha256_code([f1], salt="calibrare_extra=/a/x.json") != fl.sha256_code([f1], salt="calibrare_extra=/b/x.json") != fl.sha256_code([f1])
    show("POS", "sha256_code acoperă calea efectivă a calibrării extra (altă cale = alt hash)")

    # ---- R10: prompting (manechin_fraza per produs scanată) și fetch_models (.part, hash lipsă)
    cx = pr.load_contexte()
    ctx_ok = pr.allowed_contexts("BZ739OR", cx)[0]
    assert pr.build_prompt("BZ739OR", ctx_ok, 0, cx)
    show("POS", "prompt BZ739OR cu manechin_fraza reală (conține doar formularea fixă „non-human”) se construiește")
    bad = copy.deepcopy(cx)
    bad["produse"]["BZ739OR"]["manechin_fraza"] += " with a smiling face and hair"
    neg_raises("manechin_fraza per produs cu cuvinte interzise (face, hair)", pr.PromptError, "fraza de manechin (BZ739OR): face, hair", lambda: pr.build_prompt("BZ739OR", ctx_ok, 0, bad))
    bad = copy.deepcopy(cx)
    bad["manechin"]["fraza"] += " with a head"
    neg_raises("manechin.fraza generală cu cuvânt interzis (head)", pr.PromptError, "fraza de manechin (S476YE): head", lambda: pr.build_prompt("S476YE", pr.allowed_contexts("S476YE", bad)[0], 0, bad))
    assert pr.lead_forbidden_words("An abstract non-human torso", cx) == [] and pr.lead_forbidden_words("a human torso", cx) == ["human"]
    show("NEG", "doar formularea fixă „non-human” e scutită; „human” singur e respins")

    with tempfile.TemporaryDirectory() as td:
        md = Path(td)
        model = {"id": "m1", "source": "hf", "repo": "a/b", "revision": "c" * 40}
        entry = {"path": "a.json", "size": 3, "sha256": hashlib.sha256(b"abc").hexdigest()}
        dest = fm.resolve_dest(md, "m1", "a.json")
        part = dest.with_name(dest.name + ".part")
        part.parent.mkdir(parents=True)
        part.write_bytes(b"alt-run")
        neg_raises(".part dintr-o rulare anterioară: refuzat și NEȘTERS", fm.FetchError, "există din altă rulare", lambda: fm.fetch_file(md, model, entry, pin=False))
        assert part.read_bytes() == b"alt-run"
        part.unlink()
        dest.write_bytes(b"abc")
        no_hash = {"path": "a.json", "size": 3}
        try:
            fm.fetch_file(md, model, no_hash, pin=False)
            raise AssertionError("trebuia să pice")
        except fm.FetchError as e:
            assert "manifestul nu are sha256" in str(e) and hashlib.sha256(b"abc").hexdigest() in str(e), e
            show("NEG", "fișier deja descărcat, manifest fără hash: mesaj clar cu sha256 calculat (nu blocare tăcută)", str(e)[:100])
        assert dest.read_bytes() == b"abc"
    print("ok")


if __name__ == "__main__":
    main()
