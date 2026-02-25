# PROJECT OS - YouProtect Website

Acesta este centrul operațional al proiectului. Orice sesiune începe de aici.

## Ordinea de citire la start de sesiune

1. `/Users/homefolder/youprotect-website/PROJECT_OS/00-NORTH_STAR.md`
2. `/Users/homefolder/youprotect-website/PROJECT_OS/02-BACKLOG.md`
3. `/Users/homefolder/youprotect-website/PROJECT_OS/03-DECISIONS_LOG.md`
4. `/Users/homefolder/youprotect-website/PROJECT_OS/04-SESSION_HANDOFF.md`

## Source of Truth extins

- Product spec: `/Users/homefolder/youprotect-website/MASTER_SPEC.md`
- DB technical: `/Users/homefolder/postgres-railway-projects/DATABASE_DOCUMENTATION.md`
- DB ERD: `/Users/homefolder/postgres-railway-projects/railway_erd.md`
- Website <> DB map: `/Users/homefolder/postgres-railway-projects/WEBSITE_DB_INTEGRATION_MAP.md`
- Deploy flow: `/Users/homefolder/youprotect-website/PROJECT_OS/06-DEPLOY_FLOW.md`

## Reguli de operare

- Lucrăm pe task-uri cu ID (`WP-001`, `WP-002`, ...).
- Recomandat: 1 task `IN_PROGRESS` la un moment dat.
- Orice decizie structurală intră în `03-DECISIONS_LOG.md`.
- La final de sesiune se actualizează obligatoriu `04-SESSION_HANDOFF.md`.
- Fără lucru “invizibil”: tot ce facem se mapează pe backlog.

## PM local (orchestrator)

Executabil:
- `/Users/homefolder/youprotect-website/PROJECT_OS/pm/pm`

Comenzi:
- `pm status` - status global backlog
- `pm next` - arată următorul task
- `pm next --start` - selectează task-ul următor și îl setează `IN_PROGRESS`
- `pm start <TASK_ID>` - pornește explicit un task
- `pm close <TASK_ID>` - închide task (`DONE`)
- `pm review <TASK_ID>` - rulează quality gate înainte de `close`

Reguli reviewer:
- `/Users/homefolder/youprotect-website/PROJECT_OS/pm/REVIEWER_RULES.md`
- `/Users/homefolder/youprotect-website/PROJECT_OS/pm/ROLES.md`

## Bucla standard de lucru

1. `pm status`
2. `pm next --start`
3. implementare task
4. `pm review <TASK_ID>`
5. `npm run release:iteration -- <TASK_ID>`
6. validare live pe Cloudflare (desktop + mobile)
7. `pm close <TASK_ID>`
8. update `04-SESSION_HANDOFF.md`
