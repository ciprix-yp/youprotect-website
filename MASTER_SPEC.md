# YouProtect Website - MASTER_SPEC

Status: Draft for execution  
Date: 2026-02-24  
Owner: YouProtect

## 1. Product Vision

YouProtect website trebuie sa fie:
- un site premium B2B (nu ecommerce clasic),
- un catalog de produse usor de administrat din baza de date,
- un motor de conversie in doua directii:
  - `Vreau mostre returnabile` (primary CTA),
  - `Book a call` (secondary CTA).

Obiectivul principal este cresterea conversiei, nu afisarea de pret public.

## 2. Business Goals (90 zile)

- KPI principal: cresterea ratei de conversie `vizitator -> click CTA` (`Vreau mostre returnabile` sau `Book a call`).
- Monitorizare paralela pentru ambele fluxuri ca sa identificam canalul cu conversie mai buna.
- Lead calificat: lead care atinge minim 60% pe criteriile de calificare (avatar fit, indicatori financiari, nr angajati, intentie de cumparare).

Nota: scorul este consultativ pentru agentul uman. Nu blocheaza booking-ul.

## 3. Positioning si UX Rules

Reguli hard:
- nu este ecommerce clasic,
- fara cos,
- fara checkout,
- fara preturi publice.

Design direction:
- premium industrial,
- dark-first,
- accent pe incredere, rigoare, claritate.

## 4. CTA Strategy (final)

Primary CTA (site-wide):
- `Vreau mostre returnabile`

Secondary CTA:
- `Book a call`

Observatie:
- in copy si flow evitam framing de "pret instant";
- mergem pe "alegere produse + descoperire + consultanta + oferta asistata".

## 5. Information Architecture (MVP)

Pagini MVP:
- `/` (Home)
- `/despre-noi`
- `/clientul-ideal` (sau redenumire din `/cum-lucram`, decizie de implementare)
- `/produse`
- `/produse/[slug]`
- `/politica-confidentialitate`
- `/termeni-conditii`
- `/politica-cookies`
- `/multumim` (optional in MVP, recomandat)

## 6. Conversion Flows

### 6.1 Flow A - `Vreau mostre returnabile` (primary)

1. User navigheaza catalogul.
2. Selecteaza produse intr-un `shortlist` (max 12 produse).
3. Intra in formularul smart (wizard AI, max 10 intrebari).
4. Completeaza date de contact + metoda de plata.
5. Primeste email de confirmare automata (target <2 minute).
6. Lead-ul intra in orchestrare (n8n + DB) pentru ofertare/follow-up.

Reguli:
- shortlist editabil in formular (add/remove),
- fara cantitate per produs in shortlist,
- intrebari despre angajati/cantitati apar in formular, nu in catalog.

### 6.2 Flow B - `Book a call` (secondary)

1. User completeaza mini-precalificare.
2. Se deschide booking flow in Microsoft Bookings.
3. User alege prima pozitie disponibila in calendar.
4. Primeste email de confirmare automata (target <2 minute).
5. Lead-ul intra in pipeline cu status de call programat.

Reguli:
- precalificare este obligatorie,
- scorul nu restrictioneaza booking-ul (inclusiv sub 60%),
- scorul este doar context pentru agent.

## 7. Catalog Functionality (non-ecommerce)

Catalogul trebuie sa ofere:
- listare produse,
- filtrare (categorie/industrie/gen),
- pagina de detaliu per produs,
- selectie in shortlist pentru cerere mostre/oferta.

Nu trebuie sa ofere:
- pret public,
- cos,
- checkout.

## 8. Smart Discovery Engine (AI Wizard)

