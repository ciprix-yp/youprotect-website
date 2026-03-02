import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('console', msg => console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', err => console.log('[pageerror]', err.message));

page.on('response', async (response) => {
  if (response.url().includes('/api/leads') && response.request().method() === 'POST') {
    try {
      const body = await response.text();
      console.log('[api]', response.status(), body);
    } catch {
      console.log('[api]', response.status(), '<body unavailable>');
    }
  }
});

await page.goto('https://youprotect-website.pages.dev/produse/', { waitUntil: 'networkidle', timeout: 60000 });
console.log('[step] loaded', page.url());

await page.getByRole('button', { name: 'Book a call' }).first().click();
await page.getByText('Mini-precalificare pentru Book a call').waitFor({ timeout: 10000 });
console.log('[step] modal visible');

await page.getByRole('button', { name: /Urgent/i }).first().click();
await page.getByRole('button', { name: /Incaltaminte protectie/i }).first().click();
await page.getByRole('button', { name: /6-20 oameni/i }).first().click();
await page.getByRole('button', { name: /Comparam optiuni acum/i }).first().click();
await page.getByRole('button', { name: /Confort slab in teren/i }).first().click();
await page.getByRole('button', { name: /Rata mai buna de purtare/i }).first().click();
console.log('[step] qualification answered');

await page.locator('div.p-8').getByRole('button', { name: /Continua/i }).first().click();
await page.getByText('Detaliile tale de contact').waitFor({ timeout: 10000 });
console.log('[step] moved to contact');

await page.getByLabel(/Nume si Prenume/i).fill('Playwright User');
await page.getByLabel(/Email/i).fill(`playwright.${Date.now()}@example.com`);
await page.getByLabel(/Telefon/i).fill('0721234567');
await page.getByLabel(/Companie/i).fill('YouProtect QA');
await page.getByLabel(/Mesaj/i).fill('playwright test');

const submit = page.getByRole('button', { name: /Trimite cererea de call/i });

const navPromise = page.waitForURL(/outlook\.office\.com\/book/i, { timeout: 20000 });
await submit.click();

let navOk = false;
try {
  await navPromise;
  navOk = true;
} catch {
  navOk = false;
}

console.log('[nav-ok]', navOk);
console.log('[final-url]', page.url());

if (!navOk) {
  const fallbackLink = page.getByRole('link', { name: /continua aici|Deschide calendarul acum/i }).first();
  const visible = await fallbackLink.isVisible().catch(() => false);
  console.log('[fallback-visible]', visible);
  if (visible) {
    await fallbackLink.click();
    await page.waitForURL(/outlook\.office\.com\/book/i, { timeout: 20000 });
    console.log('[fallback-nav-ok]', true);
    console.log('[fallback-final-url]', page.url());
  }
}

await browser.close();
