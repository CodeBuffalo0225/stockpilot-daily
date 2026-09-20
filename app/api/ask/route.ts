/**
 * POST /api/ask - one question about one day's board.
 *
 * Runs on the server because the deck store and the model key both live there. The
 * browser sends only a date, a lens name and a question; it never receives a credential
 * and never decides what is true.
 */
import { getDeck } from '../../../src/spine/store';
import { AskRequest } from '../../../src/ask/schema';
import { ask } from '../../../src/ask/ask';
import { parseLens, buildLens } from '../../../src/lens/lens';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BODY = 4_000;

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: 'That question is too long.' }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Body is not valid JSON.' }, { status: 400 });
  }

  const parsed = AskRequest.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Ask a question between 4 and 300 characters.' }, { status: 400 });
  }

  const deck = await getDeck(parsed.data.date);
  if (!deck) return Response.json({ error: 'There is no board for that day.' }, { status: 404 });

  // The lens only sets who the answer is pitched to; an unknown one just means nobody.
  const choice = parseLens(parsed.data.lens, parsed.data.ai);
  const lensName = choice ? buildLens(deck, choice.key, choice.ai).name : null;

  const result = await ask(parsed.data.question, deck, lensName);
  return Response.json({ ...result, date: deck.date });
}
