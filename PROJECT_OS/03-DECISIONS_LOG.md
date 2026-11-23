# Decision Log (ADR Lite)

## Reguli

- O intrare per decizie structurală.
- Nu edităm istoric; doar adăugăm intrări noi.

---

## D-2026-02-24-01
- Context: Conversie website non-ecommerce, cu shortlist multiprodus.
- Decizie: Introducere `lead_request_products` (many-to-many) cu limită hard 12 produse/lead.
- De ce: `lead_requests.product_id` suporta un singur produs.
- Impact: Flow-ul dorit este acoperit fără a rupe compatibilitatea legacy.

## D-2026-02-24-02
- Context: Agentul are nevoie de context înainte de discuție.
- Decizie: Introducere `website_lead_context` + `website_lead_pipeline` + `website_lead_events`.
- De ce: Separăm contextul website de modelul CRM/prospectare.
- Impact: Orchestrare mai clară în n8n și handoff mai bun către sales.

## D-2026-02-24-03
- Context: Calificare lead simplă pentru MVP.
- Decizie: Praguri scoring DB-level: `<50 low`, `50-<75 medium`, `>=75 high`.
- De ce: Claritate pentru agent + consistență automată.
- Impact: Etichetare automată și predictibilă.

## D-2026-02-25-01
- Context: Avem nevoie de execuție disciplinată, pas cu pas, fără pierdere de context între sesiuni.
- Decizie: Introducem un orchestrator local `pm` + reviewer gate deterministic înainte de `DONE`.
- De ce: Reducem haosul operațional și facem verificarea repetabilă.
- Impact: Flux standardizat `status -> next -> implementare -> review -> close`.

## D-2026-02-25-02
- Context: Dorim validare live la fiecare iterație (desktop + mobile), nu doar local.
- Decizie: Standardizăm release loop cu `git push` la fiecare iterație + deploy Cloudflare Pages pe branch.
- De ce: Feedback rapid din mediu online și risc mai mic de surprize la lansare.
- Impact: Fiecare task poate fi validat pe URL preview înainte de `DONE`.

## D-2026-02-25-03
- Context: Proiectul Cloudflare Pages este deja conectat nativ la repo cu auto deployments active.
- Decizie: Folosim Git integration ca mecanism principal de deploy și păstrăm `wrangler` doar opțional.
- De ce: Setup mai simplu, mai puține secrete/config de întreținut.
- Impact: `release:iteration` devine `review + push`, iar deploy-ul se întâmplă automat.

## D-2026-02-25-04
- Context: Feedback-ul vizual ad-hoc e valoros, dar poate deturna execuția de la taskul activ.
- Decizie: Introducem protocol "capture first": orice sugestie nouă intră în `07-IDEA_INBOX.md` și se execută doar când e mapată explicit la un task.
- De ce: Păstrăm focusul sprintului fără să pierdem ideile bune.
- Impact: Execuție mai disciplinată, trasabilitate mai bună între idee -> task -> implementare.

## D-2026-02-25-05
- Context: Persistența lead-urilor din Cloudflare Pages Functions către Railway Postgres direct pe `DATABASE_URL` a blocat runtime-ul.
- Decizie: Introducem Hyperdrive binding (`HYPERDRIVE`) și folosim `connectionString` din binding în endpoint-ul `/api/leads`.
- De ce: Stabilitate la conexiunea DB din Workers + latență mai bună și eliminarea blocajelor TCP directe.
- Impact: Submit-ul website scrie end-to-end în `lead_requests`, `lead_request_products`, `website_lead_context`.

## D-2026-02-25-06
- Context: Scorul și contextul wizard erau trimise din frontend, dar backend salva incomplet doar o parte din răspunsuri.
- Decizie: Scoring + validare wizard mutate server-side în `/api/leads`, cu upsert complet în `website_lead_context` (`answers_json`, `pain_points`, `desired_outcomes`, `needs_summary`, `qualification_score`, `payment_method`, hints).
- De ce: Consistență DB, protecție la payload incomplet/manipulat și aliniere la acceptance WP-003.
- Impact: Agentul primește context complet în DB și label-ul (`low/medium/high`) este derivat automat prin trigger pe pragurile stabilite.

## D-2026-02-25-07
- Context: Flow-ul `Book a call` trebuia legat de pipeline-ul operațional, fără integrare directă complexă în Microsoft API pentru MVP.
- Decizie: Upsert `website_lead_pipeline` direct în `/api/leads` cu reguli:
  - `view_samples` -> `offer_in_progress`
  - `book_call` fără confirmare booking -> `intake_new` + `booking_reference=pending_lead_<id>`
  - `book_call` cu `booking_reference`/`booking_slot_at` -> `book_call_scheduled`
- De ce: Asigurăm persistență imediată a stadiului și a referinței de booking, păstrând extensibilitatea pentru webhook/n8n ulterior.
- Impact: Pipeline-ul este populat determinist la submit, iar răspunsul API include metadatele operaționale pentru pașii următori.

## D-2026-02-25-08
- Context: Catalogul avea prea multe CTA-uri concurente, iar focusul pe mobil se pierdea după selectarea produselor.
- Decizie: Normalizăm arhitectura CTA în catalog la un flux unic shortlist-first și adăugăm sticky mobile bar activ doar când există produse selectate.
- De ce: Reducem zgomotul decizional, păstrăm claritatea funnel-ului și scurtăm drumul către conversie pe mobil.
- Impact: UX mai coerent desktop/mobile, CTA-urile rămân măsurabile (`catalog_summary`, `catalog_mobile_sticky_primary`, `catalog_mobile_sticky_secondary`).

## D-2026-02-25-09
- Context: Utilizatorii aveau nevoie de control mai bun în explorarea catalogului fără a crește complexitatea backend.
- Decizie: Introducem filtre comerciale combinate cu sortare client-side (`Relevanta`, `Noutati`, `A-Z`) peste dataset-ul existent.
- De ce: Găsirea produselor potrivite devine mai rapidă, fără cost de integrare DB suplimentară pentru MVP.
- Impact: Catalogul devine mai navigabil; păstrăm SSG simplu și logică UI în frontend.

## D-2026-04-08-01
- Context: Nevoia unui Lead Magnet educațional (TCO Calculator) promovat exclusiv din campanii Social Media pentru a capta date de contact.
- Decizie: Implementarea unui Landing Page "ascuns" la ruta `/lp/tco-calculator` cu meta eticheta `noindex`, plus o componentă React care calculează 3-Year ROI și CPW și le trimite prin webhook către n8n (`TCOCalculator.tsx`).
- De ce: Paginile lead gen funcționează cel mai bine fără Header/Footer și vizibilitate generală care induce distrageri.
- Impact: Un flux vizual independent dar aliniat CSS-ului nativ care scurge date brute automat către prospectare.

## D-2026-06-24-01
- Context: Google indexa `youprotect-website.pages.dev` în loc de `youprotect.ro` (canonical/og/sitemap derivau din domeniul pages.dev).
- Decizie: `site` în `astro.config.mjs` = `https://youprotect.ro`. Adăugat `@astrojs/sitemap` (fixat la `3.2.1` pentru Astro 4) cu `filter` pe `/lp/` (noindex) și `/confirmare`, plus `public/robots.txt`. Corectat `image` din JSON-LD (`favicon.svg` -> `favicon.png`).
- De ce: la build static, `<link rel=canonical>` și `og:url` (din `BaseLayout.astro`) derivă din `site`; versiunile `@astrojs/sitemap` 3.3+ cer `routes` din hook-ul `astro:build:done`, disponibil abia în Astro 5.
- Impact: toate semnalele SEO arată unitar spre `youprotect.ro`. Rămân 2 pași manuali (în afara repo): atașarea `youprotect.ro` ca custom domain în Cloudflare Pages (200, nu 403) + submit sitemap în Google Search Console.

## D-2026-06-24-02
- Context: Audit frontend a găsit fonturi încărcate greșit (doar 400/700, dar UI folosește 300/500/600), Playfair nefolosit, CTA-uri spre `/contact` inexistent și microcopy sub contrast AA.
- Decizie: Încărcăm weight-urile reale (`Montserrat 300-700`, `Lato 300/400/700`) și scoatem Playfair; reparăm CTA-urile (`/programeaza-discutie`, `/cere-oferta`); AOS `once:true/mirror:false`; bump `neutral-500 -> neutral-400` pe microcopy; link Maps real în footer.
- De ce: ierarhia tipografică premium nu se randa (browserul falsifica weight-urile); `/contact` era rută moartă.
- Impact: UI corect randat + zero linkuri rupte. Amânat: conversia `<button onclick=location>` -> `<a href>` (~18 instanțe) și consolidarea tokenilor de culoare (vezi BACKLOG UX-001).

