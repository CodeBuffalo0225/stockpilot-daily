// Ask the board one question from the terminal.
//
//   npm run ask -- "what did it buy today?"
//   npm run ask -- "what would make it sell?" --date 2026-09-17 --lens analyst
//   npm run ask -- "..." --local        # read data/decks/, not the database
//
// Same code path the web endpoint uses, so this is how you check the model layer
// without a browser. With no ANTHROPIC_API_KEY it exercises the deterministic
// answerer, which is the no-key product.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({
  path: join(process.env.STOCKPILOT_DIR ?? join(process.env.HOME ?? '', 'Documents', 'stockpilot'), '.env'),
});
dotenv.config({ path: join(projectRoot, '.env.local'), override: true });

// --local reads data/decks/ instead of the database, for when the local Supabase
// stack's Docker is down. Same escape hatch as `npm run sync -- --local`.
if (process.argv.includes('--local')) {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

import { getDeck } from '../src/spine/store';
import { ask } from '../src/ask/ask';
import { ungrounded } from '../src/ask/grounding';
import { parseLens, buildLens } from '../src/lens/lens';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const question = process.argv.slice(2).find((a) => !a.startsWith('--') && process.argv[process.argv.indexOf(a) - 1]?.startsWith('--') !== true);
  if (!question) {
    console.error('\nusage: npm run ask -- "your question" [--date YYYY-MM-DD] [--lens analyst] [--ai bear]\n');
    process.exit(1);
  }

  const deck = await getDeck(flag('date'));
  if (!deck) {
    console.error('\nNo deck for that date. Run `npm run sync -- --local` first.\n');
    process.exit(1);
  }

  const choice = parseLens(flag('lens'), flag('ai'));
  const lensName = choice ? buildLens(deck, choice.key, choice.ai).name : null;

  const result = await ask(question, deck, lensName);
  console.log(`\n  board    ${deck.date}${lensName ? `  ·  lens ${lensName}` : ''}`);
  console.log(`  source   ${result.source}${result.reason ? ` (${result.reason})` : ''}`);
  console.log(`\n  ${result.answer}\n`);

  // The gate runs inside ask(); re-checking here proves what reached the terminal.
  const bad = ungrounded(result.answer, deck);
  console.log(`  ungrounded figures in what you just read: ${bad.length ? bad.map((f) => f.raw).join(', ') : 'none'}\n`);
}

main().catch((err) => {
  console.error(`\n[ask] ${(err as Error).message}\n`);
  process.exit(1);
});
