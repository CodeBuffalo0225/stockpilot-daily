# ask — NO BAR YET

Perplexity was the intended bar for the ask panel. It is behind a Cloudflare bot
check, which this harness now refuses to capture: `REJECTED-cloudflare-wall.png` is
what came back. Bypassing bot detection is not on the table, so this bar has to come
from somewhere else.

**Do not run a blind round for `ask` until a real bar is here.** A critic comparing
our panel against a CAPTCHA page picks ours every time, and the loop would be
grading itself — the exact failure the method exists to prevent.

Options, in order of preference:
1. A 390x844 screenshot of Robinhood's own Learn / answer surface, taken on the phone.
2. Any shipped answer-with-sources surface that captures without a wall.
3. The skill's fallback: generated target stills — but Travis approves them first,
   because an agent approving its own targets is self-grading by proxy.
