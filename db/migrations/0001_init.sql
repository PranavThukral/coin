-- COIN — initial schema.
-- All money is integer cents (bigint). See src/contracts.ts section 1.
-- Per-session tables are keyed (session_id, id) and cascade on session delete.
-- The template session '00000000-0000-4000-8000-000000000000' holds the seed
-- and never expires; clone_template() copies it for each visitor.

begin;

-- ---------------------------------------------------------------- sessions
-- Dates are live: the template is written against the seed anchor date
-- (2026-11-15); each session's copy is shifted by
--   date_offset_days = today_date - anchor
-- so "due in 3 days" stays true whatever day the visitor arrives.
create table sessions (
  id                uuid primary key,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  is_template       boolean not null default false,
  today_date        date not null,     -- Toronto calendar date at creation
  date_offset_days  integer not null,  -- today_date - seed anchor date
  ip_hash           text               -- sha256(ip + salt), for per-IP rate limits only
);
create index sessions_last_seen_idx on sessions (last_seen_at) where not is_template;

insert into sessions (id, is_template, today_date, date_offset_days)
  values ('00000000-0000-4000-8000-000000000000', true, date '2026-11-15', 0);

-- ---------------------------------------------------------------- global (not per session)
create table securities (
  ticker              text primary key check (ticker ~ '^[A-Z]{3,5}\.CX$'),
  name                text not null,
  kind                text not null check (kind in ('stock','etf')),
  sector              text not null,
  dividend_yield_bps  integer not null
);

create table prices (
  ticker       text not null references securities(ticker),
  date         date not null,
  close_cents  bigint not null check (close_cents > 0),
  primary key (ticker, date)
);

-- ---------------------------------------------------------------- per session
create table accounts (
  session_id               uuid not null references sessions(id) on delete cascade,
  id                       text not null,
  type                     text not null check (type in ('chequing','hisa','tfsa','rrsp','non_registered','credit_card')),
  name                     text not null,
  institution_label        text not null,
  mask                     char(4) not null,
  balance_cents            bigint not null,
  opening_balance_cents    bigint not null,
  limit_cents              bigint,
  statement_balance_cents  bigint,
  statement_due_date       date,
  interest_rate_bps        integer,
  primary key (session_id, id)
);

create table transactions (
  session_id         uuid not null references sessions(id) on delete cascade,
  id                 text not null,
  account_id         text not null,
  posted_on          date not null,
  amount_cents       bigint not null,
  merchant           text not null,
  description        text not null,          -- UNTRUSTED free text
  category           text not null,
  kind               text not null,
  transfer_group_id  text,
  action_id          uuid,
  primary key (session_id, id),
  foreign key (session_id, account_id) references accounts(session_id, id) on delete cascade
);
create index transactions_lookup_idx on transactions (session_id, account_id, posted_on);
create index transactions_date_idx on transactions (session_id, posted_on);

create table holdings (
  session_id      uuid not null references sessions(id) on delete cascade,
  account_id      text not null,
  ticker          text not null references securities(ticker),
  quantity        integer not null check (quantity >= 0),
  avg_cost_cents  bigint not null,
  primary key (session_id, account_id, ticker),
  foreign key (session_id, account_id) references accounts(session_id, id) on delete cascade
);

create table bills (
  session_id    uuid not null references sessions(id) on delete cascade,
  id            text not null,
  payee         text not null,               -- UNTRUSTED
  amount_cents  bigint not null check (amount_cents >= 0),  -- 0 = nothing due (e.g. card statement paid)
  due_date      date not null,
  recurrence    text not null check (recurrence in ('monthly','quarterly','annual','once')),
  category      text not null,
  saved         boolean not null,
  memo          text,                        -- UNTRUSTED
  primary key (session_id, id)
);

create table contacts (
  session_id  uuid not null references sessions(id) on delete cascade,
  id          text not null,
  name        text not null,                 -- UNTRUSTED
  email       text not null,
  saved       boolean not null,
  primary key (session_id, id)
);

create table room (
  session_id            uuid not null references sessions(id) on delete cascade,
  account_type          text not null check (account_type in ('tfsa','rrsp')),
  year                  integer not null,
  room_remaining_cents  bigint not null,
  primary key (session_id, account_type, year)
);

-- Coin's conversation. Rules 0 and 8 read the user's text from HERE, never
-- from what the model says the user said.
create table messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  parts       jsonb,                         -- charts and action cards shown with an assistant message
  created_at  timestamptz not null default now()
);
create index messages_session_idx on messages (session_id, created_at);

