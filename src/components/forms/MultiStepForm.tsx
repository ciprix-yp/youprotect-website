import React, { useEffect, useRef, useState } from 'react';
import { isValidCUI } from '../../lib/cui.js';
import { PERSONALIZATION_ANSWERS, quoteCategoryLabel } from '../../lib/quote-categories.js';
import { SITE } from '../../lib/site';
import { DOMAINS } from '../../lib/domains.js';
import { DETAILS_MAX_LENGTH, EMAIL_REGEX } from '../../lib/lead-limits.js';
import { postLead } from '../../lib/post-lead.js';
import { flagLead, track } from '../../lib/track';
import { HONEYPOT_FIELD } from '../../lib/honeypot.js';
import Honeypot from './Honeypot';

type Intent = 'consultation' | 'quote';
type Option = { label: string; hasOther?: boolean };

interface MultiStepFormProps {
  intent: Intent;
  // slug -> nume, pentru produsele publicate. Formularul acceptă ?produs=<slug> doar dacă slug-ul e aici.
  products?: Record<string, string>;
}

// Datele de contact vin la final: întrebările ușoare întâi, apoi „unde îți trimitem oferta”.
// Programarea: trei întrebări de calificare, apoi contactul cu un câmp liber (20.11.2026, D-2026-11-20-06).
const FORM_1_STEPS = ['q1', 'q2', 'q3', 'contact'];
const FORM_2_STEPS = ['q1', 'q2', 'q3', 'personalizare', 'q4', 'q5', 'q6', 'q7', 'contact'];

// Cheia din sessionStorage cu datele pentru calendarul de pe /confirmare/ (nu le punem în URL).
export const BOOKING_PREFILL_KEY = 'yp_booking_prefill';

const PHONE = { href: `tel:${SITE.telephone}`, label: SITE.telephoneDisplay };

// Echipele de 1–4 persoane nu sunt în formular: le răspundem mai repede pe WhatsApp.
const SMALL_TEAM_WHATSAPP = `https://wa.me/${SITE.telephone.replace(/\D/g, '')}?text=${encodeURIComponent(
  'Bună! Am o echipă de 1–4 persoane și aș vrea o recomandare de echipamente.',
)}`;

// Variantele de la „Ce produse ai în vedere?” în care intră categoriile de pe homepage (?categorie=<slug>).
const SSM_OPTION = 'Mănuși / căști / ochelari / alte echipamente SSM';
const HEIGHT_OPTION = 'Lucru la înălțime (hamuri, sisteme anticădere)';
const CATEGORY_OPTION: Record<string, string> = {
  manusi: SSM_OPTION,
  casti: SSM_OPTION,
  ochelari: SSM_OPTION,
  'lucru-la-inaltime': HEIGHT_OPTION,
};

const DOMAIN_OPTIONS: Option[] = DOMAINS.map((label) => ({ label, hasOther: label === 'Alt domeniu' }));

const TEAM_SIZES: Option[] = [
  { label: '5–15 persoane' },
  { label: '16–40 persoane' },
  { label: '41–100 persoane' },
  { label: 'Peste 100 de persoane' },
];

const inputClass =
  'w-full bg-[#0a0a0a] border border-white/15 rounded-md px-4 py-3 text-white placeholder:text-neutral-400 focus:outline-none focus:border-yp-yellow transition-colors';

