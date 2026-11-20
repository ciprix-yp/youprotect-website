// Calculatorul de cost (src/lib/tco.js), după refacerea din 20.11.2026 (D-2026-11-20-08). Valorile așteptate sunt
// calculate de mână, nu copiate din cod.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TCO_DEFAULTS, computeTco, formatDuration, parseTcoInputs, tcoAnswers } from '../src/lib/tco.js';

const base = { employees: 20, durability: 1, adminHours: 0, hourCost: 45 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('tco: fiecare categorie are frecvența și bucățile ei', () => {
  const input = parseTcoInputs({
    ...base,
    categories: ['manusi', 'incaltaminte'],
    prices: { manusi: 10, incaltaminte: 200 },
    qualityPrices: { manusi: 15, incaltaminte: 300 },
    months: { manusi: 0.25, incaltaminte: 12 }, // mănuși săptămânal, încălțăminte anual
    qty: { manusi: 1, incaltaminte: 1 },
  });
  const r = computeTco(input);
  // Mănuși: 20 oameni × 1 pereche × 48 pe an = 960 de perechi, × 10 lei = 9.600 lei.
  close(r.rows[0].unitsPerYear, 960);
  close(r.rows[0].now, 9600);
  // Încălțăminte: 20 × 1 × 1 pe an × 200 lei = 4.000 lei.
  close(r.rows[1].now, 4000);
  close(r.purchaseNow, 13600);
  // Prag din prețuri: (960 × 15 + 20 × 300) / 13.600 = 20.400 / 13.600 = 1,5.
  close(r.breakEvenPrices, 1.5);
});

test('tco: bucăți pe om (ex. două seturi de haine)', () => {
  const r = computeTco(parseTcoInputs({
    ...base, categories: ['imbracaminte'], prices: { imbracaminte: 100 }, qualityPrices: { imbracaminte: 150 },
    months: { imbracaminte: 12 }, qty: { imbracaminte: 2 },
  }));
  close(r.purchaseNow, 20 * 2 * 1 * 100); // 4.000 lei
});

test('tco: durabilitatea împarte doar varianta de calitate; pragul din prețuri nu depinde de ea', () => {
  const raw = { ...base, categories: ['incaltaminte'], prices: { incaltaminte: 180 }, qualityPrices: { incaltaminte: 360 },
    months: { incaltaminte: 6 }, qty: { incaltaminte: 1 } };
  const d1 = computeTco(parseTcoInputs(raw));
  const d2 = computeTco(parseTcoInputs({ ...raw, durability: 2 }));
  close(d1.purchaseNow, d2.purchaseNow);
  close(d2.purchaseQuality, d1.purchaseQuality / 2);
  close(d1.breakEvenPrices, 2); // 360 / 180
  close(d2.breakEvenPrices, 2);
  close(d2.difference, 0); // exact la prag: costă la fel
});

test('tco: administrarea e o ipoteză separată, iar pragul cu ea e egal la paritate', () => {
  const input = parseTcoInputs({ ...base, adminHours: 10, hourCost: 50, categories: ['incaltaminte'],
    prices: { incaltaminte: 200 }, qualityPrices: { incaltaminte: 300 }, months: { incaltaminte: 12 }, qty: { incaltaminte: 1 } });
  const r = computeTco(input);
  close(r.adminNow, 6000); // 10 × 12 × 50
  close(r.breakEvenPrices, 1.5); // fără administrare
  close(r.breakEvenWithAdmin, (6000 + 6000) / (4000 + 6000)); // (calitate + admin) / (acum + admin) = 1,2
  const atPar = computeTco({ ...input, durability: r.breakEvenWithAdmin });
  close(atPar.totalQuality, r.totalNow);
});

test('tco: implicit durează la fel (durabilitate 1), deci rezultatul pornește neutru', () => {
  assert.equal(TCO_DEFAULTS.durability, 1);
  const r = computeTco(parseTcoInputs({ ...TCO_DEFAULTS }));
  close(r.purchaseQuality, r.purchaseQualitySameLife);
});

test('tco: validare și formatul vechi (o singură frecvență pentru toate)', () => {
  const legacy = parseTcoInputs({ ...base, categories: ['incaltaminte', 'manusi'], months: 6 });
  assert.deepEqual(legacy.months, { incaltaminte: 6, manusi: 6 });
  assert.equal(parseTcoInputs({ ...base, categories: ['manusi'], months: 5 }), null);
  const bad = parseTcoInputs({ ...base, categories: ['manusi'], months: { manusi: 7 }, qty: { manusi: 999 }, prices: { manusi: 0 } });
  assert.equal(bad.months.manusi, 1); // frecvență necunoscută → exemplul categoriei
  assert.equal(bad.qty.manusi, 50); // limita
  assert.equal(bad.prices.manusi, 1); // serverul nu primește niciodată 0; pagina nu lasă să treci cu un preț sub 1 leu
});

test('tco: durata în română („de” la 20+, săptămâni sub o lună)', () => {
  assert.equal(formatDuration(0.25), '1 săptămână');
  assert.equal(formatDuration(0.5), '2 săptămâni');
  assert.equal(formatDuration(1), '1 lună');
  assert.equal(formatDuration(13.5), '13,5 luni');
  assert.equal(formatDuration(30), '30 de luni');
  assert.equal(formatDuration(36), '3 ani');
});

test('tco: rezumatul pentru CRM are frecvența și bucățile pe categorie', () => {
  const input = parseTcoInputs({ ...base, categories: ['manusi'], months: { manusi: 0.25 }, qty: { manusi: 2 } });
  const answers = tcoAnswers(input, computeTco(input));
  const cats = answers.find((a) => a.question === 'calc_categorii').answer;
  assert.match(cats, /2 buc\.\/om, în fiecare săptămână/);
  assert.ok(answers.some((a) => a.question === 'calc_prag_admin'));
  assert.ok(answers.length <= 30);
});
