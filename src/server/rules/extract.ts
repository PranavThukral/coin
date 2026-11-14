import { ACCOUNT_ALIASES, FULL_AMOUNT_PHRASES, INTENT_VERBS, SEED_CONTACTS, type AccountId, type ExtractRequestEntities } from "../../contracts";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const boundary = (s: string) => new RegExp(`(?<![\\w])${escape(s)}(?![\\w])`, "gi");

export const extractRequestEntities: ExtractRequestEntities = (text) => {
  const lower = text.toLowerCase();
  const matches = Object.entries(ACCOUNT_ALIASES).flatMap(([id, aliases]) => aliases.flatMap(alias =>
    [...text.matchAll(boundary(alias))].map(m => ({ id: id as AccountId, index: m.index, length: m[0].length }))));
  matches.sort ( (a, b) => a.index - b.index || b.length - a.length );
  const chosen: typeof matches = [];
  for (const m of matches) if (!chosen.some(c => m.index < c.index + c.length && c.index < m.index + m.length)) chosen.push(m);
  const emails = [...text.matchAll(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi)].map(m => m[0]);
  const tickers = [...text.matchAll(/\b[A-Z]{3,5}\.CX\b/gi)].map(m => m[0].toUpperCase());
  const quantities = [...text.matchAll(/\b(\d+)\s+shares?\b/gi)].map(m => Number(m[1]));
  const masked = text.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, ' ').replace(/\b[A-Z]{3,5}\.CX\b/gi, ' ')
    .replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?\b/g, ' ')
    .replace(/\b\d+\s+shares?\b/gi, ' ');
  const amounts_cents = [...masked.matchAll(/(?<![\w.])\$?\d[\d,]*(?:\.\d{1,2})?\s*k?(?![\w.])/gi)].map(m => {
    const raw = m[0].replace(/[$,\s]/g, '').toLowerCase();
    const k = raw.endsWith('k');
    const n = k ? raw.slice(0, -1) : raw;
    const [whole, fraction = ''] = n.split('.');
    const scale = k ? 100000 : 100;
    return Number(whole) * scale + Number((fraction + '00').slice(0, 2)) * (k ? 1000 : 1);
  });
  const stop = new Set(['i','coin','the','a','an','my','please','can','could','would','should','what','why','how','send','pay','move','transfer','buy','sell','january','february','march','april','may','june','july','august','september','october','november','december','tfsa','rrsp', ...Object.values(ACCOUNT_ALIASES).flatMap(a => a.flatMap(x => x.toLowerCase().split(/[\s-]+/)))]);
  const names = [...text.matchAll(/\b[A-Z][a-z]+\b/g)].map(m => m[0]).filter(n => !stop.has(n.toLowerCase()));
  for (const contact of SEED_CONTACTS) { const first = contact.name.split(/\s/)[0]; if (boundary(first).test(text)) names.push(first); }
  for (const m of text.matchAll(/\bto\s+([a-z][a-z'-]*)/gi)) if (!stop.has(m[1].toLowerCase())) names.push(m[1]);
  names.push(...emails);
  const verb = INTENT_VERBS.some(v => boundary(v).test(text));
  const denied = /\b(?:don['’]?t|do not|never|stop|cancel|without)\b/i.test(text);
  const hypothetical = /\b(?:what if|suppose|hypothetically|if i|would i|could i)\b/i.test(text);
  const past = /\b(?:why|what|when|how|explain|show|tell)\b[^.!?]*\b(?:did|last|previous|previously|sent|paid|moved|refund)\b/i.test(text);
  return { has_action_intent: verb && !denied && !hypothetical && !past, amounts_cents, full_amount: FULL_AMOUNT_PHRASES.some(p => lower.includes(p)), accounts_mentioned: chosen.map(m => m.id), names, emails, tickers, quantities, side: /\b(?:buy|purchase)\b/i.test(text) ? 'buy' : /\bsell\b/i.test(text) ? 'sell' : null };
};

