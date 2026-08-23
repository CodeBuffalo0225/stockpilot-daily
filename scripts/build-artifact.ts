// Build the shareable single-file preview.
//
//   npm run artifact
//
// Inlines every synced deck plus one encoded render into artifact/template.html
// and writes a self-contained page. Everything is embedded because the target
// (a published Artifact) blocks external hosts other than Google Fonts — there
// is nowhere for a separate .mp4 or .json to live.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DailyDeck } from '../src/spine/schema';
import { buildTimeline } from '../src/video/timing';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIDEO_DATE = process.env.ARTIFACT_VIDEO_DATE ?? '2026-08-17';
const VIDEO_FILE = process.env.ARTIFACT_VIDEO ?? 'out/mvp-vertical.mp4';
const MAX_BYTES = 16 * 1024 * 1024;

async function main() {
  const dir = join(root, 'data', 'decks');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort().reverse();

  const decks = [];
  for (const f of files) {
    const parsed = DailyDeck.safeParse(JSON.parse(await readFile(join(dir, f), 'utf8')));
    if (!parsed.success) {
      console.warn(`  ! skipping ${f} — failed validation`);
      continue;
    }
    const d = parsed.data;
    // Only what the preview renders. The full deck carries scene copy the page
    // never shows, and every byte here is inlined into the page.
    decks.push({
      date: d.date,
      source: d.source,
      thesis: d.thesis,
      counts: d.counts,
      unansweredCount: d.unansweredCount,
      allocation: d.allocation.map((p) => ({
        ticker: p.ticker,
        tier: p.tier,
        positionPct: p.positionPct,
        sector: p.sector,
        entryNote: p.entryNote,
        stopNote: p.stopNote,
      })),
      watches: d.watches.map((w) => ({ ticker: w.ticker, note: w.note })),
      skips: d.skips,
      momentum: d.momentum.map((m) => ({
        ticker: m.ticker,
        momentumScore: m.momentumScore,
        ret63d: m.ret63d,
      })),
      tape: d.tape,
      rotations: d.rotations,
      timeline: buildTimeline(d, 30),
    });
  }

  if (decks.length === 0) throw new Error('No decks in data/decks — run `npm run sync` first.');

  let videoTag = '';
  try {
    const buf = await readFile(join(root, VIDEO_FILE));
    videoTag = `window.__VIDEO_SRC__ = "data:video/mp4;base64,${buf.toString('base64')}";\n`;
    console.log(`  video ${VIDEO_FILE} — ${(buf.length / 1048576).toFixed(2)} MB raw`);
  } catch {
    console.warn(`  ! ${VIDEO_FILE} not found — the page will show the stand-in for every day.`);
  }

  const template = await readFile(join(root, 'artifact', 'template.html'), 'utf8');
  const html = template
    .replace('const DECKS = __PAYLOAD__;', `${videoTag}const DECKS = ${JSON.stringify(decks)};`)
    .replace('__VIDEO_DATE__', JSON.stringify(VIDEO_DATE));

  if (html.includes('__PAYLOAD__') || html.includes('__VIDEO_DATE__')) {
    throw new Error('Template placeholder was not substituted — check the token names.');
  }

  const out = join(root, 'artifact', 'stockpilot-daily.html');
  await writeFile(out, html);

  const bytes = Buffer.byteLength(html);
  console.log(
    `\n  ${decks.length} decks · ${decks[0].date} → ${decks[decks.length - 1].date}` +
      `\n  ${out}\n  ${(bytes / 1048576).toFixed(2)} MB of a ${MAX_BYTES / 1048576} MB budget\n`,
  );
  if (bytes > MAX_BYTES) {
    throw new Error('Page exceeds the 16 MB artifact limit — re-encode the video smaller.');
  }
}

main().catch((err) => {
  console.error(`\n[artifact] ${(err as Error).message}\n`);
  process.exit(1);
});
