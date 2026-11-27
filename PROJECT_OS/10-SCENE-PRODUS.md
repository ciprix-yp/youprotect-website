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
5. **Compunere.** L se lipește din original; E se compune cu alpha, folosind estimare de foreground (pymatting).
6. **Verificări** (fiecare se scrie în fișă cu valoare, prag, rezultat):
   - identitate produs: diferența maximă în L erodat este exact 0 pe master; la export, pragul se calibrează
     pe zgomotul de compresie;
   - margini: halo și scurgere de culoare;
   - OCR pe logo și OCR în decor și în zona I;
   - manechin ne-uman: detector de fețe = 0; segment acromatic fără tonuri de piele; SigLIP2 zero-shot
     „mannequin" vs „real person" cu marjă; VLM auxiliar;
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

Statut: planificat / folosit / înlocuit. Data citirii: 2026-11-27 pentru toate rândurile. „n/a" = neconfirmat în sursele citite.

| Unealtă | Rol | Rev/versiune | SPDX cod | SPDX weights | URL LICENSE | URL model card | Data citirii | Hash(uri) weights | Statut | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| FLUX.2 klein 4B (distilat) | umplere cu mască (decor, manechin) | HF `black-forest-labs/FLUX.2-klein-4B` rev `e7b7dc27f91deacad38e78976d1f2b499d76a294` | Apache-2.0 | Apache-2.0 | https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/blob/main/LICENSE.md | https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/blob/main/README.md | 2026-11-27 | `transformer/diffusion_pytorch_model.safetensors` sha256 `9f29f9edcfdae452a653ffb51a534ca4decd389952c225724ff3b94042612a6e` | planificat | gated: False. Cod flux2: github `black-forest-labs/flux2`, Apache-2.0, commit `50fe5162777813d869182b139e83b10743caef15`. |
| FLUX.2 klein base 4B | umplere cu mască (variantă alternativă) | HF `black-forest-labs/FLUX.2-klein-base-4B` rev `a3b4f4849157f664bdbc776fd7453c2783562f4d` | Apache-2.0 | Apache-2.0 | https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4B/blob/main/LICENSE.md | https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4B/blob/main/README.md | 2026-11-27 | `transformer` sha256 `e109674697ffa1a3983126e32512f5428a9442bd8df59f9c95566ee90a473bb6` | planificat | La T4 se folosește cea mai bună dintre cele două variante; rândul efectiv folosit se marchează la final. |
| Text encoder klein (Qwen3ForCausalLM) | encoder de text pentru FLUX.2 klein | în repo-urile klein (revizuirile de mai sus) | Apache-2.0 (prin repo-ul klein) | Apache-2.0 (prin repo-ul klein) | n/a | n/a | 2026-11-27 | shard 00001 sha256 `8c0506e7f4936fa7e26183a4fd8da4e2bdbc5990ba64ae441f965d51228f36ea`; shard 00002 sha256 `82f2bd839378541b0557bfabaf37c7d3d637071fdcb73302dedd7cf61162ce07` | planificat | Proveniența exactă față de Qwen3 public nu e documentată în card. |
| VAE klein (AutoencoderKLFlux2) | codare/decodare latentă | `vae/diffusion_pytorch_model.safetensors` din repo-ul klein | Apache-2.0 (README flux2) | Apache-2.0 (README flux2) | n/a | n/a | 2026-11-27 | sha256 `ca70d2202afe6415bdbcb8793ba8cd99fd159cfe6192381504d6c4d3036e0f04` | planificat | |
| diffusers | rulează `Flux2KleinInpaintPipeline` | PyPI `diffusers` 0.43.0 (2026-11-12) | Apache-2.0 | n/a | n/a | n/a | 2026-11-27 | n/a | planificat | python>=3.11. Clasa în `src/diffusers/pipelines/flux2/pipeline_flux2_klein_inpaint.py`, există din v0.38.0; parametri `image`, `mask_image`, `strength`. Fără `trust_remote_code`. |
| BiRefNet | matte (decupaj produs) | HF `ZhengPeng7/BiRefNet` rev `e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4` | MIT | MIT (`license: mit` în card) | https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE | https://huggingface.co/ZhengPeng7/BiRefNet/blob/main/README.md | 2026-11-27 | `model.safetensors` (444473596 B) sha256 `9ab37426bf4de0567af6b5d21b16151357149139362e6e8992021b8ce356a154` | planificat | Cod: github `ZhengPeng7/BiRefNet`, MIT, commit `f7079632d681ecf12161fcea8905682934e59e51`. Repo-ul HF nu are fișier LICENSE. transformers NU are BiRefNet nativ; calea din card cu `trust_remote_code=True` este EXCLUSĂ. Se folosește codul MIT vendorizat pe commit fix + `safetensors.torch.load_file` (nu `torch.load`). Modelul efectiv se alege la T2. |
| BiRefNet_lite | matte (variantă evaluată) | HF `ZhengPeng7/BiRefNet_lite` rev `aa62cd87eafb9cc43056d08ef3615a14628b831d` | MIT | MIT | n/a | n/a | 2026-11-27 | sha256 `4417d89795250e698c3cb0ae8df15743810065f646f48a694fdfa7ca052d0815` | planificat | Aceleași restricții de încărcare ca BiRefNet. |
| BiRefNet-matting | matte (variantă evaluată) | HF `ZhengPeng7/BiRefNet-matting` rev `eccde0a8cbdce7ac5fecfeb06340fe7b949e85d9` | MIT | MIT | n/a | n/a | 2026-11-27 | sha256 `a9875de5b1e6c8eb5fdaa8c727a82927ce442cdc87ba3abee6a77e6fa46c25bb` | planificat | Aceleași restricții de încărcare ca BiRefNet. |
| BiRefNet_HR-matting | matte (variantă evaluată) | HF `ZhengPeng7/BiRefNet_HR-matting` rev `5d6b6f8adcb5b417c871b1d84ceaae9871355b7f` | MIT | MIT | n/a | n/a | 2026-11-27 | sha256 `a5a4de698739ea5e0e8bbab28e1b293dde95092b87a442d566cbc585c53cef55` | planificat | Aceleași restricții de încărcare ca BiRefNet. |
| SAM 2.1 hiera-large | zone L/E/I și cutii de marcaje | HF `facebook/sam2.1-hiera-large` rev `665f8e2ad61cf5f53d65644ff27c8ee525124610` | Apache-2.0 | Apache-2.0 | https://github.com/facebookresearch/sam2/blob/main/LICENSE | https://huggingface.co/facebook/sam2.1-hiera-large/blob/main/README.md | 2026-11-27 | `model.safetensors` (897897416 B) sha256 `dc407dce21301fd94abb395c5099b4f2c455fdc8a8f261ac3d0ea6d4cd197230` | planificat | Fișierul `.pt` este pickle: NU se descarcă. Rulat prin transformers `Sam2Model` + `Sam2Processor` (transformers >= 4.56.0; ultima 5.24.1). Cod: `facebookresearch/sam2`, Apache-2.0. |
| SAM 2.1 hiera-base-plus | alternativă ușoară la SAM 2.1 large | HF `facebook/sam2.1-hiera-base-plus` rev `b7320756a13354e7530a63935656d35b2f91a290` | Apache-2.0 | Apache-2.0 | https://github.com/facebookresearch/sam2/blob/main/LICENSE | n/a | 2026-11-27 | sha256 `2012733a0de5d03efd1bba550a2847c4551be9ef2e0d497c83074df66189f780` | planificat | Alternativă; aceeași regulă: fără `.pt`. |
| SigLIP2 so400m | verificare zero-shot „mannequin" vs „real person" | HF `google/siglip2-so400m-patch14-384` rev `e8e487298228002f3d8a82e0cd5c8ea9c567f57f` | n/a | Apache-2.0 (din card) | n/a | https://huggingface.co/google/siglip2-so400m-patch14-384/blob/main/README.md | 2026-11-27 | `model.safetensors` (4544143072 B) sha256 `9f4f4a49f908ef0c979bce8ff5a5c0e88882dc6c5dc4304387cbbd152558e2c2` | planificat | Repo-ul HF nu are LICENSE separat. |
| SigLIP2 base | alternativă ușoară la SigLIP2 so400m | HF `google/siglip2-base-patch16-224` rev `75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2` | n/a | n/a | n/a | n/a | 2026-11-27 | sha256 `612923381c76ec5a9bed335d1c48827e3f2e506ac31b044b63b2031fadee6a0b` | planificat | Licența nu a fost citită separat pentru această variantă. |
| YuNet (OpenCV Zoo) | detector de fețe (manechinul trebuie să dea 0 fețe) | github `opencv/opencv_zoo` commit `48b10fa505aeb51fbd127fc60a5c660040e823b7` | Apache-2.0 (repo) | MIT (model) | https://github.com/opencv/opencv_zoo/blob/main/models/face_detection_yunet/LICENSE | https://github.com/opencv/opencv_zoo/blob/main/models/face_detection_yunet/README.md | 2026-11-27 | `face_detection_yunet_2023mar.onnx` (232589 B) sha256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`; `face_detection_yunet_2026may.onnx` (229738 B) sha256 `ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0` | planificat | Rulat cu `cv2.FaceDetectorYN` (opencv-python-headless). |
| RapidOCR | OCR pe logo, decor și zona I | PyPI `rapidocr` 3.10.0 | Apache-2.0 | n/a | n/a | https://github.com/RapidAI/RapidOCR/blob/main/README.md | 2026-11-27 | det `ch_PP-OCRv5_det_mobile.onnx` sha256 `4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae`; rec `en_PP-OCRv5_rec_mobile.onnx` sha256 `c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8`; rec `latin_PP-OCRv5_rec_mobile.onnx` sha256 `b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a`; cls `ch_PP-LCNet_x0_25_textline_ori_cls_mobile.onnx` sha256 `54379ae5174d026780215fc748a7f31910dee36818e63d49e17dc598ecc82df7` | planificat | Rulează pe onnxruntime. Modele ONNX PP-OCRv5 de pe modelscope.cn; SHA256 din `default_models.yaml` v3.10.0 (https://github.com/RapidAI/RapidOCR/blob/v3.10.0/python/rapidocr/default_models.yaml). Licența modelelor Paddle upstream nu a fost citită individual: de confirmat. |
| Tesseract + tessdata_best (rezervă OCR) | OCR de rezervă | Tesseract 5.5.5; tessdata_best eng rev `e12c65a915945e4c28e237a9b52bc4a8f39a0cec` | Apache-2.0 | n/a | n/a | n/a | 2026-11-27 | n/a | planificat | Doar rezervă. EasyOCR este exclus (modele pickle). |
| pymatting | estimare de foreground pentru banda E | PyPI `pymatting` 1.1.16, tag commit `6d5c4a6bed0e5672abac0bad078e594423ffe4fd` | MIT | n/a | n/a | n/a | 2026-11-27 | wheel sha256 `6ad3f787f90d7720b60e9734c33588cb30f98a66abf7bd772fa499d3a32b466a` | planificat | Repo github `pymatting/pymatting`. Dependențe: numpy, pillow, numba>=0.60, scipy. Hash-ul este al wheel-ului, nu al unui weights. |
| Qwen3-VL-4B-Instruct (auxiliar) | semnal VLM auxiliar pentru „ne-uman" | HF `Qwen/Qwen3-VL-4B-Instruct` rev `ebb281ec70b05090aa6165b016eac8ec08e71b17` (8,9 GB) | n/a | Apache-2.0 (din card) | n/a | https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct/blob/main/README.md | 2026-11-27 | shard `30a01a0556622645a3cce87b655bbbbbc1f170c196099f1b666c93202c3339a9`; shard `046296a2a387efb43b0c997d5833c789604d168834f6e0d3064bf7bb13d002a6` | planificat | transformers >= 4.57.0. Semnal auxiliar, se marchează „folosit/nefolosit" la final. Varianta 8B (rev `0c351dd01ed87e9c1b53cbc748cba10e6187ff3b`, 17,5 GB bf16) nu încape rezonabil în 24 GB. |
| Qwen3-VL-2B (auxiliar, variantă mică) | semnal VLM auxiliar, alternativă | HF Qwen3-VL 2B rev `89644892e4d85e24eaac8bacfd4f463576704203` | n/a | n/a | n/a | n/a | 2026-11-27 | sha256 `7de1838c87a5349b016c26a1c3f7d2bc400a3d485f95ef39a7059ffd734977a0` | planificat | Id-ul exact al repo-ului HF se completează la T2. |

