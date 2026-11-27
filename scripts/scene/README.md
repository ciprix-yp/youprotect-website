# Pipeline de scene de catalog (pilot)

Mediu `uv` separat de `package.json` și de CI. Reguli și matricea uneltelor: `PROJECT_OS/10-SCENE-PRODUS.md`.
Nimic de aici nu intră în build-ul site-ului. Weights, imagini, fișe și registru nu intră în git.

## Mediu

Python 3.12, dependențe fixate exact în `pyproject.toml`, lock complet cu hash-uri în `uv.lock`
(torch 2.15.0, torchvision 0.29.2, diffusers 0.43.0, transformers 5.23.0, huggingface-hub 2.4.0, numpy 2.5.5, pymatting 1.1.16, rapidocr 3.10.0 etc.).
Cooldown de 7 zile (`exclude-newer = "7 days"`) fără excepții per pachet (transformers 5.23.0 și huggingface-hub 2.4.0 sunt cele mai noi mai vechi de 7 zile
care satisfac constrângerile Sam2Model/Qwen3-VL/diffusers 0.43.0). `uv` nu e activ direct în shell; se rulează prin mise.

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
  `compose(placed, bg, foreground=None, band_fill=True)` (L = referința așezată exact; E = F·a + B·(1−a), cu F estimat extern; restul = fundal).
  Implicit B în E vine din decorul din afara L ∪ E: `prepare_background`/`fill_from_outside` umplu E și un inel de `BAND_RING_PX`=3 px prin dilatare iterativă
  (media vecinilor 8-conectați deja cunoscuți, determinist, fără aleatoriu), pentru că reconstrucția VAE a packshot-ului are fundal alb în E (E nu se generează).
  `band_fill=False` = comportamentul vechi, doar pentru comparații.
- `checks_lib.py`: fiecare verificare întoarce `{name, value, threshold, passed, detail}`; funcții pure. `check_transform`,
  `check_identity_master` (max|Δ| = 0 pe L COMPLET, nu erodat: masterul e lossless; eroziunea de 1 px rămâne doar la `check_identity_export`), `detect_mirror`, `check_scale_not_up` (recalculează referința din sursă
  și parametrii declarați), `calibrate_export` + `check_identity_export` (ΔE2000 p99, SSIM 7x7 și ΔE2000 pe blocuri 8x8, praguri =
  valoarea calibrată pe packshot-ul singur + margine), `check_halo`, `check_color_spill`, `check_decor_fluo`.
  Pragurile calibrate (halo delta 12, spill 2%, fluo 0,5%, margini export ΔE +2 / SSIM −0,02) și valorile măsurate sunt în ieșirea
  „CAL ..." a `tests/py/scene_compose_check.py`.
- `fisa_lib.py`: `build_fisa` (calculează `rezultat_global`: adevărat doar dacă există verificări și toate au `passed is True`),
  `write_fisa(cand_dir, fisa, registry_path, base_dir)` (atomic, refuză suprascrierea, cale doar sub `base_dir`, fără `..`),
  `registru.jsonl` append-only cu `prev_sha256` (lanț) și `verify_registry`. Alterarea ultimei linii nu rupe lanțul; se prinde cu
  `fisa_sha256` față de `fisa.json`. Verificările externe (OCR, fețe, SigLIP2, VLM, T5) intră în fișă dacă au aceeași formă.

## Proba FLUX.2 klein (T4)

`fetch_models.py --group klein --model-id flux2-klein-4b --pin-new-hashes` descarcă doar modelul distilat (~16 GB); `--model-id` restrânge grupul la un model.
`klein_probe.py` (funcții pure în `klein_lib.py`, testate fără modele) rulează `Flux2KleinInpaintPipeline` pe MPS: codează promptul cu text encoder-ul,
îl eliberează, apoi încarcă transformerul; scrie `input.png`, `mask_used.png`, `raw_seed<N>.png` și `report.json` într-un director nou `<out-root>/<UTC>/`.
Rezultatele măsurate sunt în `PROJECT_OS/10-SCENE-PRODUS.md` (secțiunea T4, dacă a fost adăugată) și în raportul task-ului.

## Contexte, calibrare și candidați (T5a)

- `contexte.json`: produsele pilot cu standardele din `catalog/texts/portwest/*.json`, regulile pe atribute (clasa 2 de vizibilitate interzice
  `drum_rapid`/`cale_ferata`/`noapte`; EN ISO 11611 clasa 1 interzice `sudura_activa`; S7L permite noroi și apă), formularea fixă a manechinului
  (FD25BK = natură moartă, fără manechin), lista cuvintelor interzise și contextele cu etichete și variante. Contextele cu etichete interzise
  rămân în fișier doar ca să fie respinse explicit de `prompting.build_prompt`.
