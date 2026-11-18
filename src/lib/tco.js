// Calculatorul de cost real al echipamentelor (pagina /calculator-cost-echipamente/).
// O singură sursă pentru calcul: o folosesc pagina (TCOCalculator.tsx) și serverul (server/leads.js), ca cifrele care
// ajung în CRM să fie recalculate din datele introduse, nu luate de la client.
//
// Modelul e intenționat simplu și are toate ipotezele la vedere. Nu folosește cifre „din industrie”:
//   - cost de achiziție pe an = angajați × preț × înlocuiri pe an (12 / luni între înlocuiri);
//   - timpul de administrare (comandă, recepție, distribuire, evidență) = ore pe lună × 12 × cost orar;
//   - varianta de calitate durează de `durability` ori mai mult, deci se înlocuiește și se administrează de atâtea
//     ori mai rar. `durability` e o ipoteză pe care o alege vizitatorul; o verificăm la testare.
//   - 220 de zile lucrătoare pe an, pentru costul pe zi de purtare.
//   - pragul de rentabilitate (`breakEven`) nu depinde de nicio ipoteză: de câte ori trebuie să dureze mai mult un
//     produs de calitate ca să coste la fel pe an. Peste prag, costă mai puțin.

import { DOMAINS } from './domains.js';

export const TCO_CATEGORIES = {
  incaltaminte: { label: 'Încălțăminte de protecție', price: 180, qualityPrice: 350 },
  imbracaminte: { label: 'Îmbrăcăminte de lucru', price: 120, qualityPrice: 220 },
  manusi: { label: 'Mănuși de protecție', price: 25, qualityPrice: 45 },
  casti: { label: 'Căști de protecție', price: 80, qualityPrice: 160 },
  ochelari: { label: 'Ochelari de protecție', price: 35, qualityPrice: 70 },
};

export const TCO_LIMITS = {
  employees: { min: 5, max: 500 },
  price: { min: 1, max: 5000 },
  months: [3, 4, 6, 9, 12],
  durability: { min: 1, max: 3, step: 0.25 },
  adminHours: { min: 0, max: 80 },
  hourCost: { min: 10, max: 300 },
};

export const WORKING_DAYS_PER_YEAR = 220;

export const TCO_DEFAULTS = {
  domain: '',
  employees: 20,
  categories: ['incaltaminte', 'imbracaminte'],
  prices: {},
  qualityPrices: {},
  months: 6,
  durability: 2,
  adminHours: 4,
  hourCost: 45,
};

const clamp = (n, { min, max }) => Math.min(max, Math.max(min, n));
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Validează datele calculatorului (de la client sau din payload) și le aduce în limite.
 * Întoarce null dacă lipsesc câmpurile obligatorii sau au tip greșit.
 */
export function parseTcoInputs(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { employees, months, durability, adminHours, hourCost } = raw;
  if (![employees, durability, adminHours, hourCost].every(isNum)) return null;
  if (!TCO_LIMITS.months.includes(months)) return null;
  const categories = Array.isArray(raw.categories)
    ? [...new Set(raw.categories.filter((c) => typeof c === 'string' && Object.hasOwn(TCO_CATEGORIES, c)))]
    : [];
  if (!categories.length) return null;

  const priceMap = (source, key) => {
    const out = {};
    for (const id of categories) {
      const value = source && typeof source === 'object' && Object.hasOwn(source, id) ? source[id] : undefined;
      out[id] = isNum(value) ? clamp(Math.round(value), TCO_LIMITS.price) : TCO_CATEGORIES[id][key];
    }
    return out;
  };

  return {
    domain: DOMAINS.includes(raw.domain) ? raw.domain : '',
    employees: clamp(Math.round(employees), TCO_LIMITS.employees),
    categories,
    prices: priceMap(raw.prices, 'price'),
    qualityPrices: priceMap(raw.qualityPrices, 'qualityPrice'),
    months,
    durability: clamp(Math.round(durability * 4) / 4, TCO_LIMITS.durability),
    adminHours: clamp(Math.round(adminHours), TCO_LIMITS.adminHours),
    hourCost: clamp(Math.round(hourCost), TCO_LIMITS.hourCost),
  };
}

/** Calculul propriu-zis, pe date deja validate cu parseTcoInputs. Sume în lei pe an. */
export function computeTco(input) {
  const perYear = 12 / input.months;
  const rows = input.categories.map((id) => {
    const now = input.employees * input.prices[id] * perYear;
    const quality = (input.employees * input.qualityPrices[id] * perYear) / input.durability;
    return { id, label: TCO_CATEGORIES[id].label, now, quality };
  });
  const purchaseNow = rows.reduce((s, r) => s + r.now, 0);
  const purchaseQuality = rows.reduce((s, r) => s + r.quality, 0);
  const adminNow = input.adminHours * 12 * input.hourCost;
  const adminQuality = adminNow / input.durability;
  const totalNow = purchaseNow + adminNow;
  const totalQuality = purchaseQuality + adminQuality;
  const difference = totalNow - totalQuality; // > 0: varianta de calitate costă mai puțin pe an
  // Cu durabilitate d, costul de calitate e (achiziție la d=1 + administrare) / d; la prag e egal cu costul de acum.
  const breakEven = totalNow > 0 ? (purchaseQuality * input.durability + adminNow) / totalNow : 0;
  const days = input.employees * WORKING_DAYS_PER_YEAR;
  return {
    rows,
    purchaseNow,
    purchaseQuality,
    adminNow,
    adminQuality,
    totalNow,
    totalQuality,
    difference,
    differencePct: totalNow > 0 ? (difference / totalNow) * 100 : 0,
    breakEven,
    perDayNow: totalNow / days,
    perDayQuality: totalQuality / days,
  };
}

/** Număr cu virgulă zecimală, ca în română: 1,5. */
export const formatFactor = (n) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 }).format(n);

const lei = (n) => `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(Math.round(n))} lei`;
export const formatLei = lei;

/** Rezumatul pentru CRM și pentru emailul de notificare: perechi label/answer, ca la formulare. */
export function tcoAnswers(input, result) {
  const cats = input.categories
    .map((id) => `${TCO_CATEGORIES[id].label} (${input.prices[id]} → ${input.qualityPrices[id]} lei/buc.)`)
    .join('; ');
  return [
    { question: 'sursa', label: 'Sursa', answer: 'Calculatorul de cost (estimare orientativă)' },
    ...(input.domain ? [{ question: 'calc_domeniu', label: 'Domeniu', answer: input.domain }] : []),
    { question: 'calc_angajati', label: 'Angajați cu echipament', answer: String(input.employees) },
    { question: 'calc_categorii', label: 'Categorii (preț actual → preț calitate)', answer: cats },
    { question: 'calc_inlocuire', label: 'Înlocuire acum', answer: `la ${input.months} luni` },
    { question: 'calc_durabilitate', label: 'Durabilitate presupusă', answer: `de ${formatFactor(input.durability)} ori mai mult` },
    { question: 'calc_prag', label: 'Prag de rentabilitate', answer: `de ${formatFactor(result.breakEven)} ori mai mult` },
    { question: 'calc_admin', label: 'Administrare', answer: `${input.adminHours} ore/lună × ${input.hourCost} lei/oră` },
    { question: 'calc_cost_acum', label: 'Cost estimat acum', answer: `${lei(result.totalNow)}/an` },
    { question: 'calc_cost_calitate', label: 'Cost estimat cu produse de calitate', answer: `${lei(result.totalQuality)}/an` },
    { question: 'calc_diferenta', label: 'Diferență estimată', answer: `${lei(result.difference)}/an` },
  ];
}
