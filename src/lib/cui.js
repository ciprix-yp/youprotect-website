// Validarea CUI/CIF (cifra de control), folosită de formular (în browser) și de API (pe server).
// Algoritmul e cel din convențiile RO (ro-format.ts, testat). „RO” din față marchează doar plătitorul de TVA.

/** CUI fără prefixul RO și fără spații, ex. „RO 46294850” -> „46294850”. */
export function normalizeCUI(input) {
  return String(input ?? '')
    .trim()
    .toUpperCase()
    .replace(/^RO/, '')
    .replace(/\s/g, '');
}

/** true dacă CUI-ul are 2–10 cifre și cifra de control corectă. */
export function isValidCUI(input) {
  const s = normalizeCUI(input);
  if (!/^\d{2,10}$/.test(s)) return false;
  const digits = s.split('').map(Number);
  const control = digits.pop();
  const key = [7, 5, 3, 2, 1, 7, 5, 3, 2];
  const padded = [...Array(9 - digits.length).fill(0), ...digits];
  const sum = padded.reduce((acc, d, i) => acc + d * key[i], 0);
  return ((sum * 10) % 11) % 10 === control;
}
