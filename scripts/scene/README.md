# Pipeline de scene de catalog (pilot)

Mediu `uv` separat de `package.json` și de CI. Reguli și matricea uneltelor: `PROJECT_OS/10-SCENE-PRODUS.md`.
Nimic de aici nu intră în build-ul site-ului. Weights, imagini, fișe și registru nu intră în git.

## Mediu

Python 3.12, dependențe fixate exact în `pyproject.toml`, lock complet cu hash-uri în `uv.lock`
(torch 2.15.0, torchvision 0.29.2, diffusers 0.43.0, transformers 5.24.1, numpy 2.5.5, pymatting 1.1.16, rapidocr 3.10.0 etc.).
`uv` nu e activ direct în shell; se rulează prin mise.

Comanda standard (căi absolute, `-I` pentru orice Python care citește fișiere descărcate sau imagini):

```sh
mise exec uv@0.13.6 -- uv run --project "/Users/home/You Protect - website/.claude/worktrees/scene-pilot/scripts/scene" --frozen python -I <script> <args>
```

`--frozen` folosește `uv.lock` ca atare (nu rezolvă și nu actualizează nimic). Prima rulare creează `scripts/scene/.venv` (ignorat de git).
Pentru a schimba o dependență: editezi `pyproject.toml`, rulezi `uv lock` și comiți ambele fișiere.

## Modele

`models.lock.json` e manifestul: pentru fiecare model, id HF, revizie (commit SHA de 40 hex), lista EXACTĂ de fișiere permise
cu mărime și sha256, și grupul (`matte`, `sam`, `siglip`, `faces`, `ocr`, `klein`, `vlm`).
`hash_sursa` spune de unde vine hash-ul (`document-T1`, `hf-lfs-oid`, `calculat-la-prima-descarcare` sau, pentru
fișiere încă nedescărcate, `de-calculat-la-prima-descarcare` cu `sha256: null`).

```sh
# descărcare (stdlib, fără token; doar fișierele din manifest, la revizia fixată)
python3 -I scripts/scene/fetch_models.py --models-dir "/Users/home/You Protect - website/.catalog-work/scene/models" --group matte
# doar verificare a ce e pe disc
python3 -I scripts/scene/fetch_models.py --models-dir "/Users/home/You Protect - website/.catalog-work/scene/models" --group all --verify-only
```

Reguli ale scriptului: fără extensii `.pt .pth .bin .ckpt .pkl .pickle .npy .npz .py .pyc`; mărime + sha256 verificate;
la mismatch se șterge doar fișierul parțial al acelui run și se iese cu cod != 0; destinația rămâne sub `--models-dir`.
Grupurile `klein` și `vlm` (~16 GB și ~9 GB) nu se descarcă înainte de T4; unele fișiere mici din ele au `sha256: null`
și cer `--pin-new-hashes` la prima descărcare (hash-ul calculat se înscrie în manifest și se comite).

## Scripturi

- `birefnet_load.py`: BiRefNet (cod MIT vendorizat în `vendor/birefnet`, weights din safetensors) -> mască soft PNG 8 biți.
- `sam_load.py`: smoke SAM 2.1 (`Sam2Model` + `Sam2Processor`, `use_safetensors`, `local_files_only`) -> mască PNG.

- `zones_lib.py`: bibliotecă deterministă (Pillow + numpy): morfologie cu disc, construcția L/E/I, validarea invariantelor, I/O pentru `zone.json` și măști.
- `zone_specs.json`: specificația per produs (parametri, cutii/puncte/poligoane pentru marcaje critice și interior, matte ales cu motiv).
- `build_zones.py`: matte (BiRefNet + prag pe alb, comparate) + SAM 2.1 + L/E/I -> `zone.json`, măști PNG și `zone_overlay.png` într-un director NOU.
- `verify_zones.py`: `--zone-dir <dir> --source <jpg>`; cod 0 doar dacă toate invariantele (marcaje critice 100% în L, I strict interior, E în banda de 1-3 px, hash-uri, sha256 sursă) sunt respectate.

```sh
RUN='mise exec uv@0.13.6 -- uv run --project "<worktree>/scripts/scene" --frozen python -I'
$RUN scripts/scene/build_zones.py --source <jpg> --spec scripts/scene/zone_specs.json --product S476YE --models-dir <models> --out <director nou>
$RUN scripts/scene/verify_zones.py --zone-dir <director> --source <jpg>
```

Testele zonelor (`tests/scene-zones.test.mjs`) rulează pe imagini sintetice, fără modele; `verify_zones.py` merge și cu `uv run --no-project --with pillow --with numpy`.

Exemplu:

```sh
mise exec uv@0.13.6 -- uv run --project "/Users/home/You Protect - website/.claude/worktrees/scene-pilot/scripts/scene" --frozen \
  python -I "/Users/home/You Protect - website/.claude/worktrees/scene-pilot/scripts/scene/birefnet_load.py" \
  --models-dir "/Users/home/You Protect - website/.catalog-work/scene/models" \
  --image "/Users/home/You Protect - website/.catalog-work/images/portwest/S476YE.jpg" \
  --out "/Users/home/You Protect - website/.catalog-work/scene/_smoke/S476YE_mask.png"
```

Fără ComfyUI, fără MCP, fără custom nodes, fără `trust_remote_code`, fără `torch.load`/pickle.

## Compunere, verificări și fișă (T3a)

Trei module deterministe, doar Pillow + numpy + stdlib (rulează fără modele AI; test: `tests/scene-compose.test.mjs`):

- `compose_lib.py`: `place_product` (doar scalare <= 1 și deplasare întreagă; la scale 1.0 copie exactă, la < 1 Pillow LANCZOS și zonele
  recalculate cu `zones_lib.build_zones` din alpha și măștile critice reeșantionate, apoi validate), `inpaint_mask` = NOT(L ∪ E),
  `compose` (L = referința așezată exact; E = F·a + B·(1−a), cu F estimat extern; restul = fundal).
- `checks_lib.py`: fiecare verificare întoarce `{name, value, threshold, passed, detail}`; funcții pure. `check_transform`,
  `check_identity_master` (max|Δ| = 0 în L erodat 1 px), `detect_mirror`, `check_scale_not_up` (recalculează referința din sursă
  și parametrii declarați), `calibrate_export` + `check_identity_export` (ΔE2000 p99, SSIM 7x7 și ΔE2000 pe blocuri 8x8, praguri =
  valoarea calibrată pe packshot-ul singur + margine), `check_halo`, `check_color_spill`, `check_decor_fluo`.
  Pragurile calibrate (halo delta 12, spill 2%, fluo 0,5%, margini export ΔE +2 / SSIM −0,02) și valorile măsurate sunt în ieșirea
  „CAL ..." a `tests/py/scene_compose_check.py`.
- `fisa_lib.py`: `build_fisa` (calculează `rezultat_global`: adevărat doar dacă există verificări și toate au `passed is True`),
  `write_fisa(cand_dir, fisa, registry_path, base_dir)` (atomic, refuză suprascrierea, cale doar sub `base_dir`, fără `..`),
  `registru.jsonl` append-only cu `prev_sha256` (lanț) și `verify_registry`. Alterarea ultimei linii nu rupe lanțul; se prinde cu
  `fisa_sha256` față de `fisa.json`. Verificările externe (OCR, fețe, SigLIP2, VLM, T5) intră în fișă dacă au aceeași formă.
