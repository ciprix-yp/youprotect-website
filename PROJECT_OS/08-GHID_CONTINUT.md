# Ghid de conținut You Protect

Șablonul unic pentru tot ce scriem pe site: fișe de produs, pagini de industrie, homepage, CTA-uri.
Fișele de produs au în plus un fișier-șablon (`catalog/texts/_template.json`) și o verificare automată
(`scripts/catalog/lint_texts.py`), rulată la fiecare asamblare.

## 0. Pentru cine scriem

Textul nu trebuie să ne placă nouă. Trebuie să răspundă întrebărilor din capul cititorului, în ordinea în care și le
pune:

1. **„De ce să citesc?”** Titlul și prima frază a fiecărei secțiuni îi spun ce câștigă dacă citește mai departe.
2. **„Ce poți face pentru mine?”** Rezultatul concret pentru firma și oamenii lui, nu descrierea noastră.
3. **„De ce să te cred?”** Dovada: standardul, documentul, procesul, condiția scrisă, un client real.
4. **„Ce fac acum și ce risc?”** Pasul următor și ce se întâmplă după clic.

**Cititorul e eroul, You Protect e ghidul** (owner, 25.11.2026: „vreau să punem leadul în rolul de erou, să scriem
pe limbajul său, să-i vorbim lui”):

- Eroul are o sarcină: să-și echipeze oamenii potrivit, în buget și fără bătăi de cap. Ghidul îl ajută cu înțelegere
  (îi cunoaștem situația) și cu autoritate (dovezi: standarde, documente, showroom-ul, testarea, recenziile reale).
- Subiectul frazelor e „tu”, „echipa ta”, „oamenii tăi”. „Noi” apare doar ca să spună ce facem pentru el.
- Titlurile vorbesc despre rezultatul lui, nu despre noi. De evitat, exemplu de pe site: „Suntem partenerul local
  pentru companiile din Satu Mare…”.
- Povestea noastră (Despre noi) e dovada că suntem ghidul potrivit, nu subiectul paginii.
- Cuvintele lui: expresiile din căutări (`09-HARTA-CUVINTE-CHEIE.md` §2–3), obiecțiile (09 §5) și recenziile reale
  (`src/data/testimonials.json`), nu jargonul nostru.
- Mizele se spun ca fapt (ce se întâmplă dacă echipamentul nu e potrivit sau nu e purtat), nu ca frică (§3).

Reguli:

- Fiecare secțiune răspunde în principal la o singură întrebare (tabelul din §7).
- Întâi răspunsul, apoi explicația. Prima frază îl face pe cititor să o citească pe a doua.
- Titlurile spun răspunsul sau rezultatul, nu eticheta secțiunii (nu „Serviciile noastre”, „Valorile noastre”).
- Testul titlurilor: cine citește doar titlurile și primele fraze află ce poți face pentru el și de ce să te creadă.
- O frază după care cititorul poate spune „și?” se taie sau primește faptul care îi lipsește.
- Atenția se câștigă prin relevanță, nu prin lungime. Măsura e dacă cititorul trece la secțiunea următoare sau la
  acțiune, nu cât timp stă pe pagină.
- Întrebarea 3 e frâna întrebării 1: fără promisiuni, frică sau superlative ca să prinzi atenția (regulile de adevăr,
  §3).
- Obiecțiile reale ale clienților și pagina care răspunde la fiecare sunt în `09-HARTA-CUVINTE-CHEIE.md` §5. Fiecare
  pagină principală răspunde la obiecțiile din dreptul ei.

## 1. Vocea

- **Tu**, diplomat, respectuos, apropiat. Niciodată „dumneavoastră”, „vă”, „cereți”, „aveți”.
- Fraze scurte, la persoana a II-a: „Stai la cald.”, „Te miști liber.”, „Ceri ofertă de pe această pagină.”
- Fără superlative goale: „cel mai bun”, „revoluționar”, „lider”, „nr. 1”.
- Tipografie: ș/ț cu virgulă (nu cu sedilă), ghilimele „…”, spațiu nedespărțit între număr și unitate
  (`220 g/m²`, `40 °C`, `5 %`), majusculă doar la început de frază.

| Corect | Greșit |
|---|---|
| „Ofertă pentru echipa ta” | „Ofertă pentru echipa dumneavoastră” |
| „Poți pune logoul pe piept” | „Logoul se poate aplica pe piept” (impersonal, rece) |
| „Ceri ofertă” / „Cere ofertă” (buton) | „Solicitați o ofertă” |

## 2. Fișa de produs: formula în trei straturi

Formula e pentru fișele de produs. Celelalte secțiuni ale site-ului au rețeta lor (§7).

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
- Fără „unitate protejată”: You Protect nu e și nu lucrează în acest context (owner, 21.11.2026), deși expresia apare
  în căutări lângă „echipamente de protecție”.
