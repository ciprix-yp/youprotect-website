// Întrebările fiecărui formular, comune pentru pagină (MultiStepForm.tsx: pașii) și server (server/leads.js: ce
// răspunsuri păstrează). Un pas nou adăugat doar în pagină ar fi fost ignorat în tăcere de server (audit, 20.11.2026).
// Contactul („contact”) e mereu ultimul pas și nu e o întrebare.
export const LEAD_QUESTIONS = {
  consultation: ['q1', 'q2', 'q3'],
  quote: ['q1', 'q2', 'q3', 'personalizare', 'q4', 'q5', 'q6', 'q7'],
};
