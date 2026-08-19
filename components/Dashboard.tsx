'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Player } from '@remotion/player';
import { StockPilotDaily } from '../src/video/StockPilotDaily';
import { buildTimeline } from '../src/video/timing';
import type { DailyDeck } from '../src/spine/schema';
import { TickerRail } from './TickerRail';

const FPS = 30;

const pct = (n: number | null, digits = 1) =>
  n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;

const verdictVar = (v: string | null) =>
  v === 'BUY' ? 'var(--buy)' : v === 'WATCH' ? 'var(--watch)' : v === 'SKIP' ? 'var(--skip)' : 'var(--text-faint)';

export function Dashboard({
  deck,
  dates,
  store,
}: {
  deck: DailyDeck;
  dates: string[];
  store: { kind: string; label: string; detail: string };
}) {
  const router = useRouter();
  const [format, setFormat] = useState<'vertical' | 'landscape'>('vertical');
  const [selected, setSelected] = useState<string | null>(null);

  const duration = useMemo(() => buildTimeline(deck, FPS).total, [deck]);

  const dims =
    format === 'vertical' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };

  // Everything known about the clicked ticker, gathered from the three places
  // the deck describes it.
  const detail = useMemo(() => {
    if (!selected) return null;
    return {
      ticker: selected,
      tape: deck.tape.find((t) => t.ticker === selected) ?? null,
      position: deck.allocation.find((p) => p.ticker === selected) ?? null,
      momentum: deck.momentum.find((m) => m.ticker === selected) ?? null,
      watch: deck.watches.find((w) => w.ticker === selected) ?? null,
      skipped: deck.skips.includes(selected),
    };
  }, [selected, deck]);

  const total = Math.max(deck.counts.buy + deck.counts.watch + deck.counts.skip, 1);
  const maxMomentum = Math.max(...deck.momentum.map((m) => m.momentumScore), 1);

  return (
    <>
      <TickerRail items={deck.tape} selected={selected} onSelect={setSelected} />
      <TickerRail items={[...deck.tape].reverse()} reverse sub secondsPerItem={3.1} />

      <main className="wrap">
        <header className="head">
          <div>
            <div className="brand">
              STOCK<span>PILOT</span> DAILY
            </div>
            <div className="brand__sub">
              {deck.date} · {deck.counts.screened} screened · source {deck.source}
            </div>
          </div>

          <div className="toolbar" style={{ marginBottom: 0 }}>
            <span className="badge">
              <span
                className={`badge__dot${store.kind === 'local' ? ' badge__dot--warn' : ''}`}
                title={store.detail}
              />
              {store.label}
            </span>
            <select
              className="btn"
              value={deck.date}
              onChange={(e) => router.push(`/?date=${e.target.value}`)}
              aria-label="Trading day"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </header>

        <div className="grid">
          {/* ------------------------------------------------------ stage */}
          <section>
            <div className="toolbar">
              {(['vertical', 'landscape'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className="btn"
                  data-active={format === f}
                  onClick={() => setFormat(f)}
                >
                  {f === 'vertical' ? '1080×1920' : '1920×1080'}
                </button>
              ))}
              <span className="badge" style={{ marginLeft: 'auto' }}>
                {(duration / FPS).toFixed(1)}s · {duration} frames
              </span>
            </div>

            <div className="stage">
              <div className={`stage__inner${format === 'landscape' ? ' stage__inner--wide' : ''}`}>
                <Player
                  // Remounting on format change avoids the player retaining the
                  // previous aspect ratio's internal scale.
                  key={format}
                  component={StockPilotDaily}
                  inputProps={deck}
                  durationInFrames={duration}
                  fps={FPS}
                  compositionWidth={dims.width}
                  compositionHeight={dims.height}
                  style={{ width: '100%' }}
                  controls
                  doubleClickToFullscreen
                  acknowledgeRemotionLicense
                />
              </div>
            </div>

            {deck.thesis && (
              <div className="card">
                <h2 className="card__title">The read</h2>
                <p className="thesis">{deck.thesis}</p>
              </div>
            )}
          </section>

          {/* -------------------------------------------------------- rail */}
          <aside>
            {detail && (
              <div className="detail">
                <div className="detail__head">
                  <strong style={{ fontSize: 20, letterSpacing: 0.3 }}>{detail.ticker}</strong>
                  <span
                    className="tier"
                    style={{ color: verdictVar(detail.tape?.verdict ?? null) }}
                  >
                    {detail.tape?.verdict ?? (detail.skipped ? 'SKIP' : 'NOT SCORED')}
                  </span>
                  <button className="detail__x" onClick={() => setSelected(null)} aria-label="Close">
                    ×
                  </button>
                </div>
                <div className="note">
                  {detail.tape?.price != null && <>Last {detail.tape.price.toFixed(2)} · </>}
                  21d {pct(detail.tape?.changePct ?? null)}
                  {detail.momentum && (
                    <>
                      {' '}
                      · score {detail.momentum.momentumScore.toFixed(1)} · 63d{' '}
                      {pct(detail.momentum.ret63d, 0)}
                    </>
                  )}
                </div>
                {detail.position?.entryNote && (
                  <div className="note">
                    <span style={{ color: 'var(--buy)', fontWeight: 700 }}>ENTRY </span>
                    {detail.position.entryNote}
                  </div>
                )}
                {detail.position?.stopNote && (
                  <div className="note">
                    <span style={{ color: 'var(--skip)', fontWeight: 700 }}>STOP </span>
                    {detail.position.stopNote}
                  </div>
                )}
                {detail.watch?.note && <div className="note">{detail.watch.note}</div>}
              </div>
            )}

            <div className="card">
              <h2 className="card__title">The board</h2>
              <div className="stats">
                {(
                  [
                    ['BUY', deck.counts.buy, 'var(--buy)'],
                    ['WATCH', deck.counts.watch, 'var(--watch)'],
                    ['SKIP', deck.counts.skip, 'var(--skip)'],
                  ] as const
                ).map(([label, n, color]) => (
                  <div className="stat" key={label} style={{ borderColor: `${color}44` }}>
                    <div className="stat__n" style={{ color }}>
                      {n}
                    </div>
                    <div className="stat__l">{label}</div>
                  </div>
                ))}
              </div>
              <div className="split">
                <div style={{ width: `${(deck.counts.buy / total) * 100}%`, background: 'var(--buy)' }} />
                <div style={{ width: `${(deck.counts.watch / total) * 100}%`, background: 'var(--watch)' }} />
                <div style={{ width: `${(deck.counts.skip / total) * 100}%`, background: 'var(--skip)' }} />
              </div>
            </div>

            <div className="card">
              <h2 className="card__title">Allocation</h2>
              {deck.allocation.length === 0 && <div className="empty">No positions this day.</div>}
              {deck.allocation.map((p) => (
                <div className="row" key={p.ticker}>
                  <span className="row__t">{p.ticker}</span>
                  <span className="tier" style={{ color: 'var(--buy)' }}>
                    T{p.tier}
                  </span>
                  <span className="row__meta">{p.sector ?? ''}</span>
                  <span className="row__num" style={{ color: 'var(--buy)' }}>
                    {p.positionPct}%
                  </span>
                </div>
              ))}
            </div>

            <div className="card">
              <h2 className="card__title">Momentum</h2>
              {deck.momentum.length === 0 && <div className="empty">No momentum screen this day.</div>}
              {deck.momentum.map((m) => (
                <div className="row" key={m.ticker}>
                  <span className="row__t">{m.ticker}</span>
                  <span className="bar">
                    <span
                      className="bar__fill"
                      style={{ width: `${(m.momentumScore / maxMomentum) * 100}%` }}
                    />
                  </span>
                  <span className="row__num" style={{ color: (m.ret63d ?? 0) >= 0 ? 'var(--buy)' : 'var(--skip)' }}>
                    {pct(m.ret63d, 0)}
                  </span>
                </div>
              ))}
            </div>

            <div className="card">
              <h2 className="card__title">Rotation watch</h2>
              <div className="note" style={{ marginTop: 0 }}>
                {deck.rotations.flagged} flagged · {deck.unansweredCount} questions logged
              </div>
              {deck.rotations.suggestions.map((r) => (
                <div className="row" key={r.tickerOut}>
                  <span className="row__t" style={{ color: 'var(--skip)' }}>
                    {r.tickerOut}
                  </span>
                  <span className="row__meta">→</span>
                  <span className="row__t" style={{ color: 'var(--buy)' }}>
                    {r.topCandidate ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
