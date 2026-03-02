const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://youprotect-website.pages.dev/produse/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.getByRole('button', { name: /Book a call/i }).first().click();
  await page.getByText('Mini-precalificare pentru Book a call').waitFor({ timeout: 10000 });

  console.log('LIVE_MODAL_OPEN=YES');
  await browser.close();
})().catch((error) => {
  console.error('LIVE_MODAL_OPEN=NO', error.message);
  process.exit(1);
});
