import type { Metadata } from 'next';
import Link from 'next/link';
import { buttondownEmbedUrl, DISCLAIMER } from '../../lib/public-list';

export const metadata: Metadata = {
  title: 'StockPilot Daily — the weekday email',
  description: '5 AI agents read the market news every morning. 3 strong signals a day, max. Free.',
};

// Copy locked in the 2026-10-27 handoff (stockpilot-public/handoff/HANDOFF.md).
// Buttondown requires a plain form POST to its embed endpoint — no fetch.
export default function SubscribePage() {
  const action = buttondownEmbedUrl();

  return (
    <main className="wrap sub">
      <Link href="/" className="brand">
        STOCK<span>PILOT</span> DAILY
      </Link>

      <header className="sub__hero">
        <h1>5 AI agents to read the market news every morning.</h1>
        <p className="sub__lede">
          3 strong signals a day, max. Plus <b>what it couldn&apos;t figure out</b>. Free. Weekdays.
        </p>

        {action ? (
          <form className="sub__form" action={action} method="post" target="_blank">
            <label htmlFor="sub-email" className="sr-only">
              Email address
            </label>
            <input id="sub-email" type="email" name="email" placeholder="you@email.com" required />
            <input type="hidden" name="tag" value="board-subscribe" />
            <button type="submit">Send it to me</button>
          </form>
        ) : (
          <p className="sub__closed" role="status">
            The list opens soon.
          </p>
        )}
        <p className="sub__fine">Unsubscribe anytime. You confirm by email before anything arrives.</p>
      </header>

      <section className="sub__section">
        <h2>How it works</h2>
        <ol className="sub__steps">
          <li>Pulls the news on my watchlist.</li>
          <li>Grills every story.</li>
          <li>Caps strong signals at 3. Hard-coded. No exceptions.</li>
          <li>Tells you what it couldn&apos;t answer.</li>
        </ol>
      </section>

      <section className="sub__section">
        <h2>Why it shows its gaps</h2>
        <p>Use this to start your research. Not to place a trade.</p>
        <p className="sub__byline">
          Travis Miragliotta · Lyndhurst, NJ ·{' '}
          <a href="https://www.linkedin.com/in/travis-miragliotta-9882aa100" rel="noopener noreferrer" target="_blank">
            LinkedIn
          </a>
        </p>
      </section>

      <footer className="sub__foot">
        <p>
          <b>Written by AI agents.</b> {DISCLAIMER}
        </p>
        <p>
          <Link href="/privacy">Privacy</Link> · <Link href="/">Today&apos;s board</Link>
        </p>
      </footer>
    </main>
  );
}
