-- StockPilot Daily — the deck store.
--
-- One row per trading day. `deck` holds the full validated DailyDeck exactly as
-- the spine produced it; that jsonb is the contract the video renders from, so
-- it is stored whole rather than shredded and reassembled. The scalar columns
-- beside it are denormalized for listing and filtering without loading every
-- deck, and the child tables exist so positions and tape can be queried ACROSS
-- days — "every time NVDA was a tier-1" is a question the jsonb alone answers
-- badly.
--
-- Security posture: RLS is on and there is NO anon policy. Nothing reads this
-- with the publishable key. The Next.js app queries server-side with the
-- service role, so the browser never receives a Supabase credential and this
-- research data is not one leaked key away from being public.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- daily_decks
-- ---------------------------------------------------------------------------

create table if not exists public.daily_decks (
  date              date primary key,
  source            text not null
                      check (source in ('local+notion', 'local', 'notion', 'fixture')),
  generated_at      timestamptz not null,

  thesis            text not null default '',
  buy_count         integer not null default 0 check (buy_count >= 0),
  watch_count       integer not null default 0 check (watch_count >= 0),
  skip_count        integer not null default 0 check (skip_count >= 0),
  screened_count    integer not null default 0 check (screened_count >= 0),
  universe_count    integer not null default 0 check (universe_count >= 0),
  unanswered_count  integer not null default 0 check (unanswered_count >= 0),
  rotations_flagged integer not null default 0 check (rotations_flagged >= 0),

  -- The full DailyDeck. Validated by Zod before it ever reaches this column.
  deck              jsonb not null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.daily_decks is
  'One StockPilot run per trading day. deck jsonb is the DailyDeck the video renders from.';
comment on column public.daily_decks.source is
  'Which sources produced this deck. Rendered on the video end card so a clip cannot imply Notion confirmed data it never held.';

create index if not exists daily_decks_date_desc_idx on public.daily_decks (date desc);
create index if not exists daily_decks_deck_gin_idx  on public.daily_decks using gin (deck jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- deck_positions — the allocation, queryable across days
-- ---------------------------------------------------------------------------

create table if not exists public.deck_positions (
  date         date not null references public.daily_decks (date) on delete cascade,
  ticker       text not null,
  tier         smallint not null check (tier between 1 and 3),
  position_pct numeric(6, 2) not null check (position_pct >= 0),
  sector       text,
  entry_note   text,
  stop_note    text,
  alpha_score  numeric(5, 2),
  time_horizon text,
  primary key (date, ticker)
);

create index if not exists deck_positions_ticker_idx on public.deck_positions (ticker, date desc);

-- ---------------------------------------------------------------------------
-- deck_tape — what scrolled that day, and the ticker UX's data source
-- ---------------------------------------------------------------------------

create table if not exists public.deck_tape (
  date       date not null references public.daily_decks (date) on delete cascade,
  ticker     text not null,
  ord        integer not null,
  price      numeric(12, 2),
  change_pct numeric(8, 2),
  verdict    text check (verdict in ('BUY', 'WATCH', 'SKIP')),
  primary key (date, ticker)
);

create index if not exists deck_tape_date_ord_idx on public.deck_tape (date, ord);

-- ---------------------------------------------------------------------------
-- deck_momentum — the ranked screen
-- ---------------------------------------------------------------------------

create table if not exists public.deck_momentum (
  date            date not null references public.daily_decks (date) on delete cascade,
  ticker          text not null,
  rank            integer not null,
  momentum_score  numeric(8, 2) not null,
  ret_21d         numeric(8, 2),
  ret_63d         numeric(8, 2),
  rs_excess_63d   numeric(8, 2),
  vol_surge       numeric(8, 2),
  pct_of_52w_high numeric(8, 2),
  last_close      numeric(12, 2),
  primary key (date, ticker)
);

create index if not exists deck_momentum_date_rank_idx on public.deck_momentum (date, rank);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists daily_decks_touch_updated_at on public.daily_decks;
create trigger daily_decks_touch_updated_at
  before update on public.daily_decks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security — deny by default, service role only.
-- ---------------------------------------------------------------------------

alter table public.daily_decks   enable row level security;
alter table public.deck_positions enable row level security;
alter table public.deck_tape      enable row level security;
alter table public.deck_momentum  enable row level security;

-- Deliberately no policies. The service role bypasses RLS; every other role
-- (anon, authenticated) is denied. If a public read-only dashboard is ever
-- wanted, add an explicit anon select policy here and understand that it makes
-- the allocations world-readable.

-- ---------------------------------------------------------------------------
-- Grants.
--
-- BYPASSRLS is NOT a table privilege: without these grants the service role
-- authenticates fine and then fails every statement with "permission denied
-- for table daily_decks". Granting explicitly here also keeps the migration
-- self-contained, rather than depending on whatever default privileges happen
-- to be configured on the target project.
--
-- anon and authenticated are deliberately granted nothing. RLS with no policy
-- already denies them; withholding the grant is the second lock.
-- ---------------------------------------------------------------------------

grant usage on schema public to service_role;

grant select, insert, update, delete on
  public.daily_decks,
  public.deck_positions,
  public.deck_tape,
  public.deck_momentum
to service_role;