- `prompting.py` (stdlib): `build_prompt(produs, context, variant)`, `allowed_contexts`, `validate_contexte`; CLI `--product P --context C [--variant N]`.
  Erori (`PromptError`): context inexistent/nedeclarat, etichetă interzisă, cuvânt interzis în decor/variantă. Teste: `tests/scene-prompting.test.mjs`.
- `calibrate_real.py` + `calibrare_v3.json` (comis, ACTUAL: compunere cu umplerea benzii E, inclusiv buzunare închise ca ochiurile unui bocanc): compuneri pe produse reale pe 5 fundaluri ne-AI, defecte artificiale, praguri alese, calibrarea
  exportului JPEG (q90, q85) pe packshot-ul singur. `calibrare.json` rămâne în git doar pentru istoric: ÎNVECHIT (compunere fără umplerea benzii), nu se mai folosește. `pilot_lib.py`: încărcare, așezare, foreground pymatting, fundaluri.
- `generate_candidates.py`: un lot per produs (`--context` unul sau mai multe, `--n` per context). Candidat = director nou
  `<PRODUS>-<context>-s<seed>` cu `master.png`, `raw_768.png`, `fisa.json`; linie în `registru.jsonl`. Generare la 768, fundal LANCZOS la 1100
  (produsul rămâne pixel-exact la scale 1.0; fundalul e mai puțin clar decât produsul). Fișa are `etapa: "T5a-fara-verificari-model"` și o verificare
  `verificari_model` cu passed=false: `rezultat_global` rămâne false până la T5b (OCR, fețe, ne-uman).

- `recompose_candidates.py`: recompune candidații existenți din `raw_768.png` + fișa T5a (produs/context/seed/prompt/model/timp/scală/deplasare), fără
  regenerare și fără modele, cu umplerea benzii E, într-un `--out-base` NOU (refuză un director existent, căi cu `..`, suprascrierea). Per candidat:
  `master.png`, copia `raw_768.png`, `fisa.json` cu `etapa: "T5a-recompus-v3"` și `fisa_t5a_sha256` (fișa veche), hash-uri pe fișierele salvate și recitite,
  linie în `<out-base>/registru.jsonl`. Zonele se verifică cu `verify_zones` și legătura produs-zone. Test: `tests/scene-recompose.test.mjs`.
  Fix-2: `compose_lib.fill_from_outside` umple și buzunarele închise (regiune înconjurată de L, ex. ochiurile bocancului) prin tranzit prin L, nu mai pică.

## Verificări cu modele (T5b)

- `checks_models_lib.py` (pur, testat fără modele): `skin_fraction` (YCbCr ∩ HSV, intervale în docstring), `chroma_stats` (C* CIELAB), `segment_is_achromatic_no_skin`,
  normalizare OCR, `check_ocr_logo` / `check_ocr_decor`, `decide_non_human` (respinge dacă ORICE semnal e pozitiv: fețe, segment, SigLIP2, VLM, piele pe imaginea întreagă),
  `validate_calibration` (pică fără >= 30 de controale sau cu recall < 100%).
- `models_runtime.py`: YuNet (1× și 2×), SigLIP2 zero-shot (6 formulări per set, perechi manechin/persoană), Qwen3-VL-4B (P(da) din logits, auxiliar), SAM 2.1 + segmentul manechinului
  `(I ∪ (SAM ∩ regiune)) \ (L ∪ E)`, RapidOCR (`use_cls=False`; logo la 3×, decor + I cu produsul mascat neutru). Un model odată în memorie.
- `collect_signals.py` (semnale brute, JSON nou), `calibrate_models.py` (căutare pe grilă pe controale + ne-om -> `calibrare_modele.json`, comis), `run_model_checks.py`
  (candidații -> `fisa_finala_v3.json` lângă `fisa.json`; `--cand-name cand_v3` pentru directorul recompus, linie în registru cu `fisier`/`etapa`, raport numeric). `model.sha256` din `modele_verificare` = sha256 peste (cale, sha256) ale fișierelor modelului.
- `check_ocr_logo`: dacă OCR nu citește nimic în original (și nici în candidat), verificarea e NECONCLUDENTĂ: `passed=true`, `value="neconcludent"`, `informativ=true`;
  fișa o păstrează, planșa o arată „INFO" (nu „OK"). Text diferit sau apărut doar în candidat pică. Identitatea pixelilor din logo o garantează identitatea pe L complet, nu OCR.
