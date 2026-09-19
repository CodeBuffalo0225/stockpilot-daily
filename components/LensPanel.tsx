import type { LensView } from '../src/lens/lens';

/**
 * Today's deck read through one investor's profile. Purely presentational: the view
 * is built on the server from the validated deck, and nothing here computes a figure.
 */
export function LensPanel({ view, clearHref }: { view: LensView; clearHref: string }) {
  return (
    <section className="lens" aria-label={`Today's board through your profile: ${view.name}`}>
      <div className="lens__head">
        <span className="lens__eyebrow">Your lens</span>
        <a className="lens__clear" href={clearHref}>
          Clear
        </a>
      </div>
      <h2 className="lens__name">{view.name}</h2>
      <p className="lens__framing">{view.framing}</p>
      <ul className="lens__points">
        {view.points.map((p) => (
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
        Take the 15-question investor profile and this board reframes itself around how you actually
        invest.
      </span>
      <span className="lens-invite__go" aria-hidden="true">
        &rarr;
      </span>
    </a>
  );
}
