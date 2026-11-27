"""Verificări stdlib pentru scripts/scene/klein_lib.py (rezoluție la multiplu de 16, validarea căilor), fără torch și fără modele.

Rulare: python3 -I tests/py/scene_klein_check.py <ROOT>
"""
# ruff: noqa: S101
import importlib.util
import sys
import tempfile
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location("klein_lib", ROOT / "scripts" / "scene" / "klein_lib.py")
kl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kl)


def raises(fn, text):
    try:
        fn()
    except ValueError as e:
        assert text in str(e), f"mesaj așteptat cu {text!r}, primit {e}"
        return
    raise AssertionError(f"trebuia ValueError({text!r})")


assert kl.fit_resolution((1100, 1100), 768) == (768, 768)
assert kl.fit_resolution((1100, 1100), 1024) == (1024, 1024)
assert kl.fit_resolution((1100, 550), 512) == (512, 256)
w, h = kl.fit_resolution((1100, 733), 768)
assert w % 16 == 0 and h % 16 == 0 and w == 768
raises(lambda: kl.fit_resolution((1100, 1100), 770), "multiplu")
raises(lambda: kl.fit_resolution((0, 1100), 768), "invalide")

with tempfile.TemporaryDirectory() as d:
    d = Path(d).resolve()
    (d / "a.jpg").write_bytes(b"x")
    assert kl.require_dir(d, "d") == d
    assert kl.require_file(d / "a.jpg", "f", (".jpg",)) == d / "a.jpg"
    raises(lambda: kl.require_dir("rel/dir", "d"), "absolută")
    raises(lambda: kl.require_dir(str(d) + "/../x", "d"), "..")
    raises(lambda: kl.require_file(d / "a.jpg", "f", (".png",)), "inexistent")
    raises(lambda: kl.require_file(d / "lipsa.jpg", "f", (".jpg",)), "inexistent")
    r = kl.new_run_dir(d, "20261127T120000Z")
    assert r.is_dir() and r.parent == d
    try:
        kl.new_run_dir(d, "20261127T120000Z")
    except FileExistsError:
        pass
    else:
        raise AssertionError("suprascrierea unui director existent trebuia refuzată")
    raises(lambda: kl.new_run_dir(d, "../x"), "timestamp")
print("ok")
