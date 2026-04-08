import React, { useState, useMemo } from 'react';
import BarChart from './BarChart';

const INDUSTRY_RISK: Record<string, number> = {
  'Construcții': 150,
  'Producție': 100,
  'Logistică': 80,
  'Mentenanță': 50,
  'Altele': 30
};

export default function TCOCalculator() {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    // Step 1
    industry: '',
    employee_count: 50,
    current_unit_price: 150,
    replacement_frequency: '6', // months
    // Step 2
    complaint_frequency: '',
    admin_time: 5,
    // Step 3
    name: '',
    company: '',
    email: '',
    phone: ''
  });

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  // --- Calculations ---
  const results = useMemo(() => {
    const empCount = formData.employee_count;
    const price = formData.current_unit_price;
    const freqMonths = parseInt(formData.replacement_frequency, 10);
    
    // 1. Current System Basic TCO (12 months)
    const annualReplacements = 12 / freqMonths;
    const currentAcqCost = empCount * price * annualReplacements;
    
    // Hidden Logistic Multiplier (1.6x for cheap equipment if freq <= 6 months)
    const logisticMultiplier = freqMonths <= 6 ? 1.6 : 1.1; 
    const currentRealTco = currentAcqCost * logisticMultiplier;

    // 2. Premium Benchmark System TCO
    // Assume double the price, but only 1 replacement per year (12 months)
    const ypPrice = price * 2;
    const ypAcqCost = empCount * ypPrice * 1;
    const ypRealTco = ypAcqCost * 1.0; // No huge hidden penalties

    // 3. Risk Factor
    const riskConst = INDUSTRY_RISK[formData.industry] || INDUSTRY_RISK['Altele'];
    const assumedRiskLoss = riskConst * empCount;

    // 4. Metrics
    const cpwCurrent = currentRealTco / (empCount * 220); // 220 working days/year
    const cpwYp = ypRealTco / (empCount * 220);
    const savings3Years = (currentRealTco * 3) - (ypRealTco * 3);

    return {
      currentAcqCost,
      currentRealTco,
      ypRealTco,
      assumedRiskLoss,
      cpwCurrent,
      cpwYp,
      savings3Years
    };
  }, [formData]);

  // --- Validation & Actions ---
  const handleNextStep1 = () => {
    const err: any = {};
    if (!formData.industry) err.industry = 'Te rugăm să alegi o industrie pentru a calibra riscul.';
    if (!formData.replacement_frequency) err.replacement_frequency = 'Obligatoriu.';
    
    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }
    setStep(2);
    // Scroll top
    window.scrollTo({ top: 30, behavior: 'smooth' });
  };

  const handleNextStep2 = () => {
    const err: any = {};
    if (!formData.complaint_frequency) err.complaint_frequency = 'Bifează o opțiune.';
    
    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }
    setStep(3);
    window.scrollTo({ top: 30, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    const err: any = {};
    if (!formData.name) err.name = 'Necesar';
    if (!formData.email || !formData.email.includes('@')) err.email = 'Email valid necesar';
    if (!formData.company) err.company = 'Necesar';

    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    setIsSubmitting(true);
    
    // WEBHOOK POST
    try {
      const payload = {
        lead: {
          nume: formData.name,
          email: formData.email,
          companie: formData.company,
          telefon: formData.phone
        },
        calculator_data: {
          industry: formData.industry,
          employee_count: formData.employee_count,
          current_unit_price: formData.current_unit_price,
          replacement_frequency: formData.replacement_frequency + ' luni',
          complaint_frequency: formData.complaint_frequency,
          admin_time: formData.admin_time
        },
        segments: {
          employee_retention_pain: formData.complaint_frequency === 'Constant',
          operational_efficiency_pain: formData.admin_time > 5
        },
        results: {
          current_tco_1_year: results.currentRealTco,
          yp_tco_1_year: results.ypRealTco,
          savings_3_years: results.savings3Years,
          cpw_current: results.cpwCurrent,
          cpw_yp: results.cpwYp,
          risk_loss: results.assumedRiskLoss
        }
      };

      // TODO: Replace with the actual n8n webhook URL when provided.
      // E.g., const webhookUrl = 'https://n8n.yourdomain.com/webhook/tco-lead';
      const webhookUrl = 'https://example-n8n-webhook.com/tco'; 
      
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
        // We ignore the actual response for now to ensure a smooth transition locally.
        // In a real scenario, we'll check `response.ok`
      }).catch(e => console.warn('Webhook err, proceeding anyway', e));

      // Go to success
      setStep(4);
      window.scrollTo({ top: 30, behavior: 'smooth' });
    } catch (e) {
      alert('A apărut o eroare la trimiterea datelor. Vă rugăm să încercați din nou.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(val);
  };

  // --- Render Steps ---
  return (
    <div className="max-w-2xl mx-auto w-full bg-[#111] rounded-[8px] border border-white/5 p-6 md:p-10 shadow-2xl relative overflow-hidden font-body">
      
      {/* Progress */}
      {step < 4 && (
        <div className="mb-8">
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-medium text-yp-yellow font-mono uppercase tracking-wider">
              Pasul {step} / 3
            </span>
            <span className="text-xs text-neutral-500 font-medium">
              {Math.round((step / 3) * 100)}% completat
            </span>
          </div>
          <div className="h-1.5 w-full bg-[#222] rounded-full overflow-hidden">
            <div 
              className="h-full bg-yp-yellow rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${(step / 3) * 100}%` }} 
            />
          </div>
        </div>
      )}

      {/* --- STEP 1: VALUE FIRST --- */}
      {step === 1 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-medium text-white mb-2">Calculator TCO Echipamente</h2>
            <p className="text-neutral-400 text-sm">Introduceți parametrii actuali pentru a vizualiza costul real.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Industrie</label>
            <select 
              value={formData.industry} 
              onChange={e => updateField('industry', e.target.value)}
              className="w-full bg-[#0a0a0a] border border-white/10 rounded-md px-4 py-3 text-white focus:outline-none focus:border-yp-yellow transition-colors"
            >
              <option value="">Alegeți industria...</option>
              {Object.keys(INDUSTRY_RISK).map(ind => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
            {errors.industry && <p className="text-red-400 text-xs mt-1">{errors.industry}</p>}
          </div>

          <div className="pt-2">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-neutral-300">Număr Angajați Curent (Echipați)</label>
              <span className="text-yp-yellow font-bold bg-yp-yellow/10 px-2 py-1 rounded">{formData.employee_count}</span>
            </div>
            <input 
              type="range" 
              min="5" 
              max="500" 
              step="5"
              value={formData.employee_count} 
              onChange={e => updateField('employee_count', Number(e.target.value))}
              className="w-full accent-yp-yellow"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">Preț Achiziție / Set (RON)</label>
              <input 
                type="number" 
                value={formData.current_unit_price} 
                onChange={e => updateField('current_unit_price', Number(e.target.value))}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-md px-4 py-3 text-white focus:outline-none focus:border-yp-yellow transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">Frecvență Înlocuire</label>
              <select 
                value={formData.replacement_frequency} 
                onChange={e => updateField('replacement_frequency', e.target.value)}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-md px-4 py-3 text-white focus:outline-none focus:border-yp-yellow transition-colors"
              >
                <option value="3">La 3 luni</option>
                <option value="6">La 6 luni</option>
                <option value="12">La 12 luni</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleNextStep1}
            className="mt-8 w-full bg-yp-yellow text-yp-black py-4 rounded font-medium text-sm hover:bg-white transition-all shadow-lg shadow-yp-yellow/20"
          >
            Vezi Eficiența
          </button>
        </div>
      )}

      {/* --- STEP 2: THE HOOK --- */}
      {step === 2 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
          <div className="bg-neutral-800/50 border border-yp-yellow/30 p-5 rounded-md mb-8">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              Alergă TCO Ascuns
            </h3>
            <p className="text-neutral-300 text-sm leading-relaxed">
              Achiziția inițială de <span className="font-bold text-white">{formatMoney(results.currentAcqCost)}</span> pe an este doar {formData.replacement_frequency <= '6' ? 'vârful aisbergului. Echipamentele cu rotație mare generează costuri invizibile majore administrativ.' : 'o parte a bugetului. Costurile administrative adaugă surplus la pierderile anuale.'}
            </p>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-xl md:text-2xl font-medium text-white mb-1">Rafinează Analiza de Risc</h2>
            <p className="text-neutral-400 text-sm">Aduceți un strat de fidelitate la calculul final prin definirea fricțiunilor interne.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-3">Feedback Angajați (Plângeri legate de uzură/confort)</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {['Rareori', 'Des', 'Constant'].map(freq => (
                <button
                  key={freq}
                  onClick={() => updateField('complaint_frequency', freq)}
                  className={`border p-3 rounded text-sm transition-all ${formData.complaint_frequency === freq ? 'bg-yp-yellow/10 border-yp-yellow text-yp-yellow' : 'bg-[#0a0a0a] border-white/10 text-neutral-400 hover:border-white/30'}`}
                >
                  {freq}
                </button>
              ))}
            </div>
            {errors.complaint_frequency && <p className="text-red-400 text-xs mt-2">{errors.complaint_frequency}</p>}
          </div>

          <div className="pt-4">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-neutral-300">Ore/Lunare Alocate de HR/Achiziții - Management Stoc</label>
              <span className="text-yp-yellow font-bold bg-yp-yellow/10 px-2 py-1 rounded">{formData.admin_time} H</span>
            </div>
            <input 
              type="range" min="1" max="40" step="1"
              value={formData.admin_time} 
              onChange={e => updateField('admin_time', Number(e.target.value))}
              className="w-full accent-yp-yellow"
            />
          </div>

          <div className="flex gap-4 mt-8">
            <button onClick={() => setStep(1)} className="px-6 py-3 rounded text-sm text-neutral-400 hover:bg-white/5">Înapoi</button>
            <button onClick={handleNextStep2} className="flex-1 bg-yp-yellow text-yp-black py-4 rounded font-medium text-sm hover:bg-white transition-all shadow-lg shadow-yp-yellow/20">Afișează Analiza Completă TCO</button>
          </div>
        </div>
      )}

      {/* --- STEP 3: LEAD CAPTURE --- */}
      {step === 3 && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          
          <BarChart currentTco={results.currentRealTco} ypTco={results.ypRealTco} />

          <div className="mt-8 mb-6 text-center">
            <h2 className="text-xl md:text-2xl font-medium text-white mb-2">Suntem Gata de Analiză</h2>
            <p className="text-neutral-400 text-sm px-4">
              Graficul compară sistemul actual (inclusiv costurile logistice ascunse pentru echipamentele slabe) cu un sistem de echipamente Premium (sub 1% garanții retur). Pentru cifrele complete (ROI 3-Ani, Cost Per Wear) și raportul detaliat PDF, lăsați-ne datele mai jos.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <input 
                  type="text" placeholder="Numele tău"
                  value={formData.name} onChange={e => updateField('name', e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-md px-4 py-3 text-white focus:border-yp-yellow text-sm"
                />
                {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
              </div>
              <div>
                <input 
                  type="text" placeholder="Compania"
                  value={formData.company} onChange={e => updateField('company', e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-md px-4 py-3 text-white focus:border-yp-yellow text-sm"
                />
                {errors.company && <p className="text-red-400 text-xs mt-1">{errors.company}</p>}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <input 
                  type="email" placeholder="E-mail de business"
                  value={formData.email} onChange={e => updateField('email', e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-md px-4 py-3 text-white focus:border-yp-yellow text-sm"
                />
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
              </div>
              <div>
                <input 
                  type="tel" placeholder="Telefon (Opțional)"
                  value={formData.phone} onChange={e => updateField('phone', e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-md px-4 py-3 text-white focus:border-yp-yellow text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <button onClick={() => setStep(2)} disabled={isSubmitting} className="px-6 py-3 rounded text-sm text-neutral-400 hover:bg-white/5">Înapoi</button>
            <button 
              onClick={handleSubmit} 
              disabled={isSubmitting}
              className="flex-1 bg-yp-yellow text-yp-black py-4 rounded font-medium text-sm flex items-center justify-center gap-2 hover:bg-white transition-all shadow-lg shadow-yp-yellow/20"
            >
              {isSubmitting ? 'Se generează auditul...' : 'Vezi Cifrele & Confirmă'}
            </button>
          </div>
        </div>
      )}

      {/* --- STEP 4: INSTANT GRATIFICATION --- */}
      {step === 4 && (
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 text-center py-6">
          <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl md:text-3xl font-medium text-white mb-4">Raportul este procesat!</h2>
          <p className="text-neutral-400 mb-8 max-w-lg mx-auto">
            Utilizarea echipamentelor Premium cu garanție extinsă reduce drastic costul pe zi de purtare și minimizează logistica repetitivă pe parcursul unui an de zile. Vei primi raportul complet pe email imediat.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-[#050505] border border-white/5 p-6 rounded-md">
              <div className="text-xs text-neutral-500 mb-1 uppercase tracking-widest font-mono">Cost Per Wear (Curent)</div>
              <div className="text-2xl text-white font-serif">{results.cpwCurrent.toFixed(2)} RON/Zi</div>
            </div>
            <div className="bg-yp-yellow/10 border border-yp-yellow/20 p-6 rounded-md">
              <div className="text-xs text-yp-yellow/80 mb-1 uppercase tracking-widest font-mono">CPW (Sistem Premium)</div>
              <div className="text-2xl text-yp-yellow font-bold font-serif">{results.cpwYp.toFixed(2)} RON/Zi</div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-yp-black to-[#111] border border-white/10 p-8 rounded-lg shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z"/></svg>
            </div>
            
            <h3 className="text-lg text-neutral-400 mb-2">Economia Generată pe 3 Ani</h3>
            <div className="text-4xl md:text-5xl font-bold text-white mb-2">{formatMoney(results.savings3Years)}</div>
            <p className="text-sm text-neutral-500 max-w-sm mx-auto mt-4 leading-relaxed">
              *Având în vedere industria `{formData.industry}`, am identificat că poți evita pierderi colaterale de până la <span className="text-white font-medium">{formatMoney(results.assumedRiskLoss)}</span> anual prin utilizarea de echipamente durabile.
            </p>
          </div>

          <a href="/produse" className="inline-block mt-8 text-yp-yellow hover:text-white transition-colors underline underline-offset-4 text-sm font-medium">
            Explorează Catalogul Până Sosește Raportul
          </a>
        </div>
      )}

    </div>
  );
}
