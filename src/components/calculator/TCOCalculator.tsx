import React, { useState, useMemo, useEffect } from "react";

// ─── CONFIG ───
const INDUSTRIES = [
  { id: "constructii", label: "Construcții", riskMultiplier: 1.35, description: "Uzură mecanică intensă, expunere intemperii" },
  { id: "productie", label: "Producție", riskMultiplier: 1.2, description: "Uzură moderată, mediu controlat" },
  { id: "logistica", label: "Logistică & Depozitare", riskMultiplier: 1.15, description: "Uzură variabilă, manipulare frecventă" },
  { id: "mentenanta", label: "Mentenanță & Service", riskMultiplier: 1.25, description: "Substanțe chimice, uzură localizată" },
  { id: "curatenie", label: "Curățenie industrială", riskMultiplier: 1.1, description: "Uzură chimică, înlocuire frecventă" },
  { id: "altele", label: "Alt domeniu", riskMultiplier: 1.15, description: "Estimare medie cross-industry" },
];

const FREQ_OPTIONS = [
  { value: 3, label: "La 3 luni", tag: "Foarte frecvent" },
  { value: 4, label: "La 4 luni", tag: "Frecvent" },
  { value: 6, label: "La 6 luni", tag: "Standard" },
  { value: 9, label: "La 9 luni", tag: "Rar" },
  { value: 12, label: "La 12 luni", tag: "Foarte rar" },
];

const EIP_CATEGORIES = [
  { id: "incaltaminte", label: "Încălțăminte de protecție", avgPrice: 180, premiumPrice: 350, premiumLifeMultiplier: 2.5 },
  { id: "imbracaminte", label: "Îmbrăcăminte de lucru", avgPrice: 120, premiumPrice: 220, premiumLifeMultiplier: 2.2 },
  { id: "manusi", label: "Mănuși de protecție", avgPrice: 25, premiumPrice: 45, premiumLifeMultiplier: 2.0 },
  { id: "casca", label: "Căști & protecție cap", avgPrice: 80, premiumPrice: 160, premiumLifeMultiplier: 3.0 },
  { id: "ochelari", label: "Ochelari de protecție", avgPrice: 35, premiumPrice: 70, premiumLifeMultiplier: 2.5 },
];

const fmt = (v: number) => new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 0 }).format(v);

// ─── COMPONENTS ───

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`flex-1 h-1 rounded-full transition-colors duration-400 ${i < step ? "bg-yp-yellow" : "bg-white/10"}`} />
      ))}
    </div>
  );
}