## D-2026-06-24-03
- Context: Audit SEO/GEO. Verificarea codului real a infirmat parțial auditul (LocalBusiness, FAQPage și sitemap existau deja), dar a confirmat: title duplicat, `og:type` hardcodat "website", lipsă `og:image`, lipsă Product/BreadcrumbList schema, breadcrumb cu slug brut, zero semnal GEO în body/headings.
- Decizie: 3 PR-uri (toate code-fixable din repo):
  - **Head plumbing**: scos `| You Protect` din titluri (layout-ul adaugă suffix o dată); `ogType`/`ogImage` ca props pe BaseLayout/InnerPageLayout/LandingLayout; `og:image` absolut + Twitter card; `@type B2BBusiness` -> `LocalBusiness` (+`@id`/`openingHours`/`areaServed`); nou `src/lib/site.ts` (NAP/areaServed/social, `sameAs` gated).
  - **Date produs**: `Product` + `BreadcrumbList` JSON-LD în `produse/[slug].astro` (fără `offers` — preț la cerere); breadcrumb afișează `product.name`.
  - **GEO + pagini noi**: mențiuni „Satu Mare/nord-vest" pe homepage (descriere/intro/FAQ + JSON-LD sincronizat); pagini noi `/echipamente-protectie-satu-mare`, `/industrii` + `constructii`/`logistica`/`productie` (InnerPageLayout, copy RO, BreadcrumbList); linkuri footer.
- De ce: `B2BBusiness` nu e tip valid schema.org; product/breadcrumb schema = rich snippets; pagini GEO/industrie = long-tail unde concurența locală e absentă.
- Impact: 14 pagini (de la 9), toate în sitemap, live prin auto-deploy. Excluse (decizie user): social/`sameAs` (doar WhatsApp) și schema de recenzii (politică Google self-reviews). Date produs (slug/descrieri/imagini) se corectează în Directus, NU în cod.

## D-2026-06-24-04
- Context: `www.youprotect.ro` dădea 404 și paginile vechi Wix (`/cine-suntem`, `/blog`, `/contact`) erau indexate dar moarte. Zona youprotect.ro e în contul Gmail (`251beb`), care NU are scope „Dynamic Redirect" (deci fără Redirect Rule clasică).
- Decizie: redirect prin **două mecanisme** (single-hop pe ambele intrări):
  - **Worker `www-redirect`** (rută `www.youprotect.ro/*`, zona youprotect.ro): 301 www->apex + mapping legacy.
  - **`public/_redirects`** în Pages (apex): 301 pentru URL-urile vechi -> pagini noi.
- Mapări: `/cine-suntem->/despre-noi`, `/despre->/despre-noi`, `/servicii->/cum-lucram`, `/contact->/programeaza-discutie`, `/blog(/*)->/`, `/magazin|/shop|/produsele-noastre->/produse`.
- De ce: cont fără Dynamic Redirect; Worker route + _redirects acoperă www și apex fără WAF; single-hop e mai bun SEO decât lanț de redirecturi sau 404.
- Impact: backlink-urile vechi nu mai cad în 404; autoritatea se consolidează pe apex. Verificat live. Cod fără referințe Wix/Shopify.

## D-2026-11-11-01
- Context: Directus (Railway `accomplished-forgiveness`) a fost oprit intenționat pentru costuri; ultimul deploy (01.06.2026) are status `REMOVED`, domeniul răspunde „Application not found”. Site-ul live are încă 6 produse demo, generate când Directus mergea. Orice rebuild fără Directus poate goli catalogul.
- Decizie: catalogul devine **fișiere de date în repo** (Astro content collection `src/content/products/`), fără Directus și fără DB la build. Conținutul se construiește din feed-urile furnizorilor + texte în română aprobate de om.
- Flux: `scripts/catalog/extract_mascot.py` (feed → `.catalog-work/`, local, fără prețuri) → `catalog/texts/<furnizor>/<model>.json` (texte RO) → `scripts/catalog/assemble_mascot.py` (fapte din feed + texte → `src/content/products/`; se oprește la traduceri lipsă) → schemă zod la build.
- Selecția produselor pornește din vânzări reale (export SmartBill 2023–2026): Sir Safety ~45 %, MASCOT ~41 % (umflat de o comandă), Portwest ~4 %. Sir Safety are cele mai multe produse recurente, dar nu are date accesibile public.
- Impact: nu se face push pe `main` până când paginile `/produse` nu citesc din noua colecție.

## D-2026-11-11-02
- Context: Pilot pe 5 produse MASCOT; feedback user pe ton și pe structura textelor.
- Decizie: ghid unic de conținut `PROJECT_OS/08-GHID_CONTINUT.md`: voce **tu** (diplomat, respectuos, apropiat), formula în 3 straturi (experiența de purtare → cum te simți și cum arăți → ce câștigă firma), reguli de adevăr, SEO, GEO. Fișele de produs au șablon (`catalog/texts/_template.json`) și verificare automată (`scripts/catalog/lint_texts.py`), rulată la asamblare.
- Marcaje: „Hi-Vis Group A” se afișează ca „Grupa Hi-Vis A (MASCOT)”, explicat ca sistemul MASCOT de combinare a pieselor pentru un set EN ISO 20471 (sursa: mascotworkwear.com/en/en-iso-20471). NU „clasa 1”: geaca 19035 e certificată singură clasa 3.
- Ofertă: „Testezi fără riscuri”, garanția banilor înapoi în 90 de zile, definită o singură dată în `src/lib/site.ts` (`RISK_FREE_TESTING`).

## D-2026-11-16-01
- Context: Astro 4 avea vulnerabilități (OSV: 1 critică, 32 high); `@astrojs/tailwind` nu suportă Astro 6+.
- Decizie: Astro 7 (Node 22.23.4 fixat în `.node-version` + `.mise.toml`); Tailwind 3 rulează prin `postcss.config.mjs` (fără migrare la Tailwind 4, ca să nu schimbăm aspectul); `compressHTML: true` păstrează spațiile ca în Astro 4.
- Impact: 0 vulnerabilități npm; HTML identic ca text, link-uri, meta și JSON-LD pe toate paginile.

## D-2026-11-16-02
- Context: Footer-ul lega pagini legale inexistente; Google Fonts și unpkg primeau IP-ul fiecărui vizitator; formularul nu avea informare GDPR.
- Decizie: fonturile și AOS găzduite pe site; fontul de text devine „YP Text” (subset Lato 2.015, OFL, redenumit conform clauzei Reserved Font Name), pentru că Lato de la Google nu are ă/ș/ț. Fără cookie-uri proprii și fără analytics → fără banner de cookies. Paginile legale descriu exact ce face site-ul.
- Regulă: orice script terț nou (analytics, pixel, chat) cere actualizarea politicii de cookies și, probabil, un banner de consimțământ.

## D-2026-11-16-03
- Context: `/api/leads` (639 de linii) nu mai era apelat de site; `qc-smoke.sh` scria lead-uri de test în producție.
- Decizie: rămâne un singur endpoint de lead-uri, `/api/submit-lead`, doar prin Hyperdrive. Testele formularului se fac în browser cu `/api/` blocat; un lead real de test se trimite doar cu acordul lui Ciprian.

## D-2026-11-16-04
- Context: Sir Safety (~45 % din vânzări) nu avea date în feed; portalul B2B cere login.
- Decizie: datele vin de pe site-ul public sirsafety.com (pagină + fișă tehnică EN). Pozele se găzduiesc la noi. Produsele noi intră cu status `review`; se publică după ce Ciprian citește textele. Acordul Sir Safety pentru poze/texte se cere în paralel.
- Formular: datele de contact trec la ultimul pas; produsul de pe care vine vizitatorul (`?produs=<slug>`) se trimite cu cererea, în `answers_json`.

## D-2026-11-17-01
- Context: Postgres-ul Railway (`passionate-wholeness`) nu mai avea adresă publică și nu mai deservea nimic. Cererile de pe site merg prin D1 + Resend + CRM (OPS-006), catalogul e din fișiere (D-2026-11-11-01), Directus (`accomplished-forgiveness`) era oprit, iar aplicația veche de prospectare picase. Baza conținea datele vechiului tool de prospectare, catalogul și CMS-ul vechi, Directus, catalogul furnizorilor și 54 de cereri de pe site, toate de test.
- Decizie (Ciprian): o copie completă, apoi ștergerea ambelor proiecte Railway. Datele de prospectare utile le migrează Prospector CRM din copie, fără coada de prospectare (484 de firme, toate cu starea `new`).
- Copia: `pg_dump` din 17.11.2026, verificată (SHA-256 identic la sursă și local; restaurare locală cu același număr de rânduri în toate cele 96 de tabele), păstrată ca imagine disc criptată AES-256 în OneDrive You Protect, în folderul „Backup baze de date”. Parola e în Passwords și în Keychain (`secret`, proiectul `youprotect-website`, `RAILWAY_BACKUP_PASSPHRASE`). Restaurare cu `pg_restore --no-acl`.
- Șters pe 17.11.2026 (definitiv pe 19.11.2026): proiectele Railway `passionate-wholeness` și `accomplished-forgiveness`, secretul Pages `DATABASE_URL`, configurația Hyperdrive `youprotect-db` și `railway_schema.sql` din repo. Volumul `postgis-volume` din proiectul Directus a fost șters fără să fie citit, la decizia lui Ciprian.
- Impact: copia din OneDrive e singura sursă pentru datele nemigrate (firmele din afara zonei urmărite în CRM, catalogul vechi, datele furnizorilor), deci se păstrează. Înlocuiește partea cu Hyperdrive din D-2026-11-16-03. Railway a fost scos din politica de confidențialitate.

