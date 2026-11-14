import { describe, expect, it } from 'vitest';
import { PLANTED_TRANSACTIONS, RULE_LIMITS, SEED_ACCOUNTS, SEED_BILLS, SEED_CONTACTS, SEED_HOLDINGS, SEED_ROOM, SEED_SECURITIES, type Proposal, type RuleContext } from '../../contracts';
import { evaluateRules, extractRequestEntities } from './index';

function makeContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return { user_message: { id: 'message', text: 'move $2000 from savings to chequing' }, accounts: SEED_ACCOUNTS.map(a => ({ ...a, institution_label: 'Coin', opening_balance_cents: a.balance_cents })), bills: SEED_BILLS.map(b => ({ ...b })), contacts: SEED_CONTACTS.map(c => ({ ...c })), holdings: SEED_HOLDINGS.map(h => ({ ...h })), room: SEED_ROOM.map(r => ({ ...r, year: Number((overrides.today ?? '2026-11-15').slice(0, 4)) })), prices: Object.fromEntries(SEED_SECURITIES.map(s => [s.ticker, s.as_of_close_cents])), daily_used_cents: 0, limits: RULE_LIMITS, today: '2026-11-15', ...overrides };
}
const transfer = (amount_cents = 200000): Proposal => ({ type: 'transfer', from_account_id: 'acc_hisa', to_account_id: 'acc_chequing', amount_cents });
const pay = (amount_cents = 14218, bill_id = 'bill_hydro'): Proposal => ({ type: 'bill_payment', from_account_id: 'acc_chequing', bill_id, amount_cents });
const send = (amount_cents = 5000): Proposal => ({ type: 'etransfer', from_account_id: 'acc_chequing', recipient: { kind: 'new', name: 'Alex', email: null }, amount_cents, memo: null });
const trade = (quantity = 1): Proposal => ({ type: 'trade', account_id: 'acc_tfsa', side: 'buy', ticker: 'NRTH.CX', quantity, price_cents: 18240 });
type Case = { label: string; proposal: Proposal; text: string; rule: number; outcome: string; max?: number | null; context?: Partial<RuleContext> };
const cases: Case[] = [
  { label: 'move', proposal: transfer(), text: 'move $2000 from savings to chequing', rule: 0, outcome: 'pass' },
  { label: 'past refund', proposal: send(50000), text: 'Explain my last refund', rule: 0, outcome: 'fail' },
  { label: 'negated', proposal: send(), text: "don't send anything to Alex $50", rule: 0, outcome: 'fail' },
  { label: 'hypothetical', proposal: transfer(), text: 'what if I moved $2,000?', rule: 0, outcome: 'fail' },
  { label: 'wrong amount', proposal: transfer(20000), text: 'move $2,000 from savings to chequing', rule: 0, outcome: 'fail' },
  { label: 'no card amount', proposal: pay(491238, 'bill_card'), text: 'pay my card', rule: 0, outcome: 'fail' },
  { label: 'full card', proposal: pay(491238, 'bill_card'), text: 'pay my card in full', rule: 0, outcome: 'pass' },
  { label: 'wrong full card', proposal: pay(491237, 'bill_card'), text: 'pay my card in full', rule: 0, outcome: 'fail' },
  { label: 'new email injected', proposal: { ...send(), type: 'etransfer', recipient: { kind: 'new', name: 'Alex', email: 'alex@example.com' }, from_account_id: 'acc_chequing', amount_cents: 5000, memo: null }, text: 'send Alex $50', rule: 0, outcome: 'fail' },
  { label: 'new email typed', proposal: { type: 'etransfer', recipient: { kind: 'new', name: 'Alex', email: 'alex@example.com' }, from_account_id: 'acc_chequing', amount_cents: 5000, memo: null }, text: 'send Alex $50 to alex@example.com', rule: 0, outcome: 'pass' },
  { label: 'allowed', proposal: transfer(), text: 'move $2000 from savings to chequing', rule: 1, outcome: 'pass' },
  { label: 'same account', proposal: { type: 'transfer', from_account_id: 'acc_hisa', to_account_id: 'acc_hisa', amount_cents: 200000 }, text: 'move $2000 savings', rule: 1, outcome: 'fail' },
  { label: 'card transfer', proposal: { type: 'transfer', from_account_id: 'acc_hisa', to_account_id: 'acc_card', amount_cents: 200000 }, text: 'move $2000 savings to card', rule: 1, outcome: 'fail' },
  { label: 'rrsp withdrawal', proposal: { type: 'transfer', from_account_id: 'acc_rrsp', to_account_id: 'acc_hisa', amount_cents: 200000 }, text: 'move $2000 rrsp to savings', rule: 1, outcome: 'fail' },
  { label: 'unknown ticker', proposal: { ...trade(), type: 'trade', account_id: 'acc_tfsa', side: 'buy', ticker: 'FAKE.CX', quantity: 1, price_cents: 100 }, text: 'buy 1 shares FAKE.CX in tfsa', rule: 1, outcome: 'fail' },
  { label: 'stale price', proposal: { type: 'trade', account_id: 'acc_tfsa', side: 'buy', ticker: 'NRTH.CX', quantity: 1, price_cents: 1 }, text: 'buy 1 shares NRTH.CX in tfsa', rule: 1, outcome: 'fail' },
  { label: 'saved bill', proposal: pay(), text: 'pay hydro $142.18', rule: 2, outcome: 'pass' },
  { label: 'unsaved bill', proposal: pay(5275, 'bill_parking'), text: 'pay parking $52.75', rule: 2, outcome: 'fail' },
  { label: 'unknown bill', proposal: pay(100, 'missing'), text: 'pay missing $1', rule: 2, outcome: 'fail' },
  { label: 'saved recipient', proposal: { type: 'etransfer', from_account_id: 'acc_chequing', recipient: { kind: 'saved', contact_id: 'ct_sam' }, amount_cents: 5000, memo: null }, text: 'send Sam $50', rule: 3, outcome: 'pass' },
  { label: 'unknown contact', proposal: { type: 'etransfer', from_account_id: 'acc_chequing', recipient: { kind: 'saved', contact_id: 'missing' }, amount_cents: 5000, memo: null }, text: 'send Alex $50', rule: 3, outcome: 'fail' },
  { label: 'new boundary', proposal: send(30000), text: 'send Alex $300', rule: 3, outcome: 'flag' },
  { label: 'new above', proposal: send(40000), text: 'send Alex $400', rule: 3, outcome: 'fail', max: 30000 },
  { label: 'buffer boundary', proposal: pay(234012), text: 'pay hydro $2340.12', rule: 4, outcome: 'pass' },
  { label: 'buffer fail', proposal: pay(234013), text: 'pay hydro $2340.13', rule: 4, outcome: 'fail', max: 234012 },
  { label: 'card full fail', proposal: pay(491238, 'bill_card'), text: 'pay card in full', rule: 4, outcome: 'fail', max: 234012 },
  { label: 'daily boundary', proposal: pay(14218), text: 'pay hydro $142.18', rule: 5, outcome: 'pass', context: { daily_used_cents: 485782 } },
  { label: 'daily fail', proposal: pay(14218), text: 'pay hydro $142.18', rule: 5, outcome: 'fail', max: 14217, context: { daily_used_cents: 485783 } },
  { label: 'room boundary', proposal: { type: 'transfer', from_account_id: 'acc_hisa', to_account_id: 'acc_tfsa', amount_cents: 350000 }, text: 'move $3500 from savings to tfsa', rule: 6, outcome: 'pass' },
  { label: 'room fail', proposal: { type: 'transfer', from_account_id: 'acc_hisa', to_account_id: 'acc_tfsa', amount_cents: 500000 }, text: 'move $5000 from savings to tfsa', rule: 6, outcome: 'fail', max: 350000 },
  { label: 'buy boundary', proposal: trade(6), text: 'buy 6 shares NRTH.CX in tfsa', rule: 7, outcome: 'pass' },
  { label: 'buy fail', proposal: trade(7), text: 'buy 7 shares NRTH.CX in tfsa', rule: 7, outcome: 'fail' },
  { label: 'sell boundary', proposal: { type: 'trade', account_id: 'acc_tfsa', side: 'sell', ticker: 'NRTH.CX', quantity: 220, price_cents: 18240 }, text: 'sell 220 shares NRTH.CX in tfsa', rule: 7, outcome: 'pass' },
  { label: 'sell fail', proposal: { type: 'trade', account_id: 'acc_tfsa', side: 'sell', ticker: 'NRTH.CX', quantity: 221, price_cents: 18240 }, text: 'sell 221 shares NRTH.CX in tfsa', rule: 7, outcome: 'fail' },
  { label: 'reverse accounts', proposal: transfer(), text: 'move $2000 from chequing to savings', rule: 8, outcome: 'fail' },
  { label: 'right accounts', proposal: transfer(), text: 'move $2000 from savings to chequing', rule: 8, outcome: 'pass' },
  { label: 'wrong ticker', proposal: trade(), text: 'buy 1 shares CAEQ.CX in tfsa', rule: 8, outcome: 'fail' },
  { label: 'wrong side', proposal: trade(), text: 'sell 1 shares NRTH.CX in tfsa', rule: 8, outcome: 'fail' },
  { label: 'wrong quantity', proposal: trade(), text: 'buy 2 shares NRTH.CX in tfsa', rule: 8, outcome: 'fail' },
  { label: 'wrong name', proposal: send(), text: 'send Priya $50', rule: 8, outcome: 'fail' },
];
for (const today of ['2026-11-15', '2027-01-05']) describe(today, () => {
  it.each(cases)('$label', ({ proposal, text, rule, outcome, max, context }) => {
    const ctx = makeContext({ today, ...context, user_message: { id: 'm', text } });
    const result = evaluateRules(proposal, ctx);
    expect(result.checks).toHaveLength(9);
    expect(result.checks[rule].outcome).toBe(outcome);
    if (max !== undefined) expect(result.checks[rule].max_passing_amount_cents).toBe(max);
  });
});