export default function MultiStepForm({ intent, products = {} }: MultiStepFormProps) {
  const isForm1 = intent === 'consultation';

  const [currentStep, setCurrentStep] = useState(0);
  const [honeypot, setHoneypot] = useState('');
  // Direcția ultimei mutări între pași: pasul nou intră din dreapta (înainte) sau din stânga (înapoi). La încărcare, fără animație.
  const [stepDirection, setStepDirection] = useState<'forward' | 'back' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // null = fără eroare; message = mesajul serverului pentru vizitator (sau null: textul general cu telefonul).
  const [submitError, setSubmitError] = useState<{ message: string | null } | null>(null);
  const [product, setProduct] = useState<string | null>(null);
  // Cine vine de pe o fișă de produs (?produs=<slug>) nu mai e întrebat ce produse are în vedere.
  const steps = isForm1 ? FORM_1_STEPS : product ? FORM_2_STEPS.filter((s) => s !== 'q3') : FORM_2_STEPS;
  const [category, setCategory] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const [formData, setFormData] = useState<Record<string, any>>({
    name: '',
    company: '',
    cui: '',
    phone: '',
    email: '',
    q1: '',
    q2: '',
    q3: isForm1 ? '' : [],
    q4: '',
    q5: [],
    q6: '',
    q7: '',
    personalizare: '',
    detalii: '',
    q_other: {},
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Produsul de pe care vine vizitatorul (/cere-oferta/?produs=<slug>), doar dacă e în catalog,
  // sau categoria de pe homepage (/cere-oferta/?categorie=<slug>), doar dacă e în listă.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('produs');
    if (slug && Object.hasOwn(products, slug)) setProduct(slug);
    const categorySlug = params.get('categorie');
    if (intent === 'quote' && categorySlug && quoteCategoryLabel(categorySlug)) {
      setCategory(categorySlug);
      setFormData((prev) => ({ ...prev, q3: [CATEGORY_OPTION[categorySlug]] }));
    }
  }, []);

  // La schimbarea pasului: formularul rămâne în ecran, iar focusul merge pe întrebare.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    headingRef.current?.focus({ preventScroll: true });
  }, [currentStep]);

  const updateField = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validateStep = () => {
    const newErrors: Record<string, string> = {};
    const sid = steps[currentStep];

    if (sid === 'contact') {
      if (!formData.name.trim()) newErrors.name = 'Scrie numele tău.';
      if (!formData.company.trim()) newErrors.company = 'Scrie numele firmei.';
      if (formData.cui.trim() && !isValidCUI(formData.cui)) newErrors.cui = 'CUI-ul nu pare corect. Verifică cifrele sau lasă câmpul gol.';
      if (!formData.phone.trim()) newErrors.phone = 'Scrie un număr de telefon.';
      if (!EMAIL_REGEX.test(formData.email.trim())) newErrors.email = 'Scrie o adresă de email validă, de forma nume@firma.ro.';
    } else {
      const val = formData[sid];
      if (Array.isArray(val) ? val.length === 0 : !val) newErrors[sid] = 'Alege cel puțin o variantă.';
    }

    setErrors(newErrors);
    // Cititoarele de ecran află de eroare: la contact, focusul merge pe primul câmp greșit (care își citește eroarea
    // prin aria-describedby); la întrebări, mesajul are role="alert".
    const invalid = Object.keys(newErrors);
    if (sid === 'contact' && invalid.length) requestAnimationFrame(() => document.getElementById(`f-${invalid[0]}`)?.focus());
    return invalid.length === 0;
  };

  const nextStep = () => {
    if (!validateStep()) return;
    // Măsurare: unde se opresc vizitatorii (doar numele pasului, nu răspunsul).
    if (currentStep === 0) track('form_start', { form: intent });
    track('form_step', { form: intent, step: steps[currentStep], step_number: currentStep + 1 });
    setStepDirection('forward');
    setCurrentStep((prev) => prev + 1);
  };

  // „Scoate” de lângă produsul sau categoria cu care a venit vizitatorul.
  // - Produsul: întrebarea „Ce produse ai în vedere?” (q3) reapare în listă. Dacă vizitatorul a trecut deja de locul
  //   ei și n-a răspuns, îl ducem la ea; altfel rămâne pe întrebarea la care era (înainte, indexul rămânea același,
  //   iar q3 nu mai era pusă niciodată).
  // - Categoria: scoatem și varianta pe care a bifat-o ea la „Ce produse ai în vedere?”.
  const removeContext = () => {
    if (product) {
      const currentId = steps[currentStep];
      const next = FORM_2_STEPS;
      const q3Index = next.indexOf('q3');
      const currentIndex = Math.max(next.indexOf(currentId), 0);
      setProduct(null);
      if (currentIndex > q3Index && (formData.q3 as string[]).length === 0) {
        setStepDirection('back');
        setCurrentStep(q3Index);
      } else {
        setCurrentStep(currentIndex);
      }
      return;
    }
    const option = category ? CATEGORY_OPTION[category] : undefined;
    setCategory(null);
    if (option) updateField('q3', (formData.q3 as string[]).filter((item) => item !== option));
  };

  const prevStep = () => {
    setStepDirection('back');
    setCurrentStep((prev) => prev - 1);
  };

  const submitForm = async () => {
    if (!validateStep()) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await postLead({
        intent,
        data: { ...formData, produs: product ?? undefined, categorie: category ?? undefined, [HONEYPOT_FIELD]: honeypot || undefined },
      });
      if (!result.ok) {
        setSubmitError({ message: result.message });
        setIsSubmitting(false);
        return;
      }
      flagLead(intent);

      if (intent === 'consultation') {
        try {
          sessionStorage.setItem(
            BOOKING_PREFILL_KEY,
            JSON.stringify({ name: formData.name, email: formData.email, phone: formData.phone, company: formData.company }),
          );
        } catch (_e) {
          // Fără sessionStorage, calendarul se deschide necompletat.
        }
      }
      window.location.href = `/confirmare/?intent=${intent}`;
    } catch (err) {
      console.error(err);
      setSubmitError({ message: null });
      setIsSubmitting(false);
    }
  };

  const stepHeading = (title: string, description?: string) => (
    <div className="text-left mb-8">
      <h2 ref={headingRef} tabIndex={-1} className="text-2xl md:text-3xl font-medium text-white mb-2 focus:outline-none">
        {title}
      </h2>
      {description && <p className="text-neutral-400">{description}</p>}
    </div>
  );

  const field = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label htmlFor={`f-${id}`} className="block text-sm font-medium text-neutral-300 mb-1">
        {label}
      </label>
      <input
        id={`f-${id}`}
        className={inputClass}
        value={formData[id]}
        onChange={(e) => updateField(id, e.target.value)}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `f-${id}-err` : undefined}
        {...props}
      />
      {errors[id] && (
        <p id={`f-${id}-err`} className="text-red-400 text-sm mt-1">
          {errors[id]}
        </p>
      )}
    </div>
  );

  const renderContactStep = () => (
    <div className="space-y-6">
      {stepHeading(
        isForm1 ? 'Cum te contactăm?' : 'Unde îți trimitem oferta?',
        isForm1
          ? 'După ce trimiți, alegi direct ora discuției din calendar.'
          : 'Primești oferta în cel mult 48 de ore. Te sunăm doar dacă e nevoie de o clarificare.',
      )}
      <div className="relative space-y-4">
        <Honeypot value={honeypot} onChange={setHoneypot} />
        {field('name', 'Nume și prenume', { type: 'text', autoComplete: 'name', placeholder: 'Ion Popescu' })}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
          {field('company', 'Firma', { type: 'text', autoComplete: 'organization', placeholder: 'Exemplu SRL' })}
          {field('cui', 'CUI (opțional)', { type: 'text', inputMode: 'numeric', autoComplete: 'off', placeholder: 'RO12345678' })}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('phone', 'Telefon', { type: 'tel', inputMode: 'tel', autoComplete: 'tel', placeholder: '0722 123 456' })}
          {field('email', 'Email', { type: 'email', inputMode: 'email', autoComplete: 'email', placeholder: 'ion@exemplu.ro' })}
        </div>
        <div>
          <label htmlFor="f-detalii" className="block text-sm font-medium text-neutral-300 mb-1">
            {isForm1 ? 'Despre ce vrei să vorbim? (opțional)' : 'Cantități, mărimi, coduri (opțional)'}
          </label>
          <textarea
            id="f-detalii"
            rows={3}
            maxLength={DETAILS_MAX_LENGTH}
            className={inputClass}
            value={formData.detalii}
            onChange={(e) => updateField('detalii', e.target.value)}
            placeholder={
              isForm1
                ? 'Ex.: schimbăm furnizorul de încălțăminte; vrem haine cu logo pentru 40 de oameni'
                : 'Ex.: 20 de perechi de bocanci, mărimile 40–46; 30 de geci reflectorizante M–2XL'
            }
          />
        </div>
      </div>
      <p className="text-sm text-neutral-400 leading-relaxed">
        Folosim datele doar ca să-ți răspundem la cerere. Detalii în{' '}
        <a href="/politica-confidentialitate/" target="_blank" rel="noopener" className="underline text-neutral-300 hover:text-yp-yellow">
          politica de confidențialitate
        </a>
        .
      </p>
    </div>
  );

  const optionButtonClass = (selected: boolean, disabled = false) =>
    `w-full text-left p-4 rounded-md border transition-colors duration-150 flex items-center gap-3 ${
      selected
        ? 'border-yp-yellow bg-yp-yellow/5'
        : disabled
          ? 'border-white/5 bg-[#050505] opacity-50 cursor-not-allowed'
          : 'border-white/10 bg-[#0a0a0a] hover:border-white/30'
    }`;

  const otherInput = (fieldId: string) => (
    <div className="mt-3 ml-2 reveal-in">
      <label htmlFor={`f-${fieldId}-other`} className="sr-only">
        Detalii
      </label>
      <input
        id={`f-${fieldId}-other`}
        type="text"
        placeholder="Scrie pe scurt…"
        className={`${inputClass} py-2.5 text-base md:text-sm`}
        value={formData.q_other[fieldId] || ''}
        onChange={(e) => updateField('q_other', { ...formData.q_other, [fieldId]: e.target.value })}
      />
    </div>
  );

  const renderRadioGroup = (
    fieldId: string,
    question: string,
    options: Option[],
    description?: string,
    note?: React.ReactNode,
  ) => (
    <div className="space-y-6">
      {stepHeading(question, description)}
      <div className="space-y-3" role="radiogroup" aria-label={question}>
        {options.map((opt) => {
          const isSelected = formData[fieldId] === opt.label;
          return (
            <div key={opt.label} className="w-full">
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => {
                  updateField(fieldId, opt.label);
                  if (!opt.hasOther && formData.q_other[fieldId]) {
                    const newOthers = { ...formData.q_other };
                    delete newOthers[fieldId];
                    updateField('q_other', newOthers);
                  }
                }}
                className={`${optionButtonClass(isSelected)} justify-between`}
              >
                <span className={isSelected ? 'text-yp-yellow font-medium' : 'text-neutral-300'}>{opt.label}</span>
                <span
                  aria-hidden="true"
                  className={`w-5 h-5 rounded-full flex-shrink-0 border flex items-center justify-center ${
                    isSelected ? 'border-yp-yellow' : 'border-neutral-500'
                  }`}
                >
                  {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-yp-yellow" />}
                </span>
              </button>
              {isSelected && opt.hasOther && otherInput(fieldId)}
            </div>
          );
        })}
      </div>
      {errors[fieldId] && (
        <p role="alert" className="text-red-400 text-sm mt-2 text-center md:text-left">
          {errors[fieldId]}
        </p>
      )}
      {note}
    </div>
  );

  // Sub întrebarea despre mărimea echipei: echipele de 1–4 persoane ne scriu pe WhatsApp.
  const smallTeamNote = (
    <p className="text-sm text-neutral-400 leading-relaxed">
      Ai o echipă de 1–4 persoane?{' '}
      <a
        href={SMALL_TEAM_WHATSAPP}
        target="_blank"
        rel="noopener"
        data-track="whatsapp"
        data-track-location="formular-echipa-mica"
        className="text-yp-yellow underline underline-offset-4 hover:text-white"
      >
        Scrie-ne pe WhatsApp
      </a>
      , îți răspundem mai repede acolo.
    </p>
  );

  const renderMultiSelect = (fieldId: string, question: string, options: Option[], maxSelect?: number) => {
    const selectedOptions = (formData[fieldId] as string[]) || [];
    return (
      <div className="space-y-6">
        {stepHeading(question, maxSelect ? `Alege cel mult ${maxSelect} variante.` : 'Alege toate variantele potrivite.')}
        <div className="space-y-3" role="group" aria-label={question}>
          {options.map((opt) => {
            const isSelected = selectedOptions.includes(opt.label);
            const isDisabled = !isSelected && !!maxSelect && selectedOptions.length >= maxSelect;
            return (
              <div key={opt.label} className="w-full">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  disabled={isDisabled}
                  onClick={() => {
                    if (isSelected) {
                      updateField(fieldId, selectedOptions.filter((item) => item !== opt.label));
                      // „Altceva” debifat: textul scris la el nu mai pleacă în cerere.
                      if (opt.hasOther && formData.q_other[fieldId]) {
                        const newOthers = { ...formData.q_other };
                        delete newOthers[fieldId];
                        updateField('q_other', newOthers);
                      }
                    } else if (!maxSelect || selectedOptions.length < maxSelect) {
                      updateField(fieldId, [...selectedOptions, opt.label]);
                    }
                  }}
                  className={`${optionButtonClass(isSelected, isDisabled)} items-start`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 w-5 h-5 rounded-lg border flex-shrink-0 flex items-center justify-center transition-colors ${
                      isSelected ? 'border-yp-yellow bg-yp-yellow/20 text-yp-yellow' : 'border-neutral-500'
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className={isSelected ? 'text-yp-yellow font-medium leading-snug' : 'text-neutral-300 leading-snug'}>
                    {opt.label}
                  </span>
                </button>
                {isSelected && opt.hasOther && otherInput(fieldId)}
              </div>
            );
          })}
        </div>
        {errors[fieldId] && (
        <p role="alert" className="text-red-400 text-sm mt-2 text-center md:text-left">
          {errors[fieldId]}
        </p>
      )}
      </div>
    );
  };

  const renderStepContent = () => {
    const stepId = steps[currentStep];
    if (stepId === 'contact') return renderContactStep();

    if (isForm1) {
      if (stepId === 'q1')
        return renderRadioGroup('q1', 'Ce rol ai în firmă?', [
          { label: 'Administrator / Patron' },
          { label: 'Manager operațional / Șef echipă / Șef șantier' },
          { label: 'Achiziții / Aprovizionare' },
          { label: 'SSM / HR / Administrativ' },
          { label: 'Alt rol', hasOther: true },
        ]);
      if (stepId === 'q2')
        return renderRadioGroup(
          'q2',
          'Pentru câți colegi ai în vedere echiparea, în perioada următoare?',
          TEAM_SIZES,
          undefined,
          smallTeamNote,
        );
      if (stepId === 'q3') return renderRadioGroup('q3', 'În ce domeniu lucrează echipa ta, în principal?', DOMAIN_OPTIONS);
    } else {
      if (stepId === 'q1')
        return renderRadioGroup('q1', 'Pentru câți colegi ai nevoie de echipamente acum?', TEAM_SIZES, undefined, smallTeamNote);
      if (stepId === 'q2') return renderRadioGroup('q2', 'În ce domeniu lucrează echipa ta, în principal?', DOMAIN_OPTIONS);
      if (stepId === 'q3')
        return renderMultiSelect('q3', 'Ce produse ai în vedere?', [
          { label: 'Încălțăminte de protecție' },
          { label: 'Îmbrăcăminte de lucru' },
          { label: SSM_OPTION },
          { label: HEIGHT_OPTION },
          { label: 'Echipamente reflectorizante / hi-vis' },
          { label: 'Echipamente specializate' },
          { label: 'Nu sunt sigur, am nevoie de recomandări' },
        ]);
      if (stepId === 'personalizare')
        return renderRadioGroup(
          'personalizare',
          'Vrei produsele personalizate cu logo-ul firmei tale?',
          PERSONALIZATION_ANSWERS.map((label) => ({ label })),
        );
      if (stepId === 'q4')
        return renderRadioGroup('q4', 'Cum se face acum echiparea echipei tale?', [
          { label: 'Avem deja un furnizor, dar vrem să vedem și alte variante' },
          { label: 'Avem furnizor, însă nu suntem mulțumiți de rezultate' },
          { label: 'Cumpărăm punctual, în funcție de nevoie' },
          { label: 'E prima dată când organizăm mai profesionist partea de echipamente' },
          { label: 'Doar ne orientăm momentan' },
        ]);
      if (stepId === 'q5')
        return renderMultiSelect(
          'q5',
          'Ce trebuie să rezolve bine oferta pentru tine?',
          [
            { label: 'Să fie potrivită pentru activitatea și riscurile echipei' },
            { label: 'Să ne ajute să fim acoperiți corect din punct de vedere SSM' },
            { label: 'Să avem produse durabile și confortabile' },
            { label: 'Să ne fie ușor de gestionat pe mărimi și reaprovizionare' },
            { label: 'Să avem o imagine mai profesionistă și unitară' },
            { label: 'Să ne încadrăm bine în termen' },
            { label: 'Să primim recomandări clare, nu doar prețuri' },
            { label: 'Altceva', hasOther: true },
          ],
          3,
        );
      if (stepId === 'q6')
        return renderRadioGroup('q6', 'Când ai nevoie de ofertă sau de produse?', [
          { label: 'În următoarele 2 săptămâni' },
          { label: 'În următoarea lună' },
          { label: 'În următoarele 2–3 luni' },
          { label: 'Ne pregătim din timp, fără termen imediat' },
        ]);
      if (stepId === 'q7')
        return renderRadioGroup('q7', 'Cum vrei să continuăm?', [
          { label: 'Să primesc oferta pe email' },
          { label: 'Să primesc oferta și să clarificăm rapid dacă este nevoie' },
          { label: 'Prefer să discutăm puțin înainte, ca să alegem varianta potrivită' },
        ]);
    }
    return null;
  };

  const isLastStep = currentStep === steps.length - 1;
  const progressPercent = Math.round(((currentStep + 1) / steps.length) * 100);

  return (
    <div
      ref={containerRef}
      className="max-w-xl mx-auto w-full bg-[#111] rounded-[8px] border border-white/5 p-6 md:p-8 shadow-2xl relative overflow-hidden scroll-mt-28"
    >
      {(product || category) && (
        <div className="mb-8 flex items-center justify-between gap-3 rounded-md border border-yp-yellow/30 bg-yp-yellow/5 px-4 py-3">
          <p className="text-sm text-neutral-300">
            Ceri ofertă pentru:{' '}
            <span className="text-white font-medium">{product ? products[product] : quoteCategoryLabel(category)}</span>
          </p>
          <button
            type="button"
            onClick={removeContext}
            className="shrink-0 min-h-[44px] min-w-[44px] text-neutral-400 hover:text-white text-sm underline"
          >
            Scoate
          </button>
        </div>
      )}

      <div className="mb-10">
        <div className="flex justify-between items-end mb-2">
          <span className="text-sm font-medium text-yp-yellow">
            Pasul {currentStep + 1} din {steps.length}
          </span>
          <span className="text-xs text-neutral-400 font-medium">{progressPercent}% completat</span>
        </div>
        <div
          className="h-1.5 w-full bg-[#222] rounded-full overflow-hidden"
          role="progressbar"
          aria-label="Progres formular"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
        >
          <div className="h-full bg-yp-yellow rounded-full transition-[width] duration-300 ease-out-strong" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div key={currentStep} className={`min-h-[300px] ${stepDirection ? `step-in-${stepDirection}` : ''}`}>
        {renderStepContent()}
      </div>

      {submitError && (
        <div role="alert" className="mt-6 rounded-md border border-red-400/40 bg-red-400/5 px-4 py-3 text-sm text-neutral-200">
          {submitError.message ?? (
            <>
              Nu am putut trimite cererea. Încearcă din nou peste un minut sau sună-ne la{' '}
              <a href={PHONE.href} className="underline text-white whitespace-nowrap">
                {PHONE.label}
              </a>
              .
            </>
          )}
        </div>
      )}

      <div className="mt-10 flex gap-4 pt-6 border-t border-white/10 items-center justify-between">
        {currentStep > 0 ? (
          <button
            type="button"
            onClick={prevStep}
            disabled={isSubmitting}
            className="px-6 py-3 min-h-[44px] rounded text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5 transition active:scale-[0.98]"
          >
            Înapoi
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={isLastStep ? submitForm : nextStep}
          disabled={isSubmitting}
          className="bg-yp-yellow text-yp-black px-8 py-3 min-h-[44px] rounded font-medium text-sm flex items-center gap-2 hover:bg-white transition active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Se trimite…
            </span>
          ) : (
            <>
              {isLastStep ? (isForm1 ? 'Trimite și alege ora' : 'Trimite cererea') : 'Următorul pas'}
              {!isLastStep && (
                <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