## D-2026-11-17-02
- Context: Homepage-ul nu avea nicio dovadă socială. `src/data/testimonials.json` a fost creat gol pe 11.11.2026, când a căzut Directus, dar recenziile nu fuseseră scoase intenționat. Baza veche (copia din 17.11.2026) avea 5 recenzii Google publicate pe site-ul vechi, toate de 5 stele, din ianuarie 2025 până în ianuarie 2026.
- Decizie: recenziile revin pe homepage, cu textul neschimbat, fără pozele de profil Google și cu numele ca „Prenume I.”. Pozele s-ar încărca de pe serverele Google și ar expune IP-ul vizitatorilor, contrar D-2026-11-16-02. Numele scurtate dau aceeași dovadă, cu mai puține date personale într-un repo public.
- Rămâne valabil: fără schema de recenzii (decizia lui Ciprian, politica Google pentru recenziile despre propria firmă). Recenziile noi vin prin OPS-005 (Google Business Profile) și se adaugă în `src/data/testimonials.json`.

## D-2026-11-18-01
- Context:
  - Titlul de pe homepage promitea „cresc profitabilitatea”, fără dovadă.
  - Calculatorul de cost (`/lp/tco-calculator/`) nu era legat de nicăieri și avea `noindex`.
  - Trimitea datele unui webhook n8n vechi, inactiv; erorile erau ignorate, deci cererile se pierdeau.
  - Promitea un „ghid PDF în 5 minute” pe care nu-l trimitea nimic.
  - Folosea coeficienți „din industrie” fără sursă (risc pe domeniu, costuri ascunse de 15–28 %).
- Decizie (Ciprian):
  - Titlul trebuie să fie bun pentru SEO, să sune bine și să fie adevărat.
  - Calculatorul devine lead magnet și arată orientativ că echipamentele de calitate aduc economii pe termen mediu și lung.
- Implementare:
  - **Titlul:** „Echipamente de protecție și haine de lucru alese după costul real, nu după preț”, cu link spre calculator.
  - **Pagina:** calculatorul e pe `/calculator-cost-echipamente/`, indexabil și legat din hero și footer; adresa veche are redirect 301.
  - **Modelul** (`src/lib/tco.js`) are doar formule la vedere: achiziție, înlocuiri pe an și timp de administrare.
  - **Durabilitatea** produselor de calitate o alege vizitatorul.
  - **Pragul de rentabilitate** e un calcul exact, fără ipoteze: de câte ori trebuie să dureze mai mult ca să coste la fel.
  - **Rezultatul** se vede fără date de contact; dacă vizitatorul e pe minus, pagina o spune.
  - **Cererile** pleacă prin `/api/submit-lead`, ca cerere de ofertă cu „Sursa: Calculatorul de cost”, ca să nu adauge în CRM un intent pe care Prospector nu-l acceptă încă.
  - **Cifrele** care ajung în CRM sunt recalculate pe server.
- Regulă: calculatorul nu afișează procente sau coeficienți fără sursă. O ipoteză nouă intră doar ca valoare pe care o alege vizitatorul.

## D-2026-11-18-02
- Context:
  - Site-ul nu avea nicio măsurare, deci nu știam ce aduce cereri. D-2026-11-16-02 cerea ca orice script de analiză să vină cu politica de cookies actualizată și, probabil, cu banner.
  - Decizia lui Ciprian (18.11.2026): Cloudflare Web Analytics și Google Analytics, cu cookie-urile necesare și politica de confidențialitate actualizată. Vrea metrici clare, ca să știe ce trebuie îmbunătățit.
- Decizie:
  - **Cloudflare Web Analytics**, pornit din Cloudflare Pages, fără cookie-uri. Temeiul e interesul legitim.
  - **Google Analytics 4** se încarcă doar după „Accept statisticile”. Temeiul e acordul: art. 6 alin. 1 lit. a GDPR și art. 4 alin. 5 din Legea nr. 506/2004.
  - **Bannerul** are cele două butoane la fel de vizibile. Alegerea se păstrează în localStorage (`yp_consent`, 6 luni). Din subsol, „Setări cookie-uri” redeschide bannerul. La retragerea acordului se șterg cookie-urile `_ga`.
  - **Setări GA:** cookie-urile expiră după 13 luni; Google Signals și personalizarea reclamelor sunt oprite.
  - **Ce nu trimitem în GA:** date din formulare sau din calculator. Pleacă doar numele evenimentelor și ale pașilor: `form_start`, `form_step`, `generate_lead`, `calculator_step`, `calculator_result`, `cta_click`, `whatsapp_click`, `phone_click`, `email_click`.
  - **Paginile legale și bannerul** se generează din `ANALYTICS` (`src/lib/site.ts`), ca să descrie exact ce rulează: fără ID GA nu există banner, iar politicile nu pomenesc GA.
- De făcut de Ciprian:
  1. Creează proprietatea GA4 pentru youprotect.ro și trimite ID-ul de măsurare („G-…”, e public).
  2. În GA, setează păstrarea datelor la 14 luni; politica spune „cel mult 14 luni”.
  3. Pornește Web Analytics în Cloudflare Pages.
- După fiecare pas: `ANALYTICS.ga4Id` primește ID-ul, iar `ANALYTICS.cloudflareWebAnalytics` devine `true` după ce beacon-ul apare pe pagina publicată.
- Pornit pe 18.11.2026:
  - `ANALYTICS.ga4Id` = `G-TV8YEFYQD5` (proprietatea creată de Ciprian). Verificat în browser: fără acord nu pleacă nicio cerere spre Google; după „Accept” se încarcă gtag; retragerea acordului șterge cookie-urile `_ga`.
  - `cloudflareWebAnalytics: true`, după ce beacon-ul a apărut pe youprotect.ro (deploy ba108d7). Politica de cookies spune că scriptul vine de la Cloudflare.
  - Rămâne la Ciprian, opțional: păstrarea datelor în GA la 14 luni (implicit e 2 luni; politica spune „cel mult 14 luni”, deci ambele sunt corecte).

## D-2026-11-18-03
- Context: site-ul promitea „garanția banilor înapoi în 90 de zile” fără condiții scrise. Homepage-ul spunea în plus „testare… unde proiectul o permite”.
- Regulile lui Ciprian (18.11.2026):
  - Testarea e un program complet: produsele le alegem și le aprobăm împreună cu clientul.
  - Urmărim uzura, părerea celor care le poartă și feedback-ul din piață.
  - Calculăm durata medie de viață și eficiența financiară.
  - Clientul cumpără produsele.
  - Banii se întorc integral doar dacă clientul e nemulțumit **și** produsele nu ies mai eficiente financiar decât soluția actuală.
  - În testare intră 3–5 lucrători pe rol, în funcție de mărimea clientului.
  - Toate produsele se personalizează.
  - Dacă am plătit noi transportul tur, returul e pe costul clientului.
  - Cantitățile și KPI-urile se stabilesc cu clientul, în funcție de problema lui.
  - Clientul ne dă acces la date, iar datele rămân confidențiale.
- Implementare:
  - Pagina `/testare-fara-riscuri/`, legată din RISK_FREE_TESTING (fișe de produs, homepage, catalog, formulare), din `/cum-lucram/`, din termeni și din footer.
  - Criteriul financiar e costul pe zi de purtare, aceeași măsură ca în calculator.
- Riscuri pentru You Protect și cum sunt acoperite în text:
  1. **Retur pe gust.** Trebuie îndeplinite amândouă condițiile, iar cea financiară e măsurată după protocolul semnat.
  2. **Fără date sau fără reper.** Garanția se aplică doar cu protocol semnat și cu accesul la date la termen.
  3. **90 de zile pot fi mai puțin decât durata de viață.** Durata se estimează din uzura măsurată la verificări, comparat cu un grup de control din același rol, pe aceeași perioadă. Metoda se fixează în protocol.
  4. **Folosire sau întreținere greșită.** Produsele trebuie purtate conform fișei tehnice și etichetei. Cele deteriorate intenționat sau nereturnate nu se rambursează.
  5. **Produsele personalizate nu se pot revinde.** Expunerea e limitată la comanda de test (3–5 oameni pe rol). Comenzile ulterioare nu intră în garanție.
  6. **Cereri târzii.** Cererea se face în scris, în cel mult 14 zile de la evaluarea finală. Rambursarea se face în cel mult 14 zile de la primirea produselor.
- Propuse de Claude și confirmate de Ciprian pe 18.11.2026: cele două termene de 14 zile și grupul de control. Dreptul de a folosi rezultatele anonim, ca studiu de caz, intră în protocolul semnat, nu pe site.
- Confirmate de Ciprian pe 18.11.2026, odată cu modelul de protocol (Claude Docs, „Protocol de testare — Testare fără riscuri”):
  - evaluarea și rambursarea se fac pe fiecare rol testat;
  - uzura se notează pe o scală 0–4, cu formula duratei de viață și un plafon stabilit în protocol;
  - verificările se fac la ziua 0, 30, 60 și 90;
  - participanții apar în rapoarte cu un cod; clientul anunță în 5 zile lucrătoare dacă cineva iese din testare;
  - studiul de caz are 3 opțiuni în protocol: anonim, cu numele după aprobare, sau deloc.
- Pe site: pagina, RISK_FREE_TESTING și `/cum-lucram/` spun acum „pe fiecare rol”; pagina dă intervalele de verificare și codurile pentru participanți.

## D-2026-11-18-04
- Context:
  - Ciprian vrea recenziile noi preluate automat, o dată pe lună, doar cele de 4 și 5 stele, rulate în carusel continuu.
  - Până în noiembrie 2026 le prelua zilnic un workflow n8n (Google Places API → Directus), dar Directus și Railway au fost șterse (D-2026-11-17-01).
  - Place ID: `ChIJzczeE0MFOEcRMBTA9E1R9eY`.
