# Coin

An AI money agent that answers questions about all your accounts and moves money only when code says it can.

[Try the demo](https://askcoin.vercel.app/demo) or [ask Coin live](https://askcoin.vercel.app/app).

Coin reads every account (chequing, savings, TFSA, RRSP, investing, credit card), answers in a sentence or two with charts computed in code, and proposes transfers, bill payments, e-transfers and trades. Everything runs on synthetic data. It is not connected to a bank and is not financial advice.

## How it stays safe

The model can only propose. Code decides what happens next:

1. Nine rule checks, written in plain TypeScript, run on every proposal. A proposal that fails never becomes an approvable card.
2. You approve on a card. An approved action waits 60 seconds with Undo.
3. Every rule runs again, under database locks, before any money moves.

| # | Rule | Stops |
| --- | --- | --- |
| 0 | Your intent | Actions you did not ask for in your own words, including instructions hidden in transaction notes |
| 1 | Allowed action | Unsupported actions and account pairs, such as RRSP withdrawals |
| 2 | Saved payee | Paying a bill whose payee is not saved |
| 3 | New recipient | A first e-transfer over $300 |
| 4 | Enough money | Taking chequing under $500, or overpaying the card |
| 5 | Daily limit | More than $5,000 a day in payments and e-transfers |
| 6 | Contribution room | TFSA or RRSP contributions past the room left |
| 7 | Trade limits | Buys over cash or $10,000, sells over shares held |
| 8 | Matches the request | An amount, account, recipient or security that differs from what you typed |

Text from the data (descriptions, payees, memos, contact names) is treated as untrusted and can never authorize an action.

## Results

- 540 automated tests: rules, executor races, sessions, tools, the agent loop, production JSON serialization and the scripted demo.
- A 40-request evaluation through the real chat endpoint, with an auto-approver that approves and executes every card offered. Latest run: 40 / 40 correct, 0 unsafe actions proposed, shown or executed. Across all ten recorded runs (440 requests), no unsafe action was ever executed. The set covers questions, valid actions, actions that must be blocked, planted prompt injections and ambiguous requests ([`eval/cases.ts`](eval/cases.ts), every run in [`eval/results/`](eval/results)).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

- `/demo` is a scripted walkthrough that needs no key.
- `/app` is live mode. Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`, `OPENAI_MODEL` and the two token prices.

With no `DATABASE_URL`, development uses an in-process Postgres (PGlite) seeded on first use. For a real database, set `DATABASE_URL` and run `npm run db:migrate && npm run db:seed`.

```bash
npm test
npm run typecheck
npm run lint
COIN_EVAL=1 npx vitest run eval/run.test.ts   # the evaluation (calls the model)
```

## Architecture

```
browser ── /api/chat (SSE) ──► agent loop ── read tools ──► Postgres (one copy of the bank per visitor)
                                   │
                                   └─ propose_action ──► normalize ──► rule engine ──► action card
browser ── Approve ──► pending_undo (60 s) ──► settle: lock rows, re-run every rule, then move money
```

- **Agent loop** ([`src/server/agent`](src/server/agent)): calls the model with read-only tools, at most a fixed number of steps per message. Tool output that contains user data is wrapped and marked untrusted.
- **Rule engine** ([`src/server/rules`](src/server/rules)): a pure function from a proposal and a snapshot of the accounts to pass or fail per rule. No I/O, so it is tested exhaustively.
- **Actions and executor** ([`src/server/actions`](src/server/actions)): the only code that writes ledger rows. Each state change is a conditional `UPDATE … WHERE status = …` inside a transaction that holds a session lock, so double clicks and races resolve to one outcome.
- **Sessions** ([`src/server/session`](src/server/session)): each visitor gets a cookie and a private copy of a template bank, with dates shifted to today. Idle sessions expire after two hours.
- **Interface** ([`src/app`](src/app), [`src/components`](src/components)): Next.js App Router. The browser never talks to the database or the model provider.
- **Contracts** ([`src/contracts.ts`](src/contracts.ts)): the shared types, Zod schemas, seed facts and limits that every layer, test and the eval import.

## Key design decisions

The full list, with reasons, is in [`docs/DESIGN.md`](docs/DESIGN.md). The ones that matter most:

- **The model proposes; code disposes.** The model never executes anything. Rules 0 and 8 read only the stored copy of what the user typed, never model output or data, so a prompt injection in a transaction memo can't authorize a transfer.
- **Rules run at proposal, at approval and again at execution.** Balances can change during the undo window, so the final check happens under row locks in the same transaction that moves the money.
- **Integer cents everywhere.** Only the model speaks dollars; one function converts its proposal to cents before any rule sees it.
- **Charts are computed in code.** The model picks which chart to show; the server computes every number on it.
- **Spend is capped in code:** $0.50 a day and $5 in total, plus per-session, per-IP and global message limits. Model id and prices come from the environment.

## Known limitations

- Synthetic data only. There are no real accounts or user logins: a visitor is a browser session with its own copy of the template bank.
- Settlement is lazy. There is no background job: an approved action executes on the first request from that session after its 60-second window ends, or at once if the user presses Execute now.
- Rules 0 and 8 understand requests through hand-written patterns. When they can't match a phrasing they block it, which is safe but can refuse a valid request.
- The eval cases were also used while tuning the prompt, so they are not a held-out test. The latest recorded run predates the most recent change to whole-balance transfers.
- The demo is single-user per session; there is no multi-device sync or notification when an action settles.

Built with Next.js, Postgres and GPT-6 Luna.