- Fără „distribuitor autorizat” sau „partener oficial” al unei mărci.
- Fără numărul de produse sau de modele din catalog (D-2026-11-21-03). Termenul pentru ofertă vine doar din
  `RESPONSE_TIME` (`src/lib/site.ts`).

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

## 7. Rețete pe tip de secțiune

Nivelurile de ton: 0 factual (specificații, condiții), 1 practic (produse, categorii, alegere), 2 uman (homepage,
beneficii, servicii), 3 personal (Despre noi, povești reale). Emoția nu justifică frica, rușinarea cumpărătorului sau
promisiuni nesusținute.

| Secțiunea | Întrebarea cititorului | Cum se construiește | SEO / GEO | Ton |
|---|---|---|---|---|
| Hero (H1, intro, butoane) | „Sunt unde trebuie? Ce poți face pentru mine?” | Cine, ce, pentru cine, unde, în 1–2 fraze; rezultatul pentru cititor, nu descrierea firmei; apoi butoanele | Maxim: expresia principală în H1 sau în prima frază; prima frază spune cine e You Protect, ce face și unde | 1–2 |
| Situația cititorului | „Mă privește?” | O situație concretă de lucru pe care o recunoaște; fără frică exagerată, fără vină | Mic | 2 |
| Beneficii („De ce You Protect”) | „Ce poți face pentru mine și de ce să te cred?” | Beneficiul → mecanismul care îl produce → condiția sau dovada; 3–4 blocuri, titlul fiecăruia spune rezultatul | Mediu: titluri descriptive, nu sloganuri | 2 |
| Beneficii produs | „Îi va fi bine omului meu? Trece la control?” | Formula în trei straturi (§2) | Expresia în prima frază, fapte exacte | 1 |
| Specificații | „Ce scrie exact?” | Doar date din fișa tehnică și declarația de conformitate, fără copywriting | GEO mare: cifre și standarde exacte | 0 |
| Cum lucrăm / proces | „Ce se întâmplă dacă vă scriu și cât efort îmi cere?” | Pași numerotați: ce faci tu, ce facem noi, termenul (doar din `RESPONSE_TIME`) | Mic; o întrebare „Cum…?” în FAQ | 1 |
| Despre noi | „Cine sunteți și de ce să am încredere?” | Un moment real → o decizie → ce faceți altfel azi → ce înseamnă pentru client; oameni, ani, locuri reale; fără valori abstracte; nu se scrie fără povestea factuală de la owner | Aproape zero în corp: fraza de identitate (cine, ce, unde, din ce an) și descrierea din Google | 3 |
| Dovezi (testimoniale) | „Au mai făcut-o și pentru alții?” | Citatul rămâne exact; nu se rescrie, nu se inventează | Mic | — |
| Ghid | „Cum aleg corect?” | Răspunsul în primul paragraf, apoi criterii, comparație, limite, sursa normei | Maxim, la ambele | 0–1 |
| Întrebări frecvente | O întrebare precisă | Regulile din §6: concluzia întâi, răspunsul se înțelege singur | GEO maxim | 0–1 |
| CTA și fraza de lângă buton | „Ce se întâmplă după clic și ce risc?” | Numele acțiunii din §9 + o frază care spune ce urmează (termenul doar din `RESPONSE_TIME`) | Zero | 1 |
| Titlul și descrierea din Google | „Dau clic aici sau pe următorul?” | Expresia principală + ce te diferențiază + Satu Mare unde e cazul; limitele din §4 | Maxim SEO | 1 |

Reguli comune:

- H1 cu keyword și, unde are sens, locația („… pentru construcții, în Satu Mare”).
- CTA: primar „Cere ofertă”, secundar „Programează o discuție” (același nume peste tot, ca pagina la care duce); blocul
  „Testezi fără riscuri” unde e relevant.
- CTA-ul se alege după stadiul cititorului. Pe ghiduri, pasul următor e mic (categoria, calculatorul, ghidul conex).
  Pe categorii și produse: „Cere ofertă” sau lista de ofertă. Pe Cum lucrăm și Despre noi, „Programează o discuție”
  poate fi butonul principal.
- Întrebările frecvente urmează regulile GEO din §6.
- SEO stă în scheletul paginii (titlu, H1, primul paragraf, H2, descrierea din Google, întrebări frecvente), nu în
  fiecare paragraf.

## 8. Înainte de aprobare

Automat, la `assemble_mascot.py` (sau separat: `python3 -I scripts/catalog/lint_texts.py catalog/texts/mascot`):
voce, diacritice, ghilimele, cuvinte interzise, lungimi SEO, keyword în titlu/H1/rezumat/primul paragraf,
3 paragrafe, 5–6 întrebări, întrebarea locală.

Manual: fiecare afirmație are sursă; textul sună a om, nu a broșură; fiecare secțiune răspunde la întrebarea ei (§0,
§7), iar testul titlurilor trece.

## 9. Design (aceleași reguli pe toate paginile)

- Antetul paginii interioare: `PageHeader.astro` (breadcrumb, H1, intro, butoane, fotografie opțională). Paginile de
  prezentare îl folosesc prin `GlobalInnerHero`; paginile legale prin `LegalPage`.
