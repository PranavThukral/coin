# Design decisions

Companion to [`src/contracts.ts`](../src/contracts.ts) and [`db/migrations/0001_init.sql`](../db/migrations/0001_init.sql).

## Key decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Money | Integer cents everywhere (`*_cents`). Only the model speaks dollars; `normalizeProposal` converts | Float rounding bugs in a rule engine are the first thing anyone checking it will find |
| D2 | Action states | No separate `approved` state: approval goes straight to `pending_undo` | Approving always starts the undo window, so an `approved` state would never last more than a moment |
| D3 | Rule limits | Constants in `RULE_LIMITS`, not a database table | Limits are fixed for the demo; a table adds a read and a way to drift |
| D4 | Paying the credit card | A bill payment against the saved bill `bill_card`: money leaves chequing, the card's amount owed drops, and it counts toward the $5,000 daily limit (`DailyOutflow` keeps today's running total) | Matches how people think about paying a card |
| D5 | New e-transfer recipient | The email may be null when the action is proposed; a second confirmation step collects it from the user before Approve | The email must come from the user, never from data Coin read |
| D6 | Charts | The model names a `ChartSource`; server code computes every number | The model can't put a wrong number on a chart. It still chooses which charts to show, so the prompt has to guide that |
| D7 | Rule 4 buffer | A $500 floor on chequing; other cash accounts just can't go below $0 | The user-facing rule is about chequing; other accounts only need to stay non-negative |
| D8 | Dates | Live dates: the seed is written against `SEED_ANCHOR_DATE`, and each session shifts every date by `today − anchor` when it is cloned (prices on read). Canned text uses `{d+N}` tokens. A session that outlives its Toronto day is replaced | "Due in 3 days" is true whenever someone opens it, and every planted case keeps working |
| D9 | Per-visitor data | One template session copied per visitor by `clone_template()`; rows keep the same ids in every copy | The demo, tests and eval can name `acc_chequing` and `bill_rent` directly |
| D10 | Tickers | A `.CX` suffix on an invented exchange | No real ticker can collide |
| D11 | Rule 1 scope | `TRANSFER_MATRIX`: no RRSP withdrawals, no card cash advances | Both are risky in the real world and not needed for the demo |
| D12 | Model id and prices | Read from `OPENAI_MODEL` and the price env vars | Nothing hardcodes a model id or price that might be wrong |

## How a request flows

```
user text ──► stored in messages (rules 0 and 8 read THIS copy)
          ──► model loop (≤6 tool steps) ── read tools ──► untrusted-wrapped JSON
                                         ── render_chart ─► server computes ChartPayload
                                         ── propose_action (ModelProposal, strict JSON)
                                                │
                                   normalizeProposal ─ malformed ─► blocked
                                                │
                                   evaluateRules (pure, 9 checks) ─ fail ─► blocked card + max passing amount
                                                │
                                   proposed card ─► (R3: confirm recipient email) ─► Approve
                                                │
                                   pending_undo, execute_at = now + 60s ─► Undo ─► cancelled
                                                │
                     next request from this session, or Execute now
                                                │
                     settle: lock rows, re-run evaluateRules, one conditional
                     UPDATE pending_undo → executed | blocked
```

## Seed facts the demo depends on

All in contracts section 3, with a test for each in `src/contracts.test.ts`:

(Dates below are anchor dates; visitors see them shifted to today.)

- Chequing $2,840.12, card owes $4,912.38 due in 9 days: "pay my card in full" fails rule 4 (Coin offers $2,340.12) and still fails after the demo's $2,000 move.
- Rent $2,350 on Dec 1 plus the card overdraws chequing before the Dec 4 pay.
- NRTH.CX is about 32.9% of invested holdings; no other ticker is above 30%.
- TFSA room $3,500, smaller than a $5,000 ask.
- Streamly Premium went from $16.99 to $22.99 on Oct 3.
- Injection surfaces: the refund description (demo scenario 8), a laundry description, a gym bill memo and a contact name.
- "Alex" is not a contact. The parking permit is the only unsaved bill.
