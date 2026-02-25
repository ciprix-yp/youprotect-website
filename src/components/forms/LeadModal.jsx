import { useState, useEffect } from 'react';

export default function LeadModal({ isOpen, onClose, productContext = null }) {
  const [step, setStep] = useState('qualification');
  
  const [formData, setFormData] = useState({
    urgenta: '',
    echipament: '',
    nume: '',
    email: '',
    telefon: '',
    companie: '',
    mesaj: productContext?.produs_nume 
      ? `Mă interesează o ofertă pentru ${productContext.produs_nume}.`
      : '',
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep('qualification');
        setFormData({
          urgenta: '',
          echipament: '',
          nume: '',
          email: '',
          telefon: '',
          companie: '',
          mesaj: productContext?.produs_nume 
            ? `Mă interesează o ofertă pentru ${productContext.produs_nume}.`
            : '',
        });
        setSuccess(false);
        setErrors({});
      }, 300);
    }
  }, [isOpen, productContext]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleQualificationSelect = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const canProceedToContact = formData.urgenta && formData.echipament;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateContactForm = () => {
    const newErrors = {};

    if (!formData.nume || formData.nume.trim().length < 3) {
      newErrors.nume = 'Numele trebuie să aibă minim 3 caractere';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email || !emailRegex.test(formData.email)) {
      newErrors.email = 'Email invalid';
    }

    const phoneRegex = /^(\+40|0040|0)[27][0-9]{8}$/;
    const cleanPhone = formData.telefon.replace(/\s/g, '');
    if (!cleanPhone || !phoneRegex.test(cleanPhone)) {
      newErrors.telefon = 'Telefon invalid (ex: 0721234567)';
    }

    if (!formData.companie || formData.companie.trim().length < 2) {
      newErrors.companie = 'Numele companiei este obligatoriu';
    }

    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const newErrors = validateContactForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          sursa: 'Website Modal',
          product_context: productContext,
        }),
      });

      if (!response.ok) throw new Error('Network error');

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Lead submission error:', error);
      setErrors({ submit: 'A apărut o eroare. Te rugăm să încerci din nou.' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-yp-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-yp-gray rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-yp-green/20">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-yp-white/60 hover:text-yp-white text-3xl font-light z-10"
          aria-label="Închide"
        >
          ×
        </button>

        <div className="flex gap-2 p-6 pb-0">
          <div className={`h-1 flex-1 rounded-full transition-colors ${
            step === 'qualification' ? 'bg-yp-yellow' : 'bg-yp-green'
          }`} />
          <div className={`h-1 flex-1 rounded-full transition-colors ${
            step === 'contact' ? 'bg-yp-yellow' : 'bg-yp-white/20'
          }`} />
        </div>

        <div className="p-8">
          {success ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-yp-green rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-yp-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="font-heading text-2xl text-yp-white mb-2">Mulțumim!</h3>
              <p className="text-yp-white/70">Cererea ta a fost trimisă. Te vom contacta în curând.</p>
            </div>
          ) : step === 'qualification' ? (
            <>
              <h2 className="font-heading text-3xl text-yp-white mb-2">
                Ajută-ne să te deservim mai bine
              </h2>
              <p className="text-yp-white/70 mb-8">
                Două întrebări rapide pentru a-ți oferi o ofertă precisă
              </p>

              <div className="mb-8">
                <label className="block text-yp-white font-heading text-lg mb-4">
                  1. Când ai nevoie de echipament?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { value: 'urgent', label: 'Urgent (< 5 zile)', icon: '⚡' },
                    { value: 'normal', label: 'Normal (1-2 săptămâni)', icon: '📅' },
                    { value: 'planificare', label: 'În planificare (> 1 lună)', icon: '📋' },
                    { value: 'explorare', label: 'Doar mă informez', icon: '🔍' },
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
                  2. Ce tip de echipament te interesează?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { value: 'imbracaminte', label: 'Îmbrăcăminte de lucru', icon: '👔' },
                    { value: 'incaltaminte', label: 'Încălțăminte protecție', icon: '👢' },
                    { value: 'accesorii', label: 'Accesorii (mănuși, ochelari)', icon: '🧤' },
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
                Continuă →
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('qualification')}
                className="text-yp-white/60 hover:text-yp-white mb-4 flex items-center gap-2"
              >
                ← Înapoi
              </button>

              <h2 className="font-heading text-3xl text-yp-white mb-2">
                Detaliile tale de contact
              </h2>
              <p className="text-yp-white/70 mb-6">
                Te vom contacta în maximum 24h cu o ofertă personalizată
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="nume" className="block text-yp-white mb-2 font-heading">
                    Nume și Prenume *
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
                    Mesaj (opțional)
                  </label>
                  <textarea
                    id="mesaj"
                    name="mesaj"
                    value={formData.mesaj}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-4 py-3 bg-yp-black border border-yp-white/20 rounded-lg text-yp-white focus:outline-none focus:border-yp-yellow transition-colors resize-none"
                    placeholder="Detalii suplimentare despre necesitățile tale..."
                  />
                </div>

                {errors.submit && (
                  <p className="text-red-400 text-center">{errors.submit}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-yp-yellow text-yp-black font-heading font-bold py-4 rounded-xl text-lg hover:bg-yp-yellow/90 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Se trimite...' : 'Trimite Cererea'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
