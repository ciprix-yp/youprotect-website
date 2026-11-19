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
