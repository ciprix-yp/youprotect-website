import { useEffect, useState } from 'react';

const MAX_SHORTLIST_ITEMS = 12;

const INITIAL_FORM = {
  urgenta: '',
  echipament: '',
  nume: '',
  email: '',
  telefon: '',
  companie: '',
  mesaj: '',
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

export default function LeadModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState('qualification');
  const [intent, setIntent] = useState('view_samples');
  const [triggerSource, setTriggerSource] = useState('website');
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState({});

  const syncShortlist = () => {
    setSelectedProducts(getShortlistItems());
  };

  const resetModalState = () => {
    setStep('qualification');
    setFormData(INITIAL_FORM);
    setLoading(false);
    setSuccess(false);
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

  const canProceedToContact = formData.urgenta && formData.echipament;

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

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = validateContactForm();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);

    try {
      const utm = readUtmParams();
      const sourceUrl = `${window.location.pathname}${window.location.search}`;

      const payload = {
        ...formData,
        conversion_intent: intent,
        selected_products: selectedProducts,
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

      if (!response.ok) {
        let message = 'A aparut o eroare. Te rugam sa incerci din nou.';
        try {
          const body = await response.json();
          if (body?.error) {
            message = body.error;
          }
        } catch (_error) {
          // Ignore JSON parse error and use generic message.
        }
        throw new Error(message);
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
    intent === 'book_call' ? 'Mini-precalificare pentru Book a call' : 'Cateva intrebari pentru testare';
  const subtitle =
    intent === 'book_call'
      ? 'Ne ajuta sa iti alocam rapid agentul potrivit.'
      : 'Raspunsurile tale ne ajuta sa pregatim selectie si oferta relevanta.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-yp-black/80 backdrop-blur-sm" onClick={closeModal} />

      <div className="relative bg-yp-gray rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-yp-green/20">
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
              <p className="text-yp-white/70 mb-8">{subtitle}</p>

              {intent === 'view_samples' && selectedProducts.length > 0 && (
                <div className="mb-8 rounded-xl border border-yp-white/20 bg-yp-black/20 p-4">
                  <p className="text-sm text-yp-white/70 mb-2">
                    Shortlist activ ({selectedProducts.length}/{MAX_SHORTLIST_ITEMS})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedProducts.map((product) => (
                      <span
                        key={product.id}
                        className="px-2.5 py-1 rounded-full text-xs border border-yp-white/20 text-yp-white/80"
                      >
                        {product.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-8">
                <label className="block text-yp-white font-heading text-lg mb-4">
                  1. Cand ai nevoie de echipament?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { value: 'urgent', label: 'Urgent (< 5 zile)', icon: '⚡' },
                    { value: 'normal', label: 'Normal (1-2 saptamani)', icon: '📅' },
                    { value: 'planificare', label: 'In planificare (> 1 luna)', icon: '📋' },
                    { value: 'explorare', label: 'Doar ma informez', icon: '🔍' },
                  ].map((option) => (
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
                  {[
                    { value: 'imbracaminte', label: 'Imbracaminte de lucru', icon: '👔' },
                    { value: 'incaltaminte', label: 'Incaltaminte protectie', icon: '👢' },
                    { value: 'accesorii', label: 'Accesorii (manusi, ochelari)', icon: '🧤' },
                    { value: 'complet', label: 'Echipament complet', icon: '📦' },
                  ].map((option) => (
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

              <button
                type="button"
                onClick={() => setStep('contact')}
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
              <p className="text-yp-white/70 mb-6">
                {intent === 'book_call'
                  ? 'Te contactam rapid pentru confirmarea call-ului.'
                  : 'Te contactam cu o propunere de testare in cel mai scurt timp.'}
              </p>

              {intent === 'view_samples' && selectedProducts.length > 0 && (
                <div className="mb-6 rounded-xl border border-yp-white/20 bg-yp-black/20 p-4">
                  <p className="text-sm text-yp-white/70 mb-2">Produse selectate pentru testare</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedProducts.map((product) => (
                      <span
                        key={product.id}
                        className="px-2.5 py-1 rounded-full text-xs border border-yp-white/20 text-yp-white/80"
                      >
                        {product.name}
                      </span>
                    ))}
                  </div>
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
