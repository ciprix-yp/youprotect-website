# Idea Inbox (Parking Lot)

Scop: capturam ideile noi fara sa rupem executia taskului curent.

## Statusuri idee

- `NEW`: idee noua, ne-triata
- `TRIAGED`: evaluata rapid
- `PLANNED`: acceptata, planificata pentru un task
- `IMPLEMENTED`: executata
- `DROPPED`: respinsa sau amanata indefinit

## Reguli

- Orice sugestie ad-hoc venita din feedback vizual intra aici prima data.
- Nu implementam direct o idee daca nu este mapata la un task.
- Exceptie: bug critic productie (`P0`) cu impact major.
- Fiecare idee are ID unic: `I-YYYY-MM-DD-XX`.

## Template

## I-YYYY-MM-DD-XX
- Status: `NEW`
- Source: `user|pm|review`
- Sugestie:
- Impact: `conversie|ux|tech|ops`
- Task tinta:
- Decizie PM: `accept|defer|drop`
- Executie:
- Note:

---

## Idei curente

## I-2026-02-25-01
- Status: `IMPLEMENTED`
- Source: `user`
- Sugestie: CTA pe catalog si detaliu produs schimbat in `Vreau sa testez` + mesaj clar de testare fara risc (3-5 membri, selectie agreata, plata produse, 90 zile money-back).
- Impact: `conversie`
- Task tinta: `WP-005`
- Decizie PM: `accept`
- Executie: `commit 8ac19f9`
- Note: Aplicat live pe Cloudflare.

## I-2026-02-25-02
- Status: `IMPLEMENTED`
- Source: `user`
- Sugestie: Introducere regula anti-deturnare: ideile se captureaza si se executa la momentul taskului potrivit.
- Impact: `ops`
- Task tinta: `OPS-003`
- Decizie PM: `accept`
- Executie: `update PROJECT_OS docs`
- Note: README + RUNBOOK + DECISIONS + HANDOFF aliniate.
