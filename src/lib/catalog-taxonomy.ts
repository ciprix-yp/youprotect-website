// Taxonomia catalogului: o singură sursă pentru schema de conținut și pentru afișare.

export const CATEGORIES = {
  reflectorizante: 'Îmbrăcăminte reflectorizantă',
  'geci-jachete': 'Geci și jachete',
  'tricouri-polo': 'Tricouri și polo',
  pantaloni: 'Pantaloni',
  camasi: 'Cămăși',
  incaltaminte: 'Încălțăminte de protecție',
} as const;

export const INDUSTRIES = {
  constructii: 'Construcții',
  logistica: 'Logistică',
  productie: 'Producție',
  alimentar: 'Industria alimentară',
  corporate: 'Uniforme corporate',
  energie: 'Energie și offshore',
} as const;

// Paginile de industrie care există deja pe site.
export const INDUSTRY_PAGES: Partial<Record<IndustryKey, string>> = {
  constructii: '/industrii/constructii/',
  logistica: '/industrii/logistica/',
  productie: '/industrii/productie/',
};

export type CategoryKey = keyof typeof CATEGORIES;
export type IndustryKey = keyof typeof INDUSTRIES;

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as [CategoryKey, ...CategoryKey[]];
export const INDUSTRY_KEYS = Object.keys(INDUSTRIES) as [IndustryKey, ...IndustryKey[]];