- Decizie:
  - **Preluarea:** la fiecare build, integrarea `recenzii-google` (`astro.config.mjs` → `scripts/fetch-google-reviews.mjs`) ia recenziile din Places API (varianta nouă).
  - **Filtrul:** păstrează doar 4–5 stele cu text, fără poze și cu numele „Prenume I.” (D-2026-11-17-02).
  - **Fișierele:** recenziile preluate se scriu în `src/data/testimonials.google.json`, ignorat de git. Homepage-ul le unește cu `src/data/testimonials.json`, fără dubluri.
  - **Ritmul lunar:** `.github/workflows/recenzii-lunar.yml` pornește un build pe 1 ale lunii, printr-un deploy hook Cloudflare Pages.
  - **Fără commit-uri automate:** deci fără PR-uri automate care ar ocoli regulile de merge.
  - **Dacă Google nu răspunde:** build-ul continuă cu recenziile din repo.
- Limite:
  - Places API dă cel mult 5 recenzii, alese de Google drept „cele mai relevante”.
  - Termenii Google Maps Platform restrâng păstrarea conținutului Places. Recenziile preluate stau doar în build-ul curent, iar la fiecare build se reîmprospătează.
  - Pentru toate recenziile, varianta corectă e API-ul Google Business Profile, care cere aprobare Google.
- De făcut de Ciprian:
  1. Pune cheia Places API (din variabilele n8n `GOOGLE_API_KEY` sau una nouă, restricționată la „Places API (New)”) cu `secret set youprotect-website GOOGLE_PLACES_API_KEY`.
  2. Creează un deploy hook în Cloudflare Pages și pune-l cu `secret set youprotect-website CF_PAGES_DEPLOY_HOOK`.
- Apoi Claude copiază cheia în Cloudflare Pages (producție) și hook-ul în secretele GitHub, fără să le afișeze.
- Stare pe 18.11.2026:
  - Cheia e în Cloudflare Pages, doar pe producție: plafonul proiectului Google e de 30 de cereri pe zi pentru fiecare tip de cerere Places, iar build-urile de preview nu trebuie să-l consume.
  - Field mask-ul cere doar câmpurile afișate (`reviews.name`, `rating`, `text`, `originalText`, `authorAttribution.displayName`, `publishTime`), fără poze.
  - Places API răspunde 403 (PERMISSION_DENIED) cât timp facturarea Google e în reactivare. Build-ul continuă cu recenziile din repo, iar jurnalul de build arată codul de eroare Google, fără cheie.
  - Hook-ul nu l-a putut copia Claude în GitHub: garda locală confundă `gh secret set` cu `secret set`. Îl pune Ciprian cu o comandă.
- Funcționează în producție (verificat pe youprotect.ro, 18.11.2026, seara): homepage-ul are 9 recenzii, 5 din repo și 4 preluate de la Google (cea mai nouă din noiembrie 2026). Build-ul Cloudflare vede cheia, iar Places răspunde. Secretul GitHub `CF_PAGES_DEPLOY_HOOK` e pus de Ciprian.
- Numele vin de la Google cum le-a scris omul („novak C.”); de la 18.11.2026 prima literă se face mare.

## D-2026-11-18-05
- Context: decizia lui Ciprian, transmisă pe 18.11.2026 de sesiunea Prospector (projects-f7). În „Cere ofertă” intră o singură întrebare nouă, despre personalizare. Fără termen nou, mărimi, buget sau alte câmpuri. Modulul de ofertare e amânat până e gata prospectarea.
- Implementare:
  - Pasul 4 din 9, după „Ce produse ai în vedere?”: „Vrei produsele personalizate cu logo-ul firmei tale?”, cu „Da” / „Nu” / „Nu știu încă”. „Nu știu încă” există ca să nu forțăm un răspuns.
  - Valorile stau într-un singur loc, `PERSONALIZATION_ANSWERS` din `src/lib/quote-categories.js`, folosit de formular și de server. Serverul ignoră orice altă valoare.
  - În `answers`: `{question: "personalizare", label: "Personalizare cu logo", answer: "Da" | "Nu" | "Nu știu încă"}`, după răspunsul la produse. CRM-ul îl afișează fără nicio schimbare.
  - În `structured`, când îl facem: `personalizare: "da" | "nu" | "nu_stiu"`.

## D-2026-11-19-01
- Context: auditul de cuvinte cheie (18.11.2026) cerea o pagină pentru „haine de lucru personalizate cu logo” și
  „uniforme de lucru pentru firme”. În prima măsurătoare ChatGPT, întrebarea despre uniforme cu logo din Carei a rămas
  fără You Protect. Decizia lui Ciprian: personalizarea o externalizăm.
- Implementare:
  - Pagina `/haine-de-lucru-personalizate/`: spune deschis că personalizarea se face prin parteneri.
  - Fără cantități minime sau termene pe site; le dăm în ofertă. Testul blochează cifrele urmate de „bucăți” sau „zile”.
  - Tehnicile (broderie, serigrafie, transfer termic) sunt descrise prin ce sunt, fără promisiuni de durabilitate.
  - Zonele de logo, dimensiunile maxime și limitele EN ISO 20471 vin din câmpul `personalization` al fișelor,
    adică din datele producătorului.
- Corectură: pe pagina de încălțăminte, întrebarea „Pot personaliza bocancii… cu logo? Da.” nu avea acoperire (nicio
  fișă de încălțăminte nu are zone de logo). `CategoryPage.logo` o scoate acolo; testul verifică regula.

## D-2026-11-19-02
- Context: în prima măsurătoare ChatGPT (18.11.2026), la „Cine vinde MASCOT în România?” și „Cine vinde Sir Safety
  în România?” You Protect nu apărea; erau citați workwear.ro, topprotectie.ro și mondo-romania.ro. MASCOT și Sir
  Safety fac împreună cea mai mare parte din vânzări (D-2026-11-11-01).
- Implementare: pagini de marcă la `/produse/<slug>/`, generate pentru mărcile cu cel puțin două produse publicate.
  Modelele, grupate pe categorii, certificările și zonele de logo vin din fișele de produs.
- Reguli de adevăr:
  - Despre producător scriem doar ce spune site-ul lui oficial, cu sursa pe pagină (verificat pe 19.11.2026):
    - MASCOT: daneză, fondată în 1982, sediul la vest de Silkeborg, fabrici proprii în Vietnam și Laos.
    - Sir Safety System: italiană, din Assisi, pornită în 1979 de Gino Sirci.
  - Despre You Protect: „vinde produse <marcă> firmelor și livrează în toată România”. Fără „distribuitor
    autorizat”, „oficial” sau „exclusiv”: statutul nu e documentat. Testul blochează aceste cuvinte.
  - Modelele din afara catalogului: „întreabă-ne și verificăm dacă îl putem aduce”, fără promisiune.
- Dacă You Protect apare pe lista de distribuitori a unei mărci (mesajele către producători), afirmația se poate
  întări, cu link la lista lor.

## D-2026-11-19-03
- Context: în prima măsurătoare ChatGPT (18.11.2026), la „Care e diferența dintre S1P și S3?”, „Ce clasă EN ISO 20471
  îmi trebuie lângă drum?” și „Cât costă să echipezi un muncitor din construcții?” You Protect nu apărea.
- Implementare: ghiduri la `/ghiduri/<slug>/` (date în `src/lib/guides.ts`, șablon `GuideLayout.astro`), cu răspunsul
  pe scurt sus, întrebări frecvente, sursele la final și JSON-LD `Article`, `FAQPage`, `BreadcrumbList`.
- Reguli de adevăr:
  - Fiecare fapt despre un standard sau o lege are sursa pe pagină (verificate pe 19.11.2026):
    - EN ISO 20345:2022: MASCOT, Atlas, Safety Jogger, Ejendals;
    - EN ISO 20471: Centexbel, MASCOT;
    - HG nr. 1.048/2006, republicată (Portal Legislativ): art. 10 (gratuit de la angajator), art. 14 (evaluarea),
      anexa 3 (lucrările din construcții).
  - Recomandările de clasă sunt atribuite cui le face (Centexbel); alegerea o face angajatorul, după evaluarea riscurilor.
    Nu scriem că legea cere o anumită clasă: n-am găsit un act care să o facă.
  - Fără prețuri și fără cifre de cost: ghidul de cost explică din ce se compune costul și trimite la calculator, care
    lucrează cu prețurile vizitatorului. Testul blochează sumele în lei/euro în ghiduri.
  - Modelele din catalog pomenite în ghiduri (clasa S3S/S7S, clasa EN ISO 20471) se generează din fișele de produs.

## D-2026-11-19-04
- Context: 6 titluri treceau de 64 de caractere și 10 descrieri de 160, deci Google le tăia în rezultate.
- Limite: titlul complet (cu „| You Protect”) cel mult 64 de caractere, descrierea între 70 și 160, fără duplicate.
  `scripts/seo/check-meta.mjs` le verifică pe `dist/` în CI, după build; build-ul pică dacă o pagină iese din ele.
- Cuvintele din titluri vin din Search Console (august–noiembrie 2026): acasă „echipamente de protecție” și
  „haine de lucru”, la logistică „depozit”. Keyword Planner rămâne de adăugat când vine CSV-ul.
- Descrierile pomenesc doar ce e în catalog: încălțăminte S3S/S7S, haine reflectorizante, geci, pantaloni, salopete,
  tricouri, personalizare cu logo. Căștile, mănușile, antifoanele și ochelarii nu sunt în catalog, deci nu apar în
  descrieri.

