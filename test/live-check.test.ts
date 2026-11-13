/**
 * Live-check tests. The publish script skips the deploy when the board already shows the
 * day, so a false "yes" here leaves yesterday's deck up and logs it as a success.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageShowsDeck } from '../src/ops/live-check';

const picker = (...days: string[]) =>
  `<select class="btn" aria-label="Trading day">${days
    .map((d, i) => `<option value="${d}"${i === 0 ? ' selected=""' : ''}>${d}</option>`)
    .join('')}</select>`;

test('a day in the picker is live', () => {
  const html = picker('2026-11-12', '2026-11-11');
  assert.equal(pageShowsDeck(html, '2026-11-12'), true);
  assert.equal(pageShowsDeck(html, '2026-11-11'), true);
});

test("a UTC generatedAt carrying tomorrow's date is not a deck (2026-11-13 regression)", () => {
  const html =
    picker('2026-11-12', '2026-11-11') +
    '{"date":"2026-11-12","source":"local+notion","generatedAt":"2026-11-13T01:38:46.612Z"}';
  assert.equal(pageShowsDeck(html, '2026-11-13'), false);
  assert.equal(pageShowsDeck(html, '2026-11-12'), true);
});

test('the date in prose or a placeholder is not a deck', () => {
  const html = picker('2026-11-12') + '<input placeholder="Ask about 2026-11-13…"><span>Brief · 2026-11-13</span>';
  assert.equal(pageShowsDeck(html, '2026-11-13'), false);
});

test('an empty or broken board is never live', () => {
  assert.equal(pageShowsDeck('No decks yet' + picker('2026-11-13'), '2026-11-13'), false);
  assert.equal(pageShowsDeck('Store error' + picker('2026-11-13'), '2026-11-13'), false);
  assert.equal(pageShowsDeck('', '2026-11-13'), false);
});

test('a malformed date never matches', () => {
  assert.equal(pageShowsDeck(picker('2026-11-13'), '.*'), false);
  assert.equal(pageShowsDeck(picker('2026-11-13'), ''), false);
});
