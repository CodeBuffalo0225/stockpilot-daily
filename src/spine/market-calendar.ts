// NYSE full-day closures, computed from the exchange's rules rather than a pasted list,
// so the calendar never silently runs out at the end of a year.
//
// Early closes (1 pm) are not here: the board publishes before the open, so a half day
// is still a trading day. Unscheduled closures (national mourning, 2012's hurricane) cannot
// be computed; add them to AD_HOC_CLOSURES when the exchange announces one.

const AD_HOC_CLOSURES = new Set<string>([]);

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

// nth weekday (0 = Sun) of a month; n = -1 for the last one.
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = dow(y, m, 1);
    return iso(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return iso(y, m, lastDay - ((dow(y, m, lastDay) - weekday + 7) % 7));
}

// Saturday holidays move to Friday, Sunday holidays to Monday.
function observed(y: number, m: number, d: number): string {
  const w = dow(y, m, d);
  const t = new Date(Date.UTC(y, m - 1, d + (w === 6 ? -1 : w === 0 ? 1 : 0)));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
function goodFriday(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const t = new Date(Date.UTC(y, month - 1, day - 2));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function nyseHolidays(y: number): Map<string, string> {
  const h = new Map<string, string>();
  // NYSE does not close the Friday before when Jan 1 falls on a Saturday.
  if (dow(y, 1, 1) !== 6) h.set(observed(y, 1, 1), "New Year's Day");
  h.set(nthWeekday(y, 1, 1, 3), 'Martin Luther King Jr. Day');
  h.set(nthWeekday(y, 2, 1, 3), "Washington's Birthday");
  h.set(goodFriday(y), 'Good Friday');
  h.set(nthWeekday(y, 5, 1, -1), 'Memorial Day');
  if (y >= 2022) h.set(observed(y, 6, 19), 'Juneteenth');
  h.set(observed(y, 7, 4), 'Independence Day');
  h.set(nthWeekday(y, 9, 1, 1), 'Labor Day');
  h.set(nthWeekday(y, 11, 4, 4), 'Thanksgiving Day');
  h.set(observed(y, 12, 25), 'Christmas Day');
  return h;
}

// Why the market is closed on a YYYY-MM-DD date, or null when it opens.
export function marketClosedReason(date: string): string | null {
  const [y, m, d] = date.split('-').map(Number);
  const w = dow(y, m, d);
  if (w === 0 || w === 6) return 'weekend';
  if (AD_HOC_CLOSURES.has(date)) return 'exchange closure';
  return nyseHolidays(y).get(date) ?? null;
}
