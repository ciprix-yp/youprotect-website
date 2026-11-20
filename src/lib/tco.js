// Calculatorul de cost real al echipamentelor (pagina /calculator-cost-echipamente/).
// O singură sursă pentru calcul: o folosesc pagina (TCOCalculator.tsx) și serverul (server/leads.js), ca cifrele care
// ajung în CRM să fie recalculate din datele introduse, nu luate de la client.
//
// Modelul e intenționat simplu și are toate ipotezele la vedere. Nu folosește cifre „din industrie”.
// Refăcut pe 20.11.2026 (D-2026-11-20-08), după auditul care a arătat că o singură frecvență de înlocuire pentru toate
// categoriile (mănuși și căști la fel) și o singură bucată pe om dădeau totaluri greșite.
//   - pe fiecare categorie: bucăți pe an = angajați × bucăți pe om × înlocuiri pe an (12 / luni între înlocuiri);
//     cost de achiziție pe an = bucăți pe an × preț;
//   - varianta de calitate durează de `durability` ori mai mult, deci se cumpără de atâtea ori mai rar. `durability`
//     e o ipoteză pe care o alege vizitatorul (implicit 1: durează la fel); o verificăm la testare;
//   - pragul din prețuri (`breakEvenPrices`) nu depinde de nicio ipoteză: de câte ori trebuie să dureze mai mult
//     produsele de calitate ca să coste la fel pe an;
//   - timpul de administrare (comandă, recepție, distribuire, evidență) = ore pe lună × 12 × cost orar. IPOTEZĂ: scade
//     în aceeași proporție cu înlocuirile. Pragul care o include (`breakEvenWithAdmin`) e afișat separat, numit ca atare;
//   - 220 de zile lucrătoare pe an, pentru costul pe zi de purtare.

import { DOMAINS } from './domains.js';

// Frecvențele de înlocuire, în luni (o săptămână ≈ 0,25 luni).
export const TCO_INTERVALS = [
  { months: 0.25, label: 'în fiecare săptămână' },
  { months: 0.5, label: 'la 2 săptămâni' },
  { months: 1, label: 'lunar' },
  { months: 2, label: 'la 2 luni' },
  { months: 3, label: 'la 3 luni' },
  { months: 6, label: 'la 6 luni' },
  { months: 9, label: 'la 9 luni' },
  { months: 12, label: 'o dată pe an' },
  { months: 18, label: 'la 18 luni' },
  { months: 24, label: 'la 2 ani' },
  { months: 36, label: 'la 3 ani' },
];
const INTERVAL_MONTHS = TCO_INTERVALS.map((i) => i.months);
export const intervalLabel = (months) => TCO_INTERVALS.find((i) => i.months === months)?.label ?? `la ${months} luni`;

// Valorile de pornire sunt doar exemple (pagina o spune); vizitatorul le înlocuiește cu ale lui.
// `riskFreeTesting: false`: categoria nu intră în „Testare fără riscuri” (D-2026-11-19-06); rezultatul îi oferă
// ofertă directă, nu testare.
export const TCO_CATEGORIES = {
  incaltaminte: { label: 'Încălțăminte de protecție', price: 180, qualityPrice: 350, months: 12, qty: 1, riskFreeTesting: true },
  imbracaminte: { label: 'Îmbrăcăminte de lucru', price: 120, qualityPrice: 220, months: 12, qty: 1, riskFreeTesting: true },
  manusi: { label: 'Mănuși de protecție', price: 25, qualityPrice: 45, months: 1, qty: 1, riskFreeTesting: true },
  casti: { label: 'Căști de protecție', price: 80, qualityPrice: 160, months: 24, qty: 1, riskFreeTesting: false },
  ochelari: { label: 'Ochelari de protecție', price: 35, qualityPrice: 70, months: 6, qty: 1, riskFreeTesting: false },
};

// Limitele sunt și capetele sliderelor din calculator (TCOCalculator.tsx citește de aici): serverul nu acceptă altceva
// decât poate alege vizitatorul. Înainte, sliderele mergeau până la 200/40/150, iar serverul până la 500/80/300.
export const TCO_LIMITS = {
  employees: { min: 5, max: 200 },
  // Prețuri cu bani (2 zecimale): mănușile de unică folosință sau dopurile de urechi costă sub un leu (audit, 20.11.2026).
  price: { min: 0.01, max: 5000 },
  qty: { min: 1, max: 50 },
  months: INTERVAL_MONTHS,
  durability: { min: 1, max: 3, step: 0.25 },
  adminHours: { min: 0, max: 40 },
  hourCost: { min: 10, max: 150 },
};

