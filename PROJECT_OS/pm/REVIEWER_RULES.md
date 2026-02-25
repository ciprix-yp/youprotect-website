# Reviewer Rules (v1)

Scop: gate simplu de calitate intre implementare si `DONE`.

## Principii

- Reviewer nu blocheaza business; blocheaza doar risc tehnic clar.
- Fiecare task trebuie verificat inainte de `close`.
- Daca un check pica, task-ul ramane `IN_PROGRESS` sau devine `BLOCKED`.

## Ordine verificari

1. Integritate task backlog
- Task-ul curent exista in `02-BACKLOG.md`.
- `Scope` si `Acceptance` sunt inca valide.

2. Validari automate
- `py_compile` pentru fisiere Python modificate.
- `npm run lint` daca exista script.
- `npm run test` daca exista script.
- `npm run build` daca exista script.

3. Review functional
- Fluxul schimbat respecta `MASTER_SPEC.md`.
- Nu rupe flow-ul principal: catalog -> formular smart -> oferta sau book a call.
- Evenimentele de conversie cheie raman masurabile.

4. Review siguranta
- Fara secrete hardcodate.
- Fara conexiuni DB cu credentiale in cod.
- Fara comenzi destructive in scripts.

## Verdict

- `PASS`: task poate fi inchis cu `pm close <TASK_ID>`.
- `FAIL`: se remediaza si se ruleaza din nou `pm review <TASK_ID>`.
