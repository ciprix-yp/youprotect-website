// Măsoară lunar dacă ChatGPT (prin API, cu căutare pe web) recomandă You Protect la întrebările din ai-prompts.json.
// Rulare: secret run youprotect-website -- node scripts/seo/ai-visibility.mjs <folder-rezultate> [model]
// Rezultatele (răspunsuri, surse citate) se scriu în <folder-rezultate>, în afara repo-ului: repo-ul e public.
// API-ul cu căutare aproximează ChatGPT, nu e identic: comparăm lunile între ele, nu cu ce vede un om în aplicație.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PROMPTS = JSON.parse(readFileSync(join(ROOT, 'scripts/seo/ai-prompts.json'), 'utf8'));
const BRAND = /you\s?protect|youprotect\.ro/i;
const LOCATION = { type: 'approximate', country: 'RO', region: 'Satu Mare', city: 'Satu Mare' };

const [outArg, modelArg] = process.argv.slice(2);
if (!outArg) throw new Error('dă folderul de rezultate (în afara repo-ului)');
const outDir = resolve(outArg);
if (outDir.startsWith(resolve(ROOT))) throw new Error('folderul de rezultate trebuie să fie în afara repo-ului');
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('OPENAI_API_KEY lipsește (secret run youprotect-website -- …)');
const model = modelArg || 'gpt-5';
if (!/^[a-z0-9.\-]+$/.test(model)) throw new Error(`model invalid: ${model}`);

async function ask(prompt) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, input: prompt, tools: [{ type: 'web_search', user_location: LOCATION }] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const failure = new Error(`OpenAI HTTP ${res.status} ${body.error?.code ?? ''} ${String(body.error?.message ?? '').slice(0, 200)}`);
    failure.status = res.status;
    throw failure;
  }
  const parts = (body.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
  const text = parts.filter((c) => c.type === 'output_text').map((c) => c.text).join('\n');
  const sources = [...new Set(parts.flatMap((c) => c.annotations ?? []).filter((a) => a.type === 'url_citation').map((a) => a.url))];
  return { text, sources };
}

mkdirSync(outDir, { recursive: true });
const date = new Date().toISOString().slice(0, 10);
const results = [];
for (const prompt of PROMPTS) {
  try {
    const { text, sources } = await ask(prompt);
    const mentioned = BRAND.test(text) || sources.some((u) => /youprotect\.ro/.test(u));
    results.push({ prompt, mentioned, sources, text });
    console.log(`${mentioned ? 'DA ' : 'nu '} ${prompt}`);
  } catch (error) {
    // În fișierul de rezultate intră doar codul HTTP; detaliile erorii merg în jurnal.
    results.push({ prompt, failed: true, status: error.status ?? null });
    console.error(`EROARE ${prompt}: ${error.message}`);
  }
}
const file = join(outDir, `ai-visibility-${date}-${model}.json`);
writeFileSync(file, JSON.stringify({ date, model, location: LOCATION, results }, null, 2));
const hits = results.filter((r) => r.mentioned).length;
console.log(`\nYou Protect apare în ${hits} din ${results.length} răspunsuri. Rezultate: ${file}`);
