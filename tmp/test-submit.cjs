const payload = {
  intent: "consultation",
  data: {
    name: "Test User",
    company: "Test Co",
    phone: "0722222222",
    email: "test@example.com",
    q1: "Administrator / Patron",
    q2: "5–15 persoane",
    q3: "Agricultură",
    q4: ["Vrem o imagine mai unitară și mai profesionistă a echipei"],
    q5: ["Organizarea comenzilor și reaprovizionării"],
    q6: "Să știm ce variantă este mai rentabilă pe termen lung",
    q_other: {}
  }
};

fetch('https://youprotect.ro/api/submit-lead', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
}).then(res => res.json().then(j => console.log('Status', res.status, j))).catch(console.error);