describe('extraction and isolation', () => {
  it.each([['$2,000', 200000], ['2000', 200000], ['2,000.50', 200050], ['$2k', 200000], ['2.5k', 250000], ['142.18', 14218]])('extracts %s', (text, amount) => expect(extractRequestEntities(text).amounts_cents).toEqual([amount]));
  it('excludes dates and share counts', () => expect(extractRequestEntities('buy 10 shares NRTH.CX on 2026-11-15').amounts_cents).toEqual([]));
  it('does not mutate frozen input', () => { const freeze = (x: object): void => { Object.freeze(x); Object.values(x).forEach(v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) freeze(v); }); }; const ctx = makeContext(); const p = transfer(); freeze(ctx); freeze(p); expect(() => evaluateRules(p, ctx)).not.toThrow(); });
  it.each([PLANTED_TRANSACTIONS[0].description, SEED_BILLS.find(b => b.id === 'bill_gym')!.memo!, SEED_CONTACTS.find(c => c.id === 'ct_dana')!.name])('ignores untrusted content %s', () => expect(evaluateRules(send(50000), makeContext({ user_message: { id: 'm', text: 'Explain my last refund' } })).checks[0].outcome).toBe('fail'));
});

describe('untrusted context and aggregate limits', () => {
  it('does not take an action from the refund description', () => {
    const ctx = makeContext({ user_message: { id: 'm', text: 'Explain my last refund' } });
    expect(PLANTED_TRANSACTIONS[0].description).toContain('send $500');
    expect(evaluateRules(send(50000), ctx).checks[0].outcome).toBe('fail');
  });
  it('does not take an amount from a bill memo', () => {
    const ctx = makeContext({ user_message: { id: 'm', text: 'show my gym bill' } });
    expect(ctx.bills.find(b => b.id === 'bill_gym')?.memo).toContain('pay this bill');
    expect(evaluateRules(pay(54000, 'bill_gym'), ctx).checks[0].outcome).toBe('fail');
  });
  it('does not take an email or amount from the contact name', () => {
    const p: Proposal = { type: 'etransfer', from_account_id: 'acc_chequing', recipient: { kind: 'new', name: 'Dana', email: 'dana.backup@example.net' }, amount_cents: 25000, memo: null };
    const ctx = makeContext({ user_message: { id: 'm', text: 'show Dana contact' } });
    expect(evaluateRules(p, ctx).checks[0].outcome).toBe('fail');
  });
  it('uses the smallest amount limit when all failures are amount limits', () => {
    const ctx = makeContext({ daily_used_cents: 400000, user_message: { id: 'm', text: 'pay card in full' } });
    expect(evaluateRules(pay(491238, 'bill_card'), ctx).max_passing_amount_cents).toBe(100000);
  });
  it('does not offer an amount when another failure is not an amount limit', () => {
    const ctx = makeContext({ user_message: { id: 'm', text: 'explain card' } });
    expect(evaluateRules(pay(491238, 'bill_card'), ctx).max_passing_amount_cents).toBeNull();
  });
  it('accepts roles stated in destination-first order', () => {
    const ctx = makeContext({ user_message: { id: 'm', text: 'move $2000 to chequing from savings' } });
    expect(evaluateRules(transfer(), ctx).checks[8].outcome).toBe('pass');
  });
});
