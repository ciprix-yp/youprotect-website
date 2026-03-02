import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('http://127.0.0.1:4322/produse/', { waitUntil: 'networkidle', timeout: 60000 });

await page.getByRole('button', { name: /Book a call/i }).first().click();
await page.getByText('Mini-precalificare pentru Book a call').waitFor({ timeout: 10000 });

console.log('LOCAL_MODAL_OPEN=YES');

await browser.close();
