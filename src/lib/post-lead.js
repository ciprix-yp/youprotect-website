// Trimiterea unei cereri spre /api/submit-lead, comună pentru formularul în pași și calculator.
// La un refuz al serverului (4xx: date invalide, prea multe cereri) întoarce mesajul lui, scris pentru vizitator;
// la o eroare de server sau de rețea, mesajul rămâne null și formularul arată textul general cu telefonul.
export async function postLead(payload) {
  const response = await fetch('/api/submit-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.ok) return { ok: true, message: null };
  let message = null;
  if (response.status >= 400 && response.status < 500) {
    try {
      const body = await response.json();
      if (typeof body?.error === 'string' && body.error.length <= 300) message = body.error;
    } catch (_e) {
      // Răspuns fără JSON: rămâne mesajul general.
    }
  }
  return { ok: false, message };
}
