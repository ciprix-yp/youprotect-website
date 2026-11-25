// Scenele ilustrative de pe paginile de industrie și de personalizare (public/images/scena-*.webp), generate cu OpenAI
// gpt-image-2 pe 20.11.2026 (D-2026-11-20-06). Sunt ilustrații, nu fotografii cu echipa sau clienții You Protect:
// fără logo-uri sau texte de mărci reale, cu echipamentul purtat corect; pe site au alt="" (decorative).
// Rulare: secret run youprotect-website -- node scripts/images/generate-scenes.mjs <out_dir> [nume...]
// Apoi: WebP de 1200 px sub 250 KB (tests/image-weight.test.mjs).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const STYLE_PEOPLE =
  'Photorealistic editorial photograph, natural documentary style, 35mm lens, shallow depth of field. ' +
  'Dusk or early evening, cool blue ambient light with warm work lights, the high-visibility yellow of the clothing glowing. ' +
  'No visible logos, brand names, text, signs or watermarks anywhere. Personal protective equipment worn correctly and fully. ' +
  'Adults, realistic faces, not looking at the camera. Wide composition with empty dark space on the left third.';

const SCENES = {
  personalizare:
    'Indoor studio product photograph, no people: close-up of the chest of a dark navy work jacket laid flat on a dark wooden workbench, with a neatly embroidered abstract geometric emblem in bright yellow thread; next to it a spool of yellow embroidery thread and a folded second jacket. Soft directional studio light from the right, fabric weave and stitches clearly visible, no letters or words anywhere.',
};

const out = process.argv[2];
const names = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(SCENES);
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY lipsește (secret run youprotect-website -- …)');
mkdirSync(out, { recursive: true });

for (const name of names) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt: name === 'personalizare' ? SCENES[name] + ' Photorealistic, no logos of real brands, no text, no watermark.' : `${SCENES[name]} ${STYLE_PEOPLE}`, size: '1536x1024', quality: 'high', n: 1 }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(name, res.status, body.error?.message);
    continue;
  }
  writeFileSync(join(out, `${name}.png`), Buffer.from(body.data[0].b64_json, 'base64'));
  console.log('ok', name);
}
