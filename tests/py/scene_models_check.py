"""Verificări stdlib pentru scripts/scene (manifest + fetch_models), fără rețea.

Rulare: python3 -I tests/py/scene_models_check.py <ROOT> [--manifest <alt.json>]
Cu --manifest verifică DOAR manifestul dat (iese cu cod != 0 dacă e invalid) — folosit de test pentru dovada negativă.
"""
# ruff: noqa: S101
# (S101: scriptul e un test, `assert` e mecanismul lui; rulat cu `python3 -I`, nu cu -O)
import copy
import hashlib
import importlib.util
import json
import os
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
SCENE = ROOT / "scripts" / "scene"
spec = importlib.util.spec_from_file_location("fetch_models", SCENE / "fetch_models.py")
fm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fm)

FORBIDDEN = {".pt", ".pth", ".bin", ".ckpt", ".pkl", ".pickle", ".npy", ".npz"}


def independent_manifest_errors(manifest):
    """Verificare independentă de fetch_models.validate_manifest (ca să nu testeze codul cu el însuși)."""
    errs = []
    for m in manifest["models"]:
        if m["source"] == "hf" and not re.fullmatch(r"[0-9a-f]{40}", m.get("revision", "")):
            errs.append(f"{m['id']}: revizie")
        for f in m["files"]:
            p = f["path"]
            if p.startswith("/") or ".." in p.split("/") or "\\" in p:
                errs.append(f"{m['id']}/{p}: cale")
            if p.lower().endswith(tuple(FORBIDDEN | {".py", ".pyc"})):
                errs.append(f"{m['id']}/{p}: extensie interzisă")
            sha = f.get("sha256")
            if sha is None:
                if f.get("hash_sursa") != "de-calculat-la-prima-descarcare" or m["group"] not in ("klein", "vlm"):
                    errs.append(f"{m['id']}/{p}: sha256 null în afara grupurilor klein/vlm")
            elif not re.fullmatch(r"[0-9a-f]{64}", sha):
                errs.append(f"{m['id']}/{p}: sha256")
    return errs


def expect_raises(fn, label):
    try:
        fn()
    except fm.FetchError:
        return
    raise AssertionError(f"nu a ridicat FetchError: {label}")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# --- mod doar-manifest (pentru dovada negativă din JS) ---
if "--manifest" in sys.argv:
    m = load(sys.argv[sys.argv.index("--manifest") + 1])
    errs = fm.validate_manifest(m) + independent_manifest_errors(m)
    if errs:
        print("manifest invalid:\n" + "\n".join(errs), file=sys.stderr)
        sys.exit(1)
    print("ok")
    sys.exit(0)

manifest = load(SCENE / "models.lock.json")

# 1. Manifestul real e valid.
assert fm.validate_manifest(manifest) == [], fm.validate_manifest(manifest)
assert independent_manifest_errors(manifest) == [], independent_manifest_errors(manifest)
groups = {m["group"] for m in manifest["models"]}
assert groups == set(fm.GROUPS), groups
for g in ("matte", "sam", "siglip", "faces", "ocr"):  # grupurile descărcate acum au toate hash-urile
    for m in manifest["models"]:
        if m["group"] == g:
            assert all(f["sha256"] for f in m["files"]), (g, m["id"])
# BiRefNet și SAM: nicio intrare de remote code sau pickle
for m in manifest["models"]:
    if m["id"] in ("birefnet", "sam2.1-hiera-large"):
        names = [f["path"] for f in m["files"]]
        assert "model.safetensors" in names and not any(n.endswith((".py", ".pt")) for n in names), names

# 2. Teste NEGATIVE pe manifest: fiecare mutație trebuie respinsă.
def mutate(fn):
    mm = copy.deepcopy(manifest)
    fn(mm)
    return fm.validate_manifest(mm)

def first(mm):
    return mm["models"][0]["files"][0]



cases = {
    "extensie .pt": lambda mm: first(mm).update(path="model.pt"),
    "extensie .pickle": lambda mm: first(mm).update(path="a.pickle"),
    "extensie ascunsă model.pt.safetensors": lambda mm: first(mm).update(path="model.pt.safetensors"),
    "cod remote .py": lambda mm: first(mm).update(path="birefnet.py"),
    "cale cu ..": lambda mm: first(mm).update(path="../x.safetensors"),
    "cale cu .. în mijloc": lambda mm: first(mm).update(path="a/../b.safetensors"),
    "cale absolută": lambda mm: first(mm).update(path="/etc/passwd"),
    "backslash": lambda mm: first(mm).update(path="a\\b.safetensors"),
    "sha256 scurt": lambda mm: first(mm).update(sha256="abc"),
    "sha256 majuscule": lambda mm: first(mm).update(sha256="A" * 64),
    "sha256 null fără hash_sursa": lambda mm: first(mm).update(sha256=None),
    "revizie scurtă": lambda mm: mm["models"][0].update(revision="main"),
    "grup necunoscut": lambda mm: mm["models"][0].update(group="altceva"),
    "id cu ..": lambda mm: mm["models"][0].update(id=".."),
    "url în afara listei": lambda mm: mm["models"][3]["files"][0].update(url="https://evil.example/x.onnx"),
    "url http": lambda mm: mm["models"][3]["files"][0].update(url="http://huggingface.co/x.onnx"),
}
for label, fn in cases.items():
    assert mutate(fn), f"mutația nu a fost respinsă: {label}"

