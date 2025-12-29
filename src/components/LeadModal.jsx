import { useState, useEffect } from 'react';

export default function LeadModal({ isOpen, onClose, productContext = null }) {
  const [formData, setFormData] = useState({
    nume: '',
    email: '',
    telefon: '',
    companie: '',
    mesaj: productContext?.produs_nume 
      ? `Mă interesează o ofertă pentru ${productContext.produs_nume}.`
      : '',
    intrebare_1: '',
    intrebare_2: '',
    intrebare_3: '',
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState({});

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Disable body scroll when modal open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user types
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Nume
    if (!formData.nume || formData.nume.trim().length < 3) {
      newErrors.nume = 'Numele trebuie să aibă minim 3 caractere';
    }

    // Email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email || !emailRegex.test(formData.email)) {
      newErrors.email = 'Email invalid';
    }

    // Telefon (Romanian format)
    const phoneRegex = /^(\+40|0040|0)[27][0-9]{8}$/;
    const cleanPhone = formData.telefon.replace(/\s/g, '');
    if (!cleanPhone || !phoneRegex.test(cleanPhone)) {
      newErrors.telefon = 'Telefon invalid (ex: 0721234567)';
    }

    // Companie
    if (!formData.companie || formData.companie.trim().length < 2) {
      newErrors.companie = 'Numele companiei este obligatoriu';
    }

    // Întrebări
    if (!formData.intrebare_1) {
      newErrors.intrebare_1 = 'Selectați o opțiune';
    }
    if (!formData.intrebare_2) {
      newErrors.intrebare_2 = 'Selectați o opțiune';
    }
    if (!formData.intrebare_3) {
      newErrors.intrebare_3 = 'Selectați o opțiune';
    }

    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      // TODO: Replace with actual n8n webhook URL
      const response = await fetch('https://[n8n-instance].app.n8n.cloud/webhook/lead-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          produs_id: productContext?.produs_id || null,
          produs_nume: productContext?.produs_nume || null,
          sursa: 'Website Modal',
          utm_source: new URLSearchParams(window.location.search).get('utm_source'),
          utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
          utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
          user_agent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        
        // Track conversion in GA4 (if available)
        if (window.gtag) {
          window.gtag('event', 'generate_lead', {
            event_category: 'engagement',
            event_label: productContext?.produs_nume || 'General',
            value: 1
          });
        }

        // Auto-close after 3 seconds
        setTimeout(() => {
          onClose();
          // Reset form
          setTimeout(() => {
            setSuccess(false);
            setFormData({
              nume: '',
              email: '',
              telefon: '',
              companie: '',
              mesaj: '',
              intrebare_1: '',
              intrebare_2: '',
              intrebare_3: '',
            });
          }, 300);
        }, 3000);
      } else {
        setErrors({ 
          general: data.error?.message || 'A apărut o eroare. Te rugăm să încerci din nou.' 
        });
      }
    } catch (error) {
      console.error('Lead submission error:', error);
      setErrors({
        general: (
          <div className="space-y-3">
            <p className="font-semibold text-red-400">
              Ne pare rău, a apărut o eroare tehnică.
            </p>
            <p className="text-yp-white">
              Vă rugăm să ne contactați direct:
            </p>
            <div className="flex flex-col gap-2 p-4 bg-yp-gray rounded-lg">
              
                href="tel:+40742226127"
                className="text-yp-yellow font-bold text-lg hover:underline"
              >
                📞 0742 226 127
              </a>
              
                href="mailto:office@youprotect.ro"
                className="text-yp-yellow hover:underline"
              >
                ✉️ office@youprotect.ro
              </a>
              
                href="https://wa.me/40742226127"
                className="text-yp-yellow hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                💬 WhatsApp
              </a>
            </div>
          </div>
        )
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-yp-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-yp-gray rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-yp-white/70 hover:text-yp-white text-3xl leading-none z-10"
          aria-label="Închide"
        >
          ×
        </button>

        {/* Success State */}
        {success ? (
          <div className="p-12 text-center">
            <div className="text-6xl mb-4">✓</div>
            <h3 className="text-3xl font-heading text-yp-yellow mb-4">
              Mulțumim!
            </h3>
            <p className="text-yp-white/80 text-lg">
              Veți fi contactat în maximum 24 de ore.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-8 pb-6">
              <h2 className="text-3xl font-heading mb-2">
                Cere Ofertă Personalizată
              </h2>
              {productContext && (
                <p className="text-yp-yellow text-sm">
                  Pentru: {productContext.produs_nume}
                </p>
              )}
              <p className="text-yp-white/70 mt-2">
                Consultanța este <strong className="text-yp-white">gratuită și fără obligații</strong>.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4">
              {/* General Error */}
              {errors.general && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
                  {errors.general}
                </div>
              )}

              {/* Nume */}
              <div>
                <label className="block text-yp-white font-body text-sm font-medium mb-2">
                  Nume Complet *
                </label>
                <input
                  type="text"
                  name="nume"
                  value={formData.nume}
                  onChange={handleChange}
                  placeholder="Ion Popescu"
                  className="w-full bg-yp-black text-yp-white border border-yp-gray rounded-lg px-4 py-3 font-body text-base placeholder:text-yp-gray focus:border-yp-yellow focus:ring-2 focus:ring-yp-yellow/20 focus:outline-none transition-all"
                />
                {errors.nume && (
                  <p className="text-red-400 text-sm mt-1">{errors.nume}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-yp-white font-body text-sm font-medium mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="ion@company.ro"
                  className="w-full bg-yp-black text-yp-white border border-yp-gray rounded-lg px-4 py-3 font-body text-base placeholder:text-yp-gray focus:border-yp-yellow focus:ring-2 focus:ring-yp-yellow/20 focus:outline-none transition-all"
                />
                {errors.email && (
                  <p className="text-red-400 text-sm mt-1">{errors.email}</p>
                )}
              </div>

              {/* Telefon */}
              <div>
                <label className="block text-yp-white font-body text-sm font-medium mb-2">
                  Telefon *
                </label>
                <input
                  type="tel"
                  name="telefon"
                  value={formData.telefon}
                  onChange={handleChange}
                  placeholder="0721 234 567"
                  className="w-full bg-yp-black text-yp-white border border-yp-gray rounded-lg px-4 py-3 font-body text-base placeholder:text-yp-gray focus:border-yp-yellow focus:ring-2 focus:ring-yp-yellow/20 focus:outline-none transition-all"
                />
                {errors.telefon && (
                  <p className="text-red-400 text-sm mt-1">{errors.telefon}</p>
                )}
              </div>

              {/* Companie */}
              <div>
                <label className="block text-yp-white font-body text-sm font-medium mb-2">
                  Companie *
                </label>
                <input
                  type="text"
                  name="companie"
                  value={formData.companie}
                  onChange={handleChange}
                  placeholder="SC Construct SRL"
                  className="w-full bg-yp-black text-yp-white border border-yp-gray rounded-lg px-4 py-3 font-body text-base placeholder:text-yp-gray focus:border-yp-yellow focus:ring-2 focus:ring-yp-yellow/20 focus:outline-none transition-all"
                />
                {errors.companie && (
                  <p className="text-red-400 text-sm mt-1">{errors.companie}</p>
                )}
              </div>

              {/* Întrebarea 1 */}
              <div>
                <label className="block text-yp-white font-body text-sm font-medium mb-2">
                  Când planificați achiziția? *
                </label>
                <select
                  name="intrebare_1"
                  value={formData.intrebare_1}
                  onChange={handleChange}
                  className="w-full bg-yp-black text-yp-white border border-yp-gray rounded-lg px-4 py-3 font-body text-base focus:border-yp-yellow focus:ring-2 focus:ring-yp-yellow/20 focus:outline-none transition-all"
                >
                  <option value="">Selectați...</option>
                  <option value="Urgent < 5 zile">Urgent (în 5 zile)</option>
                  <option value="Nu este foarte Urgent < 14 zile">În 2 săptămâni</option>
                  <option value="Am timp < 30 zile">În luna următoare</option>
                  <option value="Deocamdată adun oferte">Doar mă informez</option>
                </select>
                {errors.intrebare_1 && (
                  <p className="text-red-400 text-sm mt-1">{errors.intrebare_1}</p>
                )}
              </div>

              {/* Întrebarea 2 */}
              <div>
                <label className="block text-yp-white font-body text-sm font-medium mb-2">
                  Ce tip de echipament căutați? *
                </label>
                <select
                  name="intrebare_2"
                  value={formData.intrebare_2}
                  onChange={handleChange}
                  className="w-full bg-yp-black text-yp-white border border-yp-gray rounded-lg px-4 py-3 font-body text-base focus:border-yp-yellow focus:ring-2 focus:ring-yp-yellow/20 focus:outline-none transition-all"
                >
                  <option value="">Selectați...</option>
                  <option value="Echipament complet pentru echipă">Echipament complet pentru echipă</option>
                  <option value="Anumite categorii">Doar anumite categorii</option>
                  <option value="Nu sunt sigur - vreau consultanță">Nu sunt sigur - vreau consultanță</option>
                </select>
                {errors.intrebare_2 && (
                  <p className="text-red-400 text-sm mt-1">{errors.intrebare_2}</p>
                )}
              </div>

              {/* Întrebarea 3 */}
              <div>
                <label className="block text-yp-white font-body text-sm font-medium mb-2">
                  Cine ia decizia de achiziție? *
                </label>
                <select
                  name="intrebare_3"
                  value={formData.intrebare_3}
                  onChange={handleChange}
                  className="w-full bg-yp-black text-yp-white border border-yp-gray rounded-lg px-4 py-3 font-body text-base focus:border-yp-yellow focus:ring-2 focus:ring-yp-yellow/20 focus:outline-none transition-all"
                >
                  <option value="">Selectați...</option>
                  <option value="Eu decid">Eu decid</option>
                  <option value="Eu recomand - altcineva decide">Eu recomand - altcineva decide</option>
                  <option value="Doar colectez oferte">Doar colectez oferte</option>
                </select>
                {errors.intrebare_3 && (
                  <p className="text-red-400 text-sm mt-1">{errors.intrebare_3}</p>
                )}
              </div>

              {/* Mesaj (Optional) */}
              <div>
                <label className="block text-yp-white font-body text-sm font-medium mb-2">
                  Mesaj (opțional)
                </label>
                <textarea
                  name="mesaj"
                  value={formData.mesaj}
                  onChange={handleChange}
                  rows="3"
                  placeholder="Detalii suplimentare..."
                  maxLength="500"
                  className="w-full bg-yp-black text-yp-white border border-yp-gray rounded-lg px-4 py-3 font-body text-base placeholder:text-yp-gray focus:border-yp-yellow focus:ring-2 focus:ring-yp-yellow/20 focus:outline-none transition-all resize-none"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-yp-yellow text-yp-black font-heading font-bold py-4 rounded-lg text-lg hover:bg-yp-yellow/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Se trimite...' : 'Trimite Cererea'}
              </button>

              <p className="text-xs text-yp-white/50 text-center">
                Răspundem în maximum 24 de ore.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