Motorul formularului va reutiliza logica din proiectul:
- [pitch-capture-flow](https://github.com/ciprix-yp/pitch-capture-flow)

Repo local identificat:
- `/Users/homefolder/pitch-capture-flow`

MVP mode:
- wizard (nu chat complet),
- max 10 intrebari,
- focus pe descoperire nevoi, filtrare, clasificare.

Output minim obligatoriu pentru agent:
- pain points,
- ce vrea sa rezolve clientul,
- intentie de achizitie,
- context operational (echipa, industrie, urgenta),
- scor lead (consultativ).

Scoring:
- afisare in stil procent sau semafor (complexitate redusa, utilitate maxima).
- recomandare MVP: procent + eticheta (`low`, `medium`, `high`).
- praguri etichete:
  - `low`: `0 - <50`
  - `medium`: `50 - <75`
  - `high`: `75 - 100`

## 9. Data Source si Administrare

Source of truth:
- PostgreSQL (schema complexa, ~70 tabele, relatii existente), repo de referinta:
  - `/Users/homefolder/postgres-railway-projects`

### 9.1 Entitati canonice MVP (deja existente in DB)

Catalog public:
- `products` (UUID, produs de showroom),
- `product_categories` (ierarhic),
- `producatori` (brand/producator),
- `cms_slugs` (registry global de slug-uri, evita coliziuni URL).

Lead capture:
- `lead_requests` (source tracking, UTM, contact, CUI enrichment, status, priority),
- campuri de enrichment deja prezente: `matched_company_id`, `is_enriched`, `match_confidence`, `matched_via`.

Backoffice preturi (intern, nepublic):
- `suppliers`, `supplier_imports`,
- `supplier_products`, `supplier_product_variants`, `supplier_price_history`,
- `supplier_product_specs`, `supplier_product_benefits`, `supplier_product_certifications`.

### 9.2 Gap obligatoriu pentru cerinta de shortlist (max 12 produse)

Schema actuala suporta un singur produs per lead prin `lead_requests.product_id`.
Pentru shortlist multiplu este obligatoriu:
- tabel nou `lead_request_products` (many-to-many intre `lead_requests` si `products`).

Constrangeri MVP:
- `UNIQUE (lead_request_id, product_id)`,
- validare aplicatie/API: maxim 12 produse per lead.

Date minime obligatorii pe produs (la publicare):
- denumire,
- beneficii,
- garantie,
- conformitate.

Date operationale:
- listele de preturi raman interne in DB si nu sunt publice.

Strategie implementare recomandata pentru MVP:
- SSG pentru catalog + pagini produs,
- auto-rebuild la schimbari de continut.

Motiv:
- implementare mai simpla,
- stabilitate,
- SEO puternic.

## 10. Oferta si Politica de Plata

In formular (obligatoriu):
- camp `Metoda de plata`.

Optiuni si reguli comerciale:
- `Plata integrala la comanda` -> `-10%`
- `Plata partiala (minim 50%)` -> `-5%`
- `Plata la termen cu instrument de plata` -> `0%`

Nota de conversie:
- pretul la YouProtect este influentat in principal de metoda de plata, nu de volum.

Format ofertare MVP:
- un singur fisier de oferta per cerere (PDF sau HTML->PDF),
- oferta include doar produsele din shortlist + rezumat descoperire + metoda de plata selectata.

## 11. Booking Stack (MVP)

Decizie MVP:
- Microsoft Bookings.

Conditii:
- integrare in flow dupa mini-precalificare,
- sloturi pe "prima pozitie disponibila",
- email de confirmare imediat.

## 12. Orchestrare, CRM logic si Automations

Stack MVP:
- DB + n8n + Railway (dupa nevoie operationala).

MVP alerts:
- email only.

Status DB canonice (respecta `lead_requests.status` existent):
- `new`
- `contacted`
- `qualified`
- `converted`
- `lost`

Operational stages (in afara coloanei `status`, gestionate de n8n + metadate):
- `book_call_scheduled`
- `offer_in_progress`
- `offer_sent`
- `rewarm_30d`
- `recycle_90d`
- `upsell_candidate`

Regula de scoring:
- UI pentru agent afiseaza `Qualified {score}%` (ex: `Qualified 80%`),
- in DB status ramane `qualified`; scorul este atribut separat (consultativ).

Reguli lifecycle:
- la `lost` intra in re-warming la 30 zile,
- reciclare extinsa la 90 zile.

## 13. SLA si Timpi Operationale

SLA automat (MVP):
- confirmare automata email sub 2 minute pentru:
  - `Book a call`,
  - `Vreau mostre returnabile`.

Interventie umana:
- call-ul se programeaza in primul slot disponibil.

## 14. MVP Scope (ce construim acum)

In scope:
- design premium non-ecommerce,
- catalog conectat la Postgres,
- shortlist max 12 produse,
- migrare DB pentru shortlist multiplu (`lead_request_products`),
- smart form wizard (max 10 intrebari),
- metoda de plata in formular,
- booking via Microsoft Bookings,
- pipeline in DB + orchestrare n8n,
- email confirmations si email alerts,
- statusuri funnel complete,
- tracking KPI de conversie.

Out of scope (MVP):
- chatbot conversational complet ca UI principal,
- integrari Slack/Telegram,
- pricing public,
- checkout,
- qty-per-product in shortlist.

## 15. Implementation Priority

### P0 - Conversion Core
- reparare CTA/lead modal/functionare fluxuri,
- implementare shortlist + smart wizard + persistenta multiprodus in DB,
- integrare Microsoft Bookings cu mini-precalificare,
- email confirmations <2 min,
- persistenta lead + status initial in DB.

### P1 - Catalog and Data
- conectare catalog la Postgres (SSG + auto rebuild),
- pagini `/produse` si `/produse/[slug]`,
- campuri produs minime + render premium,
- pagini legale si compliance de baza.

### P2 - Automation Depth
- ofertare automata,
- follow-up automat,
- win/lost automations,
- rewarm/recycle jobs,
- upsell triggers.

## 16. Riscuri si Note tehnice

- Pitch repo are componente reutilizabile bune pentru sessioning, webhook handling si lead submit.
- Exista un fisier care necesita corectare in acel repo inainte de integrare directa API:
  - `/Users/homefolder/pitch-capture-flow/api/chat.ts` (continut nevalid TypeScript).
- Continutul comercial (descrieri produse + pricing intern) trebuie completat in DB pentru calitate buna a conversiei.
- ALERTA securitate: `DATABASE_DOCUMENTATION.md` din repo-ul DB contine credentiale in clar; este necesara rotire credentiale + redactare fisierului.

## 17. Copy Guidance (MVP)

Ton:
- consultativ,
- premium,
- fara presiune de vanzare ieftina.

Micro-copy recomandat:
- in loc de `Cere oferta`: `Vreau mostre returnabile`
- secondary: `Book a call`

## 18. Definition of Done (MVP)

MVP este considerat gata cand:
- ambele CTA-uri functioneaza end-to-end,
- booking-ul merge prin Microsoft Bookings,
- fluxul smart capteaza datele esentiale si salveaza lead-ul in DB,
- confirmarea automata email vine in <2 min,
- catalogul este alimentat din Postgres si permite shortlist max 12 produse,
- statusurile funnel sunt populate corect pentru automations ulterioare.

## 19. Documentatie Conectata (Source of Truth)

- business spec website:
  - `/Users/homefolder/youprotect-website/MASTER_SPEC.md`
- db technical spec:
  - `/Users/homefolder/postgres-railway-projects/DATABASE_DOCUMENTATION.md`
- db erd:
  - `/Users/homefolder/postgres-railway-projects/railway_erd.md`
- integration map website -> db:
  - `/Users/homefolder/postgres-railway-projects/WEBSITE_DB_INTEGRATION_MAP.md`
- migration core:
  - `/Users/homefolder/postgres-railway-projects/migrations/20260224_create_website_conversion_core.sql`
- migration praguri scoring:
  - `/Users/homefolder/postgres-railway-projects/migrations/20260224_set_website_lead_score_thresholds.sql`
