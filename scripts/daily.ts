// One command for the daily run: pull the deck, then render it.
//
//   npm run daily                  # latest date, vertical
//   npm run daily -- 2026-08-17    # a specific date
//   npm run daily -- --both        # vertical + landscape
//   npm run daily -- --landscape   # landscape only
//
// The deck is written to disk before any render starts, so the render is of a
// file that can be inspected afterwards rather than of a live API response.

import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDeck } from '../src/spine/fetch-deck';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = {
  vertical: { id: 'StockPilotDaily', suffix: 'vertical' },
  landscape: { id: 'StockPilotDailyLandscape', suffix: 'landscape' },
} as const;

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: projectRoot, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)),
    );
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const date = argv.find((a) => !a.startsWith('--'));

  const wanted: Array<keyof typeof TARGETS> = flags.has('--both')
    ? ['vertical', 'landscape']
    : flags.has('--landscape')
      ? ['landscape']
      : ['vertical'];

  const { deck, warnings } = await fetchDeck(date);

  const propsPath = join(projectRoot, 'data', 'deck.json');
  await mkdir(dirname(propsPath), { recursive: true });
  await writeFile(propsPath, JSON.stringify(deck, null, 2));

  console.log(`\n▸ StockPilot Daily — ${deck.date}  [${deck.source}]`);
  console.log(
    `  BUY ${deck.counts.buy} · WATCH ${deck.counts.watch} · SKIP ${deck.counts.skip} · screened ${deck.counts.screened}`,
  );
  for (const w of warnings) console.log(`  ! ${w}`);

  await mkdir(join(projectRoot, 'out'), { recursive: true });

  for (const key of wanted) {
    const { id, suffix } = TARGETS[key];
    const outFile = join(projectRoot, 'out', `stockpilot-${deck.date}-${suffix}.mp4`);
    console.log(`\n▸ rendering ${id} → out/stockpilot-${deck.date}-${suffix}.mp4`);
    await run('npx', [
      'remotion',
      'render',
      id,
      outFile,
      `--props=${propsPath}`,
      '--log=info',
    ]);
    console.log(`  ✓ ${outFile}`);
  }

  console.log('\ndone.\n');
}

main().catch((err) => {
  console.error(`\n[daily] ${(err as Error).message}\n`);
  process.exit(1);
});
