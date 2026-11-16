# Ghid de conținut You Protect

Șablonul unic pentru tot ce scriem pe site: fișe de produs, pagini de industrie, homepage, CTA-uri.
Fișele de produs au în plus un fișier-șablon (`catalog/texts/_template.json`) și o verificare automată
(`scripts/catalog/lint_texts.py`), rulată la fiecare asamblare.

## 1. Vocea

- **Tu**, diplomat, respectuos, apropiat. Niciodată „dumneavoastră”, „vă”, „cereți”, „aveți”.
- Fraze scurte, la persoana a II-a: „Stai la cald.”, „Te miști liber.”, „Ceri ofertă de pe această pagină.”
- Fără superlative goale: „cel mai bun”, „revoluționar”, „lider”, „nr. 1”.
- Tipografie: ș/ț cu virgulă (nu ş/ţ), ghilimele „…”, spațiu nedespărțit între număr și unitate
  (`220 g/m²`, `40 °C`, `5 %`), majusculă doar la început de frază.

| Corect | Greșit |
|---|---|
| „Ofertă pentru echipa ta” | „Ofertă pentru echipa dumneavoastră” |
| „Poți pune logoul pe piept” | „Logoul se poate aplica pe piept” (impersonal, rece) |
| „Ceri ofertă” / „Cere ofertă” (buton) | „Solicitați o ofertă” |

## 2. Formula: trei straturi

Fiecare produs oferă o experiență de purtare. Textul o spune în ordinea asta:

1. **Experiența de purtare**: ce simte corpul. Cald, uscat, comod, respiră, liber în mișcare, calci sigur.
2. **Cum te simți și cum arăți**: protejat, văzut, profesionist, îngrijit, transmiți încredere.
   Mereu legat de un fapt de design: croială modernă, două culori, material netransparent.
3. **Ce câștigă firma**: standarde și conformitate, întreținere și spălare, logo, evidență prin cip,
   testare fără riscuri.

Dicționar faptul de la furnizor → cum îl spui:

| Fapt furnizor | Cum îl spunem |
|---|---|
| Lightweight insulation, warmth without bulk | „cald fără volum”, „te miști liber” |
| Waterproof, windproof, taped seams | „te ține uscat pe ploaie și vânt” |
| Breathable | „respiră”, **doar dacă furnizorul o declară** |
| Stretch, elastane, four-way stretch | „libertate de mișcare”, „nimic nu strânge” |
| Tape over the neck seam | „nu irită la gât” |
| Shock-absorbing insole, moisture absorbing | „absoarbe șocurile la fiecare pas”, „preia umezeala” |
| Slip resistant (SR) | „calci sigur pe pardoseli alunecoase” |
| EN ISO 20471 clasa 3 | „ești văzut de departe”, „cel mai înalt nivel de vizibilitate” |
| Modern fit, two-toned, not transparent | „arăți îngrijit”, „arăți profesionist”, „transmiți încredere” |

## 3. Reguli de adevăr

- Fiecare afirmație decurge dintr-un câmp din feed-ul furnizorului sau dintr-un document al producătorului
  (fișă tehnică, declarație de conformitate).
- Interzis: cifre inventate, efecte nemăsurate („mai puțină oboseală”, „mai puține absențe”), „toată ziua”,
  comparații cu alte produse, termene de livrare sau stoc nedeclarate.
- Situațiile concrete („când te apleci, urci scări”) sunt permise doar ca ilustrare a unei proprietăți declarate.
- Ofertele (testare fără riscuri, garanție) vin doar din constanta `RISK_FREE_TESTING` din `src/lib/site.ts`.
- Un marcaj pe care nu-l înțelegem sigur se afișează fără explicație și se notează la review. Nu ghicim.
- Limitările se spun deschis, în `notes` (ex.: nuanța se poate modifica la soare).

## 4. Fișa de produs, câmp cu câmp

