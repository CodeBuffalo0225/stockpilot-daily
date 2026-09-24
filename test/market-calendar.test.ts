/**
 * Market-calendar tests. The weekday publish skips closed days, so a wrong holiday either
 * publishes a board nobody can trade on or, worse, skips a real trading day. Pinned against
 * the NYSE's published 2026 and 2027 closures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nyseHolidays, marketClosedReason } from '../src/spine/market-calendar';

test('2026 closures match the NYSE calendar', () => {
  assert.deepEqual([...nyseHolidays(2026).keys()].sort(), [
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
    '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  ]);
});

test('2027 closures match the NYSE calendar, including Saturday holidays moved to Friday', () => {
  assert.deepEqual([...nyseHolidays(2027).keys()].sort(), [
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
    '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
  ]);
});

test('a Saturday New Year is not observed on the Friday before', () => {
  assert.equal(marketClosedReason('2021-12-31'), null);
  assert.equal(marketClosedReason('2022-12-26'), 'Christmas Day');
});

test('weekends are closed and ordinary weekdays are open', () => {
  assert.equal(marketClosedReason('2026-09-26'), 'weekend');
  assert.equal(marketClosedReason('2026-09-24'), null);
  assert.equal(marketClosedReason('2026-11-27'), null); // day after Thanksgiving: early close, still open
});
