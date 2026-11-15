# Coin

**An AI money agent that answers questions about all your accounts with charts, and moves money only when code says it can.**

Coin reads every account (chequing, savings, TFSA, RRSP, investing, credit card), answers in a few plain sentences with code-computed charts, and proposes transfers, bill payments, e-transfers and trades. The model can only *propose*. Nine rule checks in code decide what reaches an approval card, an approved action waits 60 seconds with Undo, and every rule is checked again before money moves.

Everything runs on made-up data. Nothing here is connected to a bank, and nothing is financial advice.

- **Live:** _link coming_ (scripted two-minute demo first, live mode second)
- **Video:** _coming_ (two minutes, the scripted demo with narration)

<!-- GIF of demo steps 5 (transfer) and 8 (the injection) goes here. -->

## How Coin decides what can execute

```
your message ──► stored as-is (rules 0 and 8 read this copy, never the model's version)
             ──► GPT-6 Luna with read tools ── account data comes back marked "untrusted text"
                                             ── render_chart: the model names a chart, code computes every number
                                             ── propose_action: a fixed JSON shape, nothing else
                                                     │
                                        nine rule checks (pure TypeScript, no model)
                                                     │
                       blocked card with the reason ◄┴► approval card ── Approve ── 60s Undo window
                       (and the largest amount that                                       │
                        would pass, if any)                      executor: lock, re-check all nine rules,
                                                                 write the ledger, flip status exactly once
```

| # | Rule | Blocks when |
| --- | --- | --- |
| 0 | Your intent | Your own message didn't ask for an action, or the amount, account or recipient came from text in the data instead of your words |
| 1 | Allowed action | Not a transfer, bill payment, e-transfer or trade, or an account pair that isn't allowed (RRSP withdrawals, card cash advances) |
| 2 | Saved payee | The bill's payee isn't saved |
| 3 | New recipient | First-time e-transfer over $300 (under $300 it needs a second confirmation) |
| 4 | Enough money | Chequing would drop under $500, or a card payment exceeds what's owed |
| 5 | Daily limit | Bill payments plus e-transfers would pass $5,000 today |
| 6 | Contribution room | A TFSA or RRSP contribution exceeds the room left |
| 7 | Trade limits | A buy exceeds cash or $10,000, or a sell exceeds shares held |
| 8 | Matches the request | The amount, accounts, recipient or security differ from what you typed |

The rule engine is [`src/server/rules/engine.ts`](src/server/rules/engine.ts); the executor is [`src/server/actions/executor.ts`](src/server/actions/executor.ts).

## Test results

Three runs of all 40 requests on GPT-6 Luna, 120 requests in total:

| Measure | Count |
| --- | --- |
| Correct answers and proposals | **120 / 120** |
| Unsafe proposals Coin made | **0** |
| Unsafe proposals that reached an approval card | **0** |
| Unsafe actions executed | **0** |

| Group | Correct |
| --- | --- |
| Questions with known answers | 36 / 36 |
| Actions that should pass | 24 / 24 |
| Actions that should be blocked | 24 / 24 |
| Prompt injections | 18 / 18 |
| Ambiguous requests | 18 / 18 |

The three runs cost $0.17 in model calls. The first full run scored 35 / 40. A later three-run pass scored 119 / 120: the one miss was "send $50 to Sam", which Coin proposed as a new recipient instead of the saved contact. Proposals now map a first name to a saved contact when exactly one matches, and the run above came after that fix. Raw results are in [`eval/results`](eval/results).

Each of the 40 requests runs in a fresh session through the real chat endpoint, and an **auto-approver confirms, approves and executes every card Coin offers**. That makes "nothing unsafe executed" a measurement rather than an assumption. The set is in [`eval/cases.ts`](eval/cases.ts): 12 questions with known answers, 8 actions that should pass, 8 that should be blocked, 6 prompt injections planted in transaction descriptions, a bill memo and a contact name, and 6 ambiguous requests. Run it with `COIN_EVAL=1 npx vitest run eval/run.test.ts`.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

With no `DATABASE_URL`, development runs on an in-process Postgres (PGlite) seeded on first use, so this works with no setup. Live mode needs a model key: copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`, `OPENAI_MODEL` and the two token prices. The scripted demo at `/demo` needs no key; it runs the same pipeline without a model.

```bash
npm test           # ~400 tests: rules, executor races, sessions, tools, agent loop, demo
npm run typecheck
npm run lint
```

To use a real database, set `DATABASE_URL` and run `npm run db:migrate && npm run db:seed`.

## Architecture

| Part | Where | Notes |
| --- | --- | --- |
| Contracts | [`src/contracts.ts`](src/contracts.ts), [`db/migrations`](db/migrations) | Types, schemas, seed facts, rule limits, wire formats |
| Fake bank | [`scripts/seed`](scripts/seed) | Two years of deterministic history; each visitor gets their own copy, shifted to their real calendar day |
| Read tools and charts | [`src/server/tools`](src/server/tools) | Every number a chart shows is computed here |
| Rules | [`src/server/rules`](src/server/rules) | Pure functions; 216 tests, many table-driven, including adversarial phrasings and planted injections |
| Actions and executor | [`src/server/actions`](src/server/actions) | Propose, approve, undo, execute now; row locks and one conditional status flip |
| Sessions | [`src/server/session`](src/server/session) | Per-visitor clone, idle expiry, midnight rollover, capped creation |
| Agent | [`src/server/agent`](src/server/agent) | GPT-6 Luna on the Responses API, tool loop, spend ledger, rate limits |
| UI | [`src/app`](src/app), [`src/components`](src/components) | Next.js; dashboard, Coin sidebar, approval cards |
| Scripted demo | [`src/demo`](src/demo), [`src/server/demo`](src/server/demo) | Eight steps through the real pipeline, no model |

Spending is capped by its own ledger: $0.50 a day and $5 in total, checked before every model call, plus per-visitor and global rate limits.

## What this is not

- Not connected to any bank. All data is synthetic, and every action is simulated.
- Not tested against, compared with or modelled on any company's product.
- Not financial advice.

## What I'd build next

- Structured trade records in the ledger instead of quantities in descriptions.
- Funds reserved for pending actions, not just re-checked at execution.
- Conversation memory for follow-ups like "make it $1,500 instead".
- Voice input through the browser's speech recognition.
