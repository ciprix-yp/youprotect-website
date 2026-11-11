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
- Status: `TODO`
- Owner: `-`
- Scope: Conversie `<button onclick=location>` -> `<a href>` (~18 instanțe, accesibilitate/SEO/no-JS) + consolidare tokeni de culoare (`yp-green` nefolosit, hex-uri ad-hoc `#0a0a0a/#0f0f0f/#050505` -> tokeni numiți). Aliniere tagline header/footer. + social links footer + `sameAs` (cod pregătit în `src/lib/site.ts`, doar URL-uri lipsă).
- Acceptance: CTA-urile navigaționale sunt `<a>`; paleta folosește tokeni `yp-*`; build PASS + verificare vizuală în browser.
- Dependencies: none.
- Next action: PR separat (necesită verificare vizuală, de aceea a fost amânat de la fix-ul SEO).

### CMS-001
- Status: `TODO`
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
- Status: `TODO`
- Owner: `User` (Google — dashboard)
- Scope: Optimizare Google Business Profile (categorie primară, descriere cu „echipamente de protecție" + „Satu Mare", poze, Q&A, postări); campanie recenzii Google prin WhatsApp.
- Acceptance: GBP optimizat pentru Maps Pack; recenzii noi.
- Dependencies: none.
- Next action: GBP dashboard + secvență WhatsApp.


### CAT-001
- Status: `IN_PROGRESS`
- Owner: `Claude`
- Scope: Pilot catalog din fișiere de date: 5 produse MASCOT (19035, 51587, 20254, 20739, F0114), flux extract → texte RO → asamblare, ghid de conținut + verificare automată, previzualizare `/preview/produse/` (noindex).
- Acceptance: format aprobat de user (11.11.2026); build PASS; lint texte 0 erori; ui-verify fără erori în paginile noi.
- Dependencies: D-2026-11-11-01, D-2026-11-11-02.
- Next action: CAT-002 (imagini), apoi mutarea paginilor `/produse` pe colecția nouă.

### CAT-002
- Status: `TODO`
- Owner: `Claude`
- Scope: Imagini găzduite de noi din MASCOT Picturepark (sesiune de oaspete, fără cont): căutare pe `model-calitate-culoare`, 24 de cadre P01–P24 pe culoare (serie 360°), optimizare web. Înlocuiește hotlink-ul la CDN-ul din feed.
- Acceptance: pozele servite de pe youprotect.ro; build PASS; fără regresii vizuale.
- Dependencies: CAT-001.
- Next action: script de descărcare + optimizare pe cele 5 produse pilot. După: viewer 360° (I-2026-11-11-01).

### CAT-003
- Status: `BLOCKED`
- Owner: `User`
- Scope: Date de produs Sir Safety (poze, fișe tehnice, descrieri) pentru produsele recurente din vânzări (Sirflex, Piquet, Gemini Guard, Contender, Tonga, Harrison, Manhattan…).
- Acceptance: export sau acces la portalul B2B `sirweb.sirsafety.com`.
- Dependencies: acces de la Sir Safety.
- Next action: user verifică exportul din portalul B2B sau cere date de la contactul Sir Safety.


### SEC-001
- Status: `TODO`
- Owner: `Claude` + `User` (decizie + test pe DB)
- Scope: Conexiunile Postgres nu verifică certificatul TLS (`rejectUnauthorized: false`) în `functions/api/leads.js`, `functions/api/submit-lead.js` și `src/lib/catalog.ts`. Semgrep `bypass-tls-verification`: CI `semgrep` va fi roșu până la rezolvare.
- Acceptance: conexiune cu verificare TLS (CA Railway sau Hyperdrive fără opțiunea de bypass), testată pe formularul de lead; `src/lib/catalog.ts` dispare după mutarea `/produse` pe colecția nouă.
- Dependencies: acces de test la DB; CAT-001 pentru `catalog.ts`.
- Next action: verificat cum se conectează Hyperdrive la Railway și ce certificat expune Railway.

### SEC-002
- Status: `TODO`
- Owner: `Claude`
- Scope: Dependențe vulnerabile (npm audit: 1 critică, 13 high, în lanțul Astro 4 + `@astrojs/sitemap`). CI `dependencies` (OSV) va fi roșu până la upgrade.
- Acceptance: upgrade Astro (versiune majoră) + integrări; build PASS; verificare vizuală; OSV fără high/critical.
- Dependencies: preferabil după CAT-001 (paginile `/produse` pe colecția nouă).
- Next action: branch separat de upgrade, cu ghidul de migrare Astro.

---

## Next Sprint (S2)

- Automatizare ofertare + follow-up (n8n).
- Dashboard conversie de bază.
- Populare `producatori` + mapping în products.

## Icebox

- Slack/Telegram alerts.
- UI chatbot complet.
