# Portwest: surse de date pentru catalog

Ce oferă contul Portwest al You Protect și cum se ia automat. Hartă făcută pe 20.11.2026 din pagina
„Linkuri de marketing” (portwest.com/account/marketinglinks).

## Acces

- Logare pe portwest.com cu **numărul de cont** (câmpul „Email” îl acceptă) și parolă, fără reCAPTCHA la
  logarea prin formular. Credențialele stau în Keychain: `PORTWEST_ACCOUNT`, `PORTWEST_PASSWORD`
  (`secret set youprotect-website <VAR>`).
- Script: `scripts/catalog/fetch_portwest.py`. Se loghează doar când are nevoie, ține sesiunea în memorie și
  scrie în `.catalog-work/portwest/` (ignorat de git).

  ```sh
  secret run youprotect-website -- python3 -I scripts/catalog/fetch_portwest.py            # fișierele de date
  secret run youprotect-website -- python3 -I scripts/catalog/fetch_portwest.py --docs C474 # + documentele modelului
  ```

## Fișierele de date (toate CSV, separator virgulă, UTF-8)

Cheia comună e `Style` (codul modelului, de exemplu `C474`). `Item` = model + culoare + croială + mărime
(`C474YERL`). Gama Base (încălțăminte italiană, coduri `B…`) are fișiere separate.

| Fișier local | Sursă | Logare | Conținut |
|---|---|---|---|
| `descrieri-ro.csv` | CDN `marketing_files/desc/descRO.csv` | nu | Nume, descriere și caracteristici **în română**; `ProductType`, `Range`, `Collection`. ~1.850 de modele |
| `descrieri-base-ro.csv` | CDN `marketing_files/desc/descbRO.csv` | nu | La fel, pentru Base |
| `certificari.csv` | CDN `marketing_files/stds/stds.csv` | nu | Organismul notificat, numărul certificatului, standardele (până la 10 coloane) |
| `certificari-base.csv` | CDN `marketing_files/stds/base_stds.csv` | nu | La fel, pentru Base |
| `coduri-bare.csv` | CDN `marketing_files/tech/techGB.csv` | nu | Pe `Item`: dimensiuni colet, greutate, EAN13, DUN14, cod vamal |
| `coduri-bare-base.csv` | `/account/base_tech_csv` | da | La fel, pentru Base |
| `materiale-imbracaminte.csv` | `/account/materialsClothing` | da | Țesături, compoziție, gramaj, simbolurile de întreținere (în română) |
| `materiale-incaltaminte.csv` | `/account/materialsFootwear` | da | Fața și talpa |
| `materiale-incaltaminte-base.csv` | `/account/materialsFootwearBase` | da | Plus căptușeală, branț, bombeu |
| `materiale-epi.csv` | `/account/materialsOther` | da | Materialele pentru EPI, mănuși și protecție la cădere |
| `variante.csv` | `/account/downloadDailyData` (sohRO.csv) | da | Pe `Item`: culoare, mărime, croială, poză, greutate, EAN. **Doar aceste coloane**: scriptul aruncă prețul și stocul înainte de a scrie |
| `variante-base.csv` | `/account/downloadDailyData` (sohROB.csv) | da | La fel, pentru Base |

CDN = `https://d11ak7fd9ypfb7.cloudfront.net`. Fișierele de pe CDN se descarcă și fără logare.
În cont, linkurile trec prin `/account/download_link?...&url=<CDN>` (contorizare), apoi redirecționează spre CDN.

## Poze

- Câte o poză de produs pe culoare, 1100 px: `https://d11ak7fd9ypfb7.cloudfront.net/styles1100px/<Style><Culoare><Croială>.jpg`
  (de exemplu `C474YER.jpg`), aceeași adresă ca în coloana `Image_Path` din `variante.csv`.
- Media Hub (`mediahub.global.portwest.com`, portal Bynder, public): poze de produs, cu modele și în context,
  cataloage, video, logouri. Condițiile Media Hub dau clienților Portwest o licență neexclusivă, gratuită,
  pentru a folosi materialele „solely for the marketing, promotion, sale and distribution of Portwest
  products”. Deci pe site doar lângă produse Portwest, nu ca ilustrații generale.

## Documente publice pe model (fără logare)

| Document | Adresă |
|---|---|
| Declarația de conformitate UE, **în română** | `https://documents.portwest.com/declaration_eu.php?style=<Style>&lang=RO&itemcol=<Style>` |
| Fișa tehnică, **în română** | `https://documents.portwest.com/datasheet.php?style=<Style>&lang=RO&itemcol=<Style><Culoare><Croială>` |
| Tabelul de mărimi (nu există la toate modelele) | `https://d11ak7fd9ypfb7.cloudfront.net/com_images/sizecharts/<Style>.pdf` |

Fișa tehnică cere codul complet de culoare (`C474YER`); doar `C474` întoarce „Invalid item colour code”.
Serverul `documents.portwest.com` pune uneori text înaintea PDF-ului și taie finalul, iar pe HTTP/2 rupe
conexiunea. Scriptul păstrează doar PDF-uri întregi (`%PDF-` … `%%EOF`) și reîncearcă de patru ori. Din cauza
asta, pe site documentele Portwest se găzduiesc local, ca declarațiile Sir Safety, nu se leagă direct.

## Alte linkuri din pagină

- Ghiduri PDF pe CDN: zona de imprimare pe hainele reflectorizante (`marketing_files/pdf/High_Visibility_Printed_Area_Guide_2026_v2.pdf`)
  și logourile pe hainele ignifuge multi-normă (`pdfs/How+to+Safely+Add+Logos+to+FR+Multi-Norm+Workwear.pdf`).
  Utile pentru pagina de personalizare.
- Ambalaje (sustenabilitate): XLSX pe S3 `marketing-docs.s3.eu-west-1.amazonaws.com/marketing_docs/MarketingLinksPackagingDatabase.xlsx`.
- Ghiduri de mărimi: `portwest.com/market/sizing/{garments,footwear,gloves}`; pentru Base, o poză pe Dropbox.
- Portwest University (LearnUpon): cont separat, nefolosit.

## Ce nu se folosește, intenționat

Listele de prețuri (pe grupe de produse), stocul, fișierul de lichidări și fișa de produs completă conțin
prețurile contractuale ale contului sau stocul. Scriptul le refuză prin cod. Nu intră în repo (repo-ul e
public) și nu se descarcă automat.