## D-2026-11-19-05
- Context: paginile de industrie pomeneau căști, mănuși, antifoane și ochelari, dar catalogul n-avea niciunul. You Protect le
  poate aduce (confirmat de owner pe 19.11.2026), iar exportul de vânzări arată ce s-a vândut deja.
- Produse noi (Sir Safety, status `review`, doar în `/preview/produse/`): căștile Everest MD1216, ABS 901 MD1223 și Cosmos
  MD1211; viziera Speed FB1211 (pentru Everest) și viziera Ghost FB1215; ochelarii Azoto FB1328; mănușile Genio MA1427 și
  Electro clasa 0 MA1814; antifoanele Stark 8 FC1327. Din export intră în repo doar codurile; cantitățile și clienții nu.
- Categorii noi: `casti-protectie`, `manusi`, `protectia-ochilor`, `antifoane`. Paginile lor de categorie pornesc singure
  de la două produse publicate (`antifoane` are unul, deci încă nu).
- Pipeline: produsele fără variante de culoare au o singură intrare cu codul gol (poza `PS.webp`, PDF-urile `{COD}_EN.pdf`),
  iar fișa nu mai arată blocul „Culori”. Mărimile: „ONE SIZE” → „Mărime unică”, mănuși „S-7” → „S (7)” și „8 9 10 11”.
  Cele 12 produse Sir Safety existente se re-asamblează identic.
- Reguli de adevăr: textele urmează fișa tehnică acolo unde pagina web o contrazice (FB1211: EN ISO 16321-1, nu EN 166;
  MA1814: 10 kV, nu 1,0 kV) și notează conflictul în `reviewNotes`. Fără sfaturi de utilizare pe care sursa nu le dă.
- Paginile de industrie: sub lista de echipamente, „Ce e pe listă și nu găsești încă în catalog putem aduce la cerere”.

## D-2026-11-19-06
- Owner-ul (19.11.2026): „Testare fără riscuri” nu se aplică la căști, ochelari, viziere, antifoane și mănuși
  electroizolante; rămâne la haine, încălțăminte și mănușile de lucru (Genio). O cască ține ani, deci 90 de zile nu arată
  cât rezistă, iar echipamentul electroizolant nu se testează cu returnare.
- Implementare: câmpul `riskFreeTesting` pe fișa de produs (implicit true). Caseta lipsește de pe fișele excluse și de pe
  paginile de categorie unde nu toate produsele intră; pagina de marcă și condițiile programului listează ce nu intră,
  generat din catalog (`src/lib/risk-free-scope.ts`). `tests/risk-free-scope.test.mjs` pică dacă o cască, ochelari,
  viziere, antifoane sau mănuși electroizolante intră fără excludere.
- Owner-ul confirmă că poate recomanda antifoanele potrivite pentru casca Everest (FAQ-ul de pe fișă).
- Cele 9 accesorii (D-2026-11-19-05) sunt publicate. Paginile de categorie noi: căști, mănuși, ochelari și viziere.
  Listele de pe paginile de industrie duc la paginile de categorie care există (`EquipmentList.astro`).
- De confirmat cu Sir Safety, fără să blocheze publicarea (textele urmează fișa tehnică): standardul viziera Speed
  FB1211 (EN 166 pe pagină, EN ISO 16321-1 în fișă), tensiunea de rezistență MA1814 (1,0 kV pe pagină, 10 kV în fișă),
  dacă Everest vine cu vizieră și dacă ABS 901 și Cosmos vin cu jugulară, instrucțiunile de utilizare pentru MA1814.

## D-2026-11-19-07
- Context: pe 19.11.2026, la verificarea declarațiilor Sir Safety:
  - patru linkuri de pe site (MC1111, MC1113, MC3012, MC3014) întorceau o pagină HTML sau 404 în loc de PDF; pagina
    Sir Safety a produsului trimite tot acolo, deci documentul lipsește la sursă;
  - trei produse sunt fabricate de alții, iar Sir Safety are pentru ele o „dichiarazione di corrispondenza” (în
    italiană) cu declarația UE a producătorului: MA1814 (SECURA B.C., Polonia), FB1215 (Long Dar Plastic, Taiwan),
    FA1530 și FA1535 (Productos Climax, Spania). Pe fișă scria „Declarație de conformitate UE (în engleză)”.
- Implementare:
  - `extract_sirsafety.py` verifică declarația (PDF real, conformitate sau corespondență + producător);
    `--declarations-only` o reface fără să re-extragă restul. Fără PDF, fișa nu mai pune linkul.
  - `assemble_sirsafety.py`: eticheta documentului după tip (`declaratie-corespondenta`); la produsele fabricate de
    alții, textul trebuie să numească producătorul (verificat față de declarație) și fișa primește nota „Producător: …”.
    Marca poate fi a producătorului (`brand`, ex. Climax). JSON-LD `brand` = marca produsului, nu furnizorul.
  - `scripts/catalog/check-documents.mjs` verifică toate documentele din catalog; rulează lunar
    (`.github/workflows/documente-lunar.yml`) și pică dacă un link nu dă PDF.
- De cerut de la Sir Safety: declarațiile pentru MC1111, MC1113, MC3012 și MC3014.

## D-2026-11-19-08
- Context: restul articolelor vândute care lipseau din catalog (owner-ul a aprobat pe 19.11.2026).
- Produse noi (status `review`, doar în `/preview/produse/`):
  - protecție respiratorie: semimasca FFP3 FA1441 (Sir Safety), semimasca Climax 800 FA1530 și filtrul Climax 757-N
    ABEK1P3 R D FA1535 (marca Climax, fabricate de Productos Climax, Spania; D-2026-11-19-07);
  - protecție la cădere: hamul Sokoi 14 FD1143, lonjele FD1532 (în Y, din chingă), FD1570, FD1575, FD1576 (frânghie
    Kernmantel de 12 mm, 1,80 m, diferă doar prin carabiniere);
  - combinezoane de protecție chimică: Chemstat MC3443, Chemtex MC3442, Chemical Bio MC3422, Virus 8500 MC3439,
    Virus 8700 MC3441 (de unică folosință, după fișe).
- Categorii noi: `protectia-respiratorie` (/produse/masti-de-protectie/), `protectie-cadere`
  (/produse/hamuri-de-siguranta/), `combinezoane` (/produse/combinezoane-de-protectie/).
- „Testare fără riscuri” nu se aplică nici acestor grupe, după logica din D-2026-11-19-06 (EIP de categoria III, nu se
  returnează după folosire); de confirmat de owner la aprobare. `tests/risk-free-scope.test.mjs` acoperă categoriile.
- Paginile de industrie: Construcții are hamuri și lonje, măști pentru praf; Producție are măști și filtre, combinezoane.
- Reguli de adevăr: fișa tehnică are prioritate față de pagina web (lonja FD1575 nu e „de poziționare”, ci EN 354;
  hamul FD1143 are centură în talie); nicio lonjă nu e descrisă ca oprind singură căderea; fără sfaturi de utilizare
  pe care sursa nu le dă.
- De cerut de la Sir Safety: instrucțiunile de utilizare pentru hamuri, lonje, măști și combinezoane (categoria III);
  la FA1441, care limită de utilizare e corectă („50 TLV” sau factorul de protecție operațional 30); dacă Virus 8500
  există și în mărimea S (pagina web spune S–3XL, fișa M–3XL); închiderea la Chemical Bio MC3422.

## D-2026-11-19-09
- Owner-ul (19.11.2026) a aprobat publicarea celor 13 produse din D-2026-11-19-08 și a confirmat că „Testare fără
  riscuri” nu se aplică la măști, filtre, hamuri, lonje și combinezoane.
- Catalogul are 48 de produse publicate; paginile noi de categorie: /produse/masti-de-protectie/,
  /produse/hamuri-de-siguranta/, /produse/combinezoane-de-protectie/.

## D-2026-11-19-10
- Context: owner-ul a dat acces la portalul B2B Sir Safety (b2b.sirsafety.com; credențialele în Keychain,
  `SIRSAFETY_B2B_USER` / `SIRSAFETY_B2B_PASSWORD`, doar local). Folosit doar în citire, în „Articoli”; fără prețuri,
  stocuri sau comenzi.
- Ce oferă: declarația de conformitate în română pentru orice produs (`export/getCD`, langID 51), generată la cerere,
  fără date de client; fișa tehnică în engleză/germană/franceză (`export/getDS`, langID 2/54/55), nu și în română;
  instrucțiunile de utilizare nu sunt în portal.
- Verificare pe toate cele 34 de produse Sir Safety, declarația față de certificările de pe site:
  - categoriile EIP corespund peste tot; viziera Speed FB1211 e EN ISO 16321-1 (pagina lor web spunea greșit EN 166);
  - Virus 8500 MC3439 există doar în M–3XL (pagina lor web spunea S–3XL);
  - Chemical Bio MC3422: declarația nu listează EN 13034 (tip 6B), deși fișa tehnică îl declară. Scos de pe site, cu o
    notă pe fișă care explică diferența;
  - mănușile Electro MA1814: declarația Secura (atașată) listează EN 60903 și EN ISO 21420, categoria III, certificat
    UE/1241/2026/1437 (CIOP-PIB, nr. 1437). Tensiunea de rezistență nu apare în declarație.
