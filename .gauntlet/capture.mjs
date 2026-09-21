/**
 * Capture one piece of the running app at the bar's viewport.
 *
 *   node .gauntlet/capture.mjs <piece> <url> [out.png]
 *
 * Viewport is 390x844 - an iPhone 14 frame - because the bar is a phone app and a
 * mismatched viewport is the most common way a "blind" comparison stops being blind:
 * the critic can tell which is which from the framing alone, before it judges anything.
 *
 * Shoots the VIEWPORT, not the full page. A full-page shot of a scrolling board came out
 * 780x5788 next to a 780x1688 phone screenshot - the critic would have known which was
 * which before judging anything. Pass --full only when comparing against a full-page bar.
 *
 * Needs: npm i -D playwright && npx playwright install chromium
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const argv = process.argv.slice(2);
const fullPage = argv.includes('--full');
// --scroll-to <selector> brings one piece into the frame before the shutter, so a piece
// that lives further down the page is still judged at the bar's viewport rather than as
// a cropped element. Identical framing on both sides is what keeps the pair blind.
const scrollIdx = argv.indexOf('--scroll-to');
const scrollTo = scrollIdx >= 0 ? argv[scrollIdx + 1] : null;
// Guard the -1 case: without --scroll-to, `i !== scrollIdx + 1` would drop argv[0].
const drop = scrollIdx >= 0 ? new Set([scrollIdx, scrollIdx + 1]) : new Set();
const args = argv.filter((a, i) => a !== '--full' && !drop.has(i));
const [piece, url, out = `.gauntlet/shots/${piece}.png`] = args;
if (!piece || !url) {
  console.error('usage: node .gauntlet/capture.mjs <piece> <url> [out.png]');
  process.exit(1);
}

// A bot wall, consent gate or sign-in screen is not a bar. Captured silently it would
// be handed to a critic as the reference, ours would win against a CAPTCHA, and the
// loop would be grading itself. Refuse the capture instead.
const NOT_A_BAR =
  /verify you are human|security verification|are you a robot|checking your browser|enable javascript|sign in to continue|create an account to continue|something went wrong|page not found|404 error|we're not able to load|temporarily unavailable/i;

mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
// networkidle settles our own app reliably, but many shipped apps hold streaming or
// polling connections open and never reach it - so fall back rather than fail the
// capture, which would quietly mean no bar and a loop that grades itself.
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
} catch {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(3000);
}
if (scrollTo) {
  await page.locator(scrollTo).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
}
// The board animates in; settle before the shutter so two rounds are comparable.
await page.waitForTimeout(1200);
const text = await page.evaluate(() => document.body?.innerText?.slice(0, 4000) ?? '');
const wall = text.match(NOT_A_BAR);
await page.screenshot({ path: wall ? `${out}.REJECTED.png` : out, fullPage });
await browser.close();

if (wall) {
  console.error(
    `REFUSED: ${url} returned a wall ("${wall[0]}"), not the product.\n` +
      `Saved to ${out}.REJECTED.png for inspection. Do not use it as a bar - a critic\n` +
      `comparing ours against a wall or an error page hands us the win for no reason.`,
  );
  process.exit(2);
}
console.log(out);
