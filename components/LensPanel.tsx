import type { LensView } from '../src/lens/lens';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-17" -> "Sep 17". Parsed by hand so a timezone can never move the day. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1] ?? ''} ${d}`;
}

/**
 * Today's deck read through one investor's profile. Purely presentational: the view
 * is built on the server from the validated deck, and nothing here computes a figure.
 *
 * COMPACT BY DESIGN. The first version spent a whole phone screen on four bullets and
 * two callouts before a single stock appeared, and lost a blind pick in both orderings
 * for it. Now the lens is a header - who you are and one line of framing - and the notes
 * sit one tap away. The day's counts are not repeated here: the calls card directly
 * below already leads with them. The disclaimer stays visible: it is the boundary
 * between publishing calls and giving advice, and a boundary nobody can see is not one.
 */
export function LensPanel({
  view,
  clearHref,
  date,
}: {
  view: LensView;
  clearHref: string;
  date: string;
}) {
  // The first point is the one each archetype leads with; it shows without a tap.
  // Round 2 lost partly because the frame promised to explain the board and then hid
  // every word of the explanation behind a disclosure.
  const [lead, ...rest] = view.points;
  const notes = rest.length + 1 + (view.aiNote ? 1 : 0);
  return (
    <section className="lens" aria-label={`Today's board through your profile: ${view.name}`}>
      <div className="lens__head">
        <span className="lens__eyebrow">Your lens · {shortDate(date)}</span>
        <a className="lens__clear" href={clearHref}>
          Clear
        </a>
      </div>
      <h2 className="lens__name">{view.name}</h2>
      <p className="lens__framing">{view.framing}</p>
      {lead && <p className="lens__lead">{lead}</p>}

      <details className="lens__more">
        <summary>
          More notes for {view.name.replace(/^The /, 'the ')}
          <span className="lens__more-n">{notes}</span>
        </summary>
        <ul className="lens__points">
          {rest.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="lens__callout">
          <span className="lens__label">Watch for</span>
          {view.caution}
        </p>
        {view.aiNote && (
          <p className="lens__callout lens__callout--ai">
            <span className="lens__label">AI</span>
            {view.aiNote}
          </p>
        )}
      </details>

      <p className="lens__fine">{view.disclaimer}</p>
    </section>
  );
}

/** Shown with no lens active, and only when there is a quiz to send people to. */
export function LensInvite({ quizUrl }: { quizUrl: string }) {
  return (
    <a className="lens-invite" href={quizUrl}>
      <span className="lens__eyebrow">Read this your way</span>
      <span className="lens-invite__text">
        Take the investor profile quiz and this board reframes itself around how you actually
        invest.
      </span>
      <span className="lens-invite__go" aria-hidden="true">
        &rarr;
      </span>
    </a>
  );
}
