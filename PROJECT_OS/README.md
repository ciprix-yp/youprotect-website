# PROJECT OS - YouProtect Website

Acesta este centrul operațional al proiectului. Orice sesiune începe de aici.

## Ordinea de citire la start de sesiune

1. `PROJECT_OS/04-SESSION_HANDOFF.md`: secțiunea „Stare la …” (unde suntem, ce urmează, ce e la owner)
2. `PROJECT_OS/00-NORTH_STAR.md`
3. `PROJECT_OS/02-BACKLOG.md`
4. `PROJECT_OS/07-IDEA_INBOX.md`
5. `PROJECT_OS/03-DECISIONS_LOG.md`: ultimele decizii, după ID-urile din handoff
6. Pentru texte: `PROJECT_OS/08-GHID_CONTINUT.md` și `PROJECT_OS/09-HARTA-CUVINTE-CHEIE.md`

## Source of Truth extins

- Product spec: `MASTER_SPEC.md`
- Baza de date veche (Postgres pe Railway): ștearsă pe 17.11.2026, cu o copie criptată păstrată (D-2026-11-17-01). Documentația ei din `postgres-railway-projects` e doar istorică.
- Cererile de pe site: Cloudflare D1 + Resend + Prospector CRM (OPS-006 în `02-BACKLOG.md`).
- Deploy flow: `PROJECT_OS/06-DEPLOY_FLOW.md`
- Ghid de conținut (voce, întrebările cititorului, rețete pe tip de secțiune, formula în 3 straturi pentru fișele de produs, SEO, GEO, șablon fișă produs): `PROJECT_OS/08-GHID_CONTINUT.md`
- Harta cuvintelor-cheie, pe fiecare pagină: `PROJECT_OS/09-HARTA-CUVINTE-CHEIE.md`

## Reguli de operare

- Lucrăm pe task-uri cu ID (`WP-001`, `WP-002`, ...).
- Recomandat: 1 task `IN_PROGRESS` la un moment dat.
- Orice decizie structurală intră în `03-DECISIONS_LOG.md`.
- La final de sesiune se actualizează obligatoriu `04-SESSION_HANDOFF.md`.
- Fără lucru “invizibil”: tot ce facem se mapează pe backlog.
- Sugestiile ad-hoc venite pe parcurs se capturează mai întâi în `07-IDEA_INBOX.md`.
- O sugestie se execută doar dacă:
  - este mapată la task-ul curent `IN_PROGRESS`, sau
  - este planificată explicit ca task nou în backlog.

## PM local (orchestrator)

Executabil:
- `PROJECT_OS/pm/pm`

Comenzi:
- `pm status` - status global backlog
- `pm next` - arată următorul task
- `pm next --start` - selectează task-ul următor și îl setează `IN_PROGRESS`
- `pm start <TASK_ID>` - pornește explicit un task
- `pm close <TASK_ID>` - închide task (`DONE`)
- `pm review <TASK_ID>` - rulează quality gate înainte de `close`

Reguli reviewer:
- `PROJECT_OS/pm/REVIEWER_RULES.md`
- `PROJECT_OS/pm/ROLES.md`

## Bucla standard de lucru

1. `pm status`
2. `pm next --start`
3. capture sugestii noi în `07-IDEA_INBOX.md` (dacă apar)
4. implementare task
5. `pm review <TASK_ID>`
6. `npm run release:iteration -- <TASK_ID>`
7. validare live pe Cloudflare (desktop + mobile)
8. `pm close <TASK_ID>`
9. update `04-SESSION_HANDOFF.md`
