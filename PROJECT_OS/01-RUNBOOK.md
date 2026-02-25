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
3. Implementare (code/data/content).
4. `pm review <TASK_ID>` pentru quality gate.
5. Commit pe branch + `npm run release:iteration -- <TASK_ID>`.
6. Validare live Cloudflare (desktop + mobile).
7. Actualizare documentație.
8. `pm close <TASK_ID>` + update handoff.

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
