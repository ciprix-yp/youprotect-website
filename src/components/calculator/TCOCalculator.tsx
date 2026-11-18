import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DOMAINS } from '../../lib/domains.js';
import { RISK_FREE_TESTING, SITE } from '../../lib/site';
import {
  TCO_CATEGORIES,
  TCO_DEFAULTS,
  TCO_LIMITS,
  WORKING_DAYS_PER_YEAR,
  computeTco,
  formatFactor,
  formatLei,
  parseTcoInputs,
} from '../../lib/tco.js';

// Calculatorul de cost real (lead magnet). Calculul e în src/lib/tco.js, comun cu serverul.
// Rezultatul apare imediat, fără date de contact. Datele de contact sunt opționale, la final, pentru cine vrea să
// verificăm ipoteza la el în echipă; cererea intră în inbox-ul de cereri (D1 → Prospector) ca cerere de ofertă.

type CategoryId = keyof typeof TCO_CATEGORIES;
type Inputs = typeof TCO_DEFAULTS & { categories: string[]; prices: Record<string, number>; qualityPrices: Record<string, number> };

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

function PriceInput({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className="block text-xs text-neutral-400 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={TCO_LIMITS.price.min}
          max={TCO_LIMITS.price.max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full bg-[#0a0a0a] border border-white/15 rounded-md px-3 py-2 text-white font-mono text-right focus:outline-none focus:border-yp-yellow"
        />
        <span className="text-xs text-neutral-400">lei</span>
      </div>
    </div>
  );
}

export default function TCOCalculator() {
  const [step, setStep] = useState(0);
  const [inputs, setInputs] = useState<Inputs>({ ...TCO_DEFAULTS, categories: [...TCO_DEFAULTS.categories] });
  const [contact, setContact] = useState({ name: '', company: '', email: '', phone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const set = <K extends keyof Inputs>(key: K, value: Inputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setErrors({});
  };
  const priceOf = (id: string) => inputs.prices[id] ?? TCO_CATEGORIES[id as CategoryId].price;
  const qualityPriceOf = (id: string) => inputs.qualityPrices[id] ?? TCO_CATEGORIES[id as CategoryId].qualityPrice;

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
    setErrors({});
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
    if (!/^\S+@\S+\.\S+$/.test(contact.email.trim())) e.email = 'Scrie o adresă de email validă, de forma nume@firma.ro.';
    setErrors(e);
    if (Object.keys(e).length || !parsed) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const response = await fetch('/api/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'quote', data: { ...contact, calculator: parsed } }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      window.dispatchEvent(new CustomEvent('yp:lead', { detail: { form: 'calculator' } }));
      setStep(STEPS.indexOf('gata'));
    } catch (err) {
      console.error(err);
      setSubmitError(true);
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
  const saves = result ? result.difference > 0 : false;

  return (
    <div
      ref={containerRef}
      className="max-w-xl mx-auto w-full bg-[#111] rounded-[8px] border border-white/5 p-6 md:p-8 shadow-2xl scroll-mt-28 text-white"
    >
      {step < INPUT_STEPS && (
        <div className="mb-8">
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-medium text-yp-yellow font-mono uppercase tracking-wider">
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
          {heading('Ce cumperi și cât costă', 'Alege categoriile, apoi pune prețul pe bucată pe care îl plătești acum și prețul unui produs de calitate.')}
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
                    <div className="flex gap-3 px-4 pb-4 pt-1">
                      <PriceInput id={`p-${cid}`} label="Preț acum" value={priceOf(cid)} onChange={(v) => set('prices', { ...inputs.prices, [cid]: v })} />
                      <PriceInput
                        id={`q-${cid}`}
                        label="Preț calitate"
                        value={qualityPriceOf(cid)}
                        onChange={(v) => set('qualityPrices', { ...inputs.qualityPrices, [cid]: v })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {errors.categories && <p className="text-red-400 text-sm">{errors.categories}</p>}
          <p className="text-xs text-neutral-400 -mt-4">Prețurile de pornire sunt doar exemple. Pune prețurile tale, ca rezultatul să fie al tău.</p>
          <fieldset>
            <legend className="text-sm font-medium text-neutral-300 mb-3">Cât de des le înlocuiești acum?</legend>
            <div className="flex flex-wrap gap-2">
              {TCO_LIMITS.months.map((m) => (
                <button key={m} type="button" aria-pressed={inputs.months === m} onClick={() => set('months', m)} className={toggleClass(inputs.months === m)}>
                  la {m} luni
                </button>
              ))}
            </div>
          </fieldset>
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
            hint="1 înseamnă că durează la fel. Valoarea de pornire, 2, e doar un exemplu. La testare vedem cât rezistă de fapt la voi."
          />
          <p className="text-sm text-neutral-300 -mt-4">
            Adică le-ai înlocui la circa {formatFactor(inputs.months * inputs.durability)} luni, nu la {inputs.months} luni.
          </p>
          <NumberField
            id="t-admin"
            label="Ore pe lună cu echipamentele"
            value={inputs.adminHours}
            onChange={(v) => set('adminHours', v)}
            min={TCO_LIMITS.adminHours.min}
            max={40}
            suffix="ore"
            hint="Comenzi, recepție, împărțit pe mărimi, evidență, înlocuiri."
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

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-white/10 bg-[#0a0a0a] p-4">
              <p className="text-xs text-neutral-400 mb-1">Acum, pe an</p>
              <p className="text-lg sm:text-xl md:text-2xl font-semibold font-mono break-words">{formatLei(result.totalNow)}</p>
              <p className="text-xs text-neutral-400 mt-1">{result.perDayNow.toFixed(2).replace('.', ',')} lei/zi de om</p>
            </div>
            <div className="rounded-md border border-yp-yellow/40 bg-yp-yellow/5 p-4">
              <p className="text-xs text-neutral-400 mb-1">Cu produse de calitate</p>
              <p className="text-lg sm:text-xl md:text-2xl font-semibold font-mono break-words text-yp-yellow">{formatLei(result.totalQuality)}</p>
              <p className="text-xs text-neutral-400 mt-1">{result.perDayQuality.toFixed(2).replace('.', ',')} lei/zi de om</p>
            </div>
          </div>

          <div className="rounded-md border border-white/15 p-4">
            <p className="text-xs text-neutral-400 mb-1">Pragul de la care calitatea costă mai puțin</p>
            <p className="text-neutral-200 leading-relaxed">
              {result.breakEven <= 1 ? (
                'Produsele de calitate costă mai puțin chiar dacă durează la fel de mult.'
              ) : (
                <>
                  Dacă durează de cel puțin <strong className="text-white">{formatFactor(result.breakEven)} ori</strong> mai mult, adică le înlocuiești la
                  circa {formatFactor(parsed.months * result.breakEven)} luni în loc de {parsed.months}.
                </>
              )}
            </p>
          </div>

          <p className="text-neutral-200 leading-relaxed" role="status">
            {saves ? (
              <>
                Cu ipotezele tale, produsele de calitate ar costa cu <strong className="text-white">{formatLei(result.difference)}</strong> mai puțin pe an (
                {Math.round(result.differencePct)}&nbsp;%), adică {formatLei(result.difference * 3)} în trei ani.
              </>
            ) : (
              <>
                Cu ipotezele tale, produsele de calitate ar costa cu <strong className="text-white">{formatLei(-result.difference)}</strong> mai mult pe an.
                Merită doar dacă rezistă mai mult decât ai presupus sau dacă echipa câștigă confort și protecție. Exact asta verificăm la testare.
              </>
            )}
          </p>

          <div className="rounded-md border border-white/10 divide-y divide-white/5">
            {result.rows.map((r) => (
              <div key={r.id} className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-3 px-4 py-3 text-sm">
                <span className="text-neutral-300">{r.label}</span>
                <span className="font-mono text-neutral-400 whitespace-nowrap">
                  {formatLei(r.now)} → <span className="text-white">{formatLei(r.quality)}</span>
                </span>
              </div>
            ))}
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-3 px-4 py-3 text-sm">
              <span className="text-neutral-300">Timp de administrare</span>
              <span className="font-mono text-neutral-400 whitespace-nowrap">
                {formatLei(result.adminNow)} → <span className="text-white">{formatLei(result.adminQuality)}</span>
              </span>
            </div>
          </div>

          <details className="text-sm text-neutral-400">
            <summary className="cursor-pointer py-2 text-neutral-300 hover:text-white">Cum am calculat</summary>
            <ul className="mt-2 space-y-1.5 list-disc pl-5 leading-relaxed">
              <li>Cost de achiziție pe an = angajați × preț pe bucată × înlocuiri pe an (la {parsed.months} luni = {12 / parsed.months} pe an).</li>
              <li>Produsele de calitate se înlocuiesc de {formatFactor(parsed.durability)} ori mai rar, cum ai ales tu.</li>
              <li>Pragul arată de câte ori trebuie să dureze mai mult ca să coste la fel pe an. Nu depinde de nicio presupunere.</li>
              <li>Timpul de administrare scade în aceeași proporție, pentru că sunt mai puține comenzi și înlocuiri.</li>
              <li>Costul pe zi de om împarte totalul la {WORKING_DAYS_PER_YEAR} de zile lucrătoare pe an.</li>
              <li>Nu am adăugat costuri „ascunse” estimate de noi. Dacă ai și altele (opriri, înlocuiri urgente), diferența reală e mai mare.</li>
            </ul>
          </details>

          <div className="rounded-md border border-white/15 p-5">
            <p className="font-medium text-white mb-1">Verificăm ipoteza la tine în echipă</p>
            <p className="text-sm text-neutral-300 leading-relaxed mb-4">
              {RISK_FREE_TESTING.short}{' '}
              <a href={RISK_FREE_TESTING.href} className="text-yp-yellow underline underline-offset-4 hover:text-white whitespace-nowrap">
                {RISK_FREE_TESTING.linkLabel}
              </a>
            </p>
            <button
              type="button"
              onClick={next}
              className="w-full bg-yp-yellow text-yp-black px-6 py-3 min-h-[44px] rounded font-medium text-sm hover:bg-white transition-colors"
            >
              Vreau produse pentru testare
            </button>
          </div>
        </div>
      )}

      {id === 'contact' && (
        <div className="space-y-6">
          {heading('Unde te contactăm?', 'Îți propunem produsele pentru testare, pornind de la rezultatul tău.')}
          <div className="space-y-4">
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
              Nu am putut trimite datele. Încearcă din nou peste un minut sau sună-ne la{' '}
              <a href={`tel:${SITE.telephone}`} className="underline text-white whitespace-nowrap">
                {SITE.telephoneDisplay}
              </a>
              .
            </div>
          )}
        </div>
      )}

      {id === 'gata' && (
        <div className="text-center py-4">
          {heading('Am primit datele', 'Te contactăm în cel mult 48 de ore ca să alegem împreună produsele pentru testare.')}
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
