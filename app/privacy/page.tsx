import type { Metadata } from 'next';
import Link from 'next/link';
import { DISCLAIMER } from '../../lib/public-list';

export const metadata: Metadata = {
  title: 'StockPilot Daily — privacy',
  description: 'What the StockPilot email list collects and what it does with it.',
};

export default function PrivacyPage() {
  return (
    <main className="wrap sub">
      <Link href="/" className="brand">
        STOCK<span>PILOT</span> DAILY
      </Link>

      <header className="sub__hero">
        <h1>Privacy</h1>
        <p className="sub__lede">Short version: your email address, used for one email a weekday, nothing else.</p>
      </header>

      <section className="sub__section">
        <h2>What I collect</h2>
        <p>
          Your email address, and whether you confirmed and opened the email. Buttondown runs the list and stores
          this for me. I don&apos;t ask for your name, your holdings or anything about your money, and the email
          is the same for everyone.
        </p>
      </section>

      <section className="sub__section">
        <h2>What I do with it</h2>
        <p>Send you the weekday StockPilot email. I don&apos;t sell it, rent it or hand it to anyone else.</p>
      </section>

      <section className="sub__section">
        <h2>Getting out</h2>
        <p>
          Every email has an unsubscribe link. One click and you&apos;re off. To have your address deleted, reply to
          any email and say so.
        </p>
      </section>

      <section className="sub__section">
        <h2>The board</h2>
        <p>
          The ask box on the board answers from the pipeline&apos;s own run. A question you type there is sent to
          an AI service (TypeSafe) to work out which part of the run it&apos;s about. It isn&apos;t tied to your
          email. Don&apos;t type anything personal into it.
        </p>
      </section>

      <footer className="sub__foot">
        <p>
          <b>Written by AI agents.</b> {DISCLAIMER}
        </p>
        <p>
          <Link href="/subscribe">Get the email</Link> · <Link href="/">Today&apos;s board</Link>
        </p>
      </footer>
    </main>
  );
}
