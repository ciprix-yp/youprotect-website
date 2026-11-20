// Câmpul-capcană (server/leads.js, isBotSubmission): ascuns pentru oameni — în afara ecranului, fără Tab, ascuns
// cititoarelor de ecran. Un robot care completează toate câmpurile din pagină îl completează și pe el, iar serverul
// ignoră atunci cererea. Nu folosim display:none: unii roboți sar peste câmpurile ascunse așa.
import React from 'react';
import { HONEYPOT_FIELD } from '../../lib/honeypot.js';

export default function Honeypot({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
      <label htmlFor={`hp-${HONEYPOT_FIELD}`}>Lasă acest câmp gol</label>
      <input
        id={`hp-${HONEYPOT_FIELD}`}
        type="text"
        name={HONEYPOT_FIELD}
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
