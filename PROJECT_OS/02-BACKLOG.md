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
- Status: `TODO`
- Owner: `Codex`
- Scope: Bookings flow + `website_lead_pipeline` update.
- Acceptance: Booking reference și stage persistate.
- Dependencies: WP-003.
- Next action: Endpoint/update logic pentru pipeline.

### WP-005
- Status: `TODO`
- Owner: `Codex`
- Scope: Content premium pentru paginile cheie (`/`, `/produse`, CTA blocks).
- Acceptance: Copy final MVP + tone consistent + CTA clar.
- Dependencies: none.
- Next action: Draft copy v1 + review.

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

---

## Next Sprint (S2)

- Automatizare ofertare + follow-up (n8n).
- Dashboard conversie de bază.
- Populare `producatori` + mapping în products.

## Icebox

- Slack/Telegram alerts.
- UI chatbot complet.
