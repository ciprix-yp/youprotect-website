"""Constructorul de prompt pentru scenele de catalog. Doar stdlib.

Prompt-ul se construiește EXCLUSIV din `contexte.json`: un context e permis pentru un produs dacă produsul e în lista lui și
niciuna din etichetele lui nu e interzisă de atributele produsului (vizibilitate clasa 2, EN ISO 11611 clasa 1, S7L).
Prompt-ul final nu are voie să conțină cuvinte interzise (oameni, fețe etc., EN și RO); singura excepție e formularea fixă a
manechinului (`manechin.fraza`), care se scoate din text înainte de scanare.

CLI: python3 -I prompting.py --product S476YE --context santier_constructii_zi [--variant 0] [--list]
"""
from __future__ import annotations

import argparse
import copy
import json
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_CONTEXTE = HERE / "contexte.json"


class PromptError(ValueError):
    pass


def load_contexte(path: str | Path | None = None) -> dict:
    p = Path(path) if path else DEFAULT_CONTEXTE
    with open(p, encoding="utf-8") as fh:
        data = json.load(fh)
    if data.get("schema") != 1:
        raise PromptError(f"schema necunoscută în {p}")
    return data


def _fold(text: str) -> str:
    """Minuscule, fără diacritice (ă->a, ș->s ...), ca să prindă „față”, „cap”, „mână” scrise cu sau fără diacritice."""
    t = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def forbidden_words_in(text: str, contexte: dict) -> list[str]:
    words = contexte["cuvinte_interzise"]
    found = []
    tokens = re.findall(r"[a-z]+", _fold(text))
    banned = {_fold(w) for lang in words.values() for w in lang}
    for t in tokens:
        if t in banned and t not in found:
            found.append(t)
    return found


def forbidden_tags(product_id: str, contexte: dict) -> set[str]:
    prod = contexte["produse"].get(product_id)
    if prod is None:
        raise PromptError(f"produs necunoscut: {product_id!r}")
    out: set[str] = set()
    for attr in prod["atribute"]:
        rule = contexte["reguli"].get(attr)
        if rule is None:
            raise PromptError(f"atribut fără regulă: {attr!r} (produs {product_id})")
        out.update(rule["interzise"])
    return out


def _find(contexte: dict, context_id: str) -> dict:
    for c in contexte["contexte"]:
        if c["id"] == context_id:
            return c
    raise PromptError(f"context inexistent: {context_id!r}")


def allowed_contexts(product_id: str, contexte: dict | None = None) -> list[str]:
    """Id-urile contextelor permise pentru produs, în ordinea din fișier."""
    cx = contexte or load_contexte()
    bad = forbidden_tags(product_id, cx)
    return [c["id"] for c in cx["contexte"] if product_id in c["produse"] and not (bad & set(c["etichete"]))]


def build_prompt(product_id: str, context_id: str, variant: int = 0, contexte: dict | None = None) -> str:
    cx = contexte if contexte is not None else load_contexte()
    if isinstance(variant, bool) or not isinstance(variant, int) or variant < 0:
        raise PromptError(f"variant trebuie să fie întreg >= 0: {variant!r}")
    prod = cx["produse"].get(product_id)
    if prod is None:
        raise PromptError(f"produs necunoscut: {product_id!r}")
    ctx = _find(cx, context_id)
    if product_id not in ctx["produse"]:
        raise PromptError(f"contextul {context_id!r} nu e declarat pentru produsul {product_id!r}")
    hit = sorted(forbidden_tags(product_id, cx) & set(ctx["etichete"]))
    if hit:
        raise PromptError(f"contextul {context_id!r} are etichete interzise pentru {product_id}: {', '.join(hit)}")
    variants = ctx["variante"]
    if not variants:
        raise PromptError(f"contextul {context_id!r} nu are variante")
    if prod["tip"] == "manechin":
        lead = prod.get("manechin_fraza") or cx["manechin"]["fraza"]
    else:
        lead = cx["manechin"]["fraza_natura_moarta"]
    body = f"{ctx['decor']} {variants[variant % len(variants)]}"
    bad = forbidden_words_in(body, cx)  # formularea fixă (lead) nu se scanează
    if bad:
        raise PromptError(f"cuvinte interzise în decor/variantă ({context_id}): {', '.join(bad)}")
    bad_lead = forbidden_words_in(cx["manechin"]["fraza_natura_moarta"], cx)
    if bad_lead:
        raise PromptError(f"cuvinte interzise în formularea de natură moartă: {', '.join(bad_lead)}")
    prompt = f"{lead} {body}".strip()
    # verificare finală: după scoaterea formulării fixe a manechinului nu mai rămâne nimic interzis
    rest = prompt.replace(lead, " ").replace(cx["manechin"]["fraza"], " ")
    bad_all = forbidden_words_in(rest, cx)
    if bad_all:
        raise PromptError(f"prompt final cu cuvinte interzise: {', '.join(bad_all)}")
    return prompt


def validate_contexte(contexte: dict | None = None) -> list[str]:
    """Erori de integritate: fiecare produs are 4-6 contexte permise, id-uri unice, fiecare prompt permis se construiește."""
    cx = copy.deepcopy(contexte) if contexte is not None else load_contexte()
    errs: list[str] = []
    ids = [c["id"] for c in cx["contexte"]]
    if len(ids) != len(set(ids)):
        errs.append("id-uri de context duplicate")
    for pid in cx["produse"]:
        ok = allowed_contexts(pid, cx)
        if not 4 <= len(ok) <= 6:
            errs.append(f"{pid}: {len(ok)} contexte permise (trebuie 4-6)")
        for cid in ok:
            for v in range(len(_find(cx, cid)["variante"])):
                try:
                    build_prompt(pid, cid, v, cx)
                except PromptError as e:
                    errs.append(f"{pid}/{cid}/v{v}: {e}")
    return errs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--product", required=True)
    ap.add_argument("--context")
    ap.add_argument("--variant", type=int, default=0)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--contexte", default=None)
    a = ap.parse_args()
    cx = load_contexte(a.contexte)
    if a.list or not a.context:
        print("\n".join(allowed_contexts(a.product, cx)))
        return 0
    print(build_prompt(a.product, a.context, a.variant, cx))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except PromptError as e:
        print(f"EROARE: {e}", file=sys.stderr)
        sys.exit(1)
