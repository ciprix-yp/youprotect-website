# Session Handoff

## Stare la 25.11.2026 (citește întâi)

**Live** (PR #81–87, fiecare cu toate verificările verzi):
- Lista de ofertă cu mai multe produse și pagina `/contact/`, cu „Contact” în meniu (CONV-004, D-2026-11-21-01).
  Meniul întreg apare de la 1024 px (`lg`); sub această lățime, inclusiv pe tabletă, se folosește meniul de pe telefon.
- Worker-ul `www-redirect` are codul în `workers/www-redirect/` și se publică cu `wrangler deploy` din acel folder.
  `tests/www-redirect.test.mjs` verifică faptul că redirecționările din Worker și din `public/_redirects` coincid.
- Oferta „în cel mult 24 de ore” vine din `RESPONSE_TIME` (`src/lib/site.ts`). Pe site nu apare niciun număr de
  produse (D-2026-11-21-03); `tests/site-promises.test.mjs` verifică ambele reguli.
- Harta cuvintelor-cheie `09-HARTA-CUVINTE-CHEIE.md` și homepage-ul rescris după ea (D-2026-11-21-04).

**Cum scriem textele** (D-2026-11-23-01):
- Textele le scrie agentul; copywriterul extern intervine doar dacă rezultatul nu e bun.
- Sursele sunt `08-GHID_CONTINUT.md` (§0 întrebările cititorului, §3 regulile de adevăr, §7 rețetele pe tip de
  secțiune) și harta din `09`.
- Recenziile reale de pe homepage arată limbajul clienților; nu se rescriu.
- Fiecare pagină are PR-ul ei, cu link de preview; owner-ul o aprobă pe iPhone.

**Urmează** (detaliile sunt în SEO-003, `02-BACKLOG.md`):
1. Rescrierea pe pagini e gata, toate paginile sunt live (PR #90–#124, ultima `/cum-lucram/` pe 27.11.2026).
   Sursele din ghiduri le verifică lunar `scripts/seo/check-sources.mjs`. Rămân punctele din auditul de încărcare
   cognitivă (sesiunea 44, PR #126), aplicate doar pe măsură ce le aprobă owner-ul. CAT-004 (catalogul interactiv)
   nu mai așteaptă după texte; owner-ul alege varianta.
2. 03.12.2026: verificarea indexării fișelor de produs. Claude Desktop le cere zilnic până pe 02.12.
3. Începutul lui decembrie: clicurile pe căutările generale și măsurătoarea ChatGPT.
4. 18.12.2026: expiră suprimarea alertei picomatch (GHSA-fc5q-39xc-vjpf) din `osv-scanner.toml`. Dacă există între timp
   o versiune reparată, se actualizează dependența; dacă nu, se reevaluează suprimarea. Rulează doar la build, din
   dependențele Tailwind 3.

**La owner** (nu se pot face din cod):
- ID-ul corect de Google Analytics 4: `G-TV8YEFYQD5` din `src/lib/site.ts` răspunde cu 404.
- Golirea cache-ului Cloudflare pentru `/preview/produse/`.
- Scoaterea `CRM_SYNC_TOKEN` din mediul Preview din Cloudflare Pages și o bază D1 separată pentru preview.
- Trei decizii:
  - dacă roboții AI au voie să citească site-ul;
  - dacă repo-ul devine privat;
  - dacă formularele primesc Cloudflare Turnstile.

**Deschis pe GitHub:** PR #88 (Dependabot, TypeScript 6 → 7). E o versiune majoră; build-ul și testele trebuie
verificate înainte de merge.

**Testare:**
- Tranzițiile între pagini se testează în Google Chrome (Playwright `channel: 'chrome'`), nu în
  `chrome-headless-shell` (D-2026-11-21-02).
- Formularele se testează doar pe preview. Testele cap-coadă cu CRM-ul le face sesiunea CRM (projects-f7), cu
  acordul lui Ciprian.
- Search Console: `secret run youprotect-website -- node scripts/seo/gsc.mjs …`. Inspecția durează cam 5 s pe adresă;
  datele nu intră în repo.

## Sesiunea 2026-11-26: poze reale în acțiune (PR #93)

- PR #93 (`feat/poze-actiune`, D-2026-11-26-02): 19 poze reale cu oameni în acțiune (MASCOT, Portwest, Sir Safety) pe
  site, prin `ActionPhoto` și `src/data/poze-actiune.json`; pozele generate cu AI de pe /cum-lucram/ sunt înlocuite.
  Live în preview-ul PR-ului, nu în `main`. Regulile sunt în `08-GHID_CONTINUT.md` §9.
- Urmează: aprobarea lui Ciprian pe iPhone, apoi merge după OK. PR-uri separate, după acesta: cardurile de catalog pe
  model.
- Făcut în PR #104 (`feat/design-mobil-2`, înlocuiește #102, D-2026-11-26-03): antetul cu poza deasupra titlului pe
  telefon, grila întâi pe categorie și pe brand, /despre-noi/ cu portretul Alexandrei Pop, poza nouă de pe homepage
  (S02, din constanta `heroPhoto`), titlurile pașilor de pe /cum-lucram/ într-o singură culoare, recenziile fără
  autoplay. Rămâne pentru un PR următor: selecția rotativă a eroului homepage-ului (doar pregătită); verificarea pe
  iPhone real a fonturilor de rezervă.

## Sesiunea 2026-11-17: cererile pe D1, baza Railway retrasă

- Cererile de pe site: D1 `youprotect-leads` + email Resend + Prospector CRM (job la 5 minute pe M1). Totul e verificat cap-coadă, vezi OPS-006. Testele de formular: doar pe preview, fără CUI, cu acordul lui Ciprian (`01-RUNBOOK.md`, pasul 6).
- Baza veche de pe Railway e copiată, verificată și ștearsă, la fel și Hyperdrive și `DATABASE_URL` (D-2026-11-17-01). Site-ul nu mai depinde de Railway.
- Copia criptată din OneDrive („Backup baze de date”) se păstrează: e singura sursă pentru datele nemigrate.
- Sesiunea 2026-11-16 de mai jos e istorică: PR-urile ei sunt integrate, iar Hyperdrive nu mai există.

## Sesiunea 2026-11-16: Astro 7, reparații, catalog extins

- Lanț de PR-uri (fiecare peste cel anterior): #10 pilot catalog → #11 Astro 7 (`feature/astro-7`) → #12 reparații (`feature/launch-fixes`) → #13 catalog extins (`feature/catalog-sirsafety`). Merge în ordine, doar cu verificările verzi.
- Verificări: pe #12 toate verzi (inclusiv `semgrep`, deci SEC-001 e rezolvat în cod).
- Merge în `main` așteaptă deciziile lui Ciprian:
  1. lead de test pe preview (Hyperdrive scrie în DB-ul de producție);
  2. CUI-ul corect (DATA-001);
  3. citirea paginilor legale (LEGAL-001);
  4. aprobarea celor 21 de fișe noi și acordul Sir Safety pentru poze (CAT-003).
- Node: `.node-version` + `.mise.toml` = 22.23.4 (Astro 7 o cere). `astro preview` pornește acum în fundal; oprire cu `npx astro preview stop`.
- Catalog: 26 de produse (5 publicate, 21 în `review`, vizibile în `/preview/produse/`). Publicare: `status: "published"` în `catalog/texts/<furnizor>/<cod>.json`, apoi asamblarea:
  - MASCOT: `python3 -I scripts/catalog/assemble_mascot.py .catalog-work/mascot catalog/texts/mascot catalog/maps/mascot-ro.json src/content/products --no-network`
  - Sir Safety: `python3 -I scripts/catalog/assemble_sirsafety.py .catalog-work/sirsafety catalog/texts/sirsafety catalog/maps/sirsafety-ro.json src/content/products`
  - După asamblare (de la 18.11.2026): `npm run catalog:cards` face miniatura de 600 px pentru cardul din catalog. `npm test` pică dacă un produs publicat nu o are.
- Sir Safety, de la zero: `uv run --no-project --with pypdf python -I scripts/catalog/extract_sirsafety.py .catalog-work/sirsafety <COD…>`, apoi texte în `catalog/texts/sirsafety/`, apoi `fetch_images_sirsafety.py` (cu pillow), apoi asamblarea.
- Teste formular: doar în browser, cu `/api/` blocat. `qc:smoke` și `/api/leads` au fost scoase.

## Sesiunea 2026-11-11: pilot catalog

- Branch: `feature/catalog-pilot-mascot` (PR #10). `main` e protejat de ruleset-ul „main: security gates”; merge doar cu toate verificările verzi.
- Livrat pe branch: pilot 5 produse MASCOT, flux catalog în `scripts/catalog/`, texte în `catalog/texts/`, ghid `08-GHID_CONTINUT.md`, previzualizare `/preview/produse/`.
- Rulare: `python3 -I scripts/catalog/extract_mascot.py <feed.xlsx> .catalog-work/mascot <modele…> --colours <comenzi.csv>`, apoi `python3 -I scripts/catalog/assemble_mascot.py .catalog-work/mascot catalog/texts/mascot catalog/maps/mascot-ro.json src/content/products`, apoi `npm run build`.
- Imagini (după extragere): `uv run --no-project --with pillow python -I scripts/catalog/fetch_images_mascot.py .catalog-work/mascot catalog/texts/mascot .catalog-work/images/mascot public/images/products`, apoi din nou asamblarea. Originalele rămân în `.catalog-work/images/` (local).
- Feed-urile furnizorilor stau în afara repo-ului (`~/Projects/postgres-railway-projects/Liste Preturi/`); `.catalog-work/` e ignorat de git. Repo-ul e public: fără prețuri și fără date de vânzări în repo.
- Făcut: CAT-001 (`/produse` pe colecție, Directus scos, 404, redirecturi) și CAT-002 (imagini). Verificat pe staging.
- Urmează: SEC-002 (upgrade Astro), SEC-001 (TLS în `functions/api/leads.js` și `submit-lead.js`), apoi merge PR #10. Opțional: viewer 360° (I-2026-11-11-01). Blocat: CAT-003 (date Sir Safety).
- GitHub: PR #10 (draft), branch `staging` → https://staging.youprotect-website.pages.dev, `STAGING_URL` setat, ruleset „main: security gates” activ (main blocat până la SEC-001 + SEC-002).
- Node: build-ul a rulat cu Node 22 (`mise exec node@22.23.4 -- npm run build`); proiectul nu are încă `.mise.toml`.

## Istoric: starea din iunie 2026

Secțiunile de mai jos, până la checklist, descriu starea din iunie 2026. WP-005 și WP-006 (Directus) au fost depășite:
catalogul stă acum în fișiere (CAT-001), iar baza Railway a fost ștearsă (D-2026-11-17-01).

- Data: `2026-06-24`
- Status global: SEO/domeniu canonic + audit SEO/GEO livrate (4 PR-uri merged, live). Git→Cloudflare auto-deploy confirmat funcțional. `WP-005_IN_PROGRESS` rămâne deschis.

## Ce este finalizat

- DB live auditată și aliniată cu flow-ul website conversion.
- Migrații aplicate:
  - `20260224_create_website_conversion_core.sql`
  - `20260224_set_website_lead_score_thresholds.sql`
- Documentație sincronizată (`MASTER_SPEC`, `DATABASE_DOCUMENTATION`, `railway_erd`, integration map).
- PM local adăugat (`PROJECT_OS/pm/pm`) cu flow: `next -> implement -> review -> close`.
- Reviewer gate adăugat (`PROJECT_OS/pm/REVIEWER_RULES.md`) pentru verificare înainte de `DONE`.
- Deploy flow iterativ adăugat: script local `release:iteration` + CI build workflow.
- Deploy flow simplificat: Cloudflare Git integration este canalul principal (push => deploy).
- Protocol anti-deturnare activ: sugestiile ad-hoc intră în `07-IDEA_INBOX.md` și se execută doar când sunt mapate la task.

## Ce urmează imediat

1. **WP-006**: Setup MVP Directus (`accomplished-forgiveness`) + Postgres + Astro pentru un catalog pro (max 100-2000 produse active). Trebuie creat stratul curat din DB ținând cont de vasta rețea de prețuri/poze a furnizorilor.
2. **WP-005**: Finalizare pass content premium (adaptat la direcția noului catalog administrat din CMS).
3. Pregătire S2: automatizare ofertare + follow-up (n8n).

## Blocaje active

- Nu avem încă conținut final (copy + imagini) pentru toate paginile.
- `producatori` nepopulat (non-blocking MVP, dar necesar pentru filtrare avansată).
- Variabilele de mediu pentru URL-ul Microsoft Bookings nu sunt încă setate (`PUBLIC_MICROSOFT_BOOKINGS_URL` / `MICROSOFT_BOOKINGS_URL`), deci redirect-ul Bookings nu e activ live.

## Rezolvat în sesiunea curentă

- Iterații catalog UX/comercial livrate și puse live pe Cloudflare:
  - `2889de9`: galerie produs + mărimi + culori din DB.
  - `18dd9ed`: normalizare structură catalog, reducere CTA overload, nav `Catalog`.
  - `21fb809`: filtre comerciale combinate + pass copy premium.
  - `07c3021`: sortare (`Relevanta`, `Noutati`, `A-Z`) + card polish enterprise.
- Sticky mobile shortlist bar implementat pe `/produse/` (activ doar cu selecție > 0) pentru acces rapid la:
  - `Cere oferta`
  - `Discuta`
- Quality gate repetat după fiecare iterație:
  - `npm run build` = PASS
  - `npm run qc:smoke` = PASS
- PM orchestration:
  - `pm start WP-005` executat, status task setat `IN_PROGRESS`.
  - `07-IDEA_INBOX` actualizat (idei catalog marcate `IMPLEMENTED`/`TRIAGED`).
  - `03-DECISIONS_LOG` actualizat cu deciziile de IA catalog + sticky mobile + sortare.

- `WP-003` implementat și închis (`DONE`).
- Endpoint `POST /api/leads` extins pentru persistare completă în `website_lead_context`:
  - `answers_json`
  - `pain_points`
  - `desired_outcomes`
  - `needs_summary`
  - `qualification_score` (calcul server-side)
  - `payment_method` (pentru `view_samples`)
  - `company_size_hint`, `urgency_hint`
- Validări server-side adăugate pentru toate răspunsurile obligatorii din wizard și pentru metoda de plată pe fluxul `view_samples`.
- `qualification_label` se obține automat prin trigger DB (`low`, `medium`, `high`) pe pragurile active `0-50`, `50-75`, `75-100`.
- Validare live API (production) după push:
  - `POST /api/leads` (`view_samples`) -> `200`, `lead_request_id=8`, `qualification_score=98.00`, `qualification_label=high`
  - `POST /api/leads` (`book_call`) -> `200`, `lead_request_id=9`, `qualification_score=51.00`, `qualification_label=medium`
- `WP-004` implementat și închis (`DONE`).
- `POST /api/leads` upsert-ează acum `website_lead_pipeline` + log în `website_lead_events`.
- Reguli pipeline active:
  - `view_samples` -> `offer_in_progress`
  - `book_call` fără confirmare slot -> `intake_new` + `booking_reference=pending_lead_<id>`
  - `book_call` cu payload booking -> `book_call_scheduled`
- Validare live API (production) după deploy:
  - `view_samples` -> `pipeline_stage=offer_in_progress`
  - `book_call` pending -> `pipeline_stage=intake_new`, `booking_reference=pending_lead_16`
  - `book_call` cu `booking_reference` + `booking_slot_at` -> `pipeline_stage=book_call_scheduled`

## Rezolvat în sesiunea de Design/Audit Vizual (Mar 2026)

- Validare direcție premium B2B UI/UX pe paginile `/despre-noi` și `/cum-lucram` prin eliminarea cardurilor statice închise (`design fără cutii`).
- Generare și implementare active (imagini AI la comandă) integrate cu designul natural pentru procesul de Vânzări / Consultanță / Stoc.
- Integrare portret oficial Founder pe `despre-noi`.
- Înlocuire componentelor placeholder text cu logo-ul grafic oficial YP editat la pixel-perfect transparent (cu script Python `Pillow`), inclusiv Favicon activat pe tab.
- Unificare componentă Hero pe paginile interioare (`GlobalInnerHero.astro`) - ajustare brightness și opacități fără filtre `grayscale` agresive (pentru păstrarea impactului high-vis orange & graphite).
- Pregătire teren tehnic de performanță: build-uri compilate (`npm run build`) fără erori pe Cloudflare.
- PM orchestration: Suntem poziționați conform backlog-ului pentru `WP-005`.

## Rezolvat în sesiunea de Dezvoltare Marketing / Lead Gen (Apr 2026)

- S-a creat Landing Page-ul independent **TCO Calculator** (`/lp/tco-calculator`), izolat the structura de bază și exclusiv accesibil prin link direct (`noindex` activ).
- S-a conceput `LandingLayout.astro` special pentru eficiență Lead Generation, fiind lăsat complet fără `<Header>` și `<Footer>`.
- S-a dezvoltat un instrument matematic complex în `TCOCalculator.tsx` (calculând *Basic TCO*, *Premium Benchmark ROI 3 Ani*, și *Cost Per Wear/zi* derivat direct din frecvențele de rotație).
- Sistemul React este complet intergrat într-un webhook pregătit pentru n8n, care grupează datele și clasifică pain point-urile de HR și de Uzură.
- S-a implementat și ajustat graficul vizual diferențial în CSS (`BarChart.tsx`), iar stilul este complet aliniat grilei principale ale site-ului (AOS animations, max-w-7xl, typography branding).

## Rezolvat în sesiunea SEO / Domeniu canonic (Iun 2026)

- Diagnosticat de ce Google indexa `youprotect-website.pages.dev` în loc de `youprotect.ro`: `site` din `astro.config.mjs` era setat pe pages.dev, iar canonical/og derivă din `site`.
- `site` -> `https://youprotect.ro`; adăugat `@astrojs/sitemap` (pin `3.2.1` pentru Astro 4) cu filter pe `/lp/` + `/confirmare`; adăugat `public/robots.txt`; corectat `favicon.svg` -> `favicon.png` în JSON-LD. (vezi `D-2026-06-24-01`)
- Aplicat fix-uri frontend din audit: fonturi cu weight-urile reale (fără Playfair), CTA-uri reparate (`/contact` mort -> `/programeaza-discutie` și `/cere-oferta`), AOS `once:true/mirror:false`, contrast microcopy, link Maps real. (vezi `D-2026-06-24-02`)
- Quality gate: `npm run build` = PASS; canonical/og/sitemap verificate în `dist` (toate `youprotect.ro`).
- Livrare: PR #1 squash-merged în `main` (Cloudflare auto-deploy din Git).

### ⚠️ Pași manuali rămași (gate pentru propagarea în Google — nu se pot face din repo)

1. **Cloudflare Pages -> proiect `youprotect-website` -> Custom domains**: atașează `youprotect.ro` (și `www`) și confirmă că dă **200**, nu 403. Cât timp e 403, Google nu indexează nimic.
2. **Google Search Console**: adaugă proprietatea `youprotect.ro` -> trimite `sitemap-index.xml` -> *Request Indexing* pe paginile cheie. Opțional: redirect 301 pages.dev -> youprotect.ro.

## Rezolvat în sesiunea SEO/GEO — structured data + pagini (Iun 2026)

- Confirmat că **Git→Cloudflare auto-deploy funcționează** (push pe `main` declanșează build). Fallback manual: `wrangler pages deploy dist --project-name=youprotect-website --branch=main`.
- 3 PR-uri code-fixable (vezi `D-2026-06-24-03`), toate live:
  - Head plumbing: title dedup, `og:type`/`og:image`+Twitter, `LocalBusiness` corect, nou `src/lib/site.ts`.
  - `Product` + `BreadcrumbList` JSON-LD pe produse; breadcrumb cu nume real.
  - GEO pe homepage + 5 pagini noi (`/echipamente-protectie-satu-mare`, `/industrii` + 3 industrii). 14 pagini total în sitemap.
- `npm run build` = PASS la fiecare PR; verificat în `dist` (0 title-dup, og:image absolut, 0 B2BBusiness, Product/Breadcrumb prezente).

### De făcut (handoff — NU se poate din cod)
1. **CMS (Directus/Postgres):** slug typo `pantof-protecie` -> `pantof-protectie` (+301); descrieri trunchiate; imagini Unsplash/Drive -> poze reale; specs/standarde EN pentru produsele demo.
2. **Cloudflare:** Redirect Rule 301 `www.youprotect.ro/*` -> `https://youprotect.ro/$1`.
3. **Google Business Profile:** categorie + descriere (Satu Mare) + poze + Q&A; campanie recenzii prin WhatsApp.
4. **GSC:** Request Indexing pe paginile noi.
5. **Cod amânat (UX-001):** `<button onclick>` -> `<a href>`; tokeni culoare; social links + `sameAs` când există URL-uri.

## Checklist start sesiune viitoare

- Citește `PROJECT_OS/README.md`, apoi secțiunea „Stare la …” de la începutul acestui fișier.
- `git status` și `gh pr list`: pornește de pe un branch nou din `main`. Un branch local nepublicat poate fi al altei
  sesiuni; nu-l șterge și nu-l rescrie. `.codex/` și `AGENTS.md` nu sunt ale proiectului; se lasă neatinse.
- Lucrează pe un singur obiectiv din `02-BACKLOG.md` (acum SEO-003, rescrierea pe pagini).
- La final, actualizează secțiunea „Stare la …”.