create table actions (
  id                            uuid primary key default gen_random_uuid(),
  session_id                    uuid not null references sessions(id) on delete cascade,
  request_message_id            uuid not null references messages(id) on delete cascade,
  type                          text not null check (type in ('transfer','bill_payment','etransfer','trade')),
  payload                       jsonb not null,  -- normalized Proposal; immutable after approval
  status                        text not null check (status in ('proposed','blocked','pending_undo','executed','cancelled')),
  checks                        jsonb not null,  -- CheckResult[] from the latest evaluation
  primary_message               text,
  requires_second_confirmation  boolean not null default false,
  second_confirmed_at           timestamptz,
  blocked_at_execution          boolean not null default false,
  created_at                    timestamptz not null default now(),
  approved_at                   timestamptz,
  execute_at                    timestamptz,
  executed_at                   timestamptz,
  cancelled_at                  timestamptz,
  check (status <> 'pending_undo' or (approved_at is not null and execute_at is not null)),
  check (status <> 'executed' or executed_at is not null)
);
create index actions_due_idx on actions (session_id, execute_at) where status = 'pending_undo';
create index actions_daily_idx on actions (session_id, created_at) where status in ('pending_undo','executed');

-- Immutability guard: once approved, the payload cannot change.
create or replace function actions_payload_immutable() returns trigger language plpgsql as $$
begin
  if old.approved_at is not null and new.payload is distinct from old.payload then
    raise exception 'action payload is immutable after approval';
  end if;
  return new;
end $$;
create trigger actions_payload_immutable before update on actions
  for each row execute function actions_payload_immutable();

create table audit_log (
  id          bigserial primary key,
  session_id  uuid not null references sessions(id) on delete cascade,
  at          timestamptz not null default now(),
  actor       text not null check (actor in ('user','coin','system')),
  event       text not null,   -- proposed, blocked, confirmed_recipient, approved, undone, executed, blocked_at_execution, expired
  action_id   uuid,
  detail      jsonb
);
create index audit_session_idx on audit_log (session_id, at);

-- ---------------------------------------------------------------- spend control (global)
create table usage_ledger (
  id             bigserial primary key,
  at             timestamptz not null default now(),
  day_toronto    date not null,
  session_id     uuid,          -- no FK: keep spend history after sessions expire
  ip_hash        text,
  model          text not null,
  input_tokens   integer not null,
  output_tokens  integer not null,
  cost_micro_usd bigint not null  -- 1 USD = 1,000,000
);
create index usage_day_idx on usage_ledger (day_toronto);

create table rate_events (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  session_id  uuid,
  ip_hash     text,
  kind        text not null check (kind in ('chat'))
);
create index rate_events_session_idx on rate_events (session_id, at);
create index rate_events_ip_idx on rate_events (ip_hash, at);

-- ---------------------------------------------------------------- per-visitor copy
-- Requires the sessions row to exist first (with today_date and offset set).
create or replace function clone_template(p_sid uuid) returns void language plpgsql as $$
declare
  t   uuid := '00000000-0000-4000-8000-000000000000';
  off integer;
  dy  integer;  -- year shift for contribution room
begin
  select date_offset_days into strict off from sessions where id = p_sid;
  dy := extract(year from date '2026-11-15' + off)::int - 2026;

  insert into accounts select p_sid, id, type, name, institution_label, mask, balance_cents, opening_balance_cents,
    limit_cents, statement_balance_cents, statement_due_date + off, interest_rate_bps from accounts where session_id = t;
  insert into transactions select p_sid, id, account_id, posted_on + off, amount_cents, merchant, description, category,
    kind, transfer_group_id, action_id from transactions where session_id = t;
  insert into holdings select p_sid, account_id, ticker, quantity, avg_cost_cents from holdings where session_id = t;
  insert into bills select p_sid, id, payee, amount_cents, due_date + off, recurrence, category, saved, memo from bills where session_id = t;
  insert into contacts select p_sid, id, name, email, saved from contacts where session_id = t;
  insert into room select p_sid, account_type, year + dy, room_remaining_cents from room where session_id = t;
end $$;

-- Prices are global (anchored); every session reads them shifted to its calendar.
create or replace function session_prices(p_sid uuid)
returns table (ticker text, date date, close_cents bigint) language sql stable as $$
  select p.ticker, p.date + s.date_offset_days, p.close_cents
  from prices p join sessions s on s.id = p_sid
$$;

commit;
