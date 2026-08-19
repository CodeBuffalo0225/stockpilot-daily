import { getDeck, listDecks, describeStore } from '../src/spine/store';
import { Dashboard } from '../components/Dashboard';

// Server component. The Supabase service role never leaves this boundary — the
// deck arrives at the client as plain validated JSON, and no credential does.
export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const store = describeStore();

  let deck = null;
  let summaries: Awaited<ReturnType<typeof listDecks>> = [];
  let error: string | null = null;

  try {
    [deck, summaries] = await Promise.all([getDeck(date), listDecks()]);
  } catch (err) {
    error = (err as Error).message;
  }

  if (error) {
    return (
      <main className="wrap">
        <div className="brand">
          STOCK<span>PILOT</span> DAILY
        </div>
        <div className="card" style={{ marginTop: 24, borderColor: 'var(--skip)' }}>
          <h2 className="card__title">Store error — {store.label}</h2>
          <p className="note">{error}</p>
        </div>
      </main>
    );
  }

  if (!deck) {
    return (
      <main className="wrap">
        <div className="brand">
          STOCK<span>PILOT</span> DAILY
        </div>
        <div className="card" style={{ marginTop: 24 }}>
          <h2 className="card__title">No decks yet — {store.label}</h2>
          <p className="note">
            Run <code>npm run sync</code> to pull a deck from the pipeline, or set
            SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to read from the database.
          </p>
        </div>
      </main>
    );
  }

  // Keyed on the date so switching days resets client state — otherwise a
  // ticker selected on one day stays open on the next, where it may not exist.
  return (
    <Dashboard
      key={deck.date}
      deck={deck}
      dates={summaries.map((s) => s.date)}
      store={store}
    />
  );
}
