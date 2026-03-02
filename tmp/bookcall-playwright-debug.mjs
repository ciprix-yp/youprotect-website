import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

page.on('console', msg => console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', err => console.log('[pageerror]', err.message));
page.on('requestfailed', req => console.log('[requestfailed]', req.url(), req.failure()?.errorText));

await page.goto('https://youprotect-website.pages.dev/produse/', { waitUntil: 'networkidle', timeout: 60000 });

const shortlistState = await page.evaluate(() => ({
  hasShortlist: typeof window.YouProtectShortlist !== 'undefined',
  shortlistType: typeof window.YouProtectShortlist,
  hasOpenLeadModal: typeof window.YouProtectShortlist?.openLeadModal,
}));

console.log('[shortlistState]', shortlistState);

const bookButtons = await page.getByRole('button', { name: /Book a call/i }).all();
console.log('[bookButtons-count]', bookButtons.length);

if (bookButtons.length > 0) {
  await bookButtons[0].click();
  await page.waitForTimeout(1500);
}

const modalVisible = await page.getByText('Mini-precalificare pentru Book a call').isVisible().catch(() => false);
console.log('[modalVisible]', modalVisible);

await browser.close();
