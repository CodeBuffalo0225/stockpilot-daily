/**
 * Capture one piece of the running app at the bar's viewport.
 *
 *   node .gauntlet/capture.mjs <piece> <url> [out.png]
 *
 * Viewport is 390x844 - an iPhone 14 frame - because the bar is a phone app and a
 * mismatched viewport is the most common way a "blind" comparison stops being blind:
 * the critic can tell which is which from the framing alone, before it judges anything.
 *
 * Needs: npm i -D playwright && npx playwright install chromium
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [piece, url, out = `.gauntlet/shots/${piece}.png`] = process.argv.slice(2);
if (!piece || !url) {
  console.error('usage: node .gauntlet/capture.mjs <piece> <url> [out.png]');
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle' });
// The board animates in; settle before the shutter so two rounds are comparable.
await page.waitForTimeout(1200);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
