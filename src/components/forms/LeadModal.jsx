import { useEffect, useMemo, useState } from 'react';

const MAX_SHORTLIST_ITEMS = 12;
const MAX_MULTI_SELECT = 3;

const INITIAL_FORM = {
  urgenta: '',
  echipament: '',
  team_size: '',
  decision_stage: '',
  payment_method: '',
  pain_points: [],
  desired_outcomes: [],
  nume: '',
  email: '',
  telefon: '',
  companie: '',
  mesaj: '',
};

const URGENCY_OPTIONS = [
  { value: 'urgent', label: 'Urgent (< 5 zile)', icon: '⚡' },
  { value: 'normal', label: 'Normal (1-2 saptamani)', icon: '📅' },
  { value: 'planificare', label: 'In planificare (> 1 luna)', icon: '📋' },
  { value: 'explorare', label: 'Doar ma informez', icon: '🔍' },
];

const EQUIPMENT_OPTIONS = [
  { value: 'imbracaminte', label: 'Imbracaminte de lucru', icon: '👔' },
  { value: 'incaltaminte', label: 'Incaltaminte protectie', icon: '👢' },
  { value: 'accesorii', label: 'Accesorii (manusi, ochelari)', icon: '🧤' },
  { value: 'complet', label: 'Echipament complet', icon: '📦' },
];

const TEAM_SIZE_OPTIONS = [
  { value: '3_5', label: '3-5 oameni (pilot)' },
  { value: '6_20', label: '6-20 oameni' },
  { value: '21_50', label: '21-50 oameni' },
  { value: '50_plus', label: '50+ oameni' },
];

const DECISION_STAGE_OPTIONS = [
  { value: 'pilot_activ', label: 'Vrem sa testam imediat' },
  { value: 'compar_oferte', label: 'Comparam optiuni acum' },
  { value: 'buget_aprobat', label: 'Buget aprobat, cautam varianta potrivita' },
  { value: 'research', label: 'Research initial, decizie mai tarziu' },
];

const PAIN_POINT_OPTIONS = [
  { value: 'confort_scazut', label: 'Confort slab in teren' },
  { value: 'durata_mica', label: 'Produsele se uzeaza prea repede' },
  { value: 'conformitate', label: 'Presiune pe conformitate/audit' },
  { value: 'imagine_neunitara', label: 'Imagine neunitara a echipei' },
  { value: 'livrare_instabila', label: 'Livrari instabile de la furnizori' },
];

const OUTCOME_OPTIONS = [
  { value: 'rata_purtare', label: 'Rata mai buna de purtare' },
  { value: 'cost_total', label: 'Cost total mai mic pe termen lung' },
  { value: 'conformitate_audit', label: 'Conformitate clara la audit' },
  { value: 'imagine_profesionala', label: 'Imagine profesionala a echipei' },
  { value: 'predictibilitate', label: 'Predictibilitate in aprovizionare' },
];

const PAYMENT_OPTIONS = [
  {
    value: 'integral_la_comanda',
    label: 'Plata integrala la comanda',
    note: 'Discount comercial -10%',
  },
  {
    value: 'partial_50_la_comanda',
    label: 'Plata partiala (minim 50%)',
    note: 'Discount comercial -5%',
  },
  {
    value: 'la_termen_instrument_plata',
    label: 'Plata la termen cu instrument de plata',
    note: 'Discount comercial 0%',
  },
];

const LABEL_BY_VALUE = {
  ...Object.fromEntries(URGENCY_OPTIONS.map((item) => [item.value, item.label])),
  ...Object.fromEntries(EQUIPMENT_OPTIONS.map((item) => [item.value, item.label])),
  ...Object.fromEntries(TEAM_SIZE_OPTIONS.map((item) => [item.value, item.label])),
  ...Object.fromEntries(DECISION_STAGE_OPTIONS.map((item) => [item.value, item.label])),
  ...Object.fromEntries(PAIN_POINT_OPTIONS.map((item) => [item.value, item.label])),
  ...Object.fromEntries(OUTCOME_OPTIONS.map((item) => [item.value, item.label])),
  ...Object.fromEntries(PAYMENT_OPTIONS.map((item) => [item.value, item.label])),
};

const SCORE_LABEL_TEXT = {
  low: 'Low fit',
  medium: 'Medium fit',
  high: 'High fit',
};

