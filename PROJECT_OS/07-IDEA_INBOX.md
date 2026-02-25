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

## I-2026-02-25-03
- Status: `IMPLEMENTED`
- Source: `user`
- Sugestie: Pagina de produs sa includa galerie foto 3-5 imagini per produs.
- Impact: `ux`
- Task tinta: `WP-005`
- Decizie PM: `accept`
- Executie: `commit 2889de9`
- Note: Necesita mapare sursa imagini (product_images vs supplier_product_images) + fallback.

## I-2026-02-25-04
- Status: `IMPLEMENTED`
- Source: `user`
- Sugestie: Pagina de produs sa afiseze marimi disponibile si culori disponibile.
- Impact: `conversie`
- Task tinta: `WP-005`
- Decizie PM: `accept`
- Executie: `commit 2889de9`
- Note: Sursa canonică culori setata pe `supplier_product_variants`, cu fallback pe specs.

## I-2026-02-25-05
- Status: `IMPLEMENTED`
- Source: `user`
- Sugestie: Introducere tag-uri comerciale in catalog (bestseller, sezon, noutati).
- Impact: `conversie`
- Task tinta: `WP-005`
- Decizie PM: `accept`
- Executie: `commits 2889de9, 21fb809`
- Note: Tag-urile sunt in carduri si utilizabile in filtre comerciale.

## I-2026-02-25-06
- Status: `TRIAGED`
- Source: `user`
- Sugestie: CTA system-wide: primary `Cere oferta`, secondary `Discuta cu noi`; pe catalog CTA secundar `Testeaza fara riscuri`.
- Impact: `conversie`
- Task tinta: `WP-005`
- Decizie PM: `accept`
- Executie: `commits 18dd9ed, 21fb809, 07c3021`
- Note: Implementat pe `catalog + product + shortlist`; ramane pass final pe homepage/CTA globale.

## I-2026-02-25-07
- Status: `IMPLEMENTED`
- Source: `user`
- Sugestie: Coerență wireframe pe tot site-ul; pagina de produs sa fie mai orientata pe detaliu produs (nu stil de homepage).
- Impact: `ux`
- Task tinta: `WP-005`
- Decizie PM: `accept`
- Executie: `commits 18dd9ed, 21fb809, 07c3021`
- Note: Include redenumire nav din `Produse` in `Catalog`, carduri cu imagine si layout consistent.

## I-2026-02-25-08
- Status: `IMPLEMENTED`
- Source: `user`
- Sugestie: Adaugare sticky shortlist bar pe mobil pentru acces rapid la conversie.
- Impact: `conversie`
- Task tinta: `WP-005`
- Decizie PM: `accept`
- Executie: `src/pages/produse/index.astro`
- Note: Bara apare doar dupa selectie produse si include `Cere oferta` + `Discuta`.