export const WORKING_DAYS_PER_YEAR = 220;

export const TCO_DEFAULTS = {
  domain: '',
  employees: 20,
  categories: ['incaltaminte', 'imbracaminte'],
  prices: {},
  qualityPrices: {},
  months: {},
  qty: {},
  // 1 = durează la fel: rezultatul rămâne neutru până alege vizitatorul (owner, 20.11.2026).
  durability: 1,
  adminHours: 4,
  hourCost: 45,
};

const clamp = (n, { min, max }) => Math.min(max, Math.max(min, n));
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const own = (obj, key) => obj && typeof obj === 'object' && !Array.isArray(obj) && Object.hasOwn(obj, key);

/**
 * Validează datele calculatorului (de la client sau din payload) și le aduce în limite.
 * Întoarce null dacă lipsesc câmpurile obligatorii sau au tip greșit.
 * Compatibil și cu formatul vechi (o singură frecvență, `months` număr), de la paginile deschise înainte de 20.11.2026.
 */
export function parseTcoInputs(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { employees, durability, adminHours, hourCost } = raw;
  if (![employees, durability, adminHours, hourCost].every(isNum)) return null;
  const legacyMonths = isNum(raw.months) ? raw.months : null;
  if (legacyMonths !== null && !INTERVAL_MONTHS.includes(legacyMonths)) return null;
  const categories = Array.isArray(raw.categories)
    ? [...new Set(raw.categories.filter((c) => typeof c === 'string' && Object.hasOwn(TCO_CATEGORIES, c)))]
    : [];
  if (!categories.length) return null;

  const perCategory = (source, fallback, valid) => {
    const out = {};
    for (const id of categories) {
      const value = own(source, id) ? source[id] : undefined;
      out[id] = valid(value) ?? fallback(id);
    }
    return out;
  };
  const price = (v) => (isNum(v) ? clamp(Math.round(v * 100) / 100, TCO_LIMITS.price) : null);

  return {
    domain: DOMAINS.includes(raw.domain) ? raw.domain : '',
    employees: clamp(Math.round(employees), TCO_LIMITS.employees),
    categories,
    prices: perCategory(raw.prices, (id) => TCO_CATEGORIES[id].price, price),
    qualityPrices: perCategory(raw.qualityPrices, (id) => TCO_CATEGORIES[id].qualityPrice, price),
    months: perCategory(raw.months, (id) => legacyMonths ?? TCO_CATEGORIES[id].months, (v) =>
      INTERVAL_MONTHS.includes(v) ? v : null,
    ),
    qty: perCategory(raw.qty, (id) => TCO_CATEGORIES[id].qty, (v) => (isNum(v) ? clamp(Math.round(v), TCO_LIMITS.qty) : null)),
    durability: clamp(Math.round(durability * 4) / 4, TCO_LIMITS.durability),
    adminHours: clamp(Math.round(adminHours), TCO_LIMITS.adminHours),
    hourCost: clamp(Math.round(hourCost), TCO_LIMITS.hourCost),
  };
}

/**
 * Un rând din rezultat: o categorie, cu bucățile pe an și costul pe an acum / cu produse de calitate.
 * @typedef {{ id: string, label: string, unitsPerYear: number, now: number, qualitySameLife: number, quality: number }} TcoRow
 */

