# Contracts: decisions and reasons

Companion to `src/contracts.ts` and `db/migrations/0001_init.sql`. Version 1.0.0, Nov 13 2026.

## Where this differs from the build brief (approve or change)

| # | Brief said | Contract does | Why |
|---|---|---|---|
| D1 | Fields named `amount_cad`, `balance_cad` | Integer cents everywhere (`*_cents`); the model alone speaks dollars and `normalizeProposal` converts | Float money bugs in a rule engine are exactly what a founder will find |
| D2 | Status `approved` | Folded into `pending_undo` | Approving always starts the undo window, so a separate state never exists for more than a moment |
| D3 | `rules_config` table | Constants in `RULE_LIMITS` | Limits are fixed for the demo; a table adds a read and a way to drift |
| D4 | "Pay the credit card balance" under bill payments | **Kept as a bill payment** (Pranav, Nov 13): saved bill `bill_card`; money leaves chequing, the card's amount owed drops, it counts toward the $5,000 daily limit, and `DailyOutflow` keeps a running count of today's money out | Matches how people think about paying a card |
| D5 | New e-transfer recipient | Email may be null at proposal time; the second-confirmation step collects it from the user before Approve | The email must come from the user, never from data Coin read |
| D6 | Chart tool "returns data for the UI to draw" | The model names a `ChartSource`; server code computes every number (approved Nov 13; the model chooses which charts to show, so W5's prompt must guide that well) | The model can't put a wrong number on a chart |
| D7 | Rule 4 buffer | $500 floor applies to chequing; other cash accounts just can't go below $0 | The brief's message only mentions chequing |
| D8 | Data dates | **Live dates** (Pranav, Nov 13): the seed is written against `SEED_ANCHOR_DATE`; each session shifts every date by `today − anchor` at clone time (prices on read). Canned text uses `{d+N}` tokens. A session that outlives its Toronto day is replaced | "Due in 3 days" is true whenever someone opens it, and every planted case keeps working |
| D9 | Template data | One template session copied per visitor by `clone_template()`; rows keep the same ids in every copy | Demo, tests and harness can name `acc_chequing` and `bill_rent` directly |
| D10 | Tickers "invented" | `.CX` suffix, an invented exchange | Guarantees no real ticker collides |
| D11 | Rule 1 scope | `TRANSFER_MATRIX`: no RRSP withdrawals, no card cash advances | Both are real-world-dangerous and not needed for the demo |
| D12 | Model id | Read from `OPENAI_MODEL`, prices from env | Nobody hardcodes a guessed model id or price |

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

## Open questions for Pranav

1. **Rule 8 depth.** The contract defines `extractRequestEntities` (amounts, accounts, names, tickers, quantities, a "full amount" flag). If the rule engine can't build that well in about 3 hours, fall back to comparing only numbers and names, per the brief.
2. **"Can I afford X?"** The contract answers with a verdict (`comfortable` / `tight` / `not_now`) plus the largest comfortable amount. That's the "range" version of your open question.
3. **Hosting.** Neon or Supabase: either works with the `postgres` driver. Neon has the simpler free tier for this.
