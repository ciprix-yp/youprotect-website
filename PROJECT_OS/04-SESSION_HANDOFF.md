# Session Handoff

## Ultimul update

- Data: `2026-02-25`
- Status global: `WP-005_IN_PROGRESS`

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

1. WP-005: finalizare pass content premium pe homepage (`/`) + CTA blocks globale.
2. Rulează `pm review WP-005` după ultimul pass de copy și aliniere CTA.
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

## Checklist start sesiune viitoare

- Citește `PROJECT_OS/README.md`.
- Verifică `02-BACKLOG.md` și marchează taskul curent `IN_PROGRESS`.
- Verifică `07-IDEA_INBOX.md` și mapează ideile `TRIAGED/PLANNED` la taskul activ.
- Lucrează pe un singur obiectiv clar.
- La final, actualizează acest fișier.
