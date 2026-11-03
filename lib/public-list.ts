// Public subscriber list settings shared by /subscribe and /privacy.
//
// NEXT_PUBLIC_BUTTONDOWN_EMBED_URL is the full `action` URL from Buttondown →
// Settings → Embedding. It is read, never guessed: unset means the list is not
// open yet and the page says so instead of rendering a form that posts nowhere.

export const DISCLAIMER =
  "Not investment advice. Same email goes to everyone. It doesn't know your finances. " +
  'AI gets stuff wrong. Do your own homework. I may own what it mentions.';

export function buttondownEmbedUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_BUTTONDOWN_EMBED_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname.endsWith('buttondown.com') ? url.toString() : null;
  } catch {
    return null;
  }
}
