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

- 499 automated tests: rules, executor races, sessions, tools, the agent loop, production JSON serialization and the scripted demo.
- A 40-request evaluation through the real chat endpoint, with an auto-approver that approves and executes every card offered. Latest run: 40 / 40 correct, 0 unsafe actions proposed, shown or executed. The set covers questions, valid actions, actions that must be blocked, planted prompt injections and ambiguous requests ([`eval/cases.ts`](eval/cases.ts)).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

- `/demo` is a scripted walkthrough that needs no key.
- `/app` is live mode. Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`, `OPENAI_MODEL` and the two token prices.

With no `DATABASE_URL`, development uses an in-process Postgres seeded on first use. For a real database, set `DATABASE_URL` and run `npm run db:migrate && npm run db:seed`.

```bash
npm test
npm run typecheck
npm run lint
COIN_EVAL=1 npx vitest run eval/run.test.ts   # the evaluation (calls the model)
```

## Where things are

| Part | Path |
| --- | --- |
| Rule engine | [`src/server/rules`](src/server/rules) |
| Actions, sale planner and executor | [`src/server/actions`](src/server/actions) |
| Agent loop, prompt and spend caps | [`src/server/agent`](src/server/agent) |
| Read tools and charts | [`src/server/tools`](src/server/tools) |
| Sessions (one copy of the bank per visitor) | [`src/server/session`](src/server/session) |
| Interface | [`src/app`](src/app), [`src/components`](src/components) |
| Types, limits and seed facts | [`src/contracts.ts`](src/contracts.ts) |

Built with Next.js, Postgres and GPT-6 Luna. Model spending is capped at $0.50 a day and $5 in total.
