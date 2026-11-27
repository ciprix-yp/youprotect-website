# 10 - Scene de catalog: produs real, manechin AI, fundal AI

Document de lucru pentru pilotul „scene de catalog". Conține regulile, pipeline-ul și matricea uneltelor.
Data citirii surselor: 2026-11-27. Repo-ul este public: aici intră doar cod, teste, `contexte.json` și acest document.

## 1. Scop și reguli

Scop: imagini de catalog în care **produsul este real** (packshot Portwest, pixeli identici), purtat de un
**manechin AI fără cap, clar ne-uman**, pe un **fundal AI**, generate local pe Mac (Apple Silicon, 24 GB) cu modele deschise.

Reguli:

- **(a) Produsul e blocat.** Pixelii lui vin din poza furnizorului. AI-ul nu generează și nu redesenează produsul.
- **(b) AI generează doar manechinul și decorul.** Fără oameni. Manechinul este fără cap, neutru, clar ne-uman;
  altfel imaginea se respinge.
- **(c) Niciun marcaj vizibil pe imagine.** Metadatele AI în fișier sunt în regulă.
- **(d) Doar modele deschise, rulate local.** Pozele furnizorului nu pleacă la niciun API.
- **(e) Contexte permise.** Prompt-urile se construiesc doar din `scripts/scene/contexte.json`:
  - clasa 2 de vizibilitate: fără drum rapid, cale ferată sau noapte;
  - EN ISO 11611 clasa 1: fără sudură activă;
  - bocanc S7L: noroi sau apă sunt în regulă.
- **(f) Fără cheltuieli, fără GPU închiriat.**
- **(g) Trasabilitate.** `scripts/scene/contexte.json` este singura sursă de contexte (și de fraza manechinului);
  fișa finală a pilotului este `fisa_finala_v3.json` (aceeași în `run_model_checks.py`, `make_planse.py` și README),
  lângă `fisa.json` a fiecărui candidat, cu `sha256_master`/`sha256_raw` care leagă „acceptat” de imaginea de pe disc;
  `registru.jsonl` este append-only, cu lanț de hash-uri (`prev_sha256`), verificabil cu `verify_registry`; planșa și
  verificările cu modele re-hash-uiesc imaginea, sursa, zonele și fișa față de registru înainte de a le folosi. Niciunul dintre aceste
  artefacte generate nu intră în git (doar `contexte.json` și codul).

## 2. Pipeline

Cod în `scripts/scene/` (Python, mediu `uv` separat, în afara `package.json` și a CI).

0. **sha256 sursă.** Se calculează și se înregistrează înainte de orice procesare.
1. **Matte.** BiRefNet comparat cu masca de prag pe fundal alb; se alege varianta mai curată.
2. **Zone.** Se definesc în `zone.json` (SAM 2.1):
   - **L**: nucleu blocat;
   - **E**: bandă de margine, 1-3 px;
   - **I**: interior de haină „ghost"; manechinul îl poate acoperi;
   - cutii pentru marcajele critice. Marcajele critice sunt 100% în L.
3. **Așezare.** Doar scalare cu factor ≤ 1 și deplasare cu valori întregi. Fără oglindire, fără rotire.
4. **Umplere cu mască** în afara L+E: FLUX.2 klein 4B prin diffusers `Flux2KleinInpaintPipeline`.
5. **Compunere.** L se lipește din original; E se compune cu alpha, folosind estimare de foreground (pymatting) și, ca fundal B, decorul
   generat propagat din afara L ∪ E (`compose_lib.fill_from_outside`/`prepare_background`, implicit `band_fill=True`): reconstrucția VAE a
   packshot-ului din E și dintr-un inel de 3 px are fundal alb (masca de inpainting e NOT(L ∪ E), E nu se generează), deci fără umplere marginea s-ar amesteca
   cu alb, nu cu decorul. `band_fill=False` păstrează comportamentul vechi, doar pentru comparații. Candidații compuși înainte de această corecție
   se recompun din `raw_768.png` existent cu `recompose_candidates.py` (fără regenerare), într-un director nou, etapa „T5a-recompus-v3".
