#!/usr/bin/env node
import path from "node:path";
import { promises as fsp } from "node:fs";

const [rawUrl = "http://localhost:3000", rawLabel = ""] = process.argv.slice(2);
const url = rawUrl.trim();

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)) {
  console.error("[screenshot] URL must be localhost, ex: http://localhost:3000");
  process.exit(1);
}

function sanitizeLabel(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function nextIndex(dir) {
  const files = await fsp.readdir(dir).catch(() => []);
  const regex = /^screenshot-(\d+)(?:-[a-z0-9-_]+)?\.png$/i;
  let max = 0;
  for (const file of files) {
    const m = file.match(regex);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 1;
}

async function main() {
  let puppeteerModule;
  try {
    puppeteerModule = await import("puppeteer");
  } catch {
    console.error("[screenshot] Missing dependency: puppeteer");
    console.error("[screenshot] Install with: npm i -D puppeteer");
    process.exit(1);
  }

  const puppeteer = puppeteerModule.default ?? puppeteerModule;
  const outputDir = path.resolve(process.cwd(), "temporary screenshots");
  await fsp.mkdir(outputDir, { recursive: true });

  const idx = await nextIndex(outputDir);
  const label = sanitizeLabel(rawLabel || "");
  const fileName = label ? `screenshot-${idx}-${label}.png` : `screenshot-${idx}.png`;
  const outputPath = path.join(outputDir, fileName);

  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await page.screenshot({ path: outputPath, fullPage: true, type: "png" });
    console.log(`[screenshot] Saved: ${outputPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[screenshot] Failed:", err);
  process.exit(1);
});
