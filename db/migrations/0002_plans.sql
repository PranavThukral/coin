-- Coin, migration 0002: actions built by the server's sale planner.
--
-- 'message': the model proposed it from one user message (rules 0 and 8 read
--            that message).
-- 'plan':    planner code chose the holdings and share counts after the user
--            asked for a sale without naming them (rules 0 and 8 check the
--            user's recent messages for that request instead).
alter table actions
  add column origin text not null default 'message' check (origin in ('message', 'plan'));