Variante excluse pe criteriul licenței: FLUX.2 klein 9B și FLUX.2 dev (licență non-comercială, acces cu poartă/gated). Nu se folosesc.

## 4. Evaluate și înlocuite

| Unealtă | Statut | Motive |
|---|---|---|
| DiffSynth-Studio + șablonul `Template-KleinBase4B-Inpaint` (HF `DiffSynth-Studio/Template-KleinBase4B-Inpaint` rev `4d5e683e26c9ef246a3335aa9cede7bd94e5e506`, Apache-2.0) | înlocuit cu diffusers | Execută `model.py` descărcat prin `exec_module` (echivalent `trust_remote_code`); nu are tag stabil cu `template.py`; depinde de `entropack`, cu licență nespecificată; cere CUDA și 40 GB. |
| MediaPipe Face Detector | înlocuit cu YuNet | Licența modelului neconfirmată. |
| EasyOCR | exclus | Modele în format pickle. |
| BiRefNet prin `trust_remote_code=True` | exclus | Se folosește codul MIT vendorizat pe commit fix. |
| SAM 2.1 `.pt` | exclus | Format pickle; se folosește `model.safetensors`. |

## 5. Cum se rulează (schiță)

Comenzile exacte se completează la T2.

- `uv` cu lock fixat în `scripts/scene/`, separat de `package.json` și de CI.
- Cache HF standard sau `.catalog-work/scene/models/`; nimic de weights în repo.
- Orice Python care citește fișiere descărcate rulează cu `-I`.
- Căile se dau ca argumente, nu se deduc din directorul curent.
- Weights doar în format safetensors/ONNX, verificate cu sha256 din matrice înainte de prima rulare.
