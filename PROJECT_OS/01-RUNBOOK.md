# Runbook de Execuție

## Ritm de lucru

- Lucrăm în sprinturi de 7 zile.
- În fiecare sprint:
  - 1 obiectiv de business,
  - 3-7 task-uri implementabile,
  - 1 review de risc și blocaje.

## Flux standard pe task

1. `pm next --start` sau `pm start <TASK_ID>`.
2. Clarificare scope și criterii de acceptare.
3. Capturare sugestii ad-hoc în `07-IDEA_INBOX.md` (dacă apar în timpul execuției).
4. Implementare (code/data/content).
5. `pm review <TASK_ID>` pentru quality gate.
6. Commit pe branch + `npm run release:iteration -- <TASK_ID>`.
7. Validare live Cloudflare (desktop + mobile).
8. Actualizare documentație.
9. `pm close <TASK_ID>` + update handoff.

## Definition of Done (task)

Un task este `DONE` doar dacă:
- codul este aplicat,
- datele/migrațiile sunt validate,
- impactul este documentat,
- există notă în handoff.

## Reguli anti-haos

- Nu pornim task nou dacă obiectivul sprintului nu e stabilit.
- Nu lăsăm task `IN_PROGRESS` fără owner și next action.
- Nu facem schimbări de schemă fără migrare + rollback.
- Nu executăm sugestii ad-hoc direct din chat; mai întâi intră în `07-IDEA_INBOX.md`.

## Flux sugestii ad-hoc (anti-deturnare)

1. Primim sugestia și o salvăm imediat ca `I-YYYY-MM-DD-XX` în `07-IDEA_INBOX.md`.
2. Facem triere rapidă (impact pe conversie, risc, cost de implementare).
3. O mapăm la:
   - taskul curent (dacă ajută direct obiectivul curent), sau
   - task viitor / backlog.
4. Executăm sugestia doar în fereastra taskului mapat.
5. Marcăm statusul ideii: `NEW -> TRIAGED -> PLANNED -> IMPLEMENTED` (sau `DROPPED`).