- Declarațiile lipsă (MC1111, MC1113, MC3012, MC3014) există în portal; găzduirea lor pe site e decizia owner-ului.

## D-2026-11-19-11
- Owner-ul (19.11.2026): declarațiile UE de conformitate în română din portalul B2B Sir Safety se pun pe fișele de
  produs, primele în lista de documente, lângă cele în engleză.
- `scripts/catalog/fetch_declarations_sirsafety.py` (prin `secret run`): login la portal, `export/getCD` cu limba 51,
  verifică PDF-ul (în română, numește articolul, fără date de client), reduce antetul la 150 dpi (544 → 110 KB, sub
  limita din pre-commit; textul și semnătura rămân) și scrie `public/documente/<slug>/declaratie-de-conformitate-ro.pdf`.
  `assemble_sirsafety.py` leagă fișierul când există.
- 30 din 34 de produse Sir Safety au declarația în română (3,3 MB în total), inclusiv MC1111, MC1113, MC3012 și MC3014,
  care nu aveau nicio declarație funcțională. Cele 4 fabricate de alții (MA1814, FB1215, FA1530, FA1535) au doar
  declarația de corespondență, în italiană, fără variantă în română.
- Documentul e cel generat de Sir Safety: unele diacritice lipsesc din fontul lor („DECLARAIE”). Nu le modificăm.
- `tests/local-documents.test.mjs`: fiecare document local există, e PDF, are sub 500 KB și e folosit de o fișă;
  `check-documents.mjs` verifică lunar și documentele locale.

## D-2026-11-20-01
- Owner-ul (20.11.2026): Portwest e furnizor actual, produsele lui trebuie importate în catalog. A dat acces la contul
  Portwest (logare cu numărul de cont; credențialele în Keychain, `PORTWEST_ACCOUNT` / `PORTWEST_PASSWORD`, doar local).
- Harta linkurilor de marketing: `catalog/sources/portwest.md`. Descărcare automată:
  `scripts/catalog/fetch_portwest.py` → `.catalog-work/portwest/` (ignorat de git).
- Ce avem: descrieri și caracteristici în română (~1.850 de modele), certificări (organism, număr de certificat,
  standarde), materiale și întreținere, coduri de bare, variante cu poze de 1100 px, plus pe fiecare model declarația UE
  de conformitate și fișa tehnică în română, publice pe documents.portwest.com.
- Pozele: condițiile Media Hub Portwest permit clienților folosirea materialelor doar pentru marketingul și vânzarea
  produselor Portwest. Le folosim doar pe fișele și paginile produselor Portwest.
- Documentele Portwest se găzduiesc local, nu se leagă direct: serverul lor întoarce uneori PDF-uri trunchiate.
- Prețurile contractuale, stocul și lichidările rămân în afara repo-ului (public); scriptul refuză acele adrese, iar din
  Daily Data păstrează doar coloanele de produs.

## D-2026-11-20-02
- Owner-ul (20.11.2026) a aprobat importul a 20 de modele Portwest: cele 9 vândute deja (SmartBill trece doar codul
  modelului: B1712B, FD25, FC32, FT46, FE05, BZ739, BZ444, S476, F476) și 11 noi, alese pe golurile catalogului, fără să
  concureze direct cu MASCOT și Sir Safety: reflectorizante în afară de geci (T501, T180, PW327), depozit frigorific
  (CS10, CS11, A751), mănuși pe tipuri de risc (A672 tăiere, A727 impact, A540 sudură, A812 chimice) și genunchiere (KP40).
- „Testare fără riscuri”: da la haine, încălțăminte, mănuși anti-tăiere, anti-impact și de frig, genunchiere; nu la
  echipamentul de sudură (BZ739, BZ444, A540) și la mănușile de protecție chimică (A812). Testul
  `tests/risk-free-scope.test.mjs` prinde un produs nou din aceste grupe fără `riskFreeTesting: false`.
- Sursa de adevăr: declarația UE de conformitate și fișa tehnică Portwest în română (documents.portwest.com),
  găzduite pe site. `assemble_portwest.py` oprește asamblarea dacă un standard din text nu e în declarație.
- Categoria EIP: toate declarațiile Portwest scriu „Cat. III”, și la genunchiere sau veste reflectorizante, dar doar
  A812 pomenește supravegherea producției de către un organism notificat (modulul D), obligatorie la categoria III. Pe
  site trecem categoria III doar unde declarația pomenește modulul C2/D. De întrebat Portwest.
- B1712B e fabricat de BASE Protection Srl (Italia), cu declarația semnată în numele Portwest: marca pe site e
  „Base Protection”, cu producătorul trecut pe fișă.
- Categorie nouă: „Genunchiere” (KP40).

## D-2026-11-20-03
- Owner-ul (20.11.2026) a cerut „colecția Office” MASCOT. În feed nu există o gamă cu numele ăsta: e FRONTLINE
  „Corporate Casual” (cămăși, pantaloni, pulovere) plus „M by Mascot” (pantofi business), 47 de modele.
- Cămășile se grupează pe linii, după material: o fișă = o linie, cu croielile (bărbați și damă) ca variante, fiecare cu
  codul ei MASCOT (aprobat de owner). Câmp nou în schemă: `variants` {title, items[{label, model, sizes, colours}]},
  completat de `assemble_mascot.py` din feed, pe fiecare cod. 7 fișe în loc de 17 modele:
  - Signature 22004 (+22104, 22204), Premium cu poliester reciclat 20104 (+20304, 20204, 20014, 20114),
    Premium din bumbac 21404 (+20504, 21204, 21314, 21214), Basic din poplin 21904 (+20604, 21804, 21914, 21814);
  - pantalonii de damă 20637 (perechea lui 20739), pantofii sport business F3003, puloverul 50636 (+50635, guler în V).
- F3003 nu e încălțăminte de protecție („Non-safety” în feed): categorie nouă, „Încălțăminte business”, și o notă pe
  fișă. Categorie cu pagină nouă: „Cămăși corporate” (/produse/camasi-corporate/).

## D-2026-11-20-04
- Uniformizarea designului (cerută de owner pe 20.11.2026), după stilul catalogului:
  - un singur antet de pagină (`PageHeader.astro`): breadcrumb, H1 ca în catalog, butoanele din `ui.ts`, fotografia în
    dreapta pe paginile de prezentare; fără spațiile duble de sub header pe formulare, confirmare și paginile legale;
  - containere `max-w-7xl px-4` peste tot (30 erau `px-6`); paginile legale și ghidurile cu coloana de text de ~70 de
    caractere, aliniată la stânga, cu breadcrumb;
  - scoase: animațiile AOS (196 de atribute, scriptul și pachetul npm), etichetele monospațiate în majuscule, cuvintele
    colorate din titluri, săgețile din butoane, emoji-urile din footer, cercurile blurate;
  - butoanele de pe homepage, Despre noi și Cum lucrăm la cele patru variante comune, cu înălțimea de 48 px;
  - „Discută cu un consultant” → „Programează o discuție” (același nume ca pagina și ca butonul din header);
  - personalizare: zonele de logo pe coloane (un model deschis nu mai întinde rândul), fără etichetele de deasupra titlurilor;
  - testare fără riscuri: ce intră în program e acum sus, sub primul paragraf.
- Homepage-ul (blocurile de CTA repetate, textul lung din hero) rămâne pentru faza de conversie: e mesaj, nu design.

## D-2026-11-20-05
- Faza finală (SEO, GEO, conversie), după auditul din 20.11.2026 (Search Console pe 90 de zile: 78 de clickuri, 73 pe
  numele firmei; căutările generice duc la homepage pe pozițiile 1–4, aproape fără clickuri, multe cu intenție locală
  „magazin…”). Owner-ul a aprobat tot:
  - homepage restructurat din 13 blocuri în 8 (hero scurt și concret, mărci, recenzii, categorii, „De ce You Protect” cu
    4 fapte și link spre dovadă, pași, ce include, un singur CTA, 6 întrebări frecvente generate dintr-o listă);
  - în hero: „Programează o discuție” + „Cere ofertă”; catalogul și calculatorul ca linkuri;
  - showroom-ul din Vetiș are cabină de probă (owner): în descrierea homepage-ului, în LocalBusiness (amenityFeature),
    pe pagina Satu Mare (secțiune cu adresă, program, telefon) și într-o întrebare frecventă;
  - pagina de logistică: H1 „Echipamente de protecție pentru depozite și logistică” și secțiunea „Depozit frigorific”
    (ColdStore CS10/CS11, Apacha A751);
  - produsele demo vechi (Directus) redirecționează la categoria cea mai apropiată, nu la catalog.
- Nu scriem că showroom-ul primește fără programare și nici că toate produsele sunt expuse: nu avem confirmarea.

## D-2026-11-20-06
- Owner-ul (20.11.2026) a aprobat pașii 9–13 din lista „ce a mai rămas”:
  - formularul „Programează o discuție”: din 7 pași în 4 (rol, câți colegi, domeniu, contact); cele trei întrebări de
    sondaj (q4–q6) au fost înlocuite cu un câmp opțional „Despre ce vrei să vorbim?”, trimis ca `detalii` (CRM-ul
    Prospector a confirmat că nu depinde de q4–q6 și afișează `detalii`);
  - footer: textul „Furnizor… premium… investiție de imagine” înlocuit cu mesajul nou (costul real, showroom, livrare);
  - pagină de categorie nouă: /produse/bluze-si-hanorace-de-lucru/;
  - ghid nou: /ghiduri/haine-de-lucru-care-rezista/ (EN ISO 15797, categoriile de întreținere MASCOT, CORDURA,
    OEKO-TEX, EN ISO 13688, HG nr. 1.048/2006), cu modelele din catalog generate din fișe;
  - scene ilustrative generate cu OpenAI gpt-image-2 pentru Construcții, Logistică, Producție și Personalizare
    (`scripts/images/generate-scenes.mjs`): fără logo-uri sau texte reale, echipament purtat corect, imagini decorative
    (alt=""), niciodată prezentate ca echipa sau clienții You Protect.

