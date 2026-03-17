import React, { useState } from 'react';

type Intent = 'consultation' | 'quote';

interface MultiStepFormProps {
  intent: Intent;
}

const FORM_1_STEPS = [
  { id: 'contact', title: 'Date de contact' },
  { id: 'q1', title: 'Rol' },
  { id: 'q2', title: 'Dimensiune echipă' },
  { id: 'q3', title: 'Domeniu' },
  { id: 'q4', title: 'Ce s-a schimbat recent' },
  { id: 'q5', title: 'Priorități' },
  { id: 'q6', title: 'Ultimul pas' }
];

const FORM_2_STEPS = [
  { id: 'contact', title: 'Date de contact' },
  { id: 'q1', title: 'Dimensiune echipă' },
  { id: 'q2', title: 'Domeniu' },
  { id: 'q3', title: 'Produse vizate' },
  { id: 'q4', title: 'Situație actuală' },
  { id: 'q5', title: 'Așteptări' },
  { id: 'q6', title: 'Urgență' },
  { id: 'q7', title: 'Ultimul pas' }
];

export default function MultiStepForm({ intent }: MultiStepFormProps) {
  const isForm1 = intent === 'consultation';
  const steps = isForm1 ? FORM_1_STEPS : FORM_2_STEPS;
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState<Record<string, any>>({
    name: '',
    company: '',
    phone: '',
    email: '',
    q1: '',
    q2: '',
    q3: '',
    q4: [],
    q5: [],
    q6: '',
    q7: '',
    q_other: {} // For storing "Altceva" responses
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const validateStep = () => {
    const newErrors: Record<string, string> = {};
    const stepObj = steps[currentStep];
    const sid = stepObj.id;

    if (sid === 'contact') {
      if (!formData.name.trim()) newErrors.name = 'Numele este obligatoriu';
      if (!formData.company.trim()) newErrors.company = 'Compania este obligatorie';
      if (!formData.phone.trim()) newErrors.phone = 'Telefonul este obligatoriu';
      if (!formData.email.trim() || !/^\S+@\S+\.\S+$/.test(formData.email)) newErrors.email = 'Email invalid';
    } else {
      // Validate current question
      const val = formData[sid];
      if (Array.isArray(val)) {
        if (val.length === 0) newErrors[sid] = 'Te rugăm să alegi cel puțin o opțiune';
      } else {
        if (!val || val === '') newErrors[sid] = 'Acest câmp este obligatoriu';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep()) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => prev - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submitForm = async () => {
    if (!validateStep()) return;
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, data: formData }),
      });
      
      if (response.ok) {
        // Adaugă parametri URL pentru confirmare ca să umplem calendarul
        const queryParams = new URLSearchParams({
          intent: intent,
        });

        if (intent === 'consultation' && formData.name) {
          queryParams.set('nume', formData.name);
          queryParams.set('email', formData.email);
          if (formData.phone) queryParams.set('telefon', formData.phone);
          if (formData.company) queryParams.set('companie', formData.company);
        }

        window.location.href = `/confirmare?${queryParams.toString()}`;
      } else {
        alert('A apărut o eroare. Te rugăm să încerci din nou.');
      }
    } catch (err) {
      console.error(err);
      alert('A apărut o eroare. Te rugăm să încerci din nou.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderContactStep = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-8">
        <h2 className="text-2xl md:text-3xl font-medium text-white mb-2">
          Pe cine am onoarea să cunosc?
        </h2>
        <p className="text-neutral-400">Începem cu datele de bază pentru a ști cum să te contactăm.</p>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1">Nume și prenume</label>
          <input 
            type="text" 
            placeholder="Ion Popescu"
            className="w-full bg-[#0a0a0a] border border-white/10 rounded-md px-4 py-3 text-white focus:outline-none focus:border-yp-yellow transition-colors"
            value={formData.name}
            onChange={e => updateField('name', e.target.value)}
          />
          {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1">Companie</label>
          <input 
            type="text" 
            placeholder="SC Exemplu SRL"
            className="w-full bg-[#0a0a0a] border border-white/10 rounded-md px-4 py-3 text-white focus:outline-none focus:border-yp-yellow transition-colors"
            value={formData.company}
            onChange={e => updateField('company', e.target.value)}
          />
          {errors.company && <p className="text-red-400 text-xs mt-1">{errors.company}</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Telefon</label>
            <input 
              type="tel" 
              placeholder="07XX XXX XXX"
              className="w-full bg-[#0a0a0a] border border-white/10 rounded-md px-4 py-3 text-white focus:outline-none focus:border-yp-yellow transition-colors"
              value={formData.phone}
              onChange={e => updateField('phone', e.target.value)}
            />
            {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Email</label>
            <input 
              type="email" 
              placeholder="ion@exemplu.ro"
              className="w-full bg-[#0a0a0a] border border-white/10 rounded-md px-4 py-3 text-white focus:outline-none focus:border-yp-yellow transition-colors"
              value={formData.email}
              onChange={e => updateField('email', e.target.value)}
            />
            {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
          </div>
        </div>
      </div>
    </div>
  );

  const renderRadioGroup = (
    fieldId: string, 
    question: string, 
    options: { label: string, hasOther?: boolean }[],
    description?: string
  ) => {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center md:text-left mb-8">
          <h2 className="text-2xl md:text-3xl font-medium text-white mb-2">{question}</h2>
          {description && <p className="text-neutral-400">{description}</p>}
        </div>
        <div className="space-y-3 flex flex-col items-center sm:block">
          {options.map((opt, idx) => {
            const isSelected = formData[fieldId] === opt.label;
            return (
              <div key={idx} className="w-full">
                <button
                  onClick={() => {
                    updateField(fieldId, opt.label);
                    if (!opt.hasOther && formData.q_other[fieldId]) {
                      const newOthers = { ...formData.q_other };
                      delete newOthers[fieldId];
                      updateField('q_other', newOthers);
                    }
                  }}
                  className={`w-full text-left p-4 rounded-md border transition-all duration-200 flex items-center justify-between ${
                    isSelected 
                      ? 'border-yp-yellow bg-yp-yellow/5' 
                      : 'border-white/10 bg-[#0a0a0a] hover:border-white/30'
                  }`}
                >
                  <span className={isSelected ? 'text-yp-yellow font-medium' : 'text-neutral-300'}>
                    {opt.label}
                  </span>
                  <div className={`w-5 h-5 rounded-full flex-shrink-0 border flex items-center justify-center ${
                    isSelected ? 'border-yp-yellow' : 'border-neutral-600'
                  }`}>
                    {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-yp-yellow" />}
                  </div>
                </button>
                {isSelected && opt.hasOther && (
                  <div className="mt-3 ml-2 animate-in fade-in">
                    <input
                      type="text"
                      placeholder="Te rugăm să specifici..."
                      className="w-full bg-[#111] border border-white/10 rounded-md px-4 py-2.5 text-white focus:outline-none focus:border-yp-yellow transition-colors text-sm"
                      value={formData.q_other[fieldId] || ''}
                      onChange={(e) => updateField('q_other', { ...formData.q_other, [fieldId]: e.target.value })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {errors[fieldId] && <p className="text-red-400 text-sm mt-2 text-center md:text-left">{errors[fieldId]}</p>}
      </div>
    );
  };

  const renderMultiSelect = (
    fieldId: string, 
    question: string, 
    options: { label: string, hasOther?: boolean }[], 
    maxSelect?: number,
    description?: string
  ) => {
    const selectedOptions = formData[fieldId] as string[] || [];
    
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center md:text-left mb-8">
          <h2 className="text-2xl md:text-3xl font-medium text-white mb-2">{question}</h2>
          <p className="text-neutral-400">
            {description ? description : maxSelect ? `Alege maxim ${maxSelect} opțiuni.` : 'Alege toate variantele relevante.'}
          </p>
        </div>
        <div className="space-y-3 flex flex-col items-center sm:block">
          {options.map((opt, idx) => {
            const isSelected = selectedOptions.includes(opt.label);
            const isDisabled = !isSelected && maxSelect && selectedOptions.length >= maxSelect;
            
            return (
              <div key={idx} className="w-full">
                <button
                  disabled={isDisabled}
                  onClick={() => {
                    if (isSelected) {
                      updateField(fieldId, selectedOptions.filter(item => item !== opt.label));
                    } else if (!maxSelect || selectedOptions.length < maxSelect) {
                      updateField(fieldId, [...selectedOptions, opt.label]);
                    }
                  }}
                  className={`w-full text-left p-4 rounded-md border transition-all duration-200 flex items-start gap-3 ${
                    isSelected 
                      ? 'border-yp-yellow bg-yp-yellow/5' 
                      : isDisabled 
                        ? 'border-white/5 bg-[#050505] opacity-50 cursor-not-allowed'
                        : 'border-white/10 bg-[#0a0a0a] hover:border-white/30'
                  }`}
                >
                  <div className={`mt-0.5 w-5 h-5 rounded-[4px] border flex-shrink-0 flex items-center justify-center transition-colors ${
                    isSelected ? 'border-yp-yellow bg-yp-yellow/20 text-yp-yellow' : 'border-neutral-600'
                  }`}>
                    {isSelected && (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={isSelected ? 'text-yp-yellow font-medium leading-snug' : 'text-neutral-300 leading-snug'}>
                    {opt.label}
                  </span>
                </button>
                {isSelected && opt.hasOther && (
                  <div className="mt-3 ml-8 animate-in fade-in">
                    <input
                      type="text"
                      placeholder="Te rugăm să specifici..."
                      className="w-full bg-[#111] border border-white/10 rounded-md px-4 py-2.5 text-white focus:outline-none focus:border-yp-yellow transition-colors text-sm"
                      value={formData.q_other[fieldId] || ''}
                      onChange={(e) => updateField('q_other', { ...formData.q_other, [fieldId]: e.target.value })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {errors[fieldId] && <p className="text-red-400 text-sm mt-2 text-center md:text-left">{errors[fieldId]}</p>}
      </div>
    );
  };

  const renderStepContent = () => {
    const stepObj = steps[currentStep];
    const stepId = stepObj?.id;
    if (stepId === 'contact') return renderContactStep();
    
    if (isForm1) {
      if (stepId === 'q1') return renderRadioGroup('q1', 'Ce rol aveți în companie?', [
        { label: 'Administrator / Patron' },
        { label: 'Manager operațional / Șef echipă / Șef șantier' },
        { label: 'Achiziții / Aprovizionare' },
        { label: 'SSM / HR / Administrativ' },
        { label: 'Alt rol', hasOther: true }
      ]);
      if (stepId === 'q2') return renderRadioGroup('q2', 'Pentru aproximativ câți colegi aveți în vedere echiparea, în perioada următoare?', [
        { label: '5–15 persoane' },
        { label: '16–40 persoane' },
        { label: '41–100 persoane' },
        { label: 'Peste 100 persoane' }
      ]);
      if (stepId === 'q3') return renderRadioGroup('q3', 'În ce tip de activitate lucrați, în principal?', [
        { label: 'Construcții / infrastructură' },
        { label: 'Instalații / electrice / HVAC / sanitare' },
        { label: 'Fotovoltaice / energie' },
        { label: 'Producție / industrie' },
        { label: 'Agricultură' },
        { label: 'Servicii tehnice / mentenanță' },
        { label: 'Alt domeniu', hasOther: true }
      ]);
      if (stepId === 'q4') return renderMultiSelect('q4', 'Ce s-a schimbat recent sau ce a apărut în perioada asta de a devenit important să vă uitați la partea de echipamente?', [
        { label: 'Începe un proiect nou sau o etapă nouă' },
        { label: 'Vrem să înlocuim sau să reevaluăm furnizorul actual' },
        { label: 'Vrem să îmbunătățim calitatea sau confortul echipamentelor' },
        { label: 'Avem nevoie de mai multă claritate pe partea de SSM / conformitate' },
        { label: 'Vrem o imagine mai unitară și mai profesionistă a echipei' },
        { label: 'Ne uităm din timp la opțiuni, fără urgență imediată' }
      ], 2);
      if (stepId === 'q5') return renderMultiSelect('q5', 'Când vă gândiți la echiparea echipei, ce ați vrea să fie mai clar, mai simplu sau mai bine pus la punct?', [
        { label: 'Alegerea corectă a produselor pentru activitatea noastră' },
        { label: 'Conformitatea și documentarea SSM' },
        { label: 'Calitatea și durabilitatea în utilizare' },
        { label: 'Organizarea comenzilor și reaprovizionării' },
        { label: 'Confortul și acceptarea echipamentelor de către echipă' },
        { label: 'Imaginea profesională a firmei în fața clienților' },
        { label: 'Altceva', hasOther: true }
      ], 2);
      if (stepId === 'q6') return renderRadioGroup('q6', 'Ce ar conta cel mai mult pentru dvs. ca această discuție să fie una utilă?', [
        { label: 'Să înțelegem ce variante ni se potrivesc' },
        { label: 'Să primim recomandări clare pentru activitatea noastră' },
        { label: 'Să clarificăm ce este necesar din punct de vedere SSM' },
        { label: 'Să vedem cum putem uniformiza mai bine imaginea echipei' },
        { label: 'Să știm ce variantă este mai rentabilă pe termen lung' },
        { label: 'Altceva', hasOther: true }
      ]);
    } else {
      // FORM 2
      if (stepId === 'q1') return renderRadioGroup('q1', 'Pentru aproximativ câți colegi aveți nevoie de echipamente în această etapă?', [
        { label: '5–15 persoane' },
        { label: '16–40 persoane' },
        { label: '41–100 persoane' },
        { label: 'Peste 100 persoane' }
      ]);
      if (stepId === 'q2') return renderRadioGroup('q2', 'În ce tip de activitate lucrați, în principal?', [
        { label: 'Construcții / infrastructură' },
        { label: 'Instalații / electrice / HVAC / sanitare' },
        { label: 'Fotovoltaice / energie' },
        { label: 'Producție / industrie' },
        { label: 'Agricultură' },
        { label: 'Servicii tehnice / mentenanță' },
        { label: 'Alt domeniu', hasOther: true }
      ]);
      if (stepId === 'q3') return renderMultiSelect('q3', 'Ce tipuri de produse aveți acum în vedere?', [
        { label: 'Încălțăminte de protecție' },
        { label: 'Îmbrăcăminte de lucru' },
        { label: 'Mănuși / căști / ochelari / alte echipamente SSM' },
        { label: 'Echipamente reflectorizante / hi-vis' },
        { label: 'Echipamente specializate' },
        { label: 'Nu suntem complet siguri și avem nevoie de recomandări' }
      ]);
      if (stepId === 'q4') return renderRadioGroup('q4', 'Cum gestionați în prezent partea de echipamente pentru echipă?', [
        { label: 'Avem deja un furnizor, dar vrem să vedem și alte variante' },
        { label: 'Avem furnizor, însă nu suntem mulțumiți de rezultate' },
        { label: 'Cumpărăm punctual, în funcție de nevoie' },
        { label: 'Este prima dată când vrem să organizăm mai profesionist partea de echipamente' },
        { label: 'Doar ne orientăm momentan' }
      ]);
      if (stepId === 'q5') return renderMultiSelect('q5', 'Ce ar fi important să rezolve bine această ofertă pentru voi?', [
        { label: 'Să fie potrivită pentru activitatea și riscurile echipei' },
        { label: 'Să ne ajute să fim acoperiți corect din punct de vedere SSM' },
        { label: 'Să avem produse durabile și confortabile' },
        { label: 'Să ne fie ușor de gestionat pe mărimi și reaprovizionare' },
        { label: 'Să avem o imagine mai profesionistă și unitară' },
        { label: 'Să ne încadrăm bine în termen' },
        { label: 'Să primim recomandări clare, nu doar prețuri' },
        { label: 'Altceva', hasOther: true }
      ], 3);
      if (stepId === 'q6') return renderRadioGroup('q6', 'Când v-ar fi util să aveți oferta sau produsele?', [
        { label: 'În următoarele 2 săptămâni' },
        { label: 'În următoarea lună' },
        { label: 'În următoarele 2–3 luni' },
        { label: 'Ne pregătim din timp, fără termen imediat' }
      ]);
      if (stepId === 'q7') return renderRadioGroup('q7', 'Cum vă este mai util să continuăm de aici?', [
        { label: 'Să primesc oferta pe email' },
        { label: 'Să primesc oferta și să clarificăm rapid dacă este nevoie' },
        { label: 'Prefer să discutăm puțin înainte, ca să alegem varianta potrivită' }
      ]);
    }
  };

  const isLastStep = currentStep === steps.length - 1;
  const progressPercent = Math.round(((currentStep + 1) / steps.length) * 100);

  return (
    <div className="max-w-xl mx-auto w-full bg-[#111] rounded-[8px] border border-white/5 p-6 md:p-8 shadow-2xl relative overflow-hidden">
      {/* Progress Bar Header */}
      <div className="mb-10">
        <div className="flex justify-between items-end mb-2">
          <span className="text-xs font-medium text-yp-yellow font-mono uppercase tracking-wider">
            Pasul {currentStep + 1} / {steps.length}
          </span>
          <span className="text-xs text-neutral-500 font-medium">{progressPercent}% completat</span>
        </div>
        <div className="h-1.5 w-full bg-[#222] rounded-full overflow-hidden">
          <div 
            className="h-full bg-yp-yellow rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${progressPercent}%` }} 
          />
        </div>
      </div>

      {/* Content */}
      <div className="min-h-[300px]">
        {renderStepContent()}
      </div>

      {/* Footer Navigation */}
      <div className="mt-10 flex gap-4 pt-6 border-t border-white/10 items-center justify-between">
        {currentStep > 0 ? (
          <button
            onClick={prevStep}
            disabled={isSubmitting}
            className="px-6 py-3 rounded text-sm font-medium text-neutral-400 hover:text-white hover:bg-white/5 transition-all"
          >
            Înapoi
          </button>
        ) : <div />}

        <button
          onClick={isLastStep ? submitForm : nextStep}
          disabled={isSubmitting}
          className="bg-yp-yellow text-yp-black px-8 py-3 rounded font-medium text-sm flex items-center gap-2 hover:bg-white transition-all disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Se trimite...
            </span>
          ) : (
            <>
              {isLastStep ? 'Trimiteți' : 'Următorul pas'}
              {!isLastStep && (
                <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
