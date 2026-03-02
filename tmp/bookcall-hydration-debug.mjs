import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('console', msg => console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', err => console.log('[pageerror]', err.message));
page.on('requestfailed', req => console.log('[requestfailed]', req.url(), req.failure()?.errorText));

await page.goto('https://youprotect-website.pages.dev/produse/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);

const islandState = await page.evaluate(() => {
  const island = document.querySelector('astro-island[component-url*="LeadModal"]');
  return {
    exists: Boolean(island),
    hasSsrAttr: island?.hasAttribute('ssr') ?? null,
    client: island?.getAttribute('client') ?? null,
    componentUrl: island?.getAttribute('component-url') ?? null,
  };
});
console.log('[islandState]', islandState);

await page.evaluate(() => {
  window.__ypEvents = [];
  window.addEventListener('yp:lead-modal-open', (event) => {
    window.__ypEvents.push(event?.detail || null);
  });
});

await page.getByRole('button', { name: /Book a call/i }).first().click();
await page.waitForTimeout(1500);

const afterClick = await page.evaluate(() => ({
  ypEventsCount: (window.__ypEvents || []).length,
  lastEvent: (window.__ypEvents || []).at(-1) || null,
  modalTitleExists: !!Array.from(document.querySelectorAll('*')).find((el) =>
    el.textContent?.includes('Mini-precalificare pentru Book a call')
  ),
  hasOverlay: !!document.querySelector('div.fixed.inset-0.z-50'),
}));
console.log('[afterClick]', afterClick);

await browser.close();