## D-2026-11-20-07
- Owner-ul (20.11.2026): aspect mai premium, efecte 3D la carduri, atenție la detalii pe telefon.
  - Cardurile (produs, categorie, „De ce You Protect”) se înclină spre cursor cu un reflex de lumină și poza ridicată;
    pe telefon se apasă la atingere; fără efect cu „reduce motion”. Suprafețe ridicate (`yp-surface`, `shadow-card`),
    poze pe fond gri cald (`.img-well`, multiply), colțuri de 12 px la carduri și 8 px la butoane.
  - Telefon: țintele de atingere sub 44 px reduse de la 16–41 la 0–3 pe pagină (cardurile, breadcrumb-ul, footer-ul,
    chips-urile, punctele caruselului, selectorul de ordonare); titlul din hero mai compact; butonul plutitor apare
    abia după hero; numele de produs pe 4 rânduri și marca jos (nu se mai taie); logo-urile pe un rând; footer pe
    două coloane; secțiuni mai strânse.
  - Antet translucid cu blur; butoane cu efect de apăsare.

## D-2026-11-20-08
- Auditul calculatorului de cost (20.11.2026): aritmetica era corectă și aceeași pe pagină și pe server, dar modelul
  greșea la coșuri mixte. Avea o singură frecvență de înlocuire pentru toate categoriile, între 3 și 12 luni (mănușile
  „la 6 luni” = 2 perechi pe an de om), o singură bucată pe om și spunea că pragul „nu depinde de nicio presupunere”,
  deși includea ipoteza că timpul de administrare scade odată cu înlocuirile. Bug-uri: un preț gol apărea 0 pe ecran,
  dar calculul folosea 1 leu; virgula nu era acceptată; „1.3333333333333333 pe an” la 9 luni.
- Owner-ul a aprobat refacerea și durabilitatea implicită 1 (durează la fel: rezultat neutru până alege vizitatorul):
  - pe fiecare categorie: bucăți pe om și frecvența de înlocuire, de la o săptămână la 3 ani;
  - rezultatul principal e pragul din prețuri (fără ipoteze); pragul cu administrarea apare separat, numit ipoteză;
  - prețurile se validează (1–5.000 de lei, cu mesaj), acceptă virgula; zecimalele în română;
  - `tests/tco.test.mjs` cu valori calculate de mână; formatul vechi al cererilor (o singură frecvență) e acceptat.
- Rezumatul pentru CRM: `calc_categorii` include bucățile și frecvența pe categorie, `calc_inlocuire` dispare,
  `calc_prag` = pragul din prețuri, `calc_prag_admin` nou.

## D-2026-11-20-09
- Owner-ul (20.11.2026): fluiditate ca la Apple. Nu există un skill oficial Apple; am instalat (copiat, fără `npx`)
  `apple-design` și `review-animations` din emilkowalski/skills (MIT, făcute pentru web, după prezentările WWDC
  „Designing Fluid Interfaces”), după ce le-am citit integral.
- Aplicat: tranziții între pagini (fade + poza produsului din card în fișă și înapoi, prin View Transitions; merg în
  Chrome, Edge, Safari 18.2+, iar în rest navigarea rămâne normală), preîncărcarea paginii la hover, curbe și durate
  comune, meniul mobil și pașii formularului animate pe același drum, fade la schimbarea pozei din galerie, `:active`
  pe iPhone, header solid pentru „reduce transparency”, litere strânse la titluri. Scoase: `transition-all`,
  zoom-urile lente la hover (0,7–1 s) pe poze neclicabile, logo-ul care creștea, colțurile decorative care se umflau,
  clasele `animate-in` moarte (pluginul lor nu era instalat).
- Respins: secțiunile fixate la derulare și animațiile la scroll de pe apple.com (încetinesc un cumpărător care caută
  un produs anume; sunt ce am scos odată cu AOS) și o bibliotecă de animații „spring” (site-ul nu are gesturi de tras).

