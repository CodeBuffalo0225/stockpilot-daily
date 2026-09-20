'use client';

import { useState } from 'react';

/** What the answer is labelled with, so a reader always knows who is talking. */
const SOURCE_LABEL = {
  model: 'Answered by Claude, every figure checked against the board',
  engine: 'Answered from the board itself',
} as const;

const SUGGESTED = [
  'What did it buy, and how big?',
  'What would make it sell?',
  'What could it not verify?',
] as const;

interface Answer {
  answer: string;
  source: 'model' | 'engine';
  reason?: string;
}

export function AskBoard({ date, lens, ai }: { date: string; lens?: string; ai?: string | null }) {
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
          <p className="ask__text">{result.answer}</p>
          <p className="ask__source">
            {SOURCE_LABEL[result.source]}
            {result.source === 'engine' && result.reason === 'no_key' && ' · no model key on this deployment'}
          </p>
        </div>
      )}

      <p className="ask__fine">
        Answers describe what the pipeline did with its own book. Nothing here is advice about yours.
      </p>
    </div>
  );
}