| Câmp | Formula | Limită |
|---|---|---|
| `keyword` | Cum caută clientul, în română: „geacă de iarnă reflectorizantă”, „bocanci de protecție S3S” | — |
| `name` (H1) | Tip produs cu keyword + brand® + model: „Tricou polo de lucru MASCOT® Bandol” | — |
| `summary` | Fraza 1: keyword + ce este + standardul principal + experiența. Fraza 2: cum te simți sau cum arăți. | 60–220 caractere |
| `description` | **3 paragrafe = cele 3 straturi.** Primul paragraf începe cu keyword-ul. | min. 40 caractere/paragraf |
| `benefits` | 5–6, format „Rezultat: cum” („Cald fără volum: izolație CLIMASCOT®.”) | 3–7 |
| `specs` | Completări traduse; materialul și gramajul vin automat din feed | min. 3 în total |
| `notes` | Limitări sau precizări oneste | opțional |
| `faq` | Setul de mai jos | 5–6 |
| `seo.title` | keyword + brand + cod model | max. 50 (+ „ \| You Protect”) |
| `seo.description` | keyword + 2–3 beneficii de experiență + „Ofertă … de la You Protect.” | 70–160 |

Setul de întrebări frecvente:

1. Standardul sau clasa de protecție („Ce clasă de vizibilitate are…?”)
2. Experiența („Ține de cald fără să fie groasă?”, „Este comod pentru purtare zilnică?”)
3. Personalizarea („Pot imprima logoul firmei pe…?”), dacă produsul are zone de logo
4. Mărimi și varianta pentru femei
5. Întreținere sau limitare (spălare industrială, purtare la soare)
6. **Locală, obligatorie**: „De unde pot comanda … ?” → „De la You Protect, din Satu Mare. …”

## 5. SEO

- Keyword-ul apare în `seo.title`, `name` (H1), prima frază din `summary` și primul paragraf din `description`.
- Codul modelului intră în titlu: clienții B2B caută după cod.
- Keyword-ul exact, de cel mult două ori în descriere. Fără înșirări de cuvinte-cheie.
- Slug: `tip-produs-brand-gama-cod`, fără diacritice; nu se schimbă după publicare.
- Volume de căutare: nu avem încă date. Validăm keyword-urile în Google Search Console după lansare.

## 6. GEO (răspunsuri pe care un AI le poate cita)

- Răspunsul începe cu concluzia („Da.”, „Clasa 3 conform EN ISO 20471…”), apoi faptul.
- Fiecare răspuns se înțelege singur: repetă numele sau codul produsului, nu „acesta”.
- Cifre și standarde exacte: „EN ISO 20471 clasa 3”, „220 g/m²”, „S3S conform EN ISO 20345:2022”.
- Entitatea locală: You Protect + Satu Mare, în întrebarea „De unde pot comanda…”.
- `Product`, `FAQPage` și `BreadcrumbList` (JSON-LD) se generează automat din fișă.

## 7. Celelalte pagini (industrie, homepage, servicii)

- Aceeași formulă, la nivel de echipă: experiența oamenilor tăi → imaginea firmei → ce câștigă firma.
- H1 cu keyword și, unde are sens, locația („… pentru construcții, în Satu Mare”).
- CTA: primar „Cere ofertă”, secundar „Discută cu un consultant”; blocul „Testezi fără riscuri” unde e relevant.
- Întrebări frecvente cu aceleași reguli GEO.

## 8. Înainte de aprobare

Automat, la `assemble_mascot.py` (sau separat: `python3 -I scripts/catalog/lint_texts.py catalog/texts/mascot`):
voce, diacritice, ghilimele, cuvinte interzise, lungimi SEO, keyword în titlu/H1/rezumat/primul paragraf,
3 paragrafe, 5–6 întrebări, întrebarea locală.

Manual: fiecare afirmație are sursă; textul sună a om, nu a broșură.
