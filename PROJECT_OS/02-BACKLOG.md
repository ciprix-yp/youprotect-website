# Backlog Unic

## Cum folosim

Statusuri acceptate:
- `TODO`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE`

Format task:
- `ID`
- `Status`
- `Owner`
- `Scope`
- `Acceptance`
- `Dependencies`
- `Next action`

---

## Sprint Curent (S1)

### WP-001
- Status: `DONE`
- Owner: `Codex`
- Scope: Integrare frontend catalog pe `vw_catalog_products` + listare + detaliu.
- Acceptance: Pagina produse și pagina produs funcționează pe date live DB.
- Dependencies: DB core deja aplicat.
- Next action: Start WP-002 (shortlist UI + persistență în `lead_request_products`).

### WP-002
- Status: `DONE`
- Owner: `Codex`
- Scope: Shortlist UI + persistență în `lead_request_products` (max 12).
- Acceptance: Add/remove produse, validare limită, persistare corectă.
- Dependencies: WP-001.
- Next action: Start WP-003 (wizard write + scoring în `website_lead_context`).

### WP-003
- Status: `DONE`
- Owner: `Codex`
- Scope: Wizard smart -> write în `website_lead_context` + scoring.
- Acceptance: Salvează answers/pain_points/outcomes/score/label.
- Dependencies: WP-002.
- Next action: Start WP-004 (bookings + pipeline update).

### WP-004
- Status: `DONE`
- Owner: `Codex`
- Scope: Bookings flow + `website_lead_pipeline` update.
- Acceptance: Booking reference și stage persistate.
- Dependencies: WP-003.
- Next action: Start WP-005 (content premium + CTA copy pass).

### WP-005
- Status: `IN_PROGRESS`
- Owner: `Codex` / `Antigravity`
- Scope: Content premium pentru paginile cheie (`/`, `/produse`, CTA blocks).
- Acceptance: Copy final MVP + tone consistent + CTA clar.
- Dependencies: none.
- Next action: Finalizare pass content premium pe `/` + CTA blocks globale, apoi `pm review WP-005`.

### WP-006
- Status: `DONE`
- Owner: `Codex` / `Antigravity`
- Scope: Transition catalog to Directus + Astro. Implement a "Clean View" for products in Directus mapped over Postgres, then consume in Astro.
- Acceptance: Directus setup pe Railway. Colectie `website_products` definita. Endpointuri Astro citind din Directus via API cu fallback la `vw`.
- Dependencies: WP-003.
- Next action: P1 Deploy.

### OPS-001
- Status: `DONE`
- Owner: `Codex`
- Scope: Orchestrator local `pm` + reviewer gate pentru control execuție.
- Acceptance: Comenzi funcționale `status`, `next`, `start`, `close`, `review`.
- Dependencies: none.
- Next action: Folosim fluxul standard la toate task-urile WP.

### OPS-002
- Status: `DONE`
- Owner: `Codex`
- Scope: Pipeline iterativ Git + Cloudflare (workflow + script release local).
- Acceptance: `release:iteration` push-uit pe GitHub + Cloudflare auto deploy din Git integration; `cf:deploy` rămâne opțional.
- Dependencies: Cloudflare Pages project existent.
- Next action: Folosește `release:iteration`; deploy-ul vine din integrarea Git Cloudflare.

### OPS-003
- Status: `DONE`
- Owner: `Codex`
- Scope: Protocol anti-deturnare: "idea intake" + mapare sugestii la task-uri înainte de execuție.
- Acceptance: `07-IDEA_INBOX.md` introdus și conectat în runbook/readme/decision log; ideile sunt urmărite cu status.
- Dependencies: OPS-001.
- Next action: Toate sugestiile noi intră în `07-IDEA_INBOX.md` înainte de implementare.

### SEO-001
- Status: `DONE`
- Owner: `Claude`
- Scope: Fix domeniu canonic (`site` -> youprotect.ro) + sitemap + robots.txt + JSON-LD favicon.
- Acceptance: canonical/og/sitemap arată spre youprotect.ro; build PASS.
- Dependencies: none.
- Next action: pași manuali Cloudflare custom domain + Google Search Console (vezi `04-SESSION_HANDOFF`).

### SEO-002
- Status: `DONE`
- Owner: `Claude`
- Scope: Audit SEO/GEO — fix title duplicat, `og:type`/`og:image`+Twitter, `LocalBusiness` corect (`src/lib/site.ts`), `Product`+`BreadcrumbList` JSON-LD pe produse, mențiuni GEO homepage, pagini noi `/echipamente-protectie-satu-mare` + `/industrii/*`.
- Acceptance: build PASS (14 pagini); 0 title-dup; og:image absolut; Product/Breadcrumb prezente; pagini noi în sitemap și live.
- Dependencies: SEO-001.
- Next action: handoff CMS/Cloudflare/GBP (vezi `04-SESSION_HANDOFF`) + GSC Request Indexing.

### UX-001
- Status: `DONE` (16.11.2026, PR #12)
- Owner: `Claude`
- Rezultat: ui-verify pe 15 pagini (mobil + desktop): 0 încălcări axe, 0 ținte tactile sub 24 px, 0 erori în consolă, 0 cereri eșuate. Reparat: butonul de meniu ieșea din ecran pe mobil (overflow de la AOS), texte 9–11 px, contraste, 17 butoane `onclick` → link-uri, logo lipsă pe LP, link-uri fără „/” final (813 verificate), fontul de text fără ă/ș/ț (înlocuit cu „YP Text”, subset Lato 2.015 OFL), AOS oprit pentru „reduce motion”.
- Rămas (opțional): consolidarea tokenilor de culoare (hex-uri ad-hoc → `yp-*`).

### CMS-001
- Status: `DROPPED` (17.11.2026: Directus și baza Railway nu mai există; produsele demo au redirect 301 spre catalog, iar catalogul vine din fișiere de date, D-2026-11-11-01)
- Owner: `User` (Directus/Postgres — nu se poate din repo)
- Scope: Corecții conținut produs: slug typo `pantof-protecie` -> `pantof-protectie` (+301); descrieri trunchiate; înlocuire imagini Unsplash/Drive cu poze reale; specs/mărimi/standarde EN pentru produsele demo.
- Acceptance: produse cu slug corect, descriere completă, imagini reale.
- Dependencies: none.
- Next action: editare în Directus `website_products`.

### OPS-004
- Status: `DONE`
- Owner: `Claude`
- Scope: Redirect 301 `www -> non-www` + maparea URL-urilor vechi (Wix) către paginile noi.
- Implementare: contul de Gmail (`251beb`) NU are scope „Dynamic Redirect", deci NU s-a folosit o Redirect Rule clasică. În schimb: (1) Worker `www-redirect` cu rută `www.youprotect.ro/*` (zona youprotect.ro `34fc48…`) — 301 către apex cu mapping legacy single-hop; (2) `public/_redirects` în Pages — 301 pe apex pentru `/cine-suntem->/despre-noi`, `/blog->/`, `/contact->/programeaza-discutie`, `/servicii->/cum-lucram`, `/magazin|/shop->/produse`.
- Acceptance: `www.*` -> 301 apex; URL-uri vechi -> pagini noi (nu 404). VERIFICAT live.
- Note: codul site-ului nu are referințe Wix/Shopify (verificat prin grep).

### OPS-005
- Status: `IN PROGRESS`
- Owner: `User` (Google — dashboard)
- Scope: Optimizare Google Business Profile (categorie primară, descriere cu „echipamente de protecție" + „Satu Mare", poze, postări); campanie recenzii Google prin WhatsApp.
- Acceptance: GBP optimizat pentru Maps Pack; recenzii noi.
- Dependencies: none.
- Stare pe 18.11.2026: kitul e gata în Claude Docs („Kit recenzii Google — You Protect”): regulile Google, mesajele WhatsApp cu linkul direct de recenzie, ritmul de trimitere, lista pentru profil cu descrierea gata scrisă, modele de răspuns. Q&A a ieșit din scope: Google scoate secțiunea din profiluri din decembrie 2025.
- Next action: Ciprian pune la punct profilul, apoi trimite lotul inițial (clienții cu livrări din ultimele 12 luni).


### CAT-001
- Status: `DONE`
- Owner: `Claude`
- Scope: Catalog din fișiere de date: 5 produse MASCOT, flux extract → texte RO → asamblare, ghid de conținut + verificare automată; `/produse` și `/produse/[slug]` citesc din colecție (doar `published`), `/preview/produse/` pentru orice status (noindex).
- Rezultat (11.11.2026): Directus scos complet (`src/lib/directus.ts`, `src/lib/catalog.ts`, `@directus/sdk`, scripturi vechi); filtrele `/produse` pornesc din date reale (categorii, industrii multiple, recomandare rapidă); testimoniale din `src/data/testimonials.json` (gol, ca și live); 301 pentru cele 6 slug-uri demo vechi; pagina 404 (înainte, orice URL inexistent dădea 200 cu homepage-ul).
- Acceptance: build PASS; lint texte 0 erori; test browser filtre 10/10 PASS; ui-verify fără regresii față de live.
- Next action: merge după SEC-001 + SEC-002.

### CAT-002
- Status: `DONE`
- Owner: `Claude`
- Scope: Imagini găzduite de noi din MASCOT Picturepark (sesiune de oaspete, fără cont), prin `scripts/catalog/fetch_images_mascot.py`.
- Rezultat (11.11.2026): 253 de fișiere WebP, 3,6 MB, în `public/images/products/<slug>/`. Culoarea principală: galerie (PS, P01, P04, P07, P13, P19) + 24 de cadre 360° (`-spin-`); celelalte culori: P01, P07, P13. Fără hotlink la pozele Mascot (documentele PDF rămân pe CDN-ul Mascot).
- Note: denumirile din Picturepark variază (`_P01.jpg` și `" P01"`); mostrele de culoare SVG nu se găzduiesc (risc XSS), butonul afișează doar numele (ex. 51587 bleumarin 01).
- Acceptance: build PASS; ui-verify fără cereri eșuate; test în browser pentru schimbarea culorii și a miniaturilor: 7/7 PASS.
- Next action: viewer 360° (I-2026-11-11-01), apoi mutarea `/produse` pe colecția nouă.

### CAT-003
- Status: `DONE` (branch `feature/catalog-sirsafety`, PR #13)
- Owner: `Claude` (pipeline + texte), `User` (aprobare texte, acord poze)
- Scope: Produsele Sir Safety recurente din vânzări.
- Deblocat (16.11.2026): datele sunt publice pe www.sirsafety.com (pagină de produs + fișă tehnică PDF EN + declarație de conformitate EN), fără login. Pipeline: `extract_sirsafety.py` → `catalog/texts/sirsafety/<COD>.json` → `fetch_images_sirsafety.py` → `assemble_sirsafety.py` (verifică standardele și gramajul față de fișa tehnică). Primul lot: 12 modele, status `review`.
- Acord Sir Safety pentru poze și texte: confirmat de Ciprian pe 16.11.2026. Declarațiile de conformitate și instrucțiunile în română (Regulamentul (UE) 2016/425) rămân de cerut de la Sir Safety.
- 16.11.2026: Ciprian a aprobat toate cele 21 de fișe; trecute în `published` (26 de produse publice).

### SEC-001
- Status: `DONE` (17.11.2026: site-ul nu se mai conectează deloc la Postgres; `pg` și Hyperdrive au fost scoase odată cu OPS-006, PR #24)
- Owner: `Claude` + `User` (test pe preview)
- Scope: Conexiunile Postgres nu verificau certificatul TLS (`rejectUnauthorized: false`).
- Rezultat (16.11.2026): `submit-lead` se conectează doar prin Hyperdrive, fără opțiuni ssl (Hyperdrive face TLS spre Railway); fără fallback `DATABASE_URL`; acceptă doar întrebările cunoscute, cu limite de mărime; erori generice spre client. `/api/leads` scos (niciun apelant, endpoint public de scriere în DB-ul de producție), `scripts/qc-smoke.sh` scos (scria lead-uri de test în producție). Regulă semgrep nouă: `internal-error-message-in-response`.
- Acceptance rămasă: un lead de test trimis din preview ajunge în DB (preview-ul folosește Hyperdrive-ul de producție) — doar cu acordul lui Ciprian.
- Test 16.11.2026 (lead marcat TEST, din preview): conexiunea la Hyperdrive reușește (etapa `connect`), deci verificarea TLS fără bypass e în regulă; prima interogare pică cu `terminated` din cauza OPS-006.
- 17.11.2026: lead-ul de test din preview a mers pe drumul nou (D1 + Resend + CRM), vezi OPS-006.

### SEC-002
- Status: `DONE` (branch `chore/astro-7`, 16.11.2026)
- Owner: `Claude`
- Scope: Dependențe vulnerabile în lanțul Astro 4 (OSV: 1 critică, 32 high, 40 medium, 10 low).
- Rezultat: Astro 4.16 -> 7.4.12, `@astrojs/react` 7.1.9, `@astrojs/sitemap` 3.7.5; `@astrojs/tailwind` scos (nu suportă Astro 6+), Tailwind 3 rulează prin `postcss.config.mjs`; colecția `products` pe loader `glob()` în `src/content.config.ts`, `z` din `astro/zod`; `compressHTML: true` (Astro 7 ar fi lipit cuvintele din elemente inline); Node 22.23.4 în `.node-version` (Cloudflare Pages, CI) și `.mise.toml`; `.astro/` scos din git.
- Verificare: `npm audit` 0 vulnerabilități, 294/294 semnături verificate; build 25 pagini; comparație HTML Astro 4 vs 7: text, link-uri, meta, JSON-LD, sitemap identice pe toate paginile; screenshot-uri 41/50 identice pixel cu pixel, restul doar anti-aliasing de font; teste în browser 17/18 la fel pe ambele versiuni (eșecul: logo lipsă pe LP, vezi UX-001).
- Efecte secundare: compilatorul nou a găsit un `</div>` lipsă în `cum-lucram.astro` (butonul „Vezi catalogul” stătea în cardul 4, acum e centrat sub carduri); dispare CSS-ul Tailwind duplicat (~41 KB pe pagină) și eroarea JS „No carousel” de pe homepage.

### LEGAL-001
- Status: `DONE` (aprobat de Ciprian pe 16.11.2026, inclusiv păstrarea cererilor 2 ani de la ultimul contact)
- Owner: `Claude`
- Scope: `/politica-confidentialitate/`, `/termeni-conditii/`, `/politica-cookies/`, scrise din ce face efectiv site-ul. Orice script terț nou cere actualizarea lor.

### DATA-001
- Status: `DONE` (16.11.2026)
- Scope: CUI corect RO46294850 (confirmat de Ciprian; footer-ul vechi avea RO 46387843). Sursa unică: `SITE.legal` din `src/lib/site.ts`.

### OPS-006
- Status: `DONE` (pornit pe 17.11.2026)
- Owner: `User` + `Claude`
- Rezultat (17.11.2026):
  - D1 `youprotect-leads` (jurisdicție UE) legată ca `LEADS_DB`, schema `0001_lead.sql` aplicată; `RESEND_API_KEY` și `CRM_SYNC_TOKEN` în Cloudflare Pages (production + preview); PR #24 integrat (`e5288d7`).
  - CRM: PR #21 integrat, migrația aplicată pe M1 cu acordul lui Ciprian (pgTAP 71/71 pe M1), aplicația `cb9b31d`, jobul la 5 minute prin launchd, la clientul You Protect.
  - Verificare cap-coadă cu o cerere de test din preview, fără CUI: D1 (tag `website`), email acceptat de Resend, inbox-ul „Cereri de pe site” din CRM (marcată test), confirmată pe site. `/api/crm/leads` dă 401 fără token, pe preview și pe youprotect.ro.
- Curățenie (17.11.2026, cu acordul lui Ciprian): secretul `DATABASE_URL` șters din Pages (production și preview); configurația Hyperdrive `youprotect-db` ștearsă (verificat înainte: niciun Worker și niciun proiect Pages nu o folosea). Postgres-ul Railway avea în `lead_requests` doar 54 de cereri de test, deci nu era nimic de mutat. Baza a fost copiată, verificată și ștearsă, vezi D-2026-11-17-01.
- Problema (găsită pe 16.11.2026): Postgres-ul `passionate-wholeness` nu mai are TCP Proxy public, deci Hyperdrive nu ajunge la el; formularul nu salva cererile, probabil și pe site-ul vechi (nu știm de când; ultimul deploy Postgres: 30.08.2026).
- Decizie Ciprian (16.11.2026): cererile merg prin Resend (email către office@youprotect.ro, de pe noreply@deeplogic.ro) și în Prospector CRM, cu tag-ul `website`; CUI opțional în formular.
- Implementare: site PR #24 (`feature/leads-d1-resend`): inbox Cloudflare D1 (jurisdicție UE) + email Resend + `/api/crm/leads` (pull cu token); CRM PR #21 (`prospector-crm`, `feature/website-leads`): migrația `20261116120000_cereri_site.sql`, jobul `scripts/cereri-site/` (la 5 minute pe M1), pagina „Cereri de pe site”.
- Operare: `prospector-crm/deploy/deeplogic-m1/README.md`, „Cererile de pe site” (oprire, rotirea tokenului și a parolei, cereri care nu intră).
- Neurgent (CRM de uz intern): textul de informare GDPR din fișa persoanei e scris pentru art. 14; pentru cei care completează formularul se aplică art. 13 — de revăzut cu consultantul GDPR înainte de folosirea externă a CRM-ului.

### CONV-001
- Status: `DONE` (17.11.2026, PR #28)
- Owner: `Claude`
- Scope: Primul pas din auditul de conversie din 17.11.2026 (site live, 6 pagini, mobil și desktop, plus codul formularelor).
- Rezultat:
  - „Testezi fără riscuri” e componentă comună (`RiskFreeTesting`): apare pe homepage, în catalog și pe paginile cu formular, nu doar pe fișe;
  - butonul WhatsApp nu mai acoperă formularele;
  - catalogul are două coloane pe mobil (de la ~27 la ~10 ecrane);
  - titlurile au majuscule ca în română.

### CONV-002
- Status: `DONE` (17.11.2026)
- Owner: `Claude`
- Scope: Dovadă socială și spațiere pe formulare.
- Rezultat: cele 5 recenzii Google de pe site-ul vechi sunt din nou pe homepage (D-2026-11-17-02). Paginile cu formular au mai puțin spațiu gol sus pe mobil.

### CONV-003
- Status: `IN_PROGRESS` (decizii primite de la Ciprian pe 18.11.2026)
- Owner: `Claude` (implementare) + `User` (garanție, cont Google)
- Scope: Ce a rămas din auditul de conversie din 17.11.2026:
  - **Categorii** — `DONE`. Mănuși, căști, ochelari și lucru la înălțime se vând. Cardurile de pe homepage duc la
    `/cere-oferta/?categorie=<slug>`, iar formularul pornește cu categoria bifată. Slug-urile sunt în
    `src/lib/quote-categories.js`, iar serverul o adaugă la răspunsuri ca „Categoria aleasă pe site”.
  - **Echipe de 1–4 persoane** — `DONE`. Nu intră în formular. Sub întrebarea despre mărimea echipei, formularul le
    trimite pe WhatsApp.
  - **Recenzii în buclă** — `DONE`. Caruselul derulează continuu, iar pe mobil nu se mai oprește după o atingere.
    Are buton de pauză (WCAG 2.2.2). Preluarea lunară a recenziilor de 4–5 stele e gata (D-2026-11-18-04). Cheia
    Places API e în Cloudflare Pages (producție). Rămân: secretul GitHub `CF_PAGES_DEPLOY_HOOK`, pus de Ciprian, și
    reactivarea facturării Google (până atunci Places răspunde 403, iar site-ul rămâne pe recenziile din repo).
  - **Măsurare** — `DONE`. GA4 `G-TV8YEFYQD5`, încărcat doar după acord, și Cloudflare Web Analytics, fără cookie-uri
    (D-2026-11-18-02). Politicile de cookies și de confidențialitate le descriu pe amândouă.
  - **Titlul principal și calculatorul** — `DONE`. Detalii în D-2026-11-18-01. Cererile din calculator intră ca
    cerere de ofertă cu „Sursa: Calculatorul de cost”.
  - **Testare fără riscuri** — `DONE`. Pagina `/testare-fara-riscuri/` e publicată, aprobată de Ciprian pe
    18.11.2026 (D-2026-11-18-03).
  - **Formularul de ofertă** — `DONE` pentru acum. Rămâne pe `/cere-oferta/`, iar cererea ajunge pe email
    (office@) și în CRM. Modulul de ofertare din Prospector nu se construiește acum; după ce există, conectăm
    formularul și automatizăm (cu `structured` și slug-uri stabile, convenite cu Prospector). Pe 18.11.2026 s-a adăugat
    o singură întrebare: personalizarea cu logo (D-2026-11-18-05).

---

## Next Sprint (S2)

- Automatizare ofertare + follow-up (n8n).
- Dashboard conversie de bază.
- Populare `producatori` + mapping în products.

## Icebox

- Slack/Telegram alerts.
- UI chatbot complet.
