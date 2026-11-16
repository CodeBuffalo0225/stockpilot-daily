/**
 * Does the live board's HTML carry the deck for a given trading day?
 *
 * The only trustworthy sign is the day picker: it is built from the decks in the
 * deployment, one <option value="YYYY-MM-DD"> per deck. The date string appearing
 * anywhere else proves nothing - every deck embeds a UTC `generatedAt`, so a publish
 * after 7 pm New York stamps TOMORROW's date into the page. On 2026-11-13 that made the
 * morning run report `already_live` while the board still served the 11-12 deck.
 */
export function pageShowsDeck(html: string, date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (/No decks yet|Store error/.test(html)) return false;
  return new RegExp(`<option\\b[^>]*\\bvalue="${date}"`).test(html);
}