- Semnale: VLM = principal (recall 70/70 pe controale), SigLIP2 = secundar (marjă efectivă −0,5). Cifrele „0 respinse fals" sunt pe SETUL DE CALIBRARE, nu pe date noi.
  `calibrate_models.py --exclude-labels calibrare_t5c.json` scoate din `--good-ids` candidații etichetați „dom"/„neclar" (nu sunt „buni"); recalibrarea (Fix-2) e în `calibrare_modele_v3.json`; `calibrare_modele.json` e învechit (rămâne pentru istoric).
- Qwen3-VL-4B se descarcă cu `fetch_models.py --models-dir <m> --group vlm --model-id qwen3-vl-4b-instruct --pin-new-hashes`.

## Formă de cap și croma nuanțată (T5c)

- `head_geometry` (pur, `checks_models_lib.py`): masa = SAM ∩ I \ (L ∪ E); pe rândul de sus al fiecărei coloane se potrivește o parabolă pe cea mai lungă secvență de coloane cu vârf liber
  (fundal vizibil deasupra, nu guler); `sag_ratio` = înălțimea arcului / lățime (0 la vârf tăiat drept, ~0,5 la semisferă). `check_head_shape` respinge dacă geometria
  (`free_run >= 0,3`, `sag_ratio >= 0,15`, `width >= 60`) SAU Qwen3-VL pe decupajul gâtului (`HEAD_QUESTION`, P(da) >= 0,9) e pozitivă; intră în `ne_uman` ca semnal `head_shape`.
  Întrebarea din brief („has a head or a dome on top of the neck”) dă P(da) 0,78 și pe conul bun, deci nu separă; întrebarea folosită cere „rounded ball or dome that could be mistaken for a head”.
- Croma nuanțată: pe lângă calea strictă (piele <= 0,05, C* p90 <= 20), segmentul trece dacă mediana C* <= 14 (`segment.c_p50_max`). Pe BZ739OR segmentul gri cu nuanță caldă are mediana 3–16,
  bejul/cartonul/pielea >= 17 (setul etichetat vizual în `calibrare_t5c.json`).
- `calibrare_t5c.json` = praguri noi + etichete (doar id-uri), suprapuse cu `run_model_checks.py --calibrare-extra` (OBLIGATORIU); fișa nouă e `fisa_finala_v3.json` (fișele finale mai vechi rămân neatinse).
  Overlay-ul acceptă doar `segment.c_p50_max`, `head`, `veto_manual`, iar valorile sunt plafonate (`OVERLAY_RANGES`, ~1,5x valoarea calibrată în `calibrare_t5c.json`): `segment.c_p50_max` [0, 20], `head.sag_ratio_min` [0, 0,225], `head.free_run_min` [0, 0,45], `head.width_min` [0, 90], `head.vlm_p_yes` (0, 1]; `head` mai acceptă doar `vlm_products` (listă de șiruri); calibrarea îmbinată se revalidează, iar `validate_calibration` RECALCULEAZĂ `flagged` al fiecărui control din valorile salvate.
  `veto_manual` e legat de IMAGINE: cheia = sha256 al `master.png`, cu `motiv` și `autor` (id-ul e doar informativ).
- `boots_two_info` (doar FD25BK): semnal INFORMATIV (VLM „two boots”), nu respinge. Etapele noi: `qwen_head` (după `sam`; decupajele sunt scrise de `sam` în `<report-dir>/sam_dump`) și `qwen_boots`.

## Integritate (Fix-1a)

- Fișa nouă (v3) are `sha256_master` și `sha256_raw`, calculate pe fișierele SALVATE și recitite (verificările T3a rulează pe master-ul recitit). `run_model_checks.py` și `make_planse.py` re-hash-uiesc
  master/raw, sursa și zonele L/E/I și compară sha256 al fișei cu ultima linie a registrului (`integrity_lib.verify_candidate_binding`); orice nepotrivire oprește rularea.
  Fișele T5a vechi (fără `sha256_master`) sunt refuzate; `--legacy` le acceptă marcat (`legacy_fara_sha_master`, rezultat global fals).
- `run_model_checks.py` se oprește dacă o etapă necesară (faces, siglip, ocr, sam; qwen și qwen_head când calibrarea a inclus VLM) lipsește din `--stages` sau a eșuat. VLM lipsă = `ne_uman` PICAT.
- `generate_candidates.py` refuză `--product` ≠ `zone.json["product"]` sau o sursă care nu e a produsului din `zone_specs.json`; `klein_probe.py` și `generate_candidates.py` verifică mărimea + sha256
  ale fișierelor modelului înainte de `from_pretrained` (hash-ul din fișă = cel verificat), cu `trust_remote_code=False` și `HF_HUB_OFFLINE=1`. Zonele se încarcă doar prin numele din `zone.json` (cu sha256).
- BZ739OR: `contexte.json` are `manechin_fraza` per produs (manechin gri neutru, material rece); `prompting.py` o preferă fraza globală.
