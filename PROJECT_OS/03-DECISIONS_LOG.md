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