/** Calculul propriu-zis, pe date deja validate cu parseTcoInputs. Sume în lei pe an. */
export function computeTco(input) {
  const d = input.durability;
  /** @type {TcoRow[]} */
  const rows = input.categories.map((id) => {
    const unitsPerYear = input.employees * input.qty[id] * (12 / input.months[id]);
    const now = unitsPerYear * input.prices[id];
    const qualitySameLife = unitsPerYear * input.qualityPrices[id];
    return { id, label: TCO_CATEGORIES[id].label, unitsPerYear, now, qualitySameLife, quality: qualitySameLife / d };
  });
  const purchaseNow = rows.reduce((s, r) => s + r.now, 0);
  const purchaseQualitySameLife = rows.reduce((s, r) => s + r.qualitySameLife, 0);
  const purchaseQuality = purchaseQualitySameLife / d;
  const adminNow = input.adminHours * 12 * input.hourCost;
  const adminQuality = adminNow / d; // ipoteză: administrarea scade odată cu înlocuirile
  const totalNow = purchaseNow + adminNow;
  const totalQuality = purchaseQuality + adminQuality;
  const difference = totalNow - totalQuality; // > 0: varianta de calitate costă mai puțin pe an
  const days = input.employees * WORKING_DAYS_PER_YEAR;
  return {
    rows,
    purchaseNow,
    purchaseQuality,
    purchaseQualitySameLife,
    adminNow,
    adminQuality,
    totalNow,
    totalQuality,
    difference,
    differencePct: totalNow > 0 ? (difference / totalNow) * 100 : 0,
    // Fără ipoteze: de câte ori trebuie să dureze mai mult ca achiziția să coste la fel pe an.
    breakEvenPrices: purchaseNow > 0 ? purchaseQualitySameLife / purchaseNow : 0,
    // Cu ipoteza că și timpul de administrare scade odată cu înlocuirile.
    breakEvenWithAdmin: totalNow > 0 ? (purchaseQualitySameLife + adminNow) / totalNow : 0,
    perDayNow: totalNow / days,
    perDayQuality: totalQuality / days,
  };
}

/** Număr cu virgulă zecimală, ca în română: 1,5. */
export const formatFactor = (n) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 }).format(n);

const lei = (n) => `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(Math.round(n))} lei`;
export const formatLei = lei;
/** Prețul pe bucată, cu bani: „4,5”, „0,35”, „1.250”. */
export const formatUnitPrice = (n) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(n);

// „1 lună”, „12 luni”, „24 de luni”: „de” după numerele întregi cu ultimele două cifre 00 sau 20–99.
const plural = new Intl.PluralRules('ro-RO');
function countRo(n, one, many) {
  if (n === 1) return `1 ${one}`;
  const de = Number.isInteger(n) && plural.select(n) === 'other' ? 'de ' : '';
  return `${formatFactor(n)} ${de}${many}`;
}

/** Durata dintre înlocuiri, pentru text: „2 săptămâni”, „1 lună”, „18 luni”, „3 ani”. */
export function formatDuration(months) {
  if (months < 1) return countRo(Math.round(months * 4 * 2) / 2, 'săptămână', 'săptămâni');
  if (months >= 24 && months % 12 === 0) return countRo(months / 12, 'an', 'ani');
  return countRo(months, 'lună', 'luni');
}

/** Rezumatul pentru CRM și pentru emailul de notificare: perechi label/answer, ca la formulare. */
export function tcoAnswers(input, result) {
  const cats = input.categories
    .map((id) => {
      const qty = input.qty[id] === 1 ? '1 buc./om' : `${input.qty[id]} buc./om`;
      return `${TCO_CATEGORIES[id].label}: ${formatUnitPrice(input.prices[id])} → ${formatUnitPrice(input.qualityPrices[id])} lei/buc., ${qty}, ${intervalLabel(input.months[id])}`;
    })
    .join('; ');
  return [
    { question: 'sursa', label: 'Sursa', answer: 'Calculatorul de cost (estimare orientativă)' },
    ...(input.domain ? [{ question: 'calc_domeniu', label: 'Domeniu', answer: input.domain }] : []),
    { question: 'calc_angajati', label: 'Angajați cu echipament', answer: String(input.employees) },
    { question: 'calc_categorii', label: 'Categorii (preț acum → calitate, bucăți, înlocuire)', answer: cats },
    { question: 'calc_durabilitate', label: 'Durabilitate presupusă', answer: `de ${formatFactor(input.durability)} ori mai mult` },
    { question: 'calc_prag', label: 'Prag din prețuri', answer: `de ${formatFactor(result.breakEvenPrices)} ori mai mult` },
    { question: 'calc_prag_admin', label: 'Prag cu administrarea', answer: `de ${formatFactor(result.breakEvenWithAdmin)} ori mai mult` },
    { question: 'calc_admin', label: 'Administrare', answer: `${input.adminHours} ore/lună × ${input.hourCost} lei/oră` },
    { question: 'calc_cost_acum', label: 'Cost estimat acum', answer: `${lei(result.totalNow)}/an` },
    { question: 'calc_cost_calitate', label: 'Cost estimat cu produse de calitate', answer: `${lei(result.totalQuality)}/an` },
    { question: 'calc_diferenta', label: 'Diferență estimată', answer: `${lei(result.difference)}/an` },
  ];
}
