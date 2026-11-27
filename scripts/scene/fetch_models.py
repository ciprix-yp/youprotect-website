"""Descarcă și verifică modelele din `models.lock.json`, un grup o dată.

Doar stdlib. Reguli de securitate (documentate în PROJECT_OS/10-SCENE-PRODUS.md):
- se descarcă DOAR fișierele din manifest, la revizia fixată (HF: `resolve/<sha>/...`);
- extensii de pickle și cod (`.pt .pth .bin .ckpt .pkl .pickle .npy .npz .py .pyc`) sunt refuzate;
- numele din manifest se validează (fără `..`, fără cale absolută, fără caractere ciudate), iar destinația
  trebuie să rămână sub `--models-dir`;
- fișierul e valid doar dacă mărimea ȘI sha256 se potrivesc; la mismatch se șterge doar fișierul parțial
  creat de acest run (`*.part`, creat exclusiv) și se oprește cu cod != 0;
- fără token, fără cont; doar https, inclusiv pe redirecturi.

Rulare: python -I fetch_models.py --models-dir <dir> --group matte [--verify-only]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

FORBIDDEN_EXT = frozenset({".pt", ".pth", ".bin", ".ckpt", ".pkl", ".pickle", ".npy", ".npz", ".py", ".pyc"})
GROUPS = ("matte", "sam", "siglip", "faces", "ocr", "klein", "vlm")
ALLOWED_HOSTS = frozenset({"huggingface.co", "media.githubusercontent.com", "www.modelscope.cn"})
_SEGMENT = r"[A-Za-z0-9][A-Za-z0-9._-]*"
_REL_RE = re.compile(rf"^{_SEGMENT}(/{_SEGMENT})*$")
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_REV_RE = re.compile(r"^[0-9a-f]{40}$")
_REPO_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$")
DEFAULT_MANIFEST = Path(__file__).resolve().parent / "models.lock.json"
PENDING = "de-calculat-la-prima-descarcare"
CALCULATED = "calculat-la-prima-descarcare"


class FetchError(Exception):
    """Orice încălcare de regulă: se oprește cu cod != 0."""


def check_extension(name: str) -> None:
    """Refuză extensiile interzise pe ORICE segment de cu punct din nume (ex. `model.pt.safetensors`)."""
    base = name.rsplit("/", 1)[-1].lower()
    parts = base.split(".")[1:]
    for p in parts:
        if "." + p in FORBIDDEN_EXT:
            raise FetchError(f"extensie interzisă ({'.' + p}) în {name!r}")


def validate_rel_path(name: object) -> str:
    """Nume relativ sigur: segmente alfanumerice, fără `..`, fără `/` la început, fără backslash."""
    if not isinstance(name, str) or not name:
        raise FetchError(f"nume de fișier invalid: {name!r}")
    if name.startswith("/") or "\\" in name or "\x00" in name or ":" in name:
        raise FetchError(f"cale absolută sau separatori nepermiși: {name!r}")
    if any(seg in ("", ".", "..") for seg in name.split("/")) or ".." in name.split("/"):
        raise FetchError(f"cale cu segment interzis: {name!r}")
    if not _REL_RE.match(name):
        raise FetchError(f"caractere nepermise în {name!r}")
    check_extension(name)
    return name


def resolve_dest(models_dir: Path, model_id: str, rel: str) -> Path:
    """Destinația `<models_dir>/<model_id>/<rel>`; verifică că rămâne sub `models_dir` (inclusiv prin symlink-uri)."""
    validate_rel_path(model_id)
    validate_rel_path(rel)
    root = Path(os.path.realpath(models_dir))
    dest = Path(os.path.realpath(root / model_id / rel))
    if root != dest and root not in dest.parents:
        raise FetchError(f"destinația iese din models-dir: {dest}")
    return dest


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_file(path: Path, size: int, sha256: str) -> str | None:
    """None dacă fișierul e valid, altfel motivul."""
    if not path.is_file():
        return "lipsește"
    got = path.stat().st_size
    if got != size:
        return f"mărime {got} != {size}"
    digest = sha256_file(path)
    if digest != sha256:
        return f"sha256 {digest} != {sha256}"
    return None


def file_url(model: dict, entry: dict) -> str:
    if model["source"] == "hf":
        quoted = urllib.parse.quote(entry["path"], safe="/")
        return f"https://huggingface.co/{model['repo']}/resolve/{model['revision']}/{quoted}"
    return entry["url"]


def validate_manifest(manifest: dict) -> list[str]:
    """Lista erorilor de structură/securitate (goală = valid). Folosită și de teste."""
    errors: list[str] = []
    if manifest.get("schema") != 1:
        errors.append("schema != 1")
    seen_ids: set[str] = set()
    for m in manifest.get("models", []):
        mid = m.get("id")
        try:
            validate_rel_path(mid)
        except FetchError as e:
            errors.append(f"model {mid!r}: {e}")
            continue
        if mid in seen_ids:
            errors.append(f"model duplicat: {mid}")
        seen_ids.add(mid)
        if m.get("group") not in GROUPS:
            errors.append(f"{mid}: grup necunoscut {m.get('group')!r}")
        if m.get("source") not in ("hf", "url"):
            errors.append(f"{mid}: source {m.get('source')!r}")
        if m.get("source") == "hf":
            if not _REPO_RE.match(str(m.get("repo", ""))):
                errors.append(f"{mid}: repo invalid")
            if not _REV_RE.match(str(m.get("revision", ""))):
                errors.append(f"{mid}: revizie de 40 hex lipsă")
        elif not m.get("revision"):
            errors.append(f"{mid}: revizie lipsă")
        files = m.get("files")
        if not files:
            errors.append(f"{mid}: fără fișiere")
            continue
        names: set[str] = set()
        for e in files:
            name = e.get("path")
            try:
                validate_rel_path(name)
            except FetchError as ex:
                errors.append(f"{mid}: {ex}")
                continue
            if name in names:
                errors.append(f"{mid}: fișier duplicat {name}")
            names.add(name)
            if not isinstance(e.get("size"), int) or e["size"] <= 0:
                errors.append(f"{mid}/{name}: size invalid")
            sha = e.get("sha256")
            if sha is None:
                if e.get("hash_sursa") != PENDING:
                    errors.append(f"{mid}/{name}: sha256 null fără hash_sursa={PENDING}")
            elif not _SHA256_RE.match(str(sha)):
                errors.append(f"{mid}/{name}: sha256 invalid")
            if m.get("source") == "url":
                url = e.get("url", "")
                p = urllib.parse.urlsplit(url)
                if p.scheme != "https" or p.hostname not in ALLOWED_HOSTS:
                    errors.append(f"{mid}/{name}: url în afara listei permise: {url}")
    return errors


def load_manifest(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        manifest = json.load(f)
    errors = validate_manifest(manifest)
    if errors:
        raise FetchError("manifest invalid:\n  " + "\n  ".join(errors))
    return manifest


class _HttpsOnlyRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        if urllib.parse.urlsplit(newurl).scheme != "https":
            raise FetchError(f"redirect ne-https refuzat: {newurl}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _open(url: str):
    p = urllib.parse.urlsplit(url)
    if p.scheme != "https" or p.hostname not in ALLOWED_HOSTS:
        raise FetchError(f"url în afara listei permise: {url}")
    opener = urllib.request.build_opener(_HttpsOnlyRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": "scene-fetch-models"})  # noqa: S310  (schema https și host din lista permisă, verificate mai sus)
    return opener.open(req, timeout=60)  # noqa: S310  # nosemgrep


def download_to_part(url: str, part: Path, size: int) -> None:
    """Descarcă în `part` (creat exclusiv); nu depășește `size` octeți."""
    got = 0
    with _open(url) as resp, open(part, "xb") as out:
        for chunk in iter(lambda: resp.read(1 << 20), b""):
            got += len(chunk)
            if got > size:
                raise FetchError(f"răspuns mai mare decât mărimea din manifest ({size})")
            out.write(chunk)


def fetch_file(models_dir: Path, model: dict, entry: dict, pin: bool) -> tuple[str, str | None]:
    """Returnează (stare, sha256_calculat dacă s-a pinuit). stare: `ok` (deja valid) | `descărcat`."""
    dest = resolve_dest(models_dir, model["id"], entry["path"])
    sha = entry.get("sha256")
    if sha is None and not pin:
        raise FetchError(f"{model['id']}/{entry['path']}: hash necunoscut; rulează cu --pin-new-hashes pentru prima descărcare")
    if dest.exists():
        if sha is None:
            raise FetchError(f"{dest} există deja dar manifestul nu are hash; verifică manual")
        reason = verify_file(dest, entry["size"], sha)
        if reason is None:
            return "ok", None
        raise FetchError(f"{dest} există dar nu se potrivește ({reason}); nu îl șterg, verifică manual")
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    try:
        download_to_part(file_url(model, entry), part, entry["size"])
    except BaseException:
        if part.exists():
            part.unlink()  # doar fișierul creat de acest run
        raise
    got_size = part.stat().st_size
    digest = sha256_file(part)
    if got_size != entry["size"] or (sha is not None and digest != sha):
        part.unlink()  # parțialul creat de acest run
        raise FetchError(
            f"{model['id']}/{entry['path']}: mărime/sha256 greșite (mărime {got_size}, sha256 {digest}); "
            "fișierul parțial a fost șters"
        )
    os.replace(part, dest)
    return "descărcat", (digest if sha is None else None)


def scan_forbidden(models_dir: Path) -> list[str]:
    bad = []
    for root, _dirs, files in os.walk(models_dir):
        for f in files:
            try:
                check_extension(f)
            except FetchError:
                bad.append(os.path.join(root, f))
    return bad


def verify_group(models_dir: Path, manifest: dict, group: str, model_id: str | None = None) -> list[str]:
    problems = []
    for m in manifest["models"]:
        if m["group"] != group or (model_id and m["id"] != model_id):
            continue
        for e in m["files"]:
            dest = resolve_dest(models_dir, m["id"], e["path"])
            if e.get("sha256") is None:
                problems.append(f"{m['id']}/{e['path']}: hash încă necalculat")
                continue
            reason = verify_file(dest, e["size"], e["sha256"])
            status = "OK " if reason is None else "EȘEC"
            print(f"  {status} {m['id']}/{e['path']} ({e['size']} B)" + ("" if reason is None else f": {reason}"))
            if reason is not None:
                problems.append(f"{m['id']}/{e['path']}: {reason}")
    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--models-dir", required=True, type=Path, help="obligatoriu: unde se pun modelele")
    ap.add_argument("--group", required=True, choices=GROUPS + ("all",))
    ap.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    ap.add_argument("--model-id", default=None, help="opțional: doar modelul cu acest id din grup (ex. flux2-klein-4b)")
    ap.add_argument("--verify-only", action="store_true", help="doar verifică ce e pe disc")
    ap.add_argument(
        "--pin-new-hashes", action="store_true", help="la prima descărcare, înscrie în manifest sha256 pentru intrările fără hash"
    )
    args = ap.parse_args(argv)
    try:
        manifest = load_manifest(args.manifest)
        groups = GROUPS if args.group == "all" else (args.group,)
        models_dir = args.models_dir
        if not args.verify_only:
            models_dir.mkdir(parents=True, exist_ok=True)
        elif not models_dir.is_dir():
            raise FetchError(f"--models-dir inexistent: {models_dir}")
        failures: list[str] = []
        for group in groups:
            print(f"[{group}]")
            if not args.verify_only:
                pinned = False
                for m in manifest["models"]:
                    if m["group"] != group or (args.model_id and m["id"] != args.model_id):
                        continue
                    for e in m["files"]:
                        state, new_hash = fetch_file(models_dir, m, e, args.pin_new_hashes)
                        print(f"  {state}: {m['id']}/{e['path']}")
                        if new_hash:
                            e["sha256"], e["hash_sursa"] = new_hash, CALCULATED
                            pinned = True
                if pinned:
                    args.manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                    print(f"  manifest actualizat cu hash-uri noi: {args.manifest}")
            failures += verify_group(models_dir, manifest, group, args.model_id)
        bad = scan_forbidden(models_dir)
        if bad:
            failures += [f"extensie interzisă pe disc: {b}" for b in bad]
        if failures:
            print("EȘEC:\n  " + "\n  ".join(failures), file=sys.stderr)
            return 2
        print("toate fișierele verificate (mărime + sha256); nicio extensie interzisă în models-dir")
        return 0
    except FetchError as e:
        print(f"EROARE: {e}", file=sys.stderr)
        return 3
    except (urllib.error.URLError, OSError) as e:
        print(f"EROARE de rețea/disc: {e}", file=sys.stderr)
        return 4


if __name__ == "__main__":
    sys.exit(main())