6. **Verificări** (fiecare se scrie în fișă cu valoare, prag, rezultat):
   - identitate produs: diferența maximă pe L COMPLET (nu erodat) este exact 0 pe master (lossless, compunerea lipește tot L); eroziunea de 1 px
     rămâne doar la identitatea exportului lossy, unde pragul se calibrează pe zgomotul de compresie;
   - margini: halo și scurgere de culoare;
   - OCR pe logo și OCR în decor și în zona I; OCR logo fără text citit în original (și în candidat) e INFORMATIV („neconcludent", `informativ=true`,
     afișat „INFO" în planșă), nu „OK"; identitatea pixelilor din logo o garantează identitatea pe L, nu OCR;
   - manechin ne-uman: detector de fețe = 0; segment acromatic fără tonuri de piele; SigLIP2 zero-shot
     „mannequin" vs „real person" cu marjă; VLM = semnalul principal, SigLIP2 = semnal secundar (marjă efectivă −0,5);
   - calibrare pe poze reale cu oameni: 100% semnalate „om".
7. **Planșe pentru telefon** (revizuire vizuală pe ecran mic).

### Fișă și registru

- Fișa per candidat: `.catalog-work/scene/<cand>/fisa.json`.
- `registru.jsonl`: append-only.
- Conținutul fișei: sha256 sursă, mască și cod; modelul cu hash-ul weights; seed; prompt; scară; deplasare;
  fiecare verificare cu valoare, prag și rezultat; timpul de generare.

### Ce intră și ce nu intră în git

| Intră | Nu intră |
|---|---|
| cod (`scripts/scene/`), teste, `contexte.json`, acest document | imagini, planșe, fișe, registru, weights, pozele furnizorului |

## 3. Matricea uneltelor

Statut: planificat / folosit / nefolosit / înlocuit (actualizat după etapa 1 a pilotului). Data citirii: 2026-11-27 pentru toate rândurile. „n/a" = neconfirmat în sursele citite.

| Unealtă | Rol | Rev/versiune | SPDX cod | SPDX weights | URL LICENSE | URL model card | Data citirii | Hash(uri) weights | Statut | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| FLUX.2 klein 4B (distilat) | umplere cu mască (decor, manechin) | HF `black-forest-labs/FLUX.2-klein-4B` rev `e7b7dc27f91deacad38e78976d1f2b499d76a294` | Apache-2.0 | Apache-2.0 | https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/blob/main/LICENSE.md | https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/blob/main/README.md | 2026-11-27 | `transformer/diffusion_pytorch_model.safetensors` sha256 `9f29f9edcfdae452a653ffb51a534ca4decd389952c225724ff3b94042612a6e` | folosit | gated: False. Cod flux2: github `black-forest-labs/flux2`, Apache-2.0, commit `50fe5162777813d869182b139e83b10743caef15`. |
| FLUX.2 klein base 4B | umplere cu mască (variantă alternativă) | HF `black-forest-labs/FLUX.2-klein-base-4B` rev `a3b4f4849157f664bdbc776fd7453c2783562f4d` | Apache-2.0 | Apache-2.0 | https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4B/blob/main/LICENSE.md | https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4B/blob/main/README.md | 2026-11-27 | `transformer` sha256 `e109674697ffa1a3983126e32512f5428a9442bd8df59f9c95566ee90a473bb6` | nefolosit | Pilotul a rulat doar pe varianta distilată (rândul de mai sus). |
| Text encoder klein (Qwen3ForCausalLM) | encoder de text pentru FLUX.2 klein | în repo-urile klein (revizuirile de mai sus) | Apache-2.0 (prin repo-ul klein) | Apache-2.0 (prin repo-ul klein) | n/a | n/a | 2026-11-27 | shard 00001 sha256 `8c0506e7f4936fa7e26183a4fd8da4e2bdbc5990ba64ae441f965d51228f36ea`; shard 00002 sha256 `82f2bd839378541b0557bfabaf37c7d3d637071fdcb73302dedd7cf61162ce07` | folosit | Proveniența exactă față de Qwen3 public nu e documentată în card. |
| VAE klein (AutoencoderKLFlux2) | codare/decodare latentă | `vae/diffusion_pytorch_model.safetensors` din repo-ul klein | Apache-2.0 (README flux2) | Apache-2.0 (README flux2) | n/a | n/a | 2026-11-27 | sha256 `ca70d2202afe6415bdbcb8793ba8cd99fd159cfe6192381504d6c4d3036e0f04` | folosit | |
| diffusers | rulează `Flux2KleinInpaintPipeline` | PyPI `diffusers` 0.43.0 (2026-11-12) | Apache-2.0 | n/a | n/a | n/a | 2026-11-27 | n/a | folosit | python>=3.11. Clasa în `src/diffusers/pipelines/flux2/pipeline_flux2_klein_inpaint.py`, există din v0.38.0; parametri `image`, `mask_image`, `strength`. Fără `trust_remote_code`. |
| BiRefNet | matte (decupaj produs) | HF `ZhengPeng7/BiRefNet` rev `e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4` | MIT | MIT (`license: mit` în card) | https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE | https://huggingface.co/ZhengPeng7/BiRefNet/blob/main/README.md | 2026-11-27 | `model.safetensors` (444473596 B) sha256 `9ab37426bf4de0567af6b5d21b16151357149139362e6e8992021b8ce356a154` | folosit | Cod: github `ZhengPeng7/BiRefNet`, MIT, commit `f7079632d681ecf12161fcea8905682934e59e51`. Repo-ul HF nu are fișier LICENSE. transformers NU are BiRefNet nativ; calea din card cu `trust_remote_code=True` este EXCLUSĂ. Se folosește codul MIT vendorizat pe commit fix + `safetensors.torch.load_file` (nu `torch.load`). Modelul efectiv se alege la T2. |
| BiRefNet_lite | matte (variantă evaluată) | HF `ZhengPeng7/BiRefNet_lite` rev `aa62cd87eafb9cc43056d08ef3615a14628b831d` | MIT | MIT | n/a | n/a | 2026-11-27 | sha256 `4417d89795250e698c3cb0ae8df15743810065f646f48a694fdfa7ca052d0815` | nefolosit | Aceleași restricții de încărcare ca BiRefNet. |
| BiRefNet-matting | matte (variantă evaluată) | HF `ZhengPeng7/BiRefNet-matting` rev `eccde0a8cbdce7ac5fecfeb06340fe7b949e85d9` | MIT | MIT | n/a | n/a | 2026-11-27 | sha256 `a9875de5b1e6c8eb5fdaa8c727a82927ce442cdc87ba3abee6a77e6fa46c25bb` | nefolosit | Aceleași restricții de încărcare ca BiRefNet. |
| BiRefNet_HR-matting | matte (variantă evaluată) | HF `ZhengPeng7/BiRefNet_HR-matting` rev `5d6b6f8adcb5b417c871b1d84ceaae9871355b7f` | MIT | MIT | n/a | n/a | 2026-11-27 | sha256 `a5a4de698739ea5e0e8bbab28e1b293dde95092b87a442d566cbc585c53cef55` | nefolosit | Aceleași restricții de încărcare ca BiRefNet. |
| SAM 2.1 hiera-large | zone L/E/I și cutii de marcaje | HF `facebook/sam2.1-hiera-large` rev `665f8e2ad61cf5f53d65644ff27c8ee525124610` | Apache-2.0 | Apache-2.0 | https://github.com/facebookresearch/sam2/blob/main/LICENSE | https://huggingface.co/facebook/sam2.1-hiera-large/blob/main/README.md | 2026-11-27 | `model.safetensors` (897897416 B) sha256 `dc407dce21301fd94abb395c5099b4f2c455fdc8a8f261ac3d0ea6d4cd197230` | folosit | Fișierul `.pt` este pickle: NU se descarcă. Rulat prin transformers `Sam2Model` + `Sam2Processor` (transformers >= 4.56.0; fixat 5.23.0, cea mai nouă mai veche de 7 zile). Cod: `facebookresearch/sam2`, Apache-2.0. |
| SAM 2.1 hiera-base-plus | alternativă ușoară la SAM 2.1 large | HF `facebook/sam2.1-hiera-base-plus` rev `b7320756a13354e7530a63935656d35b2f91a290` | Apache-2.0 | Apache-2.0 | https://github.com/facebookresearch/sam2/blob/main/LICENSE | n/a | 2026-11-27 | sha256 `2012733a0de5d03efd1bba550a2847c4551be9ef2e0d497c83074df66189f780` | nefolosit | Alternativă; aceeași regulă: fără `.pt`. |
| SigLIP2 so400m | verificare zero-shot „mannequin" vs „real person" | HF `google/siglip2-so400m-patch14-384` rev `e8e487298228002f3d8a82e0cd5c8ea9c567f57f` | n/a | Apache-2.0 (din card) | n/a | https://huggingface.co/google/siglip2-so400m-patch14-384/blob/main/README.md | 2026-11-27 | `model.safetensors` (4544143072 B) sha256 `9f4f4a49f908ef0c979bce8ff5a5c0e88882dc6c5dc4304387cbbd152558e2c2` | folosit | Repo-ul HF nu are LICENSE separat. |
| SigLIP2 base | alternativă ușoară la SigLIP2 so400m | HF `google/siglip2-base-patch16-224` rev `75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2` | n/a | n/a | n/a | n/a | 2026-11-27 | sha256 `612923381c76ec5a9bed335d1c48827e3f2e506ac31b044b63b2031fadee6a0b` | nefolosit | Licența nu a fost citită separat pentru această variantă. |
| YuNet (OpenCV Zoo) | detector de fețe (manechinul trebuie să dea 0 fețe) | github `opencv/opencv_zoo` commit `48b10fa505aeb51fbd127fc60a5c660040e823b7` | Apache-2.0 (repo) | MIT (model) | https://github.com/opencv/opencv_zoo/blob/main/models/face_detection_yunet/LICENSE | https://github.com/opencv/opencv_zoo/blob/main/models/face_detection_yunet/README.md | 2026-11-27 | `face_detection_yunet_2023mar.onnx` (232589 B) sha256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`; `face_detection_yunet_2026may.onnx` (229738 B) sha256 `ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0` | folosit | Folosit doar `face_detection_yunet_2023mar.onnx`; fișierul 2026may este nefolosit. Rulat cu `cv2.FaceDetectorYN` (opencv-python-headless). |
| RapidOCR | OCR pe logo, decor și zona I | PyPI `rapidocr` 3.10.0 | Apache-2.0 | n/a | n/a | https://github.com/RapidAI/RapidOCR/blob/main/README.md | 2026-11-27 | det `ch_PP-OCRv5_det_mobile.onnx` sha256 `4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae`; rec `en_PP-OCRv5_rec_mobile.onnx` sha256 `c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8`; rec `latin_PP-OCRv5_rec_mobile.onnx` sha256 `b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a`; cls `ch_PP-LCNet_x0_25_textline_ori_cls_mobile.onnx` sha256 `54379ae5174d026780215fc748a7f31910dee36818e63d49e17dc598ecc82df7` | folosit | Rulează pe onnxruntime. Modele ONNX PP-OCRv5 de pe modelscope.cn; SHA256 din `default_models.yaml` v3.10.0 (https://github.com/RapidAI/RapidOCR/blob/v3.10.0/python/rapidocr/default_models.yaml). Licența modelelor Paddle upstream nu a fost citită individual: de confirmat. |
| Tesseract + tessdata_best (rezervă OCR) | OCR de rezervă | Tesseract 5.5.5; tessdata_best eng rev `e12c65a915945e4c28e237a9b52bc4a8f39a0cec` | Apache-2.0 | n/a | n/a | n/a | 2026-11-27 | n/a | nefolosit | Doar rezervă. EasyOCR este exclus (modele pickle). |
| pymatting | estimare de foreground pentru banda E | PyPI `pymatting` 1.1.16, tag commit `6d5c4a6bed0e5672abac0bad078e594423ffe4fd` | MIT | n/a | n/a | n/a | 2026-11-27 | wheel sha256 `6ad3f787f90d7720b60e9734c33588cb30f98a66abf7bd772fa499d3a32b466a` | folosit | Repo github `pymatting/pymatting`. Dependențe: numpy, pillow, numba>=0.60, scipy. Hash-ul este al wheel-ului, nu al unui weights. |
| Qwen3-VL-4B-Instruct (auxiliar) | semnal VLM auxiliar pentru „ne-uman" | HF `Qwen/Qwen3-VL-4B-Instruct` rev `ebb281ec70b05090aa6165b016eac8ec08e71b17` (8,9 GB) | n/a | Apache-2.0 (din card) | n/a | https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct/blob/main/README.md | 2026-11-27 | shard `30a01a0556622645a3cce87b655bbbbbc1f170c196099f1b666c93202c3339a9`; shard `046296a2a387efb43b0c997d5833c789604d168834f6e0d3064bf7bb13d002a6` | folosit | transformers >= 4.57.0. Semnal auxiliar, inclus în decizia „ne-uman". Varianta 8B (rev `0c351dd01ed87e9c1b53cbc748cba10e6187ff3b`, 17,5 GB bf16) este înlocuită: nu încape rezonabil în 24 GB. |
| Qwen3-VL-2B (auxiliar, variantă mică) | semnal VLM auxiliar, alternativă | HF `Qwen/Qwen3-VL-2B-Instruct` rev `89644892e4d85e24eaac8bacfd4f463576704203` | n/a | n/a | n/a | n/a | 2026-11-27 | sha256 `7de1838c87a5349b016c26a1c3f7d2bc400a3d485f95ef39a7059ffd734977a0` | nefolosit | Id-ul repo-ului este cel din `models.lock.json`. |

Variante excluse pe criteriul licenței: FLUX.2 klein 9B și FLUX.2 dev (licență non-comercială, acces cu poartă/gated). Nu se folosesc.

## 4. Evaluate și înlocuite

| Unealtă | Statut | Motive |
|---|---|---|
| DiffSynth-Studio + șablonul `Template-KleinBase4B-Inpaint` (HF `DiffSynth-Studio/Template-KleinBase4B-Inpaint` rev `4d5e683e26c9ef246a3335aa9cede7bd94e5e506`, Apache-2.0) | înlocuit cu diffusers | Execută `model.py` descărcat prin `exec_module` (echivalent `trust_remote_code`); nu are tag stabil cu `template.py`; depinde de `entropack`, cu licență nespecificată; cere CUDA și 40 GB. |
| MediaPipe Face Detector | înlocuit cu YuNet | Licența modelului neconfirmată. |
| EasyOCR | înlocuit cu RapidOCR | Modele în format pickle. |
| Qwen3-VL-8B (rev `0c351dd01ed87e9c1b53cbc748cba10e6187ff3b`) | înlocuit cu Qwen3-VL-4B-Instruct | 17,5 GB bf16: nu încape rezonabil în 24 GB. |
| BiRefNet prin `trust_remote_code=True` | exclus | Se folosește codul MIT vendorizat pe commit fix. |
| SAM 2.1 `.pt` | exclus | Format pickle; se folosește `model.safetensors`. |

## 5. Versiuni rezolvate

Din `scripts/scene/pyproject.toml` (fixate exact) și `scripts/scene/uv.lock`: Python 3.12, torch 2.15.0, torchvision 0.29.2,
diffusers 0.43.0, transformers 5.23.0, safetensors 0.8.0, accelerate 1.16.0, huggingface-hub 2.4.0, numpy 2.5.5, scipy 1.18.1,
pillow 13.0.0, opencv-python-headless 5.1.0.95, scikit-image 0.26.0, pymatting 1.1.16, rapidocr 3.10.0, onnxruntime 1.32.0,
timm 1.0.31, kornia 0.9.2, einops 0.8.2. Regula cooldown (`exclude-newer = "7 days"`) se aplică FĂRĂ excepții per pachet:
transformers 5.23.0 (2026-11-13) și huggingface-hub 2.4.0 (2026-10-29) sunt cele mai noi versiuni mai vechi de 7 zile care satisfac
constrângerile (Sam2Model >= 4.56, Qwen3-VL >= 4.57, diffusers 0.43.0 cere huggingface-hub >= 1.32.0, transformers 5.23.0 cere >= 1.31.0, < 3.0);
excepția `exclude-newer-package` pentru transformers 5.24.1 / huggingface-hub 2.5.0 a fost eliminată. Verificat: `uv lock --check`, testele `scene_*`
și un smoke SigLIP2 + SAM 2.1 + Qwen3-VL pe un candidat existent, fără eroare. Manifestul modelelor: `scripts/scene/models.lock.json` (revizii și sha256 per fișier).

## 6. Cum se rulează

Mediul `uv` este separat de `package.json` și de CI; `uv` se rulează prin mise. Comanda standard, cu `-I` pentru orice Python care citește
fișiere descărcate sau imagini și cu căile ca argumente (`<W>` = worktree-ul, `<M>` = directorul de modele):

```sh
RUN='mise exec uv@0.13.6 -- uv run --project "<W>/scripts/scene" --frozen python -I'
```

`--frozen` folosește `uv.lock` ca atare. Prima rulare creează `scripts/scene/.venv` (ignorat de git).

1. Descărcare verificată (stdlib, doar fișierele din manifest, la revizia fixată; mărime și sha256 verificate; fără `.pt`, `.bin`, `.pkl` etc.):

   ```sh
   python3 -I "<W>/scripts/scene/fetch_models.py" --models-dir "<M>" --group matte
   python3 -I "<W>/scripts/scene/fetch_models.py" --models-dir "<M>" --group all --verify-only
   python3 -I "<W>/scripts/scene/fetch_models.py" --models-dir "<M>" --group klein --model-id flux2-klein-4b --pin-new-hashes
   python3 -I "<W>/scripts/scene/fetch_models.py" --models-dir "<M>" --group vlm --model-id qwen3-vl-4b-instruct --pin-new-hashes
   ```

   Directorul de modele: `.catalog-work/scene/models/` (în afara git). Grupurile `klein` (~16 GB) și `vlm` (~9 GB) sunt mari.
2. Ordinea scripturilor:
   - `build_zones.py` (matte + SAM 2.1 + L/E/I, într-un director nou):
     `$RUN scripts/scene/build_zones.py --source <jpg> --spec scripts/scene/zone_specs.json --product <COD> --models-dir <M> --out <director nou>`
   - `verify_zones.py`: `$RUN scripts/scene/verify_zones.py --zone-dir <director> --source <jpg>` (cod 0 doar dacă toate invariantele trec);
   - `generate_candidates.py`: un lot per produs, `--context` (unul sau mai multe) și `--n` per context; candidat = director nou cu `master.png`,
     `raw_768.png`, `fisa.json` și linie în `registru.jsonl`;
   - `run_model_checks.py`: verificările cu modele (fețe, segment, SigLIP2, Qwen3-VL, OCR, formă de cap) peste candidați, cu pragurile din
     `calibrare_modele.json` și `--calibrare-extra calibrare_t5c.json`; scrie fișa finală lângă `fisa.json`;
   - `recompose_candidates.py`: recompune candidații T5a existenți din `raw_768.png` (fără regenerare, fără modele) cu umplerea benzii E, într-un
     `--out-base` NOU: `$RUN scripts/scene/recompose_candidates.py --cand-base <cand vechi> --out-base <director nou> --images-dir <imagini> --scene-dir <scene> --calibrare <calibrare.json>`;
   - `make_planse.py`: planșe de 1170 px pentru telefon per candidat (zone, zoom pe margini și logo/benzi, verdict din fișă).
3. Calibrarea (rulată o dată, rezultatele sunt comise): `calibrate_real.py` -> `calibrare.json`; `calibrate_models.py` -> `calibrare_modele.json`.
4. Testele rulează fără modele (`tests/scene-*.test.mjs`, `tests/py/`).

Argumentele exacte ale fiecărui script sunt în `scripts/scene/README.md` și în `--help`.

## 7. Rezultate pilot etapa 1

Produse pilot: S476YE, BZ739OR (haine) și FD25BK (bocanc, natură moartă). Etapa 1 se oprește la planșe; nu include integrare în site.
Cifrele de mai jos vin din `scripts/scene/*.json`, `scripts/scene/README.md` și din rapoartele task-urilor T4/T5.

- **Timp pe Mac (24 GB):** circa 8 s per imagine la 768 px, bf16, 4 pași. La 1024 px rularea este instabilă din cauza memoriei de 24 GB.
- **Rata de trecere pe produs, după toate verificările:** S476YE 12/30; BZ739OR 15/50; FD25BK 27/30.
- **Controale cu oameni (calibrare):** 70/70 semnalate „om" (recall 100%, cerința de calibrare), din 70 de controale obligatorii
  (variantele „original" și „mic"); diagnosticul pe variante „jos": 28/30. Pe cele 67 de imagini ne-om din calibrare: 0 respinse fals (pe SETUL DE CALIBRARE, nu pe date noi; setul „buni" conținea și candidați etichetați
  „dom"/„neclar" la T5c, deci cifra se REFACE în Fix-2 cu `calibrate_models.py --exclude-labels calibrare_t5c.json`).
  Cifrele din acest capitol (rata de trecere, recall, ne-om) provin din compunerea veche (fără umplerea benzii E, identitate pe L erodat) și rămân
  „de refăcut în Fix-2"; nu sunt cifre noi. Recall-ul pe semnal: VLM 70/70 (haine și bocanc), SigLIP2 69/70 (haine) și 46/70 (bocanc), detector de fețe 39/70, piele pe imaginea întreagă 1/70.
- **Formă de cap (T5c):** pe S476YE, domuri respinse 3/4 și un con gri bun păstrat (hala_depozit-s101); un candidat
  (platforma_logistica-s109) nu e separat automat și are veto manual. Croma nuanțată pe BZ739OR: acceptate 13/15 gri cu nuanță, 0/11 bej/carton/piele.

Limite cunoscute:

- Verificarea OCR pe logo este slabă: citește fragmente; când nu citește nimic în original, rezultatul e „neconcludent" (informativ, nu OK).
  Identitatea pixelilor din L (inclusiv logo) este garantată de verificarea identitate = 0 pe L complet, nu de OCR.
- Semnalul „formă de cap" este calibrat pe 4 exemple (set mic, etichete puse de agent, risc de supra-reglaj) și are nevoie de un veto manual pe un candidat.
- Detectorul de fețe nu prinde singur toate controalele (39/70); recall-ul vine din VLM (semnalul principal) și SigLIP2 (secundar, marjă efectivă −0,5).
- Fundalul este generat la 768 px și mărit la 1100 px (LANCZOS); rămâne o diferență de claritate față de produs, care e pixel-exact.