function RadioCards({ options, value, onChange, columns = 2 }: any) {
  const gridCols = columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return (
    <div className={`grid grid-cols-1 ${gridCols} gap-3`}>
      {options.map((opt: any) => {
        const selected = value === opt.value;
        return (
          <button 
            key={opt.value} 
            onClick={() => onChange(opt.value)} 
            className={`text-left p-4 rounded-lg transition-all duration-200 border ${selected ? "bg-yp-yellow/10 border-yp-yellow scale-[1.01]" : "bg-white/5 border-white/10 hover:border-white/30"}`}
          >
            <div className={`font-semibold text-sm ${selected ? "text-yp-yellow" : "text-neutral-300"}`}>{opt.label}</div>
            {opt.sub && <div className="text-xs text-neutral-500 mt-1">{opt.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max, step = 1, suffix, hint }: any) {
  return (
    <div className="mb-6">
      <div className="flex justify-between items-baseline mb-2">
        <label className="text-sm font-medium text-neutral-300">{label}</label>
        <span className="text-yp-yellow font-bold text-lg font-mono">
          {value}{suffix && <span className="text-xs font-normal text-neutral-500 ml-1">{suffix}</span>}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-yp-yellow h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
      />
      {hint && <div className="text-xs text-neutral-500 mt-2">{hint}</div>}
    </div>
  );
}

function MetricCard({ label, value, highlight, small }: any) {
  return (
    <div className={`rounded-xl border ${highlight ? "bg-yp-yellow/10 border-yp-yellow/30" : "bg-white/5 border-white/10"} ${small ? "p-4" : "p-6"}`}>
      <div className={`text-[11px] uppercase tracking-wider mb-2 font-mono ${highlight ? "text-yp-yellow/80" : "text-neutral-500"}`}>{label}</div>
      <div className={`font-bold font-mono ${small ? "text-xl" : "text-3xl"} ${highlight ? "text-yp-yellow" : "text-white"}`}>{value}</div>
    </div>
  );
}

function CostBreakdownBar({ label, directCost, hiddenCost, total, maxTotal }: any) {
  const w = (total / maxTotal) * 100;
  const directW = (directCost / total) * 100;
  return (
    <div className="mb-5">
      <div className="flex justify-between mb-2">
        <span className="text-sm font-medium text-neutral-300">{label}</span>
        <span className="text-sm font-bold text-white font-mono">{fmt(total)}</span>
      </div>
      <div className="h-7 bg-white/5 rounded overflow-hidden relative">
        <div className="h-full flex rounded transition-all duration-700 ease-out" style={{ width: `${w}%` }}>
          <div className="h-full bg-white/20" style={{ width: `${directW}%` }} />
          <div className="flex-1 h-full bg-red-500/40" />
        </div>
      </div>
      <div className="flex gap-4 mt-2">
        <span className="text-[11px] text-neutral-400">■ Achiziție directă: {fmt(directCost)}</span>
        <span className="text-[11px] text-red-500/80">■ Costuri ascunse: {fmt(hiddenCost)}</span>
      </div>
    </div>
  );
}

// ─── MAIN CALCULATOR ───

export default function TCOCalculator() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<any>({});

  // Step 1 - Companie
  const [industry, setIndustry] = useState("");
  const [employees, setEmployees] = useState(20);

  // Step 2 - EIP config
  const [selectedCategories, setSelectedCategories] = useState(["incaltaminte", "imbracaminte"]);
  const [replacementFreq, setReplacementFreq] = useState(6);
  const [customPrices, setCustomPrices] = useState<any>({});

  // Step 3 - Costuri operaționale
  const [adminHours, setAdminHours] = useState(4);
  const [hourlyCost, setHourlyCost] = useState(45);
  const [hasComplaints, setHasComplaints] = useState("");
  const [stockIssues, setStockIssues] = useState("");

  // Step 5 - Lead capture
  const [lead, setLead] = useState({ name: "", company: "", email: "", phone: "" });

  useEffect(() => {
    window.scrollTo({ top: 30, behavior: "smooth" });
  }, [step]);

  // ─── REAL CALCULATIONS ───
  const results = useMemo(() => {
    const ind = INDUSTRIES.find((i) => i.id === industry) || INDUSTRIES[5];
    const cats = EIP_CATEGORIES.filter((c) => selectedCategories.includes(c.id));
    const replacementsPerYear = 12 / replacementFreq;

    // Current system
    let directCostPerYear = 0;
    let premiumCostPerYear = 0;
    const breakdown: any = [];

    cats.forEach((cat) => {
      const price = customPrices[cat.id] || cat.avgPrice;
      const annualDirect = employees * price * replacementsPerYear;

      const logisticsPct = replacementFreq <= 4 ? 0.28 : replacementFreq <= 6 ? 0.22 : 0.15;
      const logisticsCost = annualDirect * logisticsPct;

      const wastePct = replacementFreq <= 4 ? 0.12 : 0.06;
      const wasteCost = annualDirect * wastePct;

      const totalCurrent = annualDirect + logisticsCost + wasteCost;

      const premiumReplacementsPerYear = 12 / (replacementFreq * cat.premiumLifeMultiplier);
      const premiumDirect = employees * cat.premiumPrice * premiumReplacementsPerYear;
      const premiumLogistics = premiumDirect * 0.12; 
      const totalPremium = premiumDirect + premiumLogistics;

      directCostPerYear += annualDirect;
      premiumCostPerYear += totalPremium;

      breakdown.push({
        category: cat.label,
        currentDirect: annualDirect,
        currentHidden: logisticsCost + wasteCost,
        currentTotal: totalCurrent,
        premiumTotal: totalPremium,
        saving: totalCurrent - totalPremium,
      });
    });

    const adminCostPerYear = adminHours * 12 * hourlyCost;
    const premiumAdminCost = adminCostPerYear * 0.4; 

    const riskCostCurrent = directCostPerYear * (ind.riskMultiplier - 1);

    const currentTotal = breakdown.reduce((s: number, b: any) => s + b.currentTotal, 0) + adminCostPerYear + riskCostCurrent;
    const premiumTotal = breakdown.reduce((s: number, b: any) => s + b.premiumTotal, 0) + premiumAdminCost;

    const savings1y = currentTotal - premiumTotal;
    const savings3y = savings1y * 3;
    const savingsPct = currentTotal > 0 ? ((savings1y / currentTotal) * 100).toFixed(0) : 0;

    const cpwCurrent = employees > 0 ? (currentTotal / (employees * 220)) : 0;
    const cpwPremium = employees > 0 ? (premiumTotal / (employees * 220)) : 0;

    return {
      breakdown,
      directCostPerYear,
      adminCostPerYear,
      premiumAdminCost,
      riskCostCurrent,
      currentTotal,
      premiumTotal,
      savings1y,
      savings3y,
      savingsPct,
      cpwCurrent,
      cpwPremium,
      industry: ind,
      replacementsPerYear,
    };
  }, [industry, employees, selectedCategories, replacementFreq, customPrices, adminHours, hourlyCost]);

  // ─── NAVIGATION ───
  const goNext = () => {
    const err: any = {};
    if (step === 1 && !industry) err.industry = "Selectează industria";
    if (step === 2 && selectedCategories.length === 0) err.categories = "Selectează cel puțin o categorie";
    if (step === 3 && !hasComplaints) err.complaints = "Selectează o opțiune";
    if (Object.keys(err).length) { setErrors(err); return; }
    setErrors({});
    setStep((s) => s + 1);
  };
  const goBack = () => { setErrors({}); setStep((s) => s - 1); };

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    const err: any = {};
    if (!lead.name.trim()) err.name = true;
    if (!lead.company.trim()) err.company = true;
    if (!lead.email.includes("@") || !lead.email.includes(".")) err.email = true;
    if (Object.keys(err).length) { setErrors(err); return; }

    setSubmitting(true);
    try {
      const payload = {
        lead,
        inputs: {
          industry,
          employees,
          categories: selectedCategories,
          replacementFreq,
          customPrices,
          adminHours,
          hourlyCost,
          complaints: hasComplaints,
          stockIssues,
        },
        results: {
          currentTotal: results.currentTotal,
          premiumTotal: results.premiumTotal,
          savings1y: results.savings1y,
          savings3y: results.savings3y,
          savingsPct: results.savingsPct,
          cpwCurrent: results.cpwCurrent,
          cpwPremium: results.cpwPremium,
          breakdown: results.breakdown,
        },
      };

      const WEBHOOK = "https://youprotect.app.n8n.cloud/webhook/tco-lead";
      await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
      
      setStep(6);
    } catch {
      alert("Eroare la trimitere. Încearcă din nou.");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── UTILS BUTTONS ───
  const ButtonPrimary = ({ onClick, children, disabled }: any) => (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className="w-full bg-yp-yellow text-yp-black font-bold py-4 px-6 rounded-lg hover:bg-white transition-colors duration-200 mt-6 shadow-lg shadow-yp-yellow/10"
    >
      {children}
    </button>
  );

  const ButtonBack = ({ onClick, children }: any) => (
    <button 
      onClick={onClick} 
      className="text-neutral-400 hover:text-white transition-colors text-sm py-4 px-2"
    >
      {children}
    </button>
  );

  return (
    <div className="max-w-2xl mx-auto w-full bg-[#111] rounded-xl border border-white/5 p-6 md:p-10 shadow-2xl relative overflow-hidden font-body text-white">
      <ProgressBar step={step} total={5} />

      {/* ═══ STEP 1: INDUSTRIE & DIMENSIUNE ═══ */}
      {step === 1 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 leading-tight">Calculează Costul Real al Echipamentelor de Protecție</h2>
          <p className="text-neutral-400 text-sm mb-8 leading-relaxed">
            Nu doar prețul de achiziție — ci tot ce plătești: înlocuiri, timp administrativ, riscuri de non-conformitate. Rezultatele sunt ale tale, instant.
          </p>

          <div className="text-xs text-neutral-500 uppercase tracking-widest mb-3 font-semibold">Industria principală</div>
          <RadioCards
            columns={2}
            options={INDUSTRIES.map((i) => ({ value: i.id, label: i.label, sub: i.description }))}
            value={industry}
            onChange={setIndustry}
          />
          {errors.industry && <div className="text-red-500 text-xs mt-2">{errors.industry}</div>}

          <div className="mt-8">
            <NumberInput
              label="Angajați care poartă EIP"
              value={employees} onChange={setEmployees}
              min={5} max={200} step={1} suffix="persoane"
              hint="Include toți angajații care primesc echipament de protecție"
            />
          </div>

          <ButtonPrimary onClick={goNext}>Continuă →</ButtonPrimary>
        </div>
      )}

      {/* ═══ STEP 2: CATEGORII EIP ═══ */}
      {step === 2 && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          <h2 className="text-2xl font-bold text-white mb-2 leading-tight">Ce echipamente achiziționezi?</h2>
          <p className="text-neutral-400 text-sm mb-8">Selectează categoriile relevante și ajustează prețul mediu pe care îl plătești acum per bucată.</p>

          <div className="flex flex-col gap-3">
            {EIP_CATEGORIES.map((cat) => {
              const selected = selectedCategories.includes(cat.id);
              return (
                <div key={cat.id} className={`rounded-lg overflow-hidden transition-all duration-200 border ${selected ? "border-yp-yellow bg-yp-yellow/5" : "border-white/10 bg-white/5"}`}>
                  <button onClick={() => toggleCategory(cat.id)} className="w-full text-left p-4 flex justify-between items-center transition-colors hover:bg-white/5">
                    <span className={`text-sm font-semibold ${selected ? "text-yp-yellow" : "text-neutral-300"}`}>{cat.label}</span>
                    <span className="text-xs text-neutral-500">
                      {selected ? "✓ Selectat" : `~${cat.avgPrice} RON`}
                    </span>
                  </button>
                  {selected && (
                    <div className="px-4 pb-4 pt-1 flex items-center justify-between border-t border-white/5 mt-1 bg-white/5">
                      <span className="text-xs text-neutral-400">Preț mediu/buc:</span>
                      <div className="flex items-center gap-2">
                        <input type="number" min={5} max={2000}
                          value={customPrices[cat.id] || cat.avgPrice}
                          onChange={(e) => setCustomPrices((p: any) => ({ ...p, [cat.id]: Number(e.target.value) }))}
                          className="w-24 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-yp-yellow text-sm font-mono font-bold text-right focus:border-yp-yellow focus:outline-none"
                        />
                        <span className="text-xs text-neutral-500 font-medium">RON</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {errors.categories && <div className="text-red-500 text-xs mt-2">{errors.categories}</div>}

          <div className="mt-8">
            <div className="text-xs text-neutral-500 uppercase tracking-widest mb-3 font-semibold">Frecvență de înlocuire (medie)</div>
            <RadioCards
              columns={3}
              options={FREQ_OPTIONS.map((f) => ({ value: f.value, label: f.label, sub: f.tag }))}
              value={replacementFreq}
              onChange={setReplacementFreq}
            />
          </div>

          <div className="flex gap-4 mt-8 items-center">
            <ButtonBack onClick={goBack}>← Înapoi</ButtonBack>
            <div className="flex-1"><ButtonPrimary onClick={goNext}>Continuă →</ButtonPrimary></div>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: COSTURI OPERAȚIONALE ═══ */}
      {step === 3 && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          <h2 className="text-2xl font-bold text-white mb-2 leading-tight">Costurile invizibile pe factură</h2>
          <p className="text-neutral-400 text-sm mb-8 leading-relaxed">Timpul echipei, plângerile, și rupturile de stoc — toate au un cost financiar real.</p>

          <NumberInput
            label="Ore / lună dedicate achiziției EIP"
            value={adminHours} onChange={setAdminHours}
            min={1} max={40} suffix="ore"
            hint="Comandă, recepție, distribuire, evidență măsuri, retururi"
          />
          <NumberInput
            label="Cost mediu oră (angajat responsabil)"
            value={hourlyCost} onChange={setHourlyCost}
            min={20} max={150} suffix="RON/oră"
            hint="Include salariul brut + contribuții"
          />

          <div className="text-xs text-neutral-500 uppercase tracking-widest mt-8 mb-3 font-semibold">Plângeri privind uzura echipamentului</div>
          <RadioCards
            columns={3}
            options={[
              { value: "rareori", label: "Rareori", sub: "Sub 10% din echipă" },
              { value: "des", label: "Des", sub: "10-30% din echipă" },
              { value: "constant", label: "Constant", sub: "Peste 30%" },
            ]}
            value={hasComplaints}
            onChange={setHasComplaints}
          />
          {errors.complaints && <div className="text-red-500 text-xs mt-2">{errors.complaints}</div>}

          <div className="text-xs text-neutral-500 uppercase tracking-widest mt-8 mb-3 font-semibold">Ai avut lipsuri de stoc EIP în ultimul an?</div>
          <RadioCards
            columns={2}
            options={[
              { value: "da", label: "Da", sub: "Am improvizat sau am așteptat" },
              { value: "nu", label: "Nu", sub: "Stoc mereu suficient" },
            ]}
            value={stockIssues}
            onChange={setStockIssues}
          />

          <div className="flex gap-4 mt-8 items-center">
            <ButtonBack onClick={goBack}>← Înapoi</ButtonBack>
            <div className="flex-1"><ButtonPrimary onClick={goNext}>Vezi Rezultatele →</ButtonPrimary></div>
          </div>
        </div>
      )}

      {/* ═══ STEP 4: REZULTATE — QUICK WIN ═══ */}
      {step === 4 && (
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
          <div className="text-center mb-10">
            <div className="text-xs text-yp-yellow font-bold uppercase tracking-widest mb-3">Analiza ta TCO</div>
            <div className="text-3xl md:text-4xl font-bold text-white mb-2">
              Costul tău real: <span className="font-mono">{fmt(results.currentTotal)}</span><span className="text-neutral-500 text-lg font-normal">/an</span>
            </div>
            <p className="text-neutral-400 text-sm max-w-lg mx-auto">
              Din care <strong>{fmt(results.currentTotal - results.directCostPerYear)}</strong> reprezintă costuri ascunse pe care nu le vezi pe factura directă de achiziție.
            </p>
          </div>

          <div className="text-xs text-neutral-500 uppercase tracking-widest mb-4 font-semibold">Defalcare pe categorii</div>
          <div className="mb-8 p-6 bg-white/5 rounded-xl border border-white/10">
            {results.breakdown.map((b: any) => (
              <CostBreakdownBar
                key={b.category}
                label={b.category}
                directCost={b.currentDirect}
                hiddenCost={b.currentHidden}
                total={b.currentTotal}
                maxTotal={Math.max(...results.breakdown.map((x: any) => x.currentTotal))}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <MetricCard label="Cost administrativ/an" value={fmt(results.adminCostPerYear)} small />
            <MetricCard label={`Risc expunere (${results.industry.label})`} value={fmt(results.riskCostCurrent)} small />
          </div>

          {/* Quick-win metric */}
          <div className="mb-6 p-8 rounded-xl bg-gradient-to-br from-yp-yellow/10 to-transparent border border-yp-yellow/20 text-center relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-yp-yellow/5 rounded-full blur-2xl pointer-events-none"></div>
            <div className="text-[11px] text-yp-yellow/70 uppercase tracking-widest mb-2 font-semibold">Cost per zi de purtare / angajat</div>
            <div className="text-4xl md:text-5xl font-bold text-white font-mono mb-2">
              {results.cpwCurrent.toFixed(2)} <span className="text-xl text-neutral-400 font-normal">RON/zi</span>
            </div>
            <p className="text-sm text-neutral-400">Acesta e indicatorul de eficiență care contează cu adevărat (CPW).</p>
          </div>

          {/* Comparison preview */}
          <div className="p-6 rounded-xl bg-[#0a0a0a] border border-white/10 mb-8 flex flex-col sm:flex-row justify-between items-center sm:items-start gap-4">
            <div>
              <div className="text-[11px] text-neutral-500 uppercase tracking-widest mb-1">Potențial Economie / An</div>
              <div className="text-3xl font-bold text-green-400 font-mono">
                {fmt(results.savings1y)}
              </div>
              <div className="text-xs text-neutral-500 mt-2 max-w-xs">Prin trecerea la echipamente premium cu durabilitate extinsă.</div>
            </div>
            <div className="bg-green-500/10 text-green-400 px-4 py-2 rounded-full text-sm font-bold border border-green-500/20">
              -{results.savingsPct}% Costuri
            </div>
          </div>

          <details className="mt-6 mb-8 group">
            <summary className="text-xs text-neutral-400 cursor-pointer py-2 hover:text-white transition-colors outline-none font-medium flex items-center gap-2">
              ℹ️ Cum am calculat aceste cifre?
            </summary>
            <div className="text-xs text-neutral-500 mt-2 p-4 bg-white/5 rounded-md leading-relaxed">
              <strong className="text-neutral-300">Costuri ascunse:</strong> Logistică internă estimată la 15-28% din costul de achiziție, proporțional cu frecvența. 
              Risipă din înlocuire prematură: 6-12%. Risc de non-conformitate: coeficient {results.industry.riskMultiplier}x specific industriei.
              Scenariul optimizat presupune echipamente cu durabilitate mărită de cel puțin 2-3x și logistică redusă cu 60%.
            </div>
          </details>

          <div className="flex gap-4 items-center">
            <ButtonBack onClick={goBack}>← Modifică</ButtonBack>
            <div className="flex-1"><ButtonPrimary onClick={goNext}>Vreau Ghidul de Optimizare →</ButtonPrimary></div>
          </div>
        </div>
      )}

      {/* ═══ STEP 5: LEAD CAPTURE ═══ */}
      {step === 5 && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2 leading-tight">Ghidul Tău de Optimizare EIP</h2>
            <p className="text-neutral-400 text-sm">
              Primești un document personalizat cu pași concreți. Îl poți folosi direct sau îl dai unui asistent AI care te ghidează.
            </p>
          </div>

          <div className="bg-yp-yellow/5 border border-yp-yellow/20 rounded-xl p-5 mb-8">
            <div className="text-sm text-yp-yellow font-bold mb-3">Ce conține pachetul complet:</div>
            <ul className="space-y-2 text-sm text-neutral-300">
              <li className="flex gap-2"><span className="text-yp-yellow">✓</span> Analiza TCO PDF detaliată cu grafice</li>
              <li className="flex gap-2"><span className="text-yp-yellow">✓</span> Checklist evaluare furnizori EIP</li>
              <li className="flex gap-2"><span className="text-yp-yellow">✓</span> Template de negociere (ce să ceri)</li>
              <li className="flex gap-2"><span className="text-yp-yellow">✓</span> Prompt structurat pentru ChatGPT/Claude</li>
            </ul>
          </div>

          <div className="space-y-4">
            <input
              type="text" placeholder="Numele tău"
              value={lead.name} onChange={(e) => { setLead((p) => ({ ...p, name: e.target.value })); setErrors((p: any) => ({ ...p, name: false })); }}
              className={`w-full bg-[#0a0a0a] border rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-yp-yellow transition-colors ${errors.name ? "border-red-500" : "border-white/10"}`}
            />
            <input
              type="text" placeholder="Compania"
              value={lead.company} onChange={(e) => { setLead((p) => ({ ...p, company: e.target.value })); setErrors((p: any) => ({ ...p, company: false })); }}
              className={`w-full bg-[#0a0a0a] border rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-yp-yellow transition-colors ${errors.company ? "border-red-500" : "border-white/10"}`}
            />
            <input
              type="email" placeholder="E-mail de business"
              value={lead.email} onChange={(e) => { setLead((p) => ({ ...p, email: e.target.value })); setErrors((p: any) => ({ ...p, email: false })); }}
              className={`w-full bg-[#0a0a0a] border rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-yp-yellow transition-colors ${errors.email ? "border-red-500" : "border-white/10"}`}
            />
            <input
              type="tel" placeholder="Telefon (Opțional)"
              value={lead.phone} onChange={(e) => setLead((p) => ({ ...p, phone: e.target.value }))}
              className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-yp-yellow transition-colors"
            />
          </div>

          <div className="text-[11px] text-neutral-500 mt-4 leading-relaxed text-center px-4">
            Folosim datele exclusiv pentru generarea și trimiterea calculului. Fără spam.
          </div>

          <div className="flex gap-4 mt-6 items-center">
            <ButtonBack onClick={goBack}>← Analiză</ButtonBack>
            <div className="flex-1">
              <ButtonPrimary onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Se generează..." : "Trimite-mi Ghidul Gratuit"}
              </ButtonPrimary>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 6: CONFIRMARE ═══ */}
      {step === 6 && (
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 text-center py-6">
          <div className="w-16 h-16 bg-green-500/10 text-green-400 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/20">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h2 className="text-3xl font-bold text-white mb-2">Ghidul este pe drum!</h2>
          <p className="text-neutral-400 text-sm mb-8">
            Verifică inbox-ul ({lead.email}). Vei primi raportul complet în câteva minute.
          </p>

          <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-6 text-left mb-8 shadow-inner">
            <div className="text-yp-yellow font-bold text-sm mb-3">💡 Cum să folosești ghidul cu AI:</div>
            <div className="text-sm text-neutral-400 leading-relaxed space-y-2">
              <p>1. Deschide ghidul PDF primit</p>
              <p>2. Încarcă-l în ChatGPT sau Claude</p>
              <p>3. Folosește comanda: <span className="text-neutral-300 italic">„Ghidează-mă pas cu pas prin reducerea CPW-ului pentru echipa mea conform acestui plan.”</span></p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-left">
            <MetricCard label="Economie potențială / an" value={fmt(results.savings1y)} highlight small />
            <MetricCard label="Economie pe 3 ani" value={fmt(results.savings3y)} highlight small />
          </div>

          <a href="/produse" className="inline-block text-yp-yellow hover:text-white transition-colors underline underline-offset-4 font-medium text-sm">
            Explorează magazinul până ajunge emailul →
          </a>
        </div>
      )}
    </div>
  );
}
