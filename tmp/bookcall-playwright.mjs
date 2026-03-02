import { chromium } from 'playwright';

const url = 'https://youprotect-website.pages.dev/produse/';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

page.on('console', msg => console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', err => console.log('[pageerror]', err.message));

let apiResponse = null;
page.on('response', async (response) => {
  if (response.url().includes('/api/leads') && response.request().method() === 'POST') {
    try {
      apiResponse = {
        status: response.status(),
        body: await response.text(),
      };
      console.log('[api]', apiResponse.status, apiResponse.body);
    } catch (err) {
      console.log('[api-error]', String(err));
    }
  }
});

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  console.log('[step] loaded', page.url());

  await page.getByRole('button', { name: /Book a call/i }).first().click();
  console.log('[step] clicked Book a call');

  await page.getByText('Mini-precalificare pentru Book a call', { exact: false }).waitFor({ timeout: 10000 });
  console.log('[step] modal visible');

  await page.getByRole('button', { name: /Urgent/i }).first().click();
  await page.getByRole('button', { name: /Incaltaminte protectie/i }).first().click();
  await page.getByRole('button', { name: /6-20 oameni/i }).first().click();
  await page.getByRole('button', { name: /Comparam optiuni acum/i }).first().click();
  await page.getByRole('button', { name: /Confort slab in teren/i }).first().click();
  await page.getByRole('button', { name: /Rata mai buna de purtare/i }).first().click();
  console.log('[step] qualification answered');

  await page.getByRole('button', { name: /Continua/i }).click();
  console.log('[step] moved to contact');

  await page.getByLabel(/Nume si Prenume/i).fill('Playwright User');
  await page.getByLabel(/Email/i).fill(`playwright.${Date.now()}@example.com`);
  await page.getByLabel(/Telefon/i).fill('0721234567');
  await page.getByLabel(/Companie/i).fill('YouProtect QA');
  await page.getByLabel(/Mesaj/i).fill('playwright test');

  const [navResult] = await Promise.allSettled([
    page.waitForURL(/outlook\.office\.com\/book/i, { timeout: 20000 }),
    page.getByRole('button', { name: /Trimite cererea de call/i }).click(),
  ]);

  console.log('[step] submit clicked');
  console.log('[navResult]', navResult.status, navResult.status === 'fulfilled' ? navResult.value : navResult.reason?.message);
  console.log('[final-url]', page.url());

  const fallbackVisible = await page.getByRole('link', { name: /continua aici|Deschide calendarul acum/i }).first().isVisible().catch(() => false);
  console.log('[fallback-visible]', fallbackVisible);

} catch (err) {
  console.error('[fatal]', err);
} finally {
  await browser.close();
}
