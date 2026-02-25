# Roles (PM + Builder + Reviewer)

## PM (orchestrator)

- Alege urmatorul task din backlog.
- Mentine un singur task activ.
- Blocheaza inchiderea taskului fara review.

Instrument: `pm`.

## Builder (implementare)

- Executa task-ul curent cap-coada.
- Actualizeaza cod + docs + handoff.
- Nu sare peste acceptance criteria.

## Reviewer (control calitate)

- Ruleaza gate-ul tehnic inainte de `DONE`.
- Verifica risc de regresie pe flow-ul de conversie.
- Verifica lipsa secretelor hardcodate.

Instrument: `pm review <TASK_ID>`.

## Optional: Second Opinion AI (Claude)

Nu este overkill daca il folosim punctual:

- la final de sprint (1 review/sprint), sau
- pentru schimbari cu risc ridicat (DB, funnel, scoring).

Nu il folosim la fiecare task mic, ca sa nu incetinim executia.