- Clasele comune sunt în `src/lib/ui.ts`: `pageContainer` (`max-w-7xl` + `px-4`, ca antetul și footer-ul),
  `pageTitle`, `pageIntro`, `sectionTitle`, `btnPrimary`, `btnSecondary`, `readingColumn` (text lung: max. ~70 de
  caractere pe rând).
- Butoane: înălțime 48 px (`h-12`), fără săgeți. Același nume pentru aceeași acțiune: „Cere ofertă”, „Programează o
  discuție”, „Vezi catalogul”.
- Fără etichete mici în majuscule deasupra titlurilor, fără cuvinte colorate în titluri, fără animații declanșate la
  derulare cu cronometru (tip AOS). Mișcarea la derulare e permisă doar legată de poziția paginii (clasele `sd-*`, vezi
  „Mișcare” mai jos).
- Text: paragrafele în greutate normală; `font-light` doar la titluri. Iconițe SVG, nu emoji.
- Grile: rânduri pline (`CategoryTiles` alege numărul de coloane; dala de final de pe paginile de categorie apare doar
  unde completează un rând).
- Premium (20.11.2026): cardurile de produs, dalele de categorie și cardurile „De ce You Protect” sunt 3D
  (`data-tilt` + `.card-3d`, `src/scripts/tilt.ts`): se înclină spre cursor doar cu mouse și fără „reduce motion”; pe
  telefon se apasă la atingere. Pozele de produs stau pe `.img-well` (fond gri cald, `mix-blend-multiply`).
  Suprafețe: `bg-yp-surface`, `shadow-card`; colțuri: cardurile `rounded-xl`, butoanele și casetele `rounded-lg`.
- Telefon: orice element atins cu degetul are cel puțin 44 px (`min-h-11`), în afară de linkurile din mijlocul frazei.
- Antetul: meniul întreg apare de la 1024 px (`lg`); sub 1024 px, inclusiv pe tabletă, e meniul de telefon. Un link nou
  în meniu se verifică la 1024 px: logo-ul, linkurile și butonul trebuie să încapă pe un rând.
- Mișcare (20.11.2026, după ghidul Apple; skill-urile `apple-design` și `review-animations`): mișcarea are un rost
  (arată ce s-a schimbat sau răspunde la o acțiune), e scurtă și se poate întrerupe.
  - Curbele: `ease-out-strong` pentru ce apare sau răspunde, `ease-drawer` pentru ce se mută pe ecran (Tailwind și
    `--ease-out`/`--ease-drawer` în `global.css`). Durate: 150 ms (culori, apăsare), 200–300 ms (meniu, pași,
    hover pe poze); peste 300 ms doar tranzițiile mari (poza care trece între pagini, caruselul).
  - Fără `transition-all` (numești proprietățile), fără zoom sau mișcare la hover pe ce nu e clicabil, fără hover
    pe telefon (`hoverOnlyWhenSupported`). Butoanele se apasă vizibil (`active:scale-[0.98]`).
  - Ce intră pe un drum iese pe același drum (meniul coboară și urcă; pasul următor vine din dreapta, „Înapoi” din
    stânga). Cu „reduce motion” rămâne doar fade-ul, fără deplasare; tranzițiile între pagini sunt oprite.
  - Între pagini: fade de 200 ms, iar poza produsului trece din card în fișă și înapoi (`data-vt-photo` pe card,
    `#gallery-well` în fișă, `src/scripts/fluid.ts`). Un nume de tranziție apare o singură dată pe pagină.
    Scripturile de pe toate paginile stau în pagină, nu în fișiere separate: altfel rulează în timpul tranziției și
    Chrome o sare (D-2026-11-20-14; `scripts/check-inline-scripts.mjs` verifică în CI).
    Tranzițiile se verifică în Google Chrome (Playwright `channel: 'chrome'`): browserul implicit al Playwright le sare
    des pe paginile servite de Cloudflare, deși vizitatorii nu au problema (D-2026-11-21-02).
  - Titlurile: `h1` cu literele strânse cu 0,02em, `h2` cu 0,01em; textul mic rămâne cu spațierea normală.
  - La derulare (20.11.2026, după feedback-ul că pe telefon paginile păreau statice): progresul vine din poziția
    paginii (`animation-timeline`), nu dintr-un cronometru, deci urmărește degetul, nu întârzie conținutul și merge
    și înapoi. Clase în `global.css`: `sd-hero-media`/`sd-hero-content` (hero), `sd-media` (pozele se așază),
    `sd-step` (linia pasului se trage), `sd-check` (bifele apar pe rând), `sd-expand` (blocul galben se lărgește),
    `sd-rise` și `.card-3d` (cardurile urcă, doar pe ecranele tactile; cu mouse-ul se înclină). Textul rămâne pe loc.
    Proprietățile se scriu separat, nu cu prescurtarea `animation` (`tests/scroll-animations.test.mjs`).
