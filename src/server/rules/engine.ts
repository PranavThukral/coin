import { ACCOUNT_ALIASES, ActionType, CARD_BILL_ID, INVESTMENT_ACCOUNT_TYPES, PAYMENT_SOURCE_TYPES, RULE_MESSAGES, RULE_MESSAGE_VARIANTS, TRANSFER_MATRIX, type CheckOutcome, type CheckResult, type EvaluateRules, type Proposal, type RuleContext, type RuleId } from '../../contracts';
import { extractRequestEntities } from './extract';
type Result = CheckResult & {
    amountFailure?: boolean;
};
const result = (rule: RuleId, outcome: CheckOutcome, substitutions: Record<string, string> = {}, amount: number | null = null, quantity: number | null = null, amountFailure = false, variant?: string): Result => {
    let message = variant ?? RULE_MESSAGES[rule];
    for (const [key, value] of Object.entries(substitutions))
        message = message.replace(`[${key}]`, value);
    return { rule, outcome, message: outcome === 'fail' || outcome === 'flag' ? message : null, max_passing_amount_cents: amount !== null && amount > 0 ? amount : null, max_passing_quantity: quantity, amountFailure };
};
const money = (n: number) => (Math.max(0, n) / 100).toFixed(2);
const word = (text: string, value: string) => value.length > 0 && new RegExp(`(?<![\\w])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i').test(text);
const account = (ctx: RuleContext, id: string) => ctx.accounts.find(a => a.id === id);
const recipientName = (p: Extract<Proposal, {
    type: 'etransfer';
}>, ctx: RuleContext) => p.recipient.kind === 'new' ? p.recipient.name : ctx.contacts.find(c => c.id === (p.recipient.kind === 'saved' ? p.recipient.contact_id : ''))?.name.split(/\s|\(/)[0] ?? '';
const billNamed = (p: Extract<Proposal, {
    type: 'bill_payment';
}>, ctx: RuleContext) => {
    const text = ctx.user_message.text;
    if (p.bill_id === CARD_BILL_ID)
        return ACCOUNT_ALIASES.acc_card.some(a => word(text, a));
    const bill = ctx.bills.find(b => b.id === p.bill_id);
    if (!bill)
        return false;
    const terms = [bill.id.replace(/^bill_/, '').replace(/_/g, ' '), ...bill.payee.split(/[^a-z]+/i).filter(s => s.length > 3)];
    return terms.some(term => word(text, term));
};
const fullValue = (p: Proposal, ctx: RuleContext) => p.type === 'bill_payment' ? p.bill_id === CARD_BILL_ID ? account(ctx, 'acc_card')?.statement_balance_cents : ctx.bills.find(b => b.id === p.bill_id)?.amount_cents : undefined;
const nameMatches = (text: string, name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.length > 0 && parts.every(part => word(text, part));
};
// R0 protects against actions not authorized by the stored user message.
function rule0(p: Proposal, ctx: RuleContext): Result {
    const e = extractRequestEntities(ctx.user_message.text);
    if (!e.has_action_intent)
        return result('R0_intent', 'fail');
    const savedBillAmount = p.type === 'bill_payment' && p.bill_id !== CARD_BILL_ID &&
        e.amounts_cents.length === 0 && billNamed(p, ctx) &&
        ctx.bills.some(b => b.id === p.bill_id && b.saved && b.amount_cents === p.amount_cents);
    if (p.type !== 'trade' && !e.amounts_cents.includes(p.amount_cents) && !(e.full_amount && fullValue(p, ctx) === p.amount_cents) && !savedBillAmount)
        return result('R0_intent', 'fail');
    if (p.type === 'bill_payment' && !billNamed(p, ctx))
        return result('R0_intent', 'fail');
    if (p.type === 'etransfer') {
        if (!nameMatches(ctx.user_message.text, recipientName(p, ctx)))
            return result('R0_intent', 'fail');
        if (p.recipient.kind === 'new' && p.recipient.email && !e.emails.map(email => email.toLowerCase()).includes(p.recipient.email.toLowerCase()) && ctx.confirmed_recipient_email?.toLowerCase() !== p.recipient.email.toLowerCase())
            return result('R0_intent', 'fail');
    }
    return result('R0_intent', 'pass');
}
// R1 protects against unsupported actions and account combinations.
function rule1(p: Proposal, ctx: RuleContext): Result {
    let ok = ActionType.safeParse(p.type).success;
    if (p.type === 'transfer') {
        const from = account(ctx, p.from_account_id);
        const to = account(ctx, p.to_account_id);
        ok = !!from && !!to && from.id !== to.id && TRANSFER_MATRIX[from.type].includes(to.type);
    }
    else if (p.type === 'bill_payment' || p.type === 'etransfer') {
        const from = account(ctx, p.from_account_id);
        ok = !!from && PAYMENT_SOURCE_TYPES.includes(from.type);
    }
    else if (p.type === 'trade') {
        const a = account(ctx, p.account_id);
        ok = !!a && INVESTMENT_ACCOUNT_TYPES.includes(a.type) && Number.isSafeInteger(ctx.prices[p.ticker]) && ctx.prices[p.ticker] > 0 && ctx.prices[p.ticker] === p.price_cents;
    }
    return result('R1_allowed_action', ok ? 'pass' : 'fail');
}
// R2 protects against paying an unsaved or unknown bill.
function rule2(p: Proposal, ctx: RuleContext): Result {
    return result('R2_saved_payee', p.type !== 'bill_payment' ? 'skip' : ctx.bills.some(b => b.id === p.bill_id && b.saved) ? 'pass' : 'fail');
}
// R3 protects against unconfirmed or oversized payments to new recipients.
function rule3(p: Proposal, ctx: RuleContext): Result {
    if (p.type !== 'etransfer')
        return result('R3_new_recipient', 'skip');
    if (p.recipient.kind === 'saved')
        return result('R3_new_recipient', ctx.contacts.some(c => c.id === (p.recipient.kind === 'saved' && p.recipient.contact_id) && c.saved) ? 'pass' : 'fail', { name: recipientName(p, ctx) });
    const max = ctx.limits.new_recipient_limit_cents;
    return result('R3_new_recipient', p.amount_cents <= max ? 'flag' : 'fail', { name: p.recipient.name }, p.amount_cents > max ? max : null, null, p.amount_cents > max);
}
// R4 protects the source balance and prevents overpaying the card.
function rule4(p: Proposal, ctx: RuleContext): Result {
    if (p.type === 'trade')
        return result('R4_enough_money', 'skip');
    const a = account(ctx, p.from_account_id);
    if (!a)
        return result('R4_enough_money', 'fail', { account: 'account', max: '0.00' });
    let max = a.balance_cents - (a.type === 'chequing' ? ctx.limits.min_buffer_cents : 0);
    const owed = p.type === 'bill_payment' && p.bill_id === CARD_BILL_ID ? account(ctx, 'acc_card')?.balance_cents ?? 0 : Infinity;
    const cardLimited = owed <= max;
    max = Math.min(max, owed);
    const variant = cardLimited ? RULE_MESSAGE_VARIANTS.R4_card_overpay : a.type !== 'chequing' ? RULE_MESSAGE_VARIANTS.R4_no_overdraft : undefined;
    return result('R4_enough_money', p.amount_cents <= max ? 'pass' : 'fail', { account: a.name, max: money(max) }, p.amount_cents > max ? max : null, null, p.amount_cents > max, variant);
}
// R5 protects the daily external payment limit.
function rule5(p: Proposal, ctx: RuleContext): Result {
    if (p.type !== 'bill_payment' && p.type !== 'etransfer')
        return result('R5_daily_limit', 'skip');
    const max = ctx.limits.daily_limit_cents - ctx.daily_used_cents;
    return result('R5_daily_limit', p.amount_cents <= max ? 'pass' : 'fail', {}, p.amount_cents > max ? max : null, null, p.amount_cents > max);
}
// R6 protects annual registered-account contribution room.
function rule6(p: Proposal, ctx: RuleContext): Result {
    if (p.type !== 'transfer')
        return result('R6_contribution_room', 'skip');
    const to = account(ctx, p.to_account_id);
    if (!to || (to.type !== 'tfsa' && to.type !== 'rrsp'))
        return result('R6_contribution_room', 'skip');
    const max = ctx.room.find(r => r.account_type === to.type && r.year === Number(ctx.today.slice(0, 4)))?.room_remaining_cents ?? 0;
    return result('R6_contribution_room', p.amount_cents <= max ? 'pass' : 'fail', { room: money(max) }, p.amount_cents > max ? max : null, null, p.amount_cents > max);
}
// R7 protects against buying beyond cash or selling unheld shares.
function rule7(p: Proposal, ctx: RuleContext): Result {
    if (p.type !== 'trade')
        return result('R7_trade_limits', 'skip');
    const held = ctx.holdings.find(h => h.account_id === p.account_id && h.ticker === p.ticker)?.quantity ?? 0;
    const price = ctx.prices[p.ticker];
    const max = p.side === 'sell' ? held : price > 0 ? Math.max(0, Math.floor(Math.min(account(ctx, p.account_id)?.balance_cents ?? 0, ctx.limits.max_trade_cents) / price)) : 0;
    const cash = account(ctx, p.account_id)?.balance_cents ?? 0;
    const variant = p.side === 'buy' ? (cash < ctx.limits.max_trade_cents ? RULE_MESSAGE_VARIANTS.R7_buy_cash : RULE_MESSAGE_VARIANTS.R7_buy_max_trade) : undefined;
    return result('R7_trade_limits', p.quantity <= max ? 'pass' : 'fail', { n: String(p.side === 'sell' ? held : max), ticker: p.ticker }, null, p.quantity > max ? max : null, false, variant);
}
// R8 protects against changing the user's specified action details.
function rule8(p: Proposal, ctx: RuleContext): Result {
    const e = extractRequestEntities(ctx.user_message.text);
    if (p.type !== 'trade' && e.amounts_cents.some(a => a !== p.amount_cents))
        return result('R8_matches_request', 'fail');
    if (p.type === 'trade' && (e.amounts_cents.some(a => a !== p.quantity * p.price_cents) || e.tickers.some(t => t !== p.ticker) || e.quantities.some(q => q !== p.quantity) || (e.side && e.side !== p.side)))
        return result('R8_matches_request' as RuleId, 'fail');
    if (p.type === 'etransfer') {
        const name = recipientName(p, ctx);
        if (!nameMatches(ctx.user_message.text, name))
            return result('R8_matches_request', 'fail');
        const targets = [...ctx.user_message.text.matchAll(/\b(?:to|send)\s+(?:my\s+)?([a-z][a-z'-]*)/gi)].map(m => m[1]);
        if (targets.some(target => !['money', 'funds', 'cash', 'payment'].includes(target.toLowerCase()) && !word(name, target) && !Object.values(ACCOUNT_ALIASES).flat().some(alias => alias.toLowerCase() === target.toLowerCase())))
            return result('R8_matches_request', 'fail');
    }
    const ids = p.type === 'transfer' ? [p.from_account_id, p.to_account_id] : p.type === 'trade' ? [p.account_id] : [p.from_account_id, ...(p.type === 'bill_payment' && p.bill_id === CARD_BILL_ID ? ['acc_card'] : [])];
    if (e.accounts_mentioned.some(id => !ids.includes(id)))
        return result('R8_matches_request', 'fail');
    if (p.type === 'transfer') {
        const text = ctx.user_message.text.toLowerCase();
        for (const [id, aliases] of Object.entries(ACCOUNT_ALIASES))
            for (const alias of aliases) {
                const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (new RegExp(`\\bfrom\\s+(?:my\\s+|the\\s+)?${escaped}\\b`, 'i').test(text) && id !== p.from_account_id)
                    return result('R8_matches_request', 'fail');
                if (new RegExp(`\\b(?:to|into)\\s+(?:my\\s+|the\\s+)?${escaped}\\b`, 'i').test(text) && id !== p.to_account_id)
                    return result('R8_matches_request', 'fail');
            }
        if (!/\b(?:from|to|into)\b/i.test(text) && e.accounts_mentioned.length >= 2 && (e.accounts_mentioned[0] !== p.from_account_id || e.accounts_mentioned[1] !== p.to_account_id))
            return result('R8_matches_request', 'fail');
    }
    return result('R8_matches_request', 'pass');
}
export const evaluateRules: EvaluateRules = (proposal, ctx) => {
    const checks = [rule0(proposal, ctx), rule1(proposal, ctx), rule2(proposal, ctx), rule3(proposal, ctx), rule4(proposal, ctx), rule5(proposal, ctx), rule6(proposal, ctx), rule7(proposal, ctx), rule8(proposal, ctx)];
    const failures = checks.filter(c => c.outcome === 'fail');
    const amountMax = failures.length && failures.every(c => c.amountFailure && c.max_passing_amount_cents !== null) ? Math.min(...failures.map(c => c.max_passing_amount_cents!)) : null;
    const quantities = failures.map(c => c.max_passing_quantity).filter((n): n is number => n !== null);
    return { allowed: failures.length === 0, checks: checks.map(c => ({ rule: c.rule, outcome: c.outcome, message: c.message, max_passing_amount_cents: c.max_passing_amount_cents, max_passing_quantity: c.max_passing_quantity })), requires_second_confirmation: checks[3].outcome === 'flag', max_passing_amount_cents: amountMax, max_passing_quantity: quantities.length ? Math.min(...quantities) : null, primary_message: failures[0]?.message ?? null };
};
