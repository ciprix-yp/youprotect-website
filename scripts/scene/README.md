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

Exemplu:

```sh
mise exec uv@0.13.6 -- uv run --project "/Users/home/You Protect - website/.claude/worktrees/scene-pilot/scripts/scene" --frozen \
  python -I "/Users/home/You Protect - website/.claude/worktrees/scene-pilot/scripts/scene/birefnet_load.py" \
  --models-dir "/Users/home/You Protect - website/.catalog-work/scene/models" \
  --image "/Users/home/You Protect - website/.catalog-work/images/portwest/S476YE.jpg" \
  --out "/Users/home/You Protect - website/.catalog-work/scene/_smoke/S476YE_mask.png"
```

Fără ComfyUI, fără MCP, fără custom nodes, fără `trust_remote_code`, fără `torch.load`/pickle.
