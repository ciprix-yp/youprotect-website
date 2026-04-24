import React, { useState, useMemo } from "react";

// ─── CONFIG ───
const INDUSTRIES = [
  { id: "constructii", label: "Construcții", risk: 1.35, desc: "Uzură mecanică, intemperii" },
  { id: "productie", label: "Producție", risk: 1.2, desc: "Mediu controlat, uzură moderată" },
  { id: "logistica", label: "Logistică & Depozitare", risk: 1.15, desc: "Manipulare, uzură variabilă" },
  { id: "mentenanta", label: "Mentenanță & Service", risk: 1.25, desc: "Chimicale, uzură localizată" },
  { id: "curatenie", label: "Curățenie industrială", risk: 1.1, desc: "Uzură chimică frecventă" },
  { id: "altele", label: "Alt domeniu", risk: 1.15, desc: "Estimare medie" },
];

const EIP_CATS = [
  { id: "incaltaminte", label: "Încălțăminte protecție", avg: 180, prem: 350, life: 2.5, icon: "👢" },
  { id: "imbracaminte", label: "Îmbrăcăminte de lucru", avg: 120, prem: 220, life: 2.2, icon: "🦺" },
  { id: "manusi", label: "Mănuși protecție", avg: 25, prem: 45, life: 2.0, icon: "🧤" },
  { id: "casca", label: "Căști & protecție cap", avg: 80, prem: 160, life: 3.0, icon: "⛑️" },
  { id: "ochelari", label: "Ochelari protecție", avg: 35, prem: 70, life: 2.5, icon: "🥽" },
];

const FREQ = [
  { v: 3, label: "3 luni", tag: "Foarte frecvent" },
  { v: 4, label: "4 luni", tag: "Frecvent" },
  { v: 6, label: "6 luni", tag: "Standard" },
  { v: 9, label: "9 luni", tag: "Rar" },
  { v: 12, label: "12 luni", tag: "Foarte rar" },
];

const fmt = (v: number) => new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 0 }).format(v);

// ─── REUSABLE COMPONENTS ───

function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`flex-1 h-1 rounded-sm transition-colors duration-400 ${i < step ? "bg-yp-yellow" : "bg-white/10"}`} />
      ))}
    </div>
  );
}