function readUtmParams() {
  if (typeof window === 'undefined') {
    return {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
  };
}

function getShortlistItems() {
  if (typeof window === 'undefined') {
    return [];
  }

  const shortlist = window.YouProtectShortlist;
  if (!shortlist) {
    return [];
  }

  return shortlist.getItems().slice(0, MAX_SHORTLIST_ITEMS);
}

function toggleArrayValue(values, target) {
  if (values.includes(target)) {
    return values.filter((value) => value !== target);
  }

  if (values.length >= MAX_MULTI_SELECT) {
    return values;
  }

  return [...values, target];
}

function buildNeedsSummary(formData, intent) {
  const intentLabel = intent === 'book_call' ? 'Book a call' : 'View samples';

  const pains = formData.pain_points.map((value) => LABEL_BY_VALUE[value] || value).join(', ');
  const outcomes = formData.desired_outcomes
    .map((value) => LABEL_BY_VALUE[value] || value)
    .join(', ');

  const parts = [
    `Intent: ${intentLabel}`,
    `Urgenta: ${LABEL_BY_VALUE[formData.urgenta] || '-'}`,
    `Echipament: ${LABEL_BY_VALUE[formData.echipament] || '-'}`,
    `Dimensiune echipa: ${LABEL_BY_VALUE[formData.team_size] || '-'}`,
    `Stadiu decizie: ${LABEL_BY_VALUE[formData.decision_stage] || '-'}`,
    `Pain points: ${pains || '-'}`,
    `Outcomes: ${outcomes || '-'}`,
  ];

  if (intent === 'view_samples') {
    parts.push(`Plata preferata: ${LABEL_BY_VALUE[formData.payment_method] || '-'}`);
  }

  return parts.join(' | ');
}

function calculateQualification(formData, intent) {
  const urgencyScore = {
    urgent: 18,
    normal: 14,
    planificare: 9,
    explorare: 4,
  };

  const equipmentScore = {
    complet: 16,
    imbracaminte: 12,
    incaltaminte: 12,
    accesorii: 9,
  };

  const teamScore = {
    '3_5': 8,
    '6_20': 12,
    '21_50': 16,
    '50_plus': 20,
  };

  const decisionScore = {
    pilot_activ: 22,
    compar_oferte: 17,
    buget_aprobat: 20,
    research: 8,
  };

  const paymentScore = {
    integral_la_comanda: 12,
    partial_50_la_comanda: 8,
    la_termen_instrument_plata: 5,
  };

  let score = 0;
  score += urgencyScore[formData.urgenta] || 0;
  score += equipmentScore[formData.echipament] || 0;
  score += teamScore[formData.team_size] || 0;
  score += decisionScore[formData.decision_stage] || 0;
  score += Math.min(formData.pain_points.length * 5, 15);
  score += Math.min(formData.desired_outcomes.length * 4, 12);

  if (intent === 'view_samples') {
    score += paymentScore[formData.payment_method] || 0;
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  let label = 'low';
  if (clamped >= 75) {
    label = 'high';
  } else if (clamped >= 50) {
    label = 'medium';
  }

  return { score: clamped, label };
}

function buildAnswersJson(formData, intent) {
  const answers = [
    { question: 'urgenta', answer: formData.urgenta || null },
    { question: 'echipament', answer: formData.echipament || null },
    { question: 'team_size', answer: formData.team_size || null },
    { question: 'decision_stage', answer: formData.decision_stage || null },
    { question: 'pain_points', answer: formData.pain_points },
    { question: 'desired_outcomes', answer: formData.desired_outcomes },
  ];

  if (intent === 'view_samples') {
    answers.push({ question: 'payment_method', answer: formData.payment_method || null });
  }

  return answers;
}

export default function LeadModal({ bookingsUrl = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState('qualification');
  const [intent, setIntent] = useState('view_samples');
  const [triggerSource, setTriggerSource] = useState('website');
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [bookingFallbackUrl, setBookingFallbackUrl] = useState('');
  const [errors, setErrors] = useState({});
  const resolvedBookingUrl = bookingFallbackUrl || bookingsUrl || '';

  const qualification = useMemo(() => calculateQualification(formData, intent), [formData, intent]);

  const syncShortlist = () => {
    setSelectedProducts(getShortlistItems());
  };

  const resetModalState = () => {
    setStep('qualification');
    setFormData(INITIAL_FORM);
    setLoading(false);
    setSuccess(false);
    setBookingFallbackUrl('');
    setErrors({});
    syncShortlist();
  };

  useEffect(() => {
    const handleOpen = (event) => {
      const detail = event?.detail || {};
      const shortlist = window.YouProtectShortlist;

      if (detail.product && shortlist) {
        shortlist.add(detail.product);
      }

      setIntent(detail.intent === 'book_call' ? 'book_call' : 'view_samples');
      setTriggerSource(detail.source || 'website');
      syncShortlist();
      setIsOpen(true);
    };

    const handleShortlistChanged = (event) => {
      const items = event?.detail?.items;
      if (Array.isArray(items)) {
        setSelectedProducts(items.slice(0, MAX_SHORTLIST_ITEMS));
      } else {
        syncShortlist();
      }
    };

    window.addEventListener('yp:lead-modal-open', handleOpen);
    window.addEventListener('yp:shortlist-changed', handleShortlistChanged);

    syncShortlist();

    return () => {
      window.removeEventListener('yp:lead-modal-open', handleOpen);
      window.removeEventListener('yp:shortlist-changed', handleShortlistChanged);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      const timeout = setTimeout(() => {
        resetModalState();
      }, 250);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [isOpen]);

  const hasCoreAnswers =
    !!formData.urgenta &&
    !!formData.echipament &&
    !!formData.team_size &&
    !!formData.decision_stage &&
    formData.pain_points.length > 0 &&
    formData.desired_outcomes.length > 0;

  const hasPaymentForIntent = intent === 'book_call' || !!formData.payment_method;
  const hasProductsForIntent = intent === 'book_call' || selectedProducts.length > 0;

  const canProceedToContact = hasCoreAnswers && hasPaymentForIntent && hasProductsForIntent;

  const closeModal = () => {
    if (loading) {
      return;
    }
    setIsOpen(false);
  };

  const handleQualificationSelect = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (errors.qualification) {
      setErrors((prev) => ({ ...prev, qualification: '' }));
    }
  };

  const handleToggleMulti = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: toggleArrayValue(prev[field], value),
    }));

    if (errors.qualification) {
      setErrors((prev) => ({ ...prev, qualification: '' }));
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validateContactForm = () => {
    const nextErrors = {};

    if (!formData.nume || formData.nume.trim().length < 3) {
      nextErrors.nume = 'Numele trebuie sa aiba minim 3 caractere';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email || !emailRegex.test(formData.email)) {
      nextErrors.email = 'Email invalid';
    }

    const phoneRegex = /^(\+40|0040|0)[27][0-9]{8}$/;
    const cleanPhone = formData.telefon.replace(/\s/g, '');
    if (!cleanPhone || !phoneRegex.test(cleanPhone)) {
      nextErrors.telefon = 'Telefon invalid (ex: 0721234567)';
    }

    if (!formData.companie || formData.companie.trim().length < 2) {
      nextErrors.companie = 'Numele companiei este obligatoriu';
    }

    if (intent === 'view_samples' && selectedProducts.length === 0) {
      nextErrors.submit = 'Selecteaza cel putin un produs in shortlist inainte de trimitere.';
    }

    return nextErrors;
  };

  const handleGoToContact = () => {
    if (!canProceedToContact) {
      setErrors((prev) => ({
        ...prev,
        qualification:
          'Completeaza toate raspunsurile obligatorii (inclusiv selectie produse si metoda de plata pentru testare).',
      }));
      return;
    }

    setStep('contact');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = validateContactForm();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    setBookingFallbackUrl('');

    try {
      const utm = readUtmParams();
      const sourceUrl = `${window.location.pathname}${window.location.search}`;
      const answersJson = buildAnswersJson(formData, intent);
      const needsSummary = buildNeedsSummary(formData, intent);

      const payload = {
        ...formData,
        conversion_intent: intent,
        selected_products: selectedProducts,
        qualification_score: qualification.score,
        qualification_label: qualification.label,
        answers_json: answersJson,
        needs_summary: needsSummary,
        booking_url: intent === 'book_call' ? bookingsUrl || null : null,
        source_url: sourceUrl,
        source_trigger: triggerSource,
        user_agent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        ...utm,
      };

      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let responseBody = null;
      try {
        responseBody = await response.json();
      } catch (_error) {
        responseBody = null;
      }

      if (!response.ok) {
        let message = 'A aparut o eroare. Te rugam sa incerci din nou.';
        if (responseBody?.error) {
          message = responseBody.error;
        }
        throw new Error(message);
      }

      if (intent === 'book_call') {
        const nextBookingUrl =
          typeof responseBody?.booking_url === 'string' && responseBody.booking_url.trim()
            ? responseBody.booking_url.trim()
            : bookingsUrl;

        if (nextBookingUrl) {
          setBookingFallbackUrl(nextBookingUrl);
          window.location.href = nextBookingUrl;
          return;
        }
      }

      if (intent === 'view_samples' && window.YouProtectShortlist) {
        window.YouProtectShortlist.clear();
      }

      setSuccess(true);

      setTimeout(() => {
        setIsOpen(false);
      }, 2000);
    } catch (error) {
      console.error('Lead submission error:', error);
      if (intent === 'book_call' && bookingsUrl) {
        setBookingFallbackUrl(bookingsUrl);
      }
      setErrors({
        submit: error instanceof Error ? error.message : 'A aparut o eroare la trimitere.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  const title =
    intent === 'book_call' ? 'Mini-precalificare pentru Book a call' : 'Wizard de testare fara risc';
  const subtitle =
    intent === 'book_call'
      ? 'Ne ajuta sa iti alocam rapid agentul potrivit.'
      : 'Raspunsurile tale ne ajuta sa pregatim selectie, scoring si oferta relevanta.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-yp-black/80 backdrop-blur-sm" onClick={closeModal} />

      <div className="relative bg-yp-gray rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-yp-green/20">
        <button
          onClick={closeModal}
          className="absolute top-4 right-4 text-yp-white/60 hover:text-yp-white text-3xl font-light z-10"
          aria-label="Inchide"
        >
          ×
        </button>

        <div className="flex gap-2 p-6 pb-0">
          <div
            className={`h-1 flex-1 rounded-full transition-colors ${
              step === 'qualification' ? 'bg-yp-yellow' : 'bg-yp-green'
            }`}
          />
          <div
            className={`h-1 flex-1 rounded-full transition-colors ${
              step === 'contact' ? 'bg-yp-yellow' : 'bg-yp-white/20'
            }`}
          />
        </div>

        <div className="p-8">
          {success ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-yp-green rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-yp-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="font-heading text-2xl text-yp-white mb-2">Multumim!</h3>
              <p className="text-yp-white/70">
                {intent === 'book_call'
                  ? 'Cererea pentru call a fost trimisa. Revenim cu confirmare pe email.'
                  : 'Cererea pentru testare a fost trimisa. Revenim rapid cu urmatorii pasi.'}
              </p>
            </div>
          ) : step === 'qualification' ? (
            <>
              <h2 className="font-heading text-3xl text-yp-white mb-2">{title}</h2>
              <p className="text-yp-white/70 mb-6">{subtitle}</p>

              <div className="mb-6 rounded-xl border border-yp-white/20 bg-yp-black/20 p-4">
                <p className="text-sm text-yp-white/70">Scor consultativ estimat</p>
                <p className="text-2xl font-heading text-yp-yellow mt-1">
                  {qualification.score}% · {SCORE_LABEL_TEXT[qualification.label]}
                </p>
                <p className="text-xs text-yp-white/60 mt-1">
                  Scorul este consultativ pentru agent si nu blocheaza conversatia.
                </p>
              </div>

              {intent === 'view_samples' && (
                <div className="mb-8 rounded-xl border border-yp-white/20 bg-yp-black/20 p-4">
                  <p className="text-sm text-yp-white/70 mb-2">
                    Shortlist activ ({selectedProducts.length}/{MAX_SHORTLIST_ITEMS})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedProducts.length === 0 ? (
                      <span className="text-xs text-amber-200">
                        Nu ai produse in selectie. Revino in catalog si adauga produse.
                      </span>
                    ) : (
                      selectedProducts.map((product) => (
                        <span
                          key={product.id}
                          className="px-2.5 py-1 rounded-full text-xs border border-yp-white/20 text-yp-white/80"
                        >
                          {product.name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="mb-8">
                <label className="block text-yp-white font-heading text-lg mb-4">
                  1. Cand ai nevoie de echipament?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {URGENCY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleQualificationSelect('urgenta', option.value)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        formData.urgenta === option.value
                          ? 'border-yp-yellow bg-yp-yellow/10 text-yp-yellow'
                          : 'border-yp-white/20 text-yp-white hover:border-yp-white/40'
                      }`}
                    >
                      <span className="text-2xl mr-3">{option.icon}</span>
                      <span className="font-heading">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-yp-white font-heading text-lg mb-4">
                  2. Ce tip de echipament te intereseaza?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {EQUIPMENT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleQualificationSelect('echipament', option.value)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        formData.echipament === option.value
                          ? 'border-yp-yellow bg-yp-yellow/10 text-yp-yellow'
                          : 'border-yp-white/20 text-yp-white hover:border-yp-white/40'
                      }`}
                    >
                      <span className="text-2xl mr-3">{option.icon}</span>
                      <span className="font-heading">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-yp-white font-heading text-lg mb-4">
                  3. Cati oameni vor fi echipati in prima etapa?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TEAM_SIZE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleQualificationSelect('team_size', option.value)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        formData.team_size === option.value
                          ? 'border-yp-yellow bg-yp-yellow/10 text-yp-yellow'
                          : 'border-yp-white/20 text-yp-white hover:border-yp-white/40'
                      }`}
                    >
                      <span className="font-heading">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-yp-white font-heading text-lg mb-4">
                  4. In ce stadiu este decizia de cumparare?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {DECISION_STAGE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleQualificationSelect('decision_stage', option.value)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        formData.decision_stage === option.value
                          ? 'border-yp-yellow bg-yp-yellow/10 text-yp-yellow'
                          : 'border-yp-white/20 text-yp-white hover:border-yp-white/40'
                      }`}
                    >
                      <span className="font-heading">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-yp-white font-heading text-lg">
                    5. Care sunt punctele de durere principale? (max {MAX_MULTI_SELECT})
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PAIN_POINT_OPTIONS.map((option) => {
                    const selected = formData.pain_points.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleToggleMulti('pain_points', option.value)}
                        className={`px-3 py-2 rounded-full text-sm border transition-colors ${
                          selected
                            ? 'border-yp-yellow bg-yp-yellow/10 text-yp-yellow'
                            : 'border-yp-white/20 text-yp-white/80 hover:border-yp-white/50'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-yp-white font-heading text-lg">
                    6. Ce rezultate vrei sa obtii? (max {MAX_MULTI_SELECT})
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {OUTCOME_OPTIONS.map((option) => {
                    const selected = formData.desired_outcomes.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleToggleMulti('desired_outcomes', option.value)}
                        className={`px-3 py-2 rounded-full text-sm border transition-colors ${
                          selected
                            ? 'border-yp-yellow bg-yp-yellow/10 text-yp-yellow'
                            : 'border-yp-white/20 text-yp-white/80 hover:border-yp-white/50'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {intent === 'view_samples' && (
                <div className="mb-8">
                  <label className="block text-yp-white font-heading text-lg mb-4">
                    7. Metoda de plata preferata
                  </label>
                  <div className="space-y-3">
                    {PAYMENT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleQualificationSelect('payment_method', option.value)}
                        className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                          formData.payment_method === option.value
                            ? 'border-yp-yellow bg-yp-yellow/10 text-yp-yellow'
                            : 'border-yp-white/20 text-yp-white hover:border-yp-white/40'
                        }`}
                      >
                        <p className="font-heading">{option.label}</p>
                        <p className="text-xs mt-1 opacity-80">{option.note}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {errors.qualification && <p className="text-amber-300 mb-4">{errors.qualification}</p>}

              <button
                type="button"
                onClick={handleGoToContact}
                disabled={!canProceedToContact}
                className={`w-full py-4 rounded-xl font-heading text-lg font-bold transition-all ${
                  canProceedToContact
                    ? 'bg-yp-yellow text-yp-black hover:bg-yp-yellow/90 hover:shadow-lg'
                    : 'bg-yp-white/10 text-yp-white/40 cursor-not-allowed'
                }`}
              >
                Continua →
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('qualification')}
                className="text-yp-white/60 hover:text-yp-white mb-4 flex items-center gap-2"
              >
                ← Inapoi
              </button>

              <h2 className="font-heading text-3xl text-yp-white mb-2">Detaliile tale de contact</h2>
              <p className="text-yp-white/70 mb-2">
                Scor estimat pentru agent: <span className="text-yp-yellow">{qualification.score}%</span>{' '}
                ({SCORE_LABEL_TEXT[qualification.label]}).
              </p>
              <p className="text-yp-white/60 text-sm mb-6">
                Scorul este consultativ; nu restrictioneaza programarea call-ului.
              </p>
              {intent === 'book_call' && resolvedBookingUrl && (
                <div className="mb-6 rounded-xl border border-yp-white/20 bg-yp-black/20 p-4">
                  <p className="text-sm text-yp-white/80">
                    Dupa trimitere, vei fi redirectionat in calendarul Microsoft Bookings.
                  </p>
                  <a
                    href={resolvedBookingUrl}
                    className="inline-flex mt-3 text-sm text-yp-yellow underline hover:text-yp-white"
                  >
                    Deschide calendarul acum
                  </a>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="nume" className="block text-yp-white mb-2 font-heading">
                    Nume si Prenume *
                  </label>
                  <input
                    type="text"
                    id="nume"
                    name="nume"
                    value={formData.nume}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 bg-yp-black border rounded-lg text-yp-white focus:outline-none focus:border-yp-yellow transition-colors ${
                      errors.nume ? 'border-red-500' : 'border-yp-white/20'
                    }`}
                    placeholder="Ion Popescu"
                  />
                  {errors.nume && <p className="text-red-400 text-sm mt-1">{errors.nume}</p>}
                </div>

                <div>
                  <label htmlFor="email" className="block text-yp-white mb-2 font-heading">
                    Email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 bg-yp-black border rounded-lg text-yp-white focus:outline-none focus:border-yp-yellow transition-colors ${
                      errors.email ? 'border-red-500' : 'border-yp-white/20'
                    }`}
                    placeholder="ion.popescu@firma.ro"
                  />
                  {errors.email && <p className="text-red-400 text-sm mt-1">{errors.email}</p>}
                </div>

                <div>
                  <label htmlFor="telefon" className="block text-yp-white mb-2 font-heading">
                    Telefon *
                  </label>
                  <input
                    type="tel"
                    id="telefon"
                    name="telefon"
                    value={formData.telefon}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 bg-yp-black border rounded-lg text-yp-white focus:outline-none focus:border-yp-yellow transition-colors ${
                      errors.telefon ? 'border-red-500' : 'border-yp-white/20'
                    }`}
                    placeholder="0721234567"
                  />
                  {errors.telefon && <p className="text-red-400 text-sm mt-1">{errors.telefon}</p>}
                </div>

                <div>
                  <label htmlFor="companie" className="block text-yp-white mb-2 font-heading">
                    Companie *
                  </label>
                  <input
                    type="text"
                    id="companie"
                    name="companie"
                    value={formData.companie}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 bg-yp-black border rounded-lg text-yp-white focus:outline-none focus:border-yp-yellow transition-colors ${
                      errors.companie ? 'border-red-500' : 'border-yp-white/20'
                    }`}
                    placeholder="Firma SRL"
                  />
                  {errors.companie && <p className="text-red-400 text-sm mt-1">{errors.companie}</p>}
                </div>

                <div>
                  <label htmlFor="mesaj" className="block text-yp-white mb-2 font-heading">
                    Mesaj (optional)
                  </label>
                  <textarea
                    id="mesaj"
                    name="mesaj"
                    value={formData.mesaj}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-4 py-3 bg-yp-black border border-yp-white/20 rounded-lg text-yp-white focus:outline-none focus:border-yp-yellow transition-colors resize-none"
                    placeholder="Detalii suplimentare despre nevoile tale..."
                  />
                </div>

                {errors.submit && <p className="text-red-400 text-center">{errors.submit}</p>}
                {intent === 'book_call' && resolvedBookingUrl && (
                  <p className="text-yp-white/70 text-center text-sm">
                    Daca nu se deschide automat calendarul,{' '}
                    <a
                      href={resolvedBookingUrl}
                      className="text-yp-yellow underline hover:text-yp-white"
                    >
                      continua aici
                    </a>
                    .
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-yp-yellow text-yp-black font-heading font-bold py-4 rounded-xl text-lg hover:bg-yp-yellow/90 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading
                    ? 'Se trimite...'
                    : intent === 'book_call'
                      ? 'Trimite cererea de call'
                      : 'Trimite cererea de testare'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
