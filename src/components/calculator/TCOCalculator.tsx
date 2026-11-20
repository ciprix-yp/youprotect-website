import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DOMAINS } from '../../lib/domains.js';
import { RISK_FREE_TESTING, SITE } from '../../lib/site';
import {
  TCO_CATEGORIES,
  TCO_DEFAULTS,
  TCO_INTERVALS,
  TCO_LIMITS,
  WORKING_DAYS_PER_YEAR,
  computeTco,
  formatDuration,
  formatFactor,
  formatLei,
  parseTcoInputs,
} from '../../lib/tco.js';
import { track } from '../../lib/track';
import { HONEYPOT_FIELD } from '../../lib/honeypot.js';
import { EMAIL_REGEX } from '../../lib/lead-limits.js';
import { postLead } from '../../lib/post-lead.js';
import Honeypot from '../forms/Honeypot';

// Calculatorul de cost real (lead magnet). Calculul e în src/lib/tco.js, comun cu serverul.
// Rezultatul apare imediat, fără date de contact. Datele de contact sunt opționale, la final, pentru cine vrea să
// verificăm ipoteza la el în echipă; cererea intră în inbox-ul de cereri (D1 → Prospector) ca cerere de ofertă.

type CategoryId = keyof typeof TCO_CATEGORIES;
/** „căști de protecție și ochelari de protecție” */
const joinRo = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} și ${items[items.length - 1]}`);
const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('ro') + s.slice(1);

type Inputs = typeof TCO_DEFAULTS & {
  categories: string[];
  prices: Record<string, number>;
  qualityPrices: Record<string, number>;
  months: Record<string, number>;
  qty: Record<string, number>;
};

const STEPS = ['echipa', 'produse', 'ipoteze', 'rezultat', 'contact', 'gata'] as const;
const INPUT_STEPS = 3;

const SMALL_TEAM_WHATSAPP = `https://wa.me/${SITE.telephone.replace(/\D/g, '')}?text=${encodeURIComponent(
  'Bună! Am o echipă de 1–4 persoane și aș vrea o recomandare de echipamente.',
)}`;

const inputClass =
  'w-full bg-[#0a0a0a] border border-white/15 rounded-md px-4 py-3 text-white placeholder:text-neutral-400 focus:outline-none focus:border-yp-yellow transition-colors';

const toggleClass = (selected: boolean) =>
  `min-h-[44px] px-4 py-2 rounded-md border text-sm text-left transition-colors ${
    selected ? 'border-yp-yellow bg-yp-yellow/10 text-yp-yellow font-medium' : 'border-white/10 bg-[#0a0a0a] text-neutral-300 hover:border-white/30'
  }`;

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline gap-3 mb-2">
        <label htmlFor={id} className="text-sm font-medium text-neutral-300">
          {label}
        </label>
        <span className="text-yp-yellow font-semibold font-mono whitespace-nowrap" aria-hidden="true">
          {value} {suffix}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={`${value} ${suffix}`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-yp-yellow h-6 cursor-pointer"
      />
      {hint && <p className="text-xs text-neutral-400 mt-1">{hint}</p>}
    </div>
  );
}

// Prețul se scrie ca text: acceptă și virgula („12,5”), cum scriu românii. Un câmp gol sau invalid dă NaN, iar pasul
// nu trece mai departe până nu e corectat (înainte, 0 apărea pe ecran, dar calculul folosea în tăcere 1 leu).
const parsePrice = (s: string) => {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
};

function PriceInput({
  id,
  label,
  value,
  onChange,
  invalid,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  invalid?: boolean;
}) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : '');
  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className="block text-xs text-neutral-400 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={invalid ? true : undefined}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parsePrice(e.target.value));
          }}
          className={`w-full min-h-11 bg-[#0a0a0a] border rounded-md px-3 py-2 text-white font-mono text-right focus:outline-none focus:border-yp-yellow ${
            invalid ? 'border-red-400/70' : 'border-white/15'
          }`}
        />
        <span className="text-xs text-neutral-400">lei</span>
      </div>
    </div>
  );
}

// Costul pe zi de om, cu bani: „3,22”.
const formatPerDay = (n: number) =>
  new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const selectClass =
  'w-full min-h-11 bg-[#0a0a0a] border border-white/15 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-yp-yellow';

export default function TCOCalculator() {
  const [step, setStep] = useState(0);
  const [inputs, setInputs] = useState<Inputs>({
    ...TCO_DEFAULTS,
    categories: [...TCO_DEFAULTS.categories],
    prices: {},
    qualityPrices: {},
    months: {},
    qty: {},
  });
  // Căștile și ochelarii nu intră în testare: pentru ele oferim direct oferta (TCO_CATEGORIES.riskFreeTesting).
  const testable = inputs.categories.filter((c) => TCO_CATEGORIES[c as keyof typeof TCO_CATEGORIES]?.riskFreeTesting);
  const notTestable = inputs.categories
    .filter((c) => !TCO_CATEGORIES[c as keyof typeof TCO_CATEGORIES]?.riskFreeTesting)
    .map((c) => TCO_CATEGORIES[c as keyof typeof TCO_CATEGORIES].label.toLocaleLowerCase('ro'));
  const offersTesting = testable.length > 0;
  const [contact, setContact] = useState({ name: '', company: '', email: '', phone: '' });
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ message: string | null } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const set = <K extends keyof Inputs>(key: K, value: Inputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setErrors({});
  };
  const priceOf = (id: string) => inputs.prices[id] ?? TCO_CATEGORIES[id as CategoryId].price;
  const qualityPriceOf = (id: string) => inputs.qualityPrices[id] ?? TCO_CATEGORIES[id as CategoryId].qualityPrice;
  const monthsOf = (id: string) => inputs.months[id] ?? TCO_CATEGORIES[id as CategoryId].months;
  const qtyOf = (id: string) => inputs.qty[id] ?? TCO_CATEGORIES[id as CategoryId].qty;
  const badPrice = (v: number) => !Number.isFinite(v) || v < TCO_LIMITS.price.min || v > TCO_LIMITS.price.max;
  const invalidPrices = inputs.categories.filter((c) => badPrice(priceOf(c)) || badPrice(qualityPriceOf(c)));

  // Aceeași validare și același calcul ca pe server.
  const parsed = useMemo(() => parseTcoInputs(inputs), [inputs]);
  const result = useMemo(() => (parsed ? computeTco(parsed) : null), [parsed]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const next = () => {
    if (STEPS[step] === 'produse' && inputs.categories.length === 0) {
      setErrors({ categories: 'Alege cel puțin o categorie.' });
      return;
    }
    if (STEPS[step] === 'produse' && invalidPrices.length > 0) {
      const names = invalidPrices.map((c) => TCO_CATEGORIES[c as CategoryId].label.toLocaleLowerCase('ro'));
      setErrors({
        categories: `Pune prețurile pe bucată, între 0,01 și 5.000 de lei, la ${joinRo(names)}.`,
      });
      return;
    }
    setErrors({});
    track('calculator_step', { step: STEPS[step], step_number: step + 1 });
    if (STEPS[step + 1] === 'rezultat' && result) track('calculator_result', { cheaper_with_quality: result.difference > 0 });
    setStep((s) => s + 1);
  };
  const back = () => {
    setErrors({});
    setStep((s) => s - 1);
  };

  const toggleCategory = (id: string) =>
    set('categories', inputs.categories.includes(id) ? inputs.categories.filter((c) => c !== id) : [...inputs.categories, id]);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!contact.name.trim()) e.name = 'Scrie numele tău.';
    if (!contact.company.trim()) e.company = 'Scrie numele firmei.';
    if (!EMAIL_REGEX.test(contact.email.trim())) e.email = 'Scrie o adresă de email validă, de forma nume@firma.ro.';
    setErrors(e);
    const invalid = Object.keys(e);
    if (invalid.length) requestAnimationFrame(() => document.getElementById(`c-${invalid[0]}`)?.focus());
    if (invalid.length || !parsed) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await postLead({ intent: 'quote', data: { ...contact, calculator: parsed, [HONEYPOT_FIELD]: honeypot || undefined } });
      if (!result.ok) {
        setSubmitError({ message: result.message });
        return;
      }
      window.dispatchEvent(new CustomEvent('yp:lead', { detail: { form: 'calculator' } }));
      setStep(STEPS.indexOf('gata'));
    } catch (err) {
      console.error(err);
      setSubmitError({ message: null });
    } finally {
      setSubmitting(false);
    }
  };

  const heading = (title: string, description?: string) => (
    <div className="mb-8">
      <h2 ref={headingRef} tabIndex={-1} className="text-2xl md:text-3xl font-medium text-white mb-2 focus:outline-none">
        {title}
      </h2>
      {description && <p className="text-neutral-400">{description}</p>}
    </div>
  );

  const contactField = (id: keyof typeof contact, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label htmlFor={`c-${id}`} className="block text-sm font-medium text-neutral-300 mb-1">
        {label}
      </label>
      <input
        id={`c-${id}`}
        className={inputClass}
        value={contact[id]}
        onChange={(ev) => {
          setContact((p) => ({ ...p, [id]: ev.target.value }));
          setErrors((p) => ({ ...p, [id]: '' }));
        }}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `c-${id}-err` : undefined}
        {...props}
      />
      {errors[id] && (
        <p id={`c-${id}-err`} className="text-red-400 text-sm mt-1">
          {errors[id]}
        </p>
      )}
    </div>
  );

  const id = STEPS[step];

  return (
    <div
      ref={containerRef}
      className="max-w-xl mx-auto w-full bg-[#111] rounded-[8px] border border-white/5 p-6 md:p-8 shadow-2xl scroll-mt-28 text-white"
    >
      {step < INPUT_STEPS && (
        <div className="mb-8">
          <div className="flex justify-between items-end mb-2">
            <span className="text-sm font-medium text-yp-yellow">
              Pasul {step + 1} din {INPUT_STEPS}
            </span>
          </div>
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: INPUT_STEPS }, (_, i) => (
              <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-yp-yellow' : 'bg-[#222]'}`} />
            ))}
          </div>
        </div>
      )}

      {id === 'echipa' && (
        <div className="space-y-8">
          {heading('Echipa ta', 'Pentru câți oameni cumperi echipamente de protecție și haine de lucru?')}
          <NumberField
            id="t-employees"
            label="Angajați care primesc echipament"
            value={inputs.employees}
            onChange={(v) => set('employees', v)}
            min={TCO_LIMITS.employees.min}
            max={200}
            suffix="pers."
          />
          <p className="text-sm text-neutral-400 -mt-4">
            Ai o echipă de 1–4 persoane?{' '}
            <a
              href={SMALL_TEAM_WHATSAPP}
              target="_blank"
              rel="noopener"
              data-track="whatsapp"
              data-track-location="calculator-echipa-mica"
              className="text-yp-yellow underline underline-offset-4 hover:text-white"
            >
              Scrie-ne pe WhatsApp
            </a>
            .
          </p>
          <fieldset>
            <legend className="text-sm font-medium text-neutral-300 mb-3">Domeniul (opțional)</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DOMAINS.map((d) => (
                <button key={d} type="button" aria-pressed={inputs.domain === d} onClick={() => set('domain', inputs.domain === d ? '' : d)} className={toggleClass(inputs.domain === d)}>
                  {d}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {id === 'produse' && (
        <div className="space-y-8">
          {heading(
            'Ce cumperi și cât costă',
            'Alege categoriile. La fiecare pui prețul pe bucată de acum și al unui produs de calitate, câte bucăți primește un om și cât de des le înlocuiești.',
          )}
          <div className="space-y-3" role="group" aria-label="Categorii de produse">
            {Object.entries(TCO_CATEGORIES).map(([cid, cat]) => {
              const selected = inputs.categories.includes(cid);
              return (
                <div key={cid} className={`rounded-md border ${selected ? 'border-yp-yellow/60' : 'border-white/10'}`}>
                  <button type="button" aria-pressed={selected} onClick={() => toggleCategory(cid)} className={`w-full ${toggleClass(selected)} border-0`}>
                    {selected ? '✓ ' : ''}
                    {cat.label}
                  </button>
                  {selected && (
                    <div className="space-y-3 px-4 pb-4 pt-1">
                      <div className="flex gap-3">
                        <PriceInput
                          id={`p-${cid}`}
                          label="Preț acum, pe bucată"
                          value={priceOf(cid)}
                          invalid={badPrice(priceOf(cid))}
                          onChange={(v) => set('prices', { ...inputs.prices, [cid]: v })}
                        />
                        <PriceInput
                          id={`q-${cid}`}
                          label="Preț calitate, pe bucată"
                          value={qualityPriceOf(cid)}
                          invalid={badPrice(qualityPriceOf(cid))}
                          onChange={(v) => set('qualityPrices', { ...inputs.qualityPrices, [cid]: v })}
                        />
                      </div>
                      <div className="flex gap-3">
                        <div className="w-28 shrink-0">
                          <label htmlFor={`n-${cid}`} className="block text-xs text-neutral-400 mb-1">
                            Bucăți pe om
                          </label>
                          <select
                            id={`n-${cid}`}
                            value={qtyOf(cid)}
                            onChange={(e) => set('qty', { ...inputs.qty, [cid]: Number(e.target.value) })}
                            className={selectClass}
                          >
                            {[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1 min-w-0">
                          <label htmlFor={`m-${cid}`} className="block text-xs text-neutral-400 mb-1">
                            Le înlocuiești
                          </label>
                          <select
                            id={`m-${cid}`}
                            value={monthsOf(cid)}
                            onChange={(e) => set('months', { ...inputs.months, [cid]: Number(e.target.value) })}
                            className={selectClass}
                          >
                            {TCO_INTERVALS.map((i) => (
                              <option key={i.months} value={i.months}>
                                {i.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {errors.categories && (
            <p role="alert" className="text-red-400 text-sm">
              {errors.categories}
            </p>
          )}
          <p className="text-xs text-neutral-400 -mt-4">
            Valorile de pornire sunt doar exemple. Pune prețurile și frecvențele tale, ca rezultatul să fie al tău. La mănuși
            și alte consumabile, „bucăți pe om” sunt perechile pe care le primește un om de fiecare dată.
          </p>
        </div>
      )}

      {id === 'ipoteze' && (
        <div className="space-y-8">
          {heading('Ipotezele tale', 'Aici decizi tu cât rezistă produsele de calitate. Calculul nu presupune nimic în locul tău.')}
          <NumberField
            id="t-durability"
            label="De câte ori durează mai mult un produs de calitate"
            value={inputs.durability}
            onChange={(v) => set('durability', v)}
            min={TCO_LIMITS.durability.min}
            max={TCO_LIMITS.durability.max}
            step={TCO_LIMITS.durability.step}
            suffix="ori"
            hint="Pornește de la 1, adică durează la fel. Mută cursorul cât crezi că durează în plus; la testare vedem cât rezistă de fapt la voi."
          />
          {inputs.categories.length > 0 && inputs.durability > 1 && (
            <p className="text-sm text-neutral-300 -mt-4">
              Adică, de exemplu, {TCO_CATEGORIES[inputs.categories[0] as CategoryId].label.toLocaleLowerCase('ro')} ar ține{' '}
              {formatDuration(monthsOf(inputs.categories[0]) * inputs.durability)}, nu {formatDuration(monthsOf(inputs.categories[0]))}.
            </p>
          )}
          <NumberField
            id="t-admin"
            label="Ore pe lună cu echipamentele"
            value={inputs.adminHours}
            onChange={(v) => set('adminHours', v)}
            min={TCO_LIMITS.adminHours.min}
            max={40}
            suffix="ore"
            hint="Comenzi, recepție, împărțit pe mărimi, evidență, înlocuiri. Pune 0 dacă nu vrei să-l iei în calcul."
          />
          <NumberField
            id="t-hour"
            label="Cât costă o oră a celui care se ocupă"
            value={inputs.hourCost}
            onChange={(v) => set('hourCost', v)}
            min={TCO_LIMITS.hourCost.min}
            max={150}
            suffix="lei/oră"
            hint="Salariul brut cu taxele angajatorului, împărțit la orele lucrate."
          />
        </div>
      )}

      {id === 'rezultat' && result && parsed && (
        <div className="space-y-6">
          {heading('Rezultatul tău', 'Estimare orientativă, calculată doar din datele introduse de tine. Nu e o ofertă și nici o promisiune de economie.')}

          {/* Rezultatul principal: pragul din prețuri, singura cifră care nu depinde de nicio presupunere. */}
          <div className="rounded-md border border-yp-yellow/40 bg-yp-yellow/5 p-4">
            <p className="text-xs text-neutral-400 mb-1">Când merită produsele de calitate</p>
            <p className="text-neutral-100 leading-relaxed">
              {result.breakEvenPrices <= 1 ? (
                'Costă mai puțin pe an chiar dacă durează la fel de mult: prețul lor pe an nu e mai mare decât al celor de acum.'
              ) : (
                <>
                  Dacă durează de cel puțin <strong className="text-yp-yellow">{formatFactor(result.breakEvenPrices)} ori</strong> mai mult decât
                  cele de acum. Sub acest prag costă mai mult pe an; peste el, mai puțin.
                </>
              )}
            </p>
            {result.adminNow > 0 && result.breakEvenPrices > 1 && formatFactor(result.breakEvenWithAdmin) !== formatFactor(result.breakEvenPrices) && (
              <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                Dacă și timpul de administrare scade odată cu înlocuirile (o presupunere),{' '}
                {result.breakEvenWithAdmin <= 1
                  ? 'costă mai puțin chiar dacă durează la fel.'
                  : `pragul coboară la ${formatFactor(result.breakEvenWithAdmin)} ori.`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-white/10 bg-[#0a0a0a] p-4">
              <p className="text-xs text-neutral-400 mb-1">Acum, pe an</p>
              <p className="text-lg sm:text-xl md:text-2xl font-semibold font-mono break-words">{formatLei(result.totalNow)}</p>
              <p className="text-xs text-neutral-400 mt-1">{formatPerDay(result.perDayNow)} lei/zi de om</p>
            </div>
            <div className="rounded-md border border-white/10 bg-[#0a0a0a] p-4">
              <p className="text-xs text-neutral-400 mb-1">
                Cu produse de calitate,{' '}
                {parsed.durability === 1 ? 'dacă durează la fel' : `dacă durează de ${formatFactor(parsed.durability)} ori mai mult`}
              </p>
              <p className="text-lg sm:text-xl md:text-2xl font-semibold font-mono break-words text-white">{formatLei(result.totalQuality)}</p>
              <p className="text-xs text-neutral-400 mt-1">{formatPerDay(result.perDayQuality)} lei/zi de om</p>
            </div>
          </div>

          <p className="text-neutral-200 leading-relaxed" role="status">
            {result.difference > 0.5 ? (
              <>
                Cu ipoteza ta, produsele de calitate ar costa cu <strong className="text-white">{formatLei(result.difference)}</strong> mai puțin pe an (
                {Math.round(result.differencePct)}&nbsp;%), adică {formatLei(result.difference * 3)} în trei ani.
              </>
            ) : result.difference < -0.5 ? (
              <>
                {parsed.durability === 1 ? 'Dacă durează la fel, ' : 'Cu ipoteza ta, '}produsele de calitate ar costa cu{' '}
                <strong className="text-white">{formatLei(-result.difference)}</strong> mai mult pe an. Merită dacă rezistă peste prag sau dacă
                echipa câștigă confort și protecție. Exact asta verificăm la testare.
              </>
            ) : (
              <>Cu ipoteza ta, cele două variante costă la fel pe an.</>
            )}
          </p>

          <div className="rounded-md border border-white/10 divide-y divide-white/5">
            {result.rows.map((r) => (
              <div key={r.id} className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-3 px-4 py-3 text-sm">
                <span className="text-neutral-300">
                  {r.label}
                  <span className="block text-xs text-neutral-500">
                    {formatFactor(r.unitsPerYear)} buc. pe an acum
                  </span>
                </span>
                <span className="font-mono text-neutral-400 whitespace-nowrap">
                  {formatLei(r.now)} → <span className="text-white">{formatLei(r.quality)}</span>
                </span>
              </div>
            ))}
            {result.adminNow > 0 && (
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-3 px-4 py-3 text-sm">
                <span className="text-neutral-300">
                  Timp de administrare
                  <span className="block text-xs text-neutral-500">presupus că scade odată cu înlocuirile</span>
                </span>
                <span className="font-mono text-neutral-400 whitespace-nowrap">
                  {formatLei(result.adminNow)} → <span className="text-white">{formatLei(result.adminQuality)}</span>
                </span>
              </div>
            )}
          </div>

          <details className="text-sm text-neutral-400">
            <summary className="cursor-pointer min-h-11 flex items-center text-neutral-300 hover:text-white">Cum am calculat</summary>
            <ul className="mt-2 space-y-1.5 list-disc pl-5 leading-relaxed">
              <li>
                Pe fiecare categorie: bucăți pe an = angajați × bucăți pe om × înlocuiri pe an (de exemplu, „la 6 luni” înseamnă 2 pe an,
                „lunar” 12). Costul pe an = bucăți pe an × prețul pe bucată.
              </li>
              <li>Produsele de calitate se cumpără de {formatFactor(parsed.durability)} ori mai rar, cum ai ales tu.</li>
              <li>
                Pragul compară doar prețurile pe an, la aceleași cantități: de câte ori trebuie să dureze mai mult produsele de calitate
                ca să coste la fel. Nu depinde de ipoteza ta despre durată.
              </li>
              <li>
                Timpul de administrare: ore pe lună × 12 × costul unei ore. Presupunem că scade în aceeași proporție cu înlocuirile
                (mai puține comenzi și împărțiri); dacă la voi nu scade, uită-te doar la pragul din prețuri.
              </li>
              <li>Costul pe zi de om împarte totalul la {WORKING_DAYS_PER_YEAR} de zile lucrătoare pe an.</li>
              <li>Nu am adăugat costuri „ascunse” estimate de noi. Dacă ai și altele (opriri, înlocuiri urgente), diferența reală e mai mare.</li>
            </ul>
          </details>

          <div className="rounded-md border border-white/15 p-5">
            {offersTesting ? (
              <>
                <p className="font-medium text-white mb-1">Verificăm ipoteza la tine în echipă</p>
                <p className="text-sm text-neutral-300 leading-relaxed mb-4">
                  {RISK_FREE_TESTING.short}{' '}
                  <a href={RISK_FREE_TESTING.href} className="text-yp-yellow underline underline-offset-4 hover:text-white whitespace-nowrap">
                    {RISK_FREE_TESTING.linkLabel}
                  </a>
                  {notTestable.length > 0 && <> {capitalize(joinRo(notTestable))} nu intră în testare; pentru ele îți facem direct oferta.</>}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-white mb-1">Îți facem oferta pornind de la rezultat</p>
                <p className="text-sm text-neutral-300 leading-relaxed mb-4">
                  {capitalize(joinRo(notTestable))} nu intră în testarea fără riscuri. Îți trimitem oferta cu prețuri pentru
                  cantitățile echipei tale.
                </p>
              </>
            )}
            <button
              type="button"
              onClick={next}
              className="w-full bg-yp-yellow text-yp-black px-6 py-3 min-h-[44px] rounded font-medium text-sm hover:bg-white transition-colors"
            >
              {offersTesting ? 'Vreau produse pentru testare' : 'Vreau oferta'}
            </button>
          </div>
        </div>
      )}

      {id === 'contact' && (
        <div className="space-y-6">
          {heading('Unde te contactăm?', offersTesting ? 'Îți propunem produsele pentru testare, pornind de la rezultatul tău.' : 'Îți trimitem oferta, pornind de la rezultatul tău.')}
          <div className="relative space-y-4">
            <Honeypot value={honeypot} onChange={setHoneypot} />
            {contactField('name', 'Nume și prenume', { type: 'text', autoComplete: 'name', placeholder: 'Ion Popescu' })}
            {contactField('company', 'Firma', { type: 'text', autoComplete: 'organization', placeholder: 'Exemplu SRL' })}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {contactField('email', 'Email', { type: 'email', inputMode: 'email', autoComplete: 'email', placeholder: 'ion@exemplu.ro' })}
              {contactField('phone', 'Telefon (opțional)', { type: 'tel', inputMode: 'tel', autoComplete: 'tel', placeholder: '0722 123 456' })}
            </div>
          </div>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Folosim datele și rezultatul calculului doar ca să-ți răspundem. Detalii în{' '}
            <a href="/politica-confidentialitate/" target="_blank" rel="noopener" className="underline text-neutral-300 hover:text-yp-yellow">
              politica de confidențialitate
            </a>
            .
          </p>
          {submitError && (
            <div role="alert" className="rounded-md border border-red-400/40 bg-red-400/5 px-4 py-3 text-sm text-neutral-200">
              {submitError.message ?? (
                <>
                  Nu am putut trimite datele. Încearcă din nou peste un minut sau sună-ne la{' '}
                  <a href={`tel:${SITE.telephone}`} className="underline text-white whitespace-nowrap">
                    {SITE.telephoneDisplay}
                  </a>
                  .
                </>
              )}
            </div>
          )}
        </div>
      )}

      {id === 'gata' && (
        <div className="text-center py-4">
          {heading('Am primit datele', offersTesting ? 'Te contactăm în cel mult 48 de ore ca să alegem împreună produsele pentru testare.' : 'Te contactăm în cel mult 48 de ore cu oferta.')}
          <a href="/produse/" className="text-yp-yellow underline underline-offset-4 hover:text-white text-sm">
            Până atunci, vezi catalogul
          </a>
        </div>
      )}

      {id !== 'gata' && (
        <div className="mt-10 flex gap-4 pt-6 border-t border-white/10 items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={back}
              disabled={submitting}
              className="px-6 py-3 min-h-[44px] rounded text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5"
            >
              {id === 'rezultat' ? 'Modifică datele' : 'Înapoi'}
            </button>
          ) : (
            <div />
          )}
          {id !== 'rezultat' && (
            <button
              type="button"
              onClick={id === 'contact' ? submit : next}
              disabled={submitting}
              className="bg-yp-yellow text-yp-black px-8 py-3 min-h-[44px] rounded font-medium text-sm hover:bg-white transition-colors disabled:opacity-70"
            >
              {id === 'contact' ? (submitting ? 'Se trimite…' : 'Trimite') : step === INPUT_STEPS - 1 ? 'Vezi rezultatul' : 'Următorul pas'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