## D-2026-11-20-10
- Owner-ul (20.11.2026, după PR #76): pe telefon restul paginilor încă par statice. Pe telefon nu există hover, deci
  efectele 3D nu se văd. Revizuim regula „fără animații la derulare” din D-2026-11-20-09: rămân interzise animațiile
  declanșate cu cronometru (AOS), dar adăugăm mișcare legată de poziția paginii (scroll-driven animations, Chrome,
  Edge, Safari 26+): poza din hero în paralaxă și textul care se stinge sub header, pozele care se așază, linia pașilor
  care se trage, bifele pe rând, blocul galben care se lărgește până la margini, cardurile care urcă (doar pe ecranele
  tactile). Fără efect cu „reduce motion” sau în browserele fără suport.
- Bug prins la build: minificatorul CSS lipea `animation-timeline` în prescurtarea `animation`, iar browserul arunca
  regula fără eroare; test nou `tests/scroll-animations.test.mjs`.

## D-2026-11-20-11
- Auditul din 20.11.2026, pasul 1 (securitate și date), aprobat de owner:
  - `/api/submit-lead` acceptă doar cereri cu Origin = site-ul (browserul îl trimite la orice POST cu fetch), ignoră
    cererile cu câmpul-capcană `adresa_web` completat (răspunde „succes”, nu salvează, nu trimite email) și salvează
    cel mult 5 cereri pe oră de la același IP (numărate în tabelul `lead`, fără schemă nouă în D1). Răspunsul de
    eroare nu mai spune ce a căzut (`stage` scos).
  - Ștergerea cererilor preluate de CRM după 30 de zile compară acum date ISO (înainte, în ziua limită „T” > „ ”
    amâna ștergerea cu până la o zi) și rulează la fiecare preluare (GET, la 5 minute), nu doar la confirmări.
    Cererile nepreluate rămân până le ia CRM-ul.
  - `youprotect-website.pages.dev` (aliasul de producție Cloudflare) e „production”, ca cererile de acolo să ajungă
    în CRM; preview-urile rămân „preview”. Contractul cu CRM-ul nu se schimbă.
  - `public/_headers`: HSTS (1 an, fără subdomenii), X-Frame-Options DENY, CSP cu sursele externe folosite
    (Google Analytics, Cloudflare Web Analytics, Cal.com) și `frame-ancestors 'none'`, Permissions-Policy, COOP;
    adresele *.pages.dev primesc `X-Robots-Tag: noindex`. CSP-ul cu hash-uri (fără 'unsafe-inline') e pasul următor.
- Rămân la owner (setări Cloudflare): baza D1 separată pentru preview și scoaterea CRM_SYNC_TOKEN din mediul Preview;
  Turnstile, dacă apar cereri-spam care trec de filtrele de mai sus.

## D-2026-11-20-12
- Auditul din 20.11.2026, pasul 2 (bug-uri văzute de vizitatori), aprobat de owner:
  - Căutarea din catalog ignoră diacriticele și semnele („caciula”, „MASCOT® 21404”) și caută toate cuvintele, în
    orice ordine („geaca mascot”); include și codul modelului. `src/lib/search.js` + copia din scriptul inline,
    ținute identice de `tests/search.test.mjs`.
  - Calculatorul păstrează banii la prețuri (2 zecimale, minimum 0,01 lei): mănușile de 4,50 lei nu mai devin 5.
  - Formularul: „Scoate” (produsul) duce înapoi la „Ce produse ai în vedere?” dacă vizitatorul trecuse de ea;
    „Scoate” (categoria) scoate și bifa pusă de ea; „Altceva” debifat nu mai trimite textul scris la el.
  - Aceeași regulă de email în pagină și pe server (`src/lib/lead-limits.js`); refuzurile serverului (date invalide,
    prea multe cereri) apar vizitatorului cu mesajul lor, nu cu „încearcă din nou”.
  - Erorile: focus pe primul câmp greșit la contact, `role="alert"` la întrebări.
  - Câmpurile au 16 px pe telefon (Safari nu mai mărește pagina la atingere).
  - Retragerea acordului oprește complet Google Analytics (`ga-disable-<id>`), nu doar cookie-urile.
  - Meniul marchează pagina curentă (și pe /despre-noi/, /cum-lucram/), cu `aria-current`; linkurile de 36–40 px
    au acum 44.

## D-2026-11-20-13
- Auditul din 20.11.2026, pasul 3 (curățenie în cod), aprobat de owner:
  - Semgrep: regulile `d1-sql-injection-from-request` (surse Workers: request.json(), headers.get(), searchParams,
    context.params) și `d1-dynamic-sql` (SQL D1 construit cu template sau concatenare), cu teste în
    `.semgrep/shift-left.js`; regula de comenzi nu mai confundă `env.LEADS_DB.exec` cu child_process.
  - CI: `npm run check` (`astro check`, TypeScript) înainte de build; proiectul are 0 erori.
  - Șterse: cele 501 cadre 360° (5,9 MB; viewer-ul e doar idee, I-2026-11-11-01 — `fetch_images_mascot.py --spin` le
    aduce înapoi), 3 logo-uri goale + `logo-yp.jpg`, `serve.mjs`, `bookingsUrl`, `brandPageFor`, ascultătorul
    `astro:page-load`; `.DS_Store` ignorat.
  - `/preview/produse/` (aprobarea fișelor în lucru) nu se mai construiește pe youprotect.ro (`CF_PAGES_BRANCH=main`),
    doar pe preview-uri și local.
  - Paritate (`tests/lead-parity.test.mjs`): întrebările formularului vin din `src/lib/lead-questions.js` (și pentru
    server), harta categoriilor din `quote-categories.js`, cheile sessionStorage din `src/lib/session-keys.js`, linkul
    WhatsApp pentru echipe mici din `whatsapp.ts`, JSON-LD doar prin `jsonLd()`. Limitele calculatorului = capetele
    sliderelor (200 de angajați, 40 de ore, 150 lei/oră; serverul accepta 500/80/300).

## D-2026-11-20-14
- Lista de ofertă pentru mai multe produse (funcția propusă în auditul din 20.11.2026, aprobată de owner: „Da, le
  facem”):
  - „Adaugă la ofertă” pe cardurile din catalog (în locul linkului „Cere ofertă”) și pe fișa produsului (lângă
    „Cere ofertă”; „Programează o discuție” a devenit link sub butoane). Al doilea tap scoate produsul.
  - Antetul arată „Lista de ofertă” cu numărul de produse doar când lista are ceva; duce la `/cere-oferta/`.
    Confirmarea apare sub antet (nu jos: acolo stă bannerul de cookie-uri și butonul WhatsApp), cu „Vezi lista”.
  - Formularul arată produsele (cel de pe fișa de unde vii, apoi lista), fiecare cu „Scoate”, și sare peste „Ce produse
    ai în vedere?”. După trimitere, lista se golește.
  - Lista stă doar în browser (localStorage `yp_quote_list`, cel mult 15 produse, expiră după 30 de zile fără
    schimbări). Politica de cookies o descrie; fiind cerută de vizitator, nu cere acord.
  - Serverul primește `produse` (slug-uri). `product` rămâne primul produs; de la două produse în sus pleacă și
    răspunsul `produse` („Produse din lista de ofertă”, adresele paginilor, câte una pe rând, ≤ 2000 de caractere).
    Încape în importul Prospector fără schimbări (cheie ≤ 40, răspuns ≤ 2000); projects-f7 a fost anunțat. Emailul
    listează produsele câte unul pe rând. Paginile vechi din cache trimit în continuare `produs`.
  - Fără cantități pe produs: rămân în „Cantități, mărimi, coduri” (decizia din 18.11.2026, fără câmpuri noi).
- Scripturile de pe fiecare pagină (BaseLayout, Header, Footer, Analytics) stau în pagină, nu în fișiere separate:
  - Cauza găsită: un script extern se descarcă după HTML și rula în timpul tranziției dintre pagini, iar Chrome o
    sărea (poza nu mai trecea din card în fișă). Măsurat cu rețea încetinită: 8 tranziții sărite din 16 cu scriptul
    din BaseLayout ca fișier separat, 0 din 28 cu el în pagină, 0 din 16 pe versiunea de dinainte. Tot asta era și
    problema scriptului de statistici din PR #80. Preîncărcarea (`modulepreload`) doar reducea rata, așa că n-a rămas.
  - `astro.config.mjs` (`inlineLayoutScripts`) le ține în pagină peste limita de 4 KB, iar
    `scripts/check-inline-scripts.mjs` pică în CI dacă o pagină încarcă alt script extern decât prefetch-ul Astro și
    calendarul de pe /confirmare/. Un script de pe toate paginile nu are voie să importe un modul folosit și de alt
    script (de aceea `src/lib/quote-list.js` nu importă nimic, iar formularul folosește lista prin
    `window.ypQuoteList`).

## D-2026-11-21-01
- Lista de ofertă (D-2026-11-20-14) e publicată pe 21.11.2026, după aprobarea owner-ului pe preview („Îmi place”).
  Verificat pe producție, pe telefon și desktop: adăugarea, numărul din antet, formularul cu cele două produse.
  projects-f7 a făcut linkurile din răspunsul `produse` clicabile în CRM. Testul cap-coadă l-a făcut tot projects-f7,
  cu acordul owner-ului: o cerere cu 3 produse de pe preview, importată printr-o rulare manuală a sincronizării cu
  cererile de preview (cea obișnuită le ignoră). „produse” a ajuns primul, cu linkuri; cererea e marcată „Ignorată”.
- Pagina de Contact (`/contact/`, a doua funcție din auditul din 20.11.2026) și „Contact” în meniu și în footer:
  - Conținut: telefonul, WhatsApp-ul și emailul (tot rândul e link), showroom-ul cu adresa, programul și indicații
    (Google Maps, Waze), drumul spre cele două formulare și datele firmei (denumire, CUI, Nr. Reg. Com., EUID).
    Datele vin din `SITE` (`src/lib/site.ts`); adresa de sediu din Registrul Comerțului nu apare până nu e actualizată.
  - Fără formular nou (cererile intră tot prin `/cere-oferta/` și `/programeaza-discutie/`, cu același format în CRM)
    și fără hartă încorporată (iframe-ul Google Maps pune cookie-uri fără acord și cere excepții în CSP).
  - `/contact` trimitea de la mutarea de pe Wix (OPS-004) spre `/programeaza-discutie/`, și în `public/_redirects`, și în
    Worker-ul `www-redirect`. Regula s-a scos din ambele. Codul Worker-ului, care stătea doar în Cloudflare, e acum în
    `workers/www-redirect/` (țintele au „/” la final, deci un singur salt), iar testele verifică că o regulă de
    redirect nu ascunde o pagină și că Worker-ul spune același lucru ca `_redirects`.
  - Antetul: meniul întreg apare de la 1024 px. Pe tabletă (768 px) logo-ul, linkurile și butonul treceau pe două
    rânduri deja cu patru linkuri; tableta are acum meniul de pe telefon.

## D-2026-11-21-02
- Tranzițiile dintre pagini se testează în Google Chrome (Playwright `channel: 'chrome'`), nu în browserul implicit al
  Playwright (`chrome-headless-shell`).
  - Măsurat pe 21.11.2026, Catalog → „Despre noi” din meniu, pe preview-ul Cloudflare: `chrome-headless-shell` sare
    tranziția în 7 din 14 și 11 din 25 de navigări; Google Chrome 155 în 0 din 15 fără fereastră și 0 din 15 cu
    fereastră. Local (fără Cloudflare), `chrome-headless-shell` nu sare niciuna (0 din 15), nici cu antetele din
    `_headers`, nici cu 150 ms întârziere la HTML.
  - Tranziția se pierde în pagina nouă, înainte de `pagereveal` (pagina veche o pornește în `pageswap`). Beacon-ul
    Cloudflare Web Analytics nu e cauza: blocat, 9 din 25 față de 11 din 25.
  - Măsurătorile din D-2026-11-20-14 (scripturile din pagină) au fost făcute cu `chrome-headless-shell`. Regula
    rămâne (nu costă nimic: scripturile comune nu mai așteaptă un fișier separat), dar o tranziție sărită în testele de acolo
    nu înseamnă neapărat o problemă pentru vizitatori.

## D-2026-11-21-03
- Termenul pentru ofertă: 24 de ore peste tot (înainte scria 48, fără confirmare documentată). Owner, 21.11.2026: după
  ce există modulul de ofertare din Prospector, devine 15 minute. Textul stă într-un singur loc, `RESPONSE_TIME` din
  `src/lib/site.ts` (formularul, calculatorul, `/confirmare/`, descrierea din Google a paginii `/cere-oferta/`).
- Numărul de produse sau de modele nu apare nicăieri pe site (owner, 21.11.2026: un număr mic face catalogul să pară
  sărac): descrierile din Google ale categoriilor și mărcilor, dalele de categorie, antetul catalogului, filtrele,
  paginile de categorie și de marcă, ghidurile, schema `ItemList`. Deasupra listei din catalog apare filtrul ales
  („Toate produsele”, „Încălțăminte de protecție, MASCOT”). Excepții: lista de ofertă a vizitatorului („Ai 3 produse
  în listă”, limita de 15) și pagina internă `/preview/produse/`. `tests/site-promises.test.mjs` verifică ambele reguli.
- Descrierea din Google a paginii „Despre noi”, din cuvintele paginii: „You Protect, din Satu Mare, alege consultativ
  echipamente de protecție și haine de lucru pentru firme. Felul în care îți echipezi oamenii arată cât îi respecți.”

## D-2026-11-23-01
- Textele site-ului le scrie agentul nostru; copywriterul extern intervine doar dacă rezultatul nu e bun (owner,
  23.11.2026).
- Criteriul de calitate: textul răspunde întrebărilor din capul cititorului (de ce să citesc, ce poți face pentru mine,
  de ce să te cred, ce fac acum), nu gustului autorului.
- Ghidul `08-GHID_CONTINUT.md` primește §0 (pentru cine scriem) și §7 (rețete pe tip de secțiune). Formula în trei
  straturi rămâne doar pentru fișele de produs; Despre noi, beneficiile, procesul și CTA-ul au fiecare rețeta lor.
- Impact: rescrierea pagină cu pagină nu mai așteaptă textele copywriterului.