function Cards({ options, value, onChange, columns = 1 }: any) {
  const gridCols = columns === 3 ? "grid-cols-3" : columns === 2 ? "grid-cols-2" : "grid-cols-1";
  return (
    <div className={`grid ${gridCols} gap-2`}>
      {options.map((o: any) => {
        const sel = value === o.value;
        return (
          <button 
            key={o.value} 
            onClick={() => onChange(o.value)} 
            className={`text-left p-4 rounded-xl transition-all duration-200 border ${sel ? "bg-yp-yellow/10 border-yp-yellow custom-active-scale" : "bg-white/5 border-white/10 hover:border-white/20"}`}
          >
            <div className={`font-semibold text-[13px] md:text-sm flex items-center leading-tight ${sel ? "text-yp-yellow" : "text-neutral-300"}`}>
              {o.icon && <span className="mr-2 text-base">{o.icon}</span>}{o.label}
            </div>
            {o.sub && <div className="text-[11px] md:text-xs text-neutral-500 mt-1">{o.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

function Chips({ options, value, onChange }: any) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o: any) => {
        const sel = value === o.value;
        return (
          <button 
            key={o.value} 
            onClick={() => onChange(o.value)} 
            className={`px-4 py-2 rounded-full cursor-pointer transition-all duration-200 whitespace-nowrap border text-xs md:text-sm font-medium ${sel ? "bg-yp-yellow/10 border-yp-yellow text-yp-yellow" : "bg-white/5 border-white/10 text-neutral-400 hover:text-neutral-200 hover:bg-white/10"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Slider({ label, value, onChange, min, max, step = 1, suffix, hint }: any) {
  return (
    <div className="mb-6">
      <div className="flex justify-between items-baseline mb-2">
        <label className="text-[13px] font-medium text-neutral-400">{label}</label>
        <span className="text-yp-yellow font-bold text-lg font-mono">
          {value}<span className="text-[11px] font-normal text-neutral-500 ml-1">{suffix}</span>
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-yp-yellow h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
      />
      {hint && <div className="text-[11px] text-neutral-500 mt-2">{hint}</div>}
    </div>
  );
}

function Metric({ label, value, highlight, sub }: any) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "bg-yp-yellow/10 border-yp-yellow/30" : "bg-white/5 border-white/10"}`}>
      <div className={`text-[10px] uppercase tracking-wider mb-1 font-mono ${highlight ? "text-yp-yellow/70" : "text-neutral-500"}`}>{label}</div>
      <div className={`font-bold font-mono text-xl ${highlight ? "text-yp-yellow" : "text-white"}`}>{value}</div>
      {sub && <div className="text-[11px] text-neutral-500 mt-1">{sub}</div>}
    </div>
  );
}

function BreakdownRow({ label, icon, direct, hidden, total, maxTotal }: any) {
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const dPct = total > 0 ? (direct / total) * 100 : 0;
  return (
    <div className="mb-3.5">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[13px] text-neutral-300 flex items-center gap-1.5"><span className="text-base">{icon}</span> {label}</span>
        <span className="text-[13px] font-bold text-white font-mono">{fmt(total)}</span>
      </div>
      <div className="h-4 bg-white/5 rounded-sm overflow-hidden relative">
        <div className="h-full flex rounded-sm transition-all duration-700 ease-out" style={{ width: `${pct}%` }}>
          <div className="h-full bg-white/10" style={{ width: `${dPct}%` }} />
          <div className="flex-1 h-full bg-red-500/30" />
        </div>
      </div>
      <div className="flex gap-3 mt-1.5">
        <span className="text-[10px] text-neutral-500">Achiziție {fmt(direct)}</span>
        <span className="text-[10px] text-red-500/80">Ascunse {fmt(hidden)}</span>
      </div>
    </div>
  );
}

// ─── MAIN CALCULATOR ───

export default function TCOCalculator() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<any>({});

  const [industry, setIndustry] = useState("");
  const [employees, setEmployees] = useState(20);
  const [selCats, setSelCats] = useState(["incaltaminte", "imbracaminte"]);
  const [freq, setFreq] = useState(6);
  const [prices, setPrices] = useState<any>({});
  const [adminH, setAdminH] = useState(4);
  const [hourCost, setHourCost] = useState(45);
  const [complaints, setComplaints] = useState("");
  const [stockIssue, setStockIssue] = useState("");
  const [supplierStatus, setSupplierStatus] = useState("");
  const [nextOrder, setNextOrder] = useState("");
  const [lead, setLead] = useState({ name: "", company: "", email: "", phone: "" });

  // ─── CALCULATIONS ───
  const results = useMemo(() => {
    const ind = INDUSTRIES.find((i) => i.id === industry) || INDUSTRIES[5];
    const cats = EIP_CATS.filter((c) => selCats.includes(c.id));
    const replPerYear = 12 / freq;
    const breakdown: any = [];
    let totalDirect = 0;
    let totalPremium = 0;

    cats.forEach((cat) => {
      const price = prices[cat.id] || cat.avg;
      const direct = employees * price * replPerYear;
      const logPct = freq <= 4 ? 0.28 : freq <= 6 ? 0.22 : 0.15;
      const wastePct = freq <= 4 ? 0.12 : 0.06;
      const hidden = direct * (logPct + wastePct);
      const currentTotal = direct + hidden;

      const premRepl = 12 / (freq * cat.life);
      const premDirect = employees * cat.prem * premRepl;
      const premTotal = premDirect + premDirect * 0.12;

      totalDirect += direct;
      totalPremium += premTotal;
      breakdown.push({ id: cat.id, label: cat.label, icon: cat.icon, direct, hidden, currentTotal, premTotal });
    });

    const adminCost = adminH * 12 * hourCost;
    const premAdminCost = adminCost * 0.4;
    const riskCost = totalDirect * (ind.risk - 1);
    const currentTotal = breakdown.reduce((s: number, b: any) => s + b.currentTotal, 0) + adminCost + riskCost;
    const premiumTotal = breakdown.reduce((s: number, b: any) => s + b.premTotal, 0) + premAdminCost;
    const savings1y = currentTotal - premiumTotal;
    const savingsPct = currentTotal > 0 ? ((savings1y / currentTotal) * 100).toFixed(0) : 0;
    const cpwCurrent = employees > 0 ? (currentTotal / (employees * 220)) : 0;
    const cpwPremium = employees > 0 ? (premiumTotal / (employees * 220)) : 0;

    return { breakdown, totalDirect, adminCost, riskCost, currentTotal, premiumTotal, savings1y, savings3y: savings1y * 3, savingsPct, cpwCurrent, cpwPremium, ind };
  }, [industry, employees, selCats, freq, prices, adminH, hourCost]);

  // ─── NAV ───
  const scrollTop = () => window.scrollTo?.({ top: 30, behavior: "smooth" });
  const next = () => {
    const e: any = {};
    if (step === 1 && !industry) e.industry = true;
    if (step === 2 && selCats.length === 0) e.cats = true;
    if (step === 3 && !complaints) e.complaints = true;
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setStep((s) => s + 1);
    scrollTop();
  };
  const back = () => { setErrors({}); setStep((s) => s - 1); scrollTop(); };
  const toggleCat = (id: string) => setSelCats((p) => p.includes(id) ? p.filter((c) => c !== id) : [...p, id]);

  const submit = async () => {
    const e: any = {};
    if (!lead.name.trim()) e.name = true;
    if (!lead.company.trim()) e.company = true;
    if (!lead.email.includes("@") || !lead.email.includes(".")) e.email = true;
    if (Object.keys(e).length) { setErrors(e); return; }
    setSubmitting(true);
    try {
      const payload = {
        lead,
        inputs: { industry, employees, categories: selCats, freq, prices, adminH, hourCost, complaints, stockIssue, supplierStatus, nextOrder },
        segments: {
          painLevel: freq <= 4 && complaints === "constant" ? "acut" : freq <= 4 ? "cost_aware" : adminH > 10 ? "eficienta_ops" : "standard",
          supplierRisk: supplierStatus === "caut" || supplierStatus === "nemultumit",
          urgency: nextOrder === "luna" ? "imediat" : nextOrder === "2_3" ? "curand" : "planificare",
          stockProblem: stockIssue === "da",
          retentionRisk: complaints === "constant",
          employeeScale: employees > 50 ? "enterprise" : employees >= 15 ? "sweet_spot" : "mic",
        },
        results: {
          currentTotal: Math.round(results.currentTotal),
          premiumTotal: Math.round(results.premiumTotal),
          savings1y: Math.round(results.savings1y),
          savings3y: Math.round(results.savings3y),
          savingsPct: results.savingsPct,
          cpwCurrent: +results.cpwCurrent.toFixed(2),
          cpwPremium: +results.cpwPremium.toFixed(2),
          breakdown: results.breakdown.map((b: any) => ({ category: b.label, currentTotal: Math.round(b.currentTotal), premiumTotal: Math.round(b.premTotal) })),
        },
      };
      await fetch("https://youprotect.app.n8n.cloud/webhook/tco-lead", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      }).catch(() => {});
      setStep(6);
      scrollTop();
    } catch { alert("Eroare. Încearcă din nou."); }
    finally { setSubmitting(false); }
  };

  // ─── UTILS BUTTONS ───
  const BtnPrimary = ({ onClick, children, disabled, className = "" }: any) => (
    <button 
      onClick={onClick} disabled={disabled}
      className={`w-full bg-yp-yellow text-yp-black font-bold py-4 px-6 rounded-xl hover:bg-white transition-colors duration-200 shadow-lg shadow-yp-yellow/10 ${className}`}
    >
      {children}
    </button>
  );

  const BtnBack = ({ onClick, children }: any) => (
    <button onClick={onClick} className="text-neutral-400 hover:text-white transition-colors text-sm py-4 px-2">
      {children}
    </button>
  );

  return (
    <div className="max-w-xl mx-auto w-full bg-[#111] rounded-2xl border border-white/5 p-6 md:p-8 shadow-2xl relative overflow-hidden font-body text-white">
      <style>{`
        .custom-active-scale:active { transform: scale(0.98); }
      `}</style>
      
      <Progress step={step} total={5} />

      {/* ═══ STEP 1 ═══ */}
      {step === 1 && (<div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="text-2xl font-bold text-white mb-2 leading-tight">Calculează Costul Real al Echipamentelor de Protecție</h2>
        <p className="text-neutral-400 text-sm mb-6 leading-relaxed">Nu prețul de pe factură — ci tot ce plătești: înlocuiri, administrare, riscuri. Rezultate instant și gratuit.</p>
        
        <div className="text-[11px] text-neutral-500 uppercase tracking-widest mb-3 font-semibold">Industria ta</div>
        <Cards columns={2} options={INDUSTRIES.map((i) => ({ value: i.id, label: i.label, sub: i.desc }))} value={industry} onChange={setIndustry} />
        {errors.industry && <div className="text-red-500 text-xs mt-2">Selectează industria</div>}
        
        <div className="mt-8">
          <Slider label="Angajați cu EIP" value={employees} onChange={setEmployees} min={5} max={200} suffix="pers." hint="Toți cei care primesc echipament de protecție" />
        </div>
        
        <div className="mt-8"><BtnPrimary onClick={next}>Continuă →</BtnPrimary></div>
      </div>)}

      {/* ═══ STEP 2 ═══ */}
      {step === 2 && (<div className="animate-in fade-in slide-in-from-right-4 duration-500">
        <h2 className="text-2xl font-bold text-white mb-2 leading-tight">Ce echipamente achiziționezi?</h2>
        <p className="text-neutral-400 text-sm mb-6 leading-relaxed">Bifează categoriile și ajustează prețul actual per bucată.</p>
        
        <div className="flex flex-col gap-2.5">
          {EIP_CATS.map((cat) => {
            const sel = selCats.includes(cat.id);
            return (<div key={cat.id}>
              <button onClick={() => toggleCat(cat.id)} className={`w-full text-left p-3.5 rounded-xl flex justify-between items-center transition-all duration-200 border custom-active-scale ${sel ? "bg-yp-yellow/10 border-yp-yellow !rounded-b-none" : "bg-white/5 border-white/10 hover:border-white/20"}`}>
                <span className={`text-[13px] md:text-sm font-semibold flex items-center gap-2 ${sel ? "text-yp-yellow" : "text-neutral-300"}`}><span className="text-lg">{cat.icon}</span> {cat.label}</span>
                <span className={`text-[13px] ${sel ? "text-yp-yellow" : "text-neutral-500"}`}>{sel ? "✓" : `~${cat.avg} RON`}</span>
              </button>
              {sel && (
                <div className="px-4 py-3 bg-yp-yellow/5 border border-yp-yellow border-t-0 rounded-b-xl flex items-center justify-between gap-3">
                  <span className="text-xs text-neutral-400 font-medium">Preț/buc:</span>
                  <div className="flex items-center gap-2">
                    <input type="number" inputMode="numeric" min={5} max={2000} value={prices[cat.id] || cat.avg}
                      onChange={(e) => setPrices((p: any) => ({ ...p, [cat.id]: Number(e.target.value) }))}
                      className="w-20 bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-yp-yellow text-[15px] font-mono font-bold text-right focus:border-yp-yellow focus:outline-none"
                    />
                    <span className="text-xs text-neutral-500 font-medium">RON</span>
                  </div>
                </div>
              )}
            </div>);
          })}
        </div>
        {errors.cats && <div className="text-red-500 text-xs mt-2">Selectează cel puțin o categorie</div>}
        
        <div className="mt-8">
          <div className="text-[11px] text-neutral-500 uppercase tracking-widest mb-3 font-semibold">Frecvență medie de înlocuire</div>
          <Chips options={FREQ.map((f) => ({ value: f.v, label: f.label }))} value={freq} onChange={setFreq} />
        </div>
        
        <div className="flex gap-4 mt-8 items-center">
          <BtnBack onClick={back}>← Înapoi</BtnBack>
          <div className="flex-1"><BtnPrimary onClick={next}>Continuă →</BtnPrimary></div>
        </div>
      </div>)}

      {/* ═══ STEP 3 ═══ */}
      {step === 3 && (<div className="animate-in fade-in slide-in-from-right-4 duration-500">
        <h2 className="text-2xl font-bold text-white mb-2 leading-tight">Costurile invizibile</h2>
        <p className="text-neutral-400 text-sm mb-6 leading-relaxed">Timpul echipei, plângerile și rupturile de stoc au un preț real.</p>
        
        <Slider label="Ore/lună gestionare EIP" value={adminH} onChange={setAdminH} min={1} max={40} suffix="ore" hint="Comandă, recepție, distribuire, evidențe, retururi" />
        <Slider label="Cost orar responsabil" value={hourCost} onChange={setHourCost} min={20} max={150} suffix="RON/h" hint="Salariu brut + contribuții" />
        
        <div className="text-[11px] text-neutral-500 uppercase tracking-widest mt-8 mb-3 font-semibold">Plângeri angajați privind EIP</div>
        <Cards columns={3} options={[
          { value: "rareori", label: "Rareori", sub: "<10%" },
          { value: "des", label: "Des", sub: "10-30%" },
          { value: "constant", label: "Constant", sub: ">30%" },
        ]} value={complaints} onChange={setComplaints} />
        {errors.complaints && <div className="text-red-500 text-xs mt-2">Selectează o opțiune</div>}
        
        <div className="text-[11px] text-neutral-500 uppercase tracking-widest mt-8 mb-3 font-semibold">Rupturi de stoc EIP în ultimul an?</div>
        <Cards columns={2} options={[
          { value: "da", label: "Da", sub: "Am improvizat sau așteptat" },
          { value: "nu", label: "Nu", sub: "Stoc suficient" },
        ]} value={stockIssue} onChange={setStockIssue} />
        
        <div className="flex gap-4 mt-8 items-center">
          <BtnBack onClick={back}>← Înapoi</BtnBack>
          <div className="flex-1"><BtnPrimary onClick={next}>Vezi Rezultatele →</BtnPrimary></div>
        </div>
      </div>)}

      {/* ═══ STEP 4: RESULTS + QUALIFYING ═══ */}
      {step === 4 && (<div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
        <div className="text-center mb-8">
          <div className="text-[11px] text-yp-yellow font-bold uppercase tracking-widest mb-2">Costul tău real anual</div>
          <div className="text-4xl font-bold text-white font-mono mb-1">{fmt(results.currentTotal)}</div>
          <div className="text-[13px] text-neutral-400 mt-2 max-w-sm mx-auto">Din care <span className="text-red-500/90 font-medium">{fmt(results.currentTotal - results.totalDirect)}</span> sunt cheltuieli ascunse care nu apar pe factură</div>
        </div>

        <div className="text-[11px] text-neutral-500 uppercase tracking-widest mb-4 font-semibold">Defalcare comparativă</div>
        <div className="mb-6 p-5 bg-white/5 rounded-xl border border-white/10">
          {results.breakdown.map((b: any) => (
            <BreakdownRow key={b.id} label={b.label} icon={b.icon} direct={b.direct} hidden={b.hidden} total={b.currentTotal} maxTotal={Math.max(...results.breakdown.map((x: any) => x.currentTotal))} />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <Metric label="Cost Admin / an" value={fmt(results.adminCost)} />
          <Metric label={`Risc expunere (${results.ind.label})`} value={fmt(results.riskCost)} />
        </div>

        <div className="mt-6 p-6 rounded-xl bg-gradient-to-br from-yp-yellow/10 to-transparent border border-yp-yellow/20 text-center relative overflow-hidden">
          <div className="text-[11px] text-yp-yellow/70 uppercase tracking-widest mb-2 font-semibold">Cost per zi de purtare / angajat</div>
          <div className="text-4xl font-bold text-white font-mono my-2">
            {results.cpwCurrent.toFixed(2)} <span className="text-sm text-neutral-400 font-normal">RON/zi</span>
          </div>
          <div className="text-xs text-neutral-400">Acesta e indicatorul real — nu prețul per bucată</div>
        </div>

        <div className="mt-5 p-5 rounded-xl bg-[#0a0a0a] border border-white/10 flex flex-col sm:flex-row justify-between items-center sm:items-start gap-4">
          <div>
            <div className="text-[11px] text-neutral-500 uppercase tracking-widest mb-1">Potențial Economie / An</div>
            <div className="text-2xl font-bold text-green-400 font-mono">{fmt(results.savings1y)}</div>
          </div>
          <div className="bg-green-500/10 text-green-400 px-4 py-2 rounded-full text-sm font-bold border border-green-500/20">
            -{results.savingsPct}% Costuri
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Metric label="CPW actual" value={`${results.cpwCurrent.toFixed(2)} RON`} />
          <Metric label="CPW optimizat" value={`${results.cpwPremium.toFixed(2)} RON`} highlight />
        </div>

        <details className="mt-5 group">
          <summary className="text-[11px] text-neutral-400 cursor-pointer py-2 hover:text-white transition-colors outline-none font-medium flex items-center gap-2">
            ℹ️ Cum am calculat
          </summary>
          <div className="text-[11px] text-neutral-500 mt-2 p-3 bg-white/5 rounded-md leading-relaxed">
            Logistică internă: 15-28% din cost achiziție (proporțional cu frecvența). Risipă înlocuire batch: 6-12%. Risc non-conformitate: coeficient {results.ind.risk}x ({results.ind.label}). Admin = orele × tariful tău. Scenariul optimizat presupune durabilitate de 2-3x și logistică redusă cu 60%.
          </div>
        </details>

        {/* ── QUALIFYING QUESTIONS ── */}
        <div className="mt-8 p-5 md:p-6 rounded-xl bg-white/[0.02] border border-white/5">
          <div className="text-xs text-neutral-400 uppercase tracking-widest mb-5 font-semibold text-center">Încă două întrebări rapide</div>
          
          <div className="mb-6">
            <div className="text-[13px] font-medium text-neutral-300 mb-3">Situația cu furnizorul actual?</div>
            <Cards columns={1} options={[
              { value: "stabil", label: "Furnizor stabil, mulțumit", sub: "Dar vreau să compar pentru viitor", icon: "✅" },
              { value: "nemultumit", label: "Am furnizor, dar nu sunt complet mulțumit", sub: "Probleme de calitate, termene sau prețuri", icon: "⚠️" },
              { value: "caut", label: "Caut activ furnizor nou", sub: "Sunt în proces de evaluare oferte", icon: "🔍" },
              { value: "intern", label: "Fără contract stabil", sub: "Cumpărăm din diverse surse de necesitate", icon: "🔄" },
            ]} value={supplierStatus} onChange={setSupplierStatus} />
          </div>
          
          <div>
            <div className="text-[13px] font-medium text-neutral-300 mb-3">Când anticipați următoarea comandă EIP?</div>
            <Cards columns={2} options={[
              { value: "luna", label: "Luna aceasta", icon: "🔥" },
              { value: "2_3", label: "În 2-3 luni", icon: "📅" },
              { value: "6_plus", label: "În 6+ luni", icon: "📦" },
              { value: "nu_stiu", label: "Nu știu exact", icon: "🤷" },
            ]} value={nextOrder} onChange={setNextOrder} />
          </div>
        </div>

        <div className="flex gap-4 mt-8 items-center">
          <BtnBack onClick={back}>← Modifică</BtnBack>
          <div className="flex-1"><BtnPrimary onClick={next}>Vreau Ghidul de Optimizare →</BtnPrimary></div>
        </div>
      </div>)}

      {/* ═══ STEP 5: LEAD CAPTURE ═══ */}
      {step === 5 && (<div className="animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2 leading-tight">Ghidul Tău de Optimizare EIP</h2>
          <p className="text-neutral-400 text-[13px] leading-relaxed">Document personalizat pe datele tale, cu pași concreți. Îl poți folosi direct sau îl încarci într-un AI care te ghidează pas cu pas.</p>
        </div>

        <div className="bg-yp-yellow/5 border border-yp-yellow/20 rounded-xl p-5 mb-8">
          <div className="text-[13px] text-yp-yellow font-bold mb-3">Ce primești în fișier:</div>
          {[
            "Analiza TCO detaliată cu toate costurile ascunse", 
            "Plan de optimizare personalizat în 4 etape", 
            "Checklist evaluare rapidă furnizori EIP", 
            "Template de negociere (ce să ceri exact)", 
            "Calculator ROI proiectat pe 1, 2 și 3 ani", 
            "Format AI-ready — compatibil ChatGPT/Claude"
          ].map((t, i) => (
            <div key={i} className="flex gap-2.5 items-start mb-2.5">
              <span className="text-yp-yellow text-[13px] mt-0.5">✓</span>
              <span className="text-neutral-300 text-[13px]">{t}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {[
            { k: "name", ph: "Numele tău complet", type: "text", mode: "text" },
            { k: "company", ph: "Compania / Organizația", type: "text", mode: "text" },
            { k: "email", ph: "E-mail de business", type: "email", mode: "email" },
            { k: "phone", ph: "Telefon de contact (Opțional)", type: "tel", mode: "tel" },
          ].map((f) => (
            <input key={f.k} type={f.type} inputMode={f.mode as any} placeholder={f.ph} value={(lead as any)[f.k]}
              onChange={(e) => { setLead((p) => ({ ...p, [f.k]: e.target.value })); setErrors((p: any) => ({ ...p, [f.k]: false })); }}
              className={`w-full bg-[#0a0a0a] border rounded-xl px-4 py-3.5 text-white text-[14px] focus:outline-none focus:border-yp-yellow transition-colors ${errors[f.k] ? "border-red-500" : "border-white/10"}`}
            />
          ))}
        </div>
        <div className="text-[10px] text-neutral-500 mt-4 leading-relaxed text-center px-2">
          Zero spam. Datele sunt procesate exclusiv pentru generarea și livrarea analizei tale TCO pe email.
        </div>

        <div className="flex gap-4 mt-8 items-center">
          <BtnBack onClick={back}>← Rezultate</BtnBack>
          <div className="flex-1">
            <BtnPrimary onClick={submit} disabled={submitting} className={submitting ? "opacity-60" : ""}>
              {submitting ? "Se generează..." : "Trimite-mi Ghidul Gratuit"}
            </BtnPrimary>
          </div>
        </div>
      </div>)}

      {/* ═══ STEP 6: DONE ═══ */}
      {step === 6 && (<div className="animate-in fade-in slide-in-from-bottom-6 duration-700 text-center py-6">
        <div className="w-14 h-14 rounded-full mx-auto mb-6 bg-green-500/10 flex items-center justify-center border border-green-500/20">
          <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-2 leading-tight">Ghidul tău este pe drum!</h2>
        <p className="text-neutral-400 text-sm mb-8 max-w-sm mx-auto">
          Verifică inbox-ul la adresa <strong>{lead.email}</strong>. Vei primi un mesaj generat automat din sistem în mai puțin de 5 minute.
        </p>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-5 text-left mb-8">
          <div className="text-yp-yellow font-bold text-[13px] mb-3">💡 Cum să folosești ghidul cu inteligență artificială:</div>
          <div className="text-[13px] text-neutral-400 leading-relaxed space-y-1.5">
            <p>1. Deschide PDF-ul primit pe adresa de email.</p>
            <p>2. Încarcă fișierul direct în ChatGPT sau Claude.</p>
            <p>3. Folosește următorul prompt: <span className="text-neutral-300 italic">„Analizează structura mea actuală de cost și ghidează-mă pas cu pas prin procesul de optimizare, conform planului din interior.”</span></p>
            <p>4. Primești acțiuni specifice pentru industria ta.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8 text-left">
          <Metric label="Economie / An" value={fmt(results.savings1y)} highlight small />
          <Metric label="Economie 3 Ani" value={fmt(results.savings3y)} highlight small />
        </div>

        <a href="/produse" className="inline-block text-yp-yellow hover:text-white transition-colors underline underline-offset-4 font-semibold text-[13px]">
          Explorează catalogul de echipamente premium →
        </a>
      </div>)}
    </div>
  );
}
