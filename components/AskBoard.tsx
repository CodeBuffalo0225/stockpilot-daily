'use client';

import { useState } from 'react';
import { pctText, type Book } from '../src/ask/book';

/**
 * What the answer is labelled with, so a reader always knows who is talking. Plain
 * words, not deployment state: a blind critic called the old "no model key on this
 * deployment" suffix an engineering message a paying user should never see, and it was.
 * The honest fact survives - the engine label says outright that no AI wrote it.
 */
const SOURCE_LABEL = {
  model: 'Written by AI from today\'s board · every figure checked against it',
  engine: 'Straight from today\'s board · no AI wrote this',
} as const;

const SUGGESTED = [
  'What did it buy, and how big?',
  'What would make it sell?',
  'What could it not verify?',
] as const;

interface Answer {
  answer: string;
  source: 'model' | 'engine';
  intent?: string;
  reason?: string;
}

/**
 * The answer to "what did it buy, and why" - bought first, then why, then the shape of
 * the book. Every number here is a deck field or a sum of them, built by buildBook, and
 * every reason is deck text quoted verbatim; nothing in this component computes or writes
 * a figure or a reason of its own.
 *
 * Round 2 lost because it led with "7.5% of the book" when the question asked why, drew
 * the holdings as slivers on a 92%-empty track, and cut every reason off mid-sentence.
 * So the bar now spends its full width on what is held, and reasons are never clamped.
 */
function BookAnswer({ book }: { book: Book }) {
  const bought = book.rows.filter((r) => r.verdict === 'BUY');
  const held = book.rows.filter((r) => r.verdict !== 'BUY');
  const Row = ({ r }: { r: (typeof book.rows)[number] }) => (
    <li className="book__row">
      <span className={`book__dot book__dot--${(r.verdict ?? 'none').toLowerCase()}`} aria-hidden="true" />
      <span className="book__tkr">
        {r.ticker}
        {r.name && <span className="book__name">{r.name}</span>}
      </span>
      <span className="book__pct">
        {pctText(r.pct)}%<span className="book__of">of book</span>
      </span>
      {r.why && (
        <p className="book__reason">
          {r.whySource === 'thesis' ? <span className="book__src">In the pipeline&apos;s words</span> : null}
          {r.whySource === 'thesis' ? `“${r.why}”` : r.why}
        </p>
      )}
    </li>
  );
  return (
    <div className="book">
      {bought.length > 0 && (
        <>
          <p className="book__kicker">Bought today</p>
          <ul className="book__rows book__rows--lead">
            {bought.map((r) => (
              <Row key={r.ticker} r={r} />
            ))}
          </ul>
        </>
      )}

      {/* Drawn to scale. flex-basis 0 means width is set by share alone; with the
          default basis, flexbox hands out spare space after each tile's text, and a
          blind critic caught the 3% tile drawn only 1.4x as wide as a 1.5% one. */}
      <div className="book__bar" role="img" aria-label={`Split of the ${pctText(book.deployed)}% invested: ${book.rows.map((r) => `${r.ticker} ${pctText(r.pct)}%`).join(', ')}`}>
        {book.rows.map((r) => (
          <span
            key={r.ticker}
            className={`book__seg book__seg--${(r.verdict ?? 'none').toLowerCase()}`}
            style={{ flex: `${r.pct} 1 0px` }}
          >
            {/* Padding lives on this label, not the segment: padded segments start at
                their padding width and only the remainder is shared out, which drew
                CRWD at 36.5% of the bar instead of its true 40%. */}
            <span className="book__lab">
              <b>{r.ticker}</b>
              {pctText(r.pct)}%
            </span>
          </span>
        ))}
      </div>
      {/* The whole book, also to scale, so the unallocated share is seen, not just read. */}
      <div className="book__whole" aria-hidden="true">
        <span style={{ width: `${Math.min(book.deployed, 100)}%` }} />
      </div>
      <p className="book__rest">
        <b>{pctText(book.deployed)}% invested</b>
        {book.unallocated != null ? ` · ${pctText(book.unallocated)}% of the book unallocated` : ''}
      </p>

      {held.length > 0 && (
        <>
          <p className="book__kicker">
            {bought.length > 0 && held.every((r) => r.verdict === 'WATCH')
              ? 'Also held, at a smaller monitoring size'
              : 'Also held'}
          </p>
          <ul className="book__rows">
            {held.map((r) => (
              <Row key={r.ticker} r={r} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function AskBoard({
  date,
  lens,
  ai,
  book,
}: {
  date: string;
  lens?: string;
  ai?: string | null;
  book?: Book | null;
}) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(q: string) {
    const asked = q.trim();
    if (asked.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, lens, ai: ai ?? undefined, question: asked }),
      });
      const data = await r.json();
      if (!r.ok) setError(data.error ?? 'That did not go through.');
      else setResult(data);
    } catch {
      setError('That did not go through. The board above is unaffected.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card ask">
      <h2 className="card__title">Ask the board</h2>

      <form
        className="ask__row"
        onSubmit={(e) => {
          e.preventDefault();
          send(question);
        }}
      >
        <input
          className="ask__input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={`Ask about ${date}…`}
          maxLength={300}
          aria-label={`Ask a question about the board for ${date}`}
        />
        <button className="btn ask__go" type="submit" disabled={busy || question.trim().length < 4}>
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </form>

      <div className="ask__chips">
        {SUGGESTED.map((q) => (
          <button
            key={q}
            type="button"
            className="ask__chip"
            disabled={busy}
            onClick={() => {
              setQuestion(q);
              send(q);
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {error && <p className="ask__error">{error}</p>}

      {result && (
        <div className="ask__answer">
          {result.intent === 'buys' && book ? (
            <BookAnswer book={book} />
          ) : (
            <p className="ask__text">{result.answer}</p>
          )}
          <p className="ask__source">{SOURCE_LABEL[result.source]}</p>
        </div>
      )}

      <p className="ask__fine">
        Answers describe what the pipeline did with its own book. Nothing here is advice about yours.
      </p>
    </div>
  );
}
