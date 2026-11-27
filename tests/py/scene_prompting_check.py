"""Verificări stdlib pentru scripts/scene/prompting.py și contexte.json (fără modele, fără Pillow).

Rulare: python3 -I tests/py/scene_prompting_check.py <ROOT>
POZITIVE: vestă + șantier ziua, bocanc + noroi, geacă + atelier; toate prompt-urile permise se construiesc; 4-6 contexte per produs.
NEGATIVE: clasa 2 + drum rapid / cale ferată / noapte, geacă 11611 clasa 1 + sudură activă, context inexistent, produs inexistent,
context nedeclarat pentru produs, cuvânt interzis injectat în decor/variantă (EN și RO, cu și fără diacritice), regulă ștearsă.
"""
# ruff: noqa: S101, E501
import copy
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location("prompting", ROOT / "scripts" / "scene" / "prompting.py")
pr = importlib.util.module_from_spec(spec)
sys.modules["prompting"] = pr
spec.loader.exec_module(pr)
cx = pr.load_contexte()
lines = []


def ok(name):
    lines.append(f"ok {name}")


def rejects(name, fn, text):
    try:
        fn()
    except pr.PromptError as e:
        assert text in str(e), f"{name}: mesaj așteptat cu {text!r}, primit {e}"
        ok(name)
        return
    raise AssertionError(f"{name}: trebuia PromptError({text!r})")


# ------------------------------------------------------------------ pozitive
p = pr.build_prompt("S476YE", "santier_constructii_zi", 0, cx)
assert "mannequin" in p and "construction site" in p and "daylight" in p
ok("POS vestă + șantier ziua")
p = pr.build_prompt("FD25BK", "santier_umed_noroi", 0, cx)
assert "mud" in p and "mannequin" not in p and "Still life" in p
ok("POS bocanc + noroi (natură moartă, fără manechin)")
p = pr.build_prompt("BZ739OR", "atelier_metalurgic", 1, cx)
assert "workshop" in p and "welding" not in p
ok("POS geacă 11611 + atelier metalurgic")
assert pr.build_prompt("S476YE", "hala_depozit", 7, cx) == pr.build_prompt("S476YE", "hala_depozit", 7 % 3, cx)
ok("POS variantă ciclică, determinist")
for pid in cx["produse"]:
    allowed = pr.allowed_contexts(pid, cx)
    assert 4 <= len(allowed) <= 6, (pid, allowed)
assert pr.validate_contexte(cx) == [], pr.validate_contexte(cx)
ok("POS 4-6 contexte permise per produs, toate prompt-urile se construiesc, fără cuvinte interzise")
assert "drum_rapid" not in pr.allowed_contexts("S476YE", cx) and "santier_noapte" not in pr.allowed_contexts("S476YE", cx)
assert "sudura_activa" not in pr.allowed_contexts("BZ739OR", cx)
ok("POS lista permisă exclude contextele interzise")
assert cx["reguli"]["s7l"]["interzise"] == [] and set(cx["reguli"]["s7l"]["permise_speciale"]) == {"noroi", "apa"}
ok("POS S7L: noroi și apă permise")

# standardele din fișele de catalog (sursa adevărului)
for pid, needle in (("S476YE", "clasa 2"), ("BZ739OR", "11611"), ("FD25BK", "S7L")):
    entry = cx["produse"][pid]
    text = (ROOT / entry["sursa"]).read_text(encoding="utf-8")
    assert needle in text and any(needle in s for s in entry["standarde"]), (pid, needle)
ok("POS standardele din contexte.json apar în fișele de catalog")

# ------------------------------------------------------------------ negative
rejects("NEG clasa 2 + drum rapid", lambda: pr.build_prompt("S476YE", "drum_rapid", 0, cx), "drum_rapid")
rejects("NEG clasa 2 + cale ferată", lambda: pr.build_prompt("S476YE", "cale_ferata", 0, cx), "cale_ferata")
rejects("NEG clasa 2 + noapte", lambda: pr.build_prompt("S476YE", "santier_noapte", 0, cx), "noapte")
rejects("NEG 11611 clasa 1 + sudură activă", lambda: pr.build_prompt("BZ739OR", "sudura_activa", 0, cx), "sudura_activa")
rejects("NEG context inexistent", lambda: pr.build_prompt("S476YE", "plaja", 0, cx), "inexistent")
rejects("NEG produs inexistent", lambda: pr.build_prompt("XX000", "hala_depozit", 0, cx), "necunoscut")
rejects("NEG context nedeclarat pentru produs", lambda: pr.build_prompt("S476YE", "atelier_metalurgic", 0, cx), "nu e declarat")
rejects("NEG variant invalid", lambda: pr.build_prompt("S476YE", "hala_depozit", -1, cx), "variant")
rejects("NEG variant bool", lambda: pr.build_prompt("S476YE", "hala_depozit", True, cx), "variant")

for bad_text, label in (
    ("a worker standing near the racks", "worker"), ("a person walking", "person"), ("people in the distance", "people"),
    ("a smiling face", "face"), ("un muncitor la lucru", "muncitor"), ("o persoană în fundal", "persoana"),
    ("o față zâmbitoare", "fata"), ("un om cu casca", "om"), ("a human head", "human"),
):
    bad = copy.deepcopy(cx)
    for c in bad["contexte"]:
        if c["id"] == "hala_depozit":
            c["decor"] += " " + bad_text
    rejects(f"NEG cuvânt interzis în decor: {label}", lambda b=bad: pr.build_prompt("S476YE", "hala_depozit", 0, b), "interzise")
bad = copy.deepcopy(cx)
for c in bad["contexte"]:
    if c["id"] == "hala_depozit":
        c["variante"][0] = "A man in the aisle."
rejects("NEG cuvânt interzis în variantă", lambda: pr.build_prompt("S476YE", "hala_depozit", 0, bad), "interzise")
assert pr.validate_contexte(bad), "validate_contexte trebuia să semnaleze decorul stricat"
ok("NEG validate_contexte semnalează contextul stricat")
bad = copy.deepcopy(cx)
del bad["reguli"]["vizibilitate_clasa_2"]
rejects("NEG atribut fără regulă", lambda: pr.build_prompt("S476YE", "hala_depozit", 0, bad), "fără regulă")
bad = copy.deepcopy(cx)
for c in bad["contexte"]:
    if c["id"] == "hala_depozit":
        c["etichete"].append("noapte")
rejects("NEG etichetă interzisă adăugată pe un context altfel permis", lambda: pr.build_prompt("S476YE", "hala_depozit", 0, bad), "noapte")
assert "hala_depozit" not in pr.allowed_contexts("S476YE", bad)
ok("NEG allowed_contexts scoate contextul cu etichetă interzisă")
# „mannequin” și „headless”-ul fix nu declanșează lista (cuvinte întregi), dar „man” singur da
assert pr.forbidden_words_in("A mannequin on a stand", cx) == []
assert pr.forbidden_words_in("A man on a stand", cx) == ["man"]
ok("POS cuvinte întregi: mannequin nu e man")

# calibrarea comisă există și are pragurile
cal = json.loads((ROOT / "scripts" / "scene" / "calibrare_v3.json").read_text(encoding="utf-8"))
assert set(cal["praguri"]) == {"halo_delta", "spill_max_frac", "fluo_max_frac"}
assert all(isinstance(v, (int, float)) and v > 0 for v in cal["praguri"].values())
assert set(cal["produse"]) == {"S476YE", "BZ739OR", "FD25BK"}
ok("POS calibrare_v3.json: praguri și 3 produse")

print("\n".join(lines))
print("ok")