# 3. Funcțiile din fetch_models pe fișiere sintetice.
expect_raises(lambda: fm.check_extension("model.pt"), ".pt")
expect_raises(lambda: fm.check_extension("sub/x.ckpt"), ".ckpt")
expect_raises(lambda: fm.validate_rel_path("../x"), "..")
expect_raises(lambda: fm.validate_rel_path("a/../x"), "a/../x")
expect_raises(lambda: fm.validate_rel_path("/abs"), "absolută")
fm.validate_rel_path("text_encoder/model-00001-of-00002.safetensors")

with tempfile.TemporaryDirectory() as tmp:
    base = Path(tmp)
    models = base / "models"
    models.mkdir()
    # resolve_dest respinge ieșirea din models-dir (.. și symlink)
    expect_raises(lambda: fm.resolve_dest(models, "m", "../../x.safetensors"), "resolve ..")
    outside = base / "outside"
    outside.mkdir()
    os.symlink(outside, models / "evil")
    expect_raises(lambda: fm.resolve_dest(models, "evil", "x.safetensors"), "symlink în afară")
    ok_dest = fm.resolve_dest(models, "m", "a/b.safetensors")
    assert models.resolve() in ok_dest.parents

    # verify_file: bun / mărime greșită / hash greșit / lipsă
    data = b"sintetic" * 100
    good = hashlib.sha256(data).hexdigest()
    f = base / "f.safetensors"
    f.write_bytes(data)
    assert fm.verify_file(f, len(data), good) is None
    assert fm.verify_file(f, len(data) + 1, good)
    assert fm.verify_file(f, len(data), "0" * 64)
    assert fm.verify_file(base / "nu-exista", 1, good) == "lipsește"

    # fetch_file cu descărcarea înlocuită (fără rețea)
    model = {"id": "m", "source": "hf", "repo": "o/r", "revision": "a" * 40, "group": "matte"}

    def fake(payload):
        def _dl(url, part, size):
            assert url.startswith(f"https://huggingface.co/o/r/resolve/{'a' * 40}/w"), url
            with open(part, "xb") as out:
                out.write(payload)
        return _dl

    entry = {"path": "w.safetensors", "size": len(data), "sha256": good}
    fm.download_to_part, real = fake(data), fm.download_to_part
    try:
        state, _ = fm.fetch_file(models, model, entry, False)
        assert state == "descărcat" and (models / "m" / "w.safetensors").read_bytes() == data
        assert not list((models / "m").glob("*.part"))
        assert fm.fetch_file(models, model, entry, False)[0] == "ok"  # a doua oară: deja valid

        # hash GREȘIT: respins, parțialul propriu șters, fișierul străin din același director rămâne
        foreign = models / "m2" / "foreign.txt"
        foreign.parent.mkdir()
        foreign.write_text("nu atinge")
        fm.download_to_part = fake(b"altceva" * 100)
        bad = {"path": "w2.safetensors", "size": 700, "sha256": good}
        model2 = dict(model, id="m2")
        expect_raises(lambda: fm.fetch_file(models, model2, bad, False), "hash greșit la descărcare")
        assert not (models / "m2" / "w2.safetensors").exists() and not (models / "m2" / "w2.safetensors.part").exists()
        assert foreign.read_text() == "nu atinge"

        # mărime greșită
        fm.download_to_part = fake(data)
        expect_raises(lambda: fm.fetch_file(models, model2, dict(bad, size=len(data) - 1, sha256=good), False), "mărime greșită")
        assert not any(p.suffix == ".part" for p in (models / "m2").iterdir())

        # extensie .pt respinsă înainte de orice descărcare
        called = []
        fm.download_to_part = lambda *a: called.append(a)
        pt_entry = {"path": "w.pt", "size": 1, "sha256": good}
        expect_raises(lambda: fm.fetch_file(models, model, pt_entry, False), ".pt în fetch_file")
        dd_entry = {"path": "../w.safetensors", "size": 1, "sha256": good}
        expect_raises(lambda: fm.fetch_file(models, model, dd_entry, False), ".. în fetch_file")
        assert not called, "s-a încercat descărcarea unui fișier interzis"

        # fișier existent cu hash greșit: nu e șters, se oprește
        (models / "m" / "w.safetensors").write_bytes(b"corupt")
        expect_raises(lambda: fm.fetch_file(models, model, entry, False), "fișier existent corupt")
        assert (models / "m" / "w.safetensors").read_bytes() == b"corupt"

        # fără hash în manifest și fără --pin-new-hashes: respins
        no_hash = {"path": "n.json", "size": 3, "sha256": None}
        expect_raises(lambda: fm.fetch_file(models, model, no_hash, False), "hash necunoscut")
    finally:
        fm.download_to_part = real

    # scan_forbidden găsește pickle pe disc
    (models / "m" / "x.pkl").write_bytes(b"x")
    assert any(p.endswith("x.pkl") for p in fm.scan_forbidden(models))

# 4. Codul vendorizat: niciun torch.load activ, fără trust_remote_code.
vend = SCENE / "vendor" / "birefnet"
for p in vend.rglob("*.py"):
    src = p.read_text(encoding="utf-8")
    assert "trust_remote_code" not in src, p
    for ln in src.splitlines():
        code = ln.split("#", 1)[0]
        assert not re.search(r"\btorch\.load\(", code), f"{p}: {ln}"
assert (vend / "LICENSE").read_text().startswith("MIT License")
for p in SCENE.glob("*.py"):
    src = p.read_text(encoding="utf-8")
    assert "trust_remote_code=True" not in src and "torch.load(" not in src, p
    assert not re.search(r"^\s*(import pickle|from pickle|import dill|import cloudpickle)|pickle\.loads?\(", src, re.M), p

print("ok")
