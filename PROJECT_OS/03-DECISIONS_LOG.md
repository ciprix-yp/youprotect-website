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
