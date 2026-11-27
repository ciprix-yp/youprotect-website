# Cod vendorizat: BiRefNet

- Sursă: https://github.com/ZhengPeng7/BiRefNet
- Commit exact: `f7079632d681ecf12161fcea8905682934e59e51`
- Arhivă: `https://codeload.github.com/ZhengPeng7/BiRefNet/tar.gz/f7079632d681ecf12161fcea8905682934e59e51`
  (sha256 al arhivei descărcate: `b1edbd3f718ccd46c5543c6028249eff40e0700e0907cd11371ba8cdf88e1080`)
- Licență: MIT (`LICENSE`, copiat neschimbat; Copyright (c) 2024 ZhengPeng)
- Data preluării: 2026-11-27
- Folosit pentru: inferență (matte). Weights NU sunt aici: `ZhengPeng7/BiRefNet` rev `e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4`,
  `model.safetensors`, încărcat cu `safetensors.torch.load_file` (vezi `../../birefnet_load.py` și `../../models.lock.json`).
  Fără `trust_remote_code`.

## Fișiere preluate

`LICENSE`, `config.py`, `models/birefnet.py`, `models/backbones/{build_backbone,dino_v3,pvt_v2,swin_v1}.py`,
`models/modules/{aspp,decoder_blocks,deform_conv,lateral_blocks,utils}.py`, plus `dataset.py` (înlocuit, vezi mai jos).
Nu s-au luat: antrenare (`train.py`, `loss.py`, `dataset.py` original, `*.sh`), `inference.py`, `image_proc.py`, `utils.py`,
`evaluation/`, `tutorials/`. `utils.py` și `image_proc.py` sunt cerute doar de `dataset.py` original, nu de model.

## Modificări (față de original) și sha256 original

| Fișier | sha256 original | Modificare |
|---|---|---|
| `config.py` | `6580aacdd661a16575a700561f91eb341d6d2df1440591056f462a1a1b1044aa` | Scoasă citirea `os.listdir` a directoarelor de date (`datasets_all = ''`) și scanarea `train.sh` din directorul curent/părinte (efecte secundare la import, doar pentru antrenare). Restul setărilor (swin_v1_l, 1024x1024, DIS5K) neschimbat. |
| `dataset.py` | n/a (înlocuit) | Original = dataloader de antrenare. Înlocuit cu un fișier care conține doar `class_labels_TR_sorted` (copiat neschimbat), singurul simbol importat de `models/birefnet.py`. |
| `models/backbones/build_backbone.py` | `f262062aea3f841f6e687b8544e98197e9a07d96f5edb67f705942e94104bc9f` | Fail-closed: `build_backbone(..., pretrained=True)` ridică `RuntimeError` (altfel ar descărca weights torchvision sau ar face `torch.load`); `load_weights` (singurul `torch.load`, `weights_only=True`) ridică `RuntimeError` înainte de orice citire. |
| `models/birefnet.py` | `7b3ccc1db3826e9cb350c5cd76de148d515826f9c19b342d9db617781c494871` | Implicit `bb_pretrained=False` (era `True`). |

Pe lângă tabel, fiecare fișier `.py` vendorizat are două linii noi la început: `# ruff: noqa` și un comentariu cu justificarea.
Motiv: hook-ul `ruff --fix` din pre-commit a șters importuri „neutilizate" din cod terț, dar folosite prin `eval(...)`
(ex. `swin_v1_l` din `build_backbone.py`), ceea ce strică modelul. Whitespace-ul de sfârșit de linie/fișier poate fi normalizat de hook-uri;
comportamentul rămâne identic cu originalul, în afara modificărilor din tabel.

## Audit (2026-11-27)

- `torch.load`: o singură apariție (`load_weights`), neutralizată; pe calea de inferență (`bb_pretrained=False`) nu era executată oricum.
- `pickle`, `trust_remote_code`, `subprocess`, `os.system`, rețea (`requests`/`urlopen`): nicio apariție în fișierele preluate.
- `eval(...)` rămâne în `birefnet.py` și `build_backbone.py`: primește doar șiruri din `Config` (constante din cod, nu din input/fișiere).
- `PyTorchModelHubMixin` (din `huggingface_hub`) e moștenit de clasa `BiRefNet`, dar `from_pretrained` nu se folosește.
- Importurile de top-level (`config`, `dataset`, `models`) cer ca `vendor/birefnet` să fie primul în `sys.path` (face `birefnet_load.py`).
