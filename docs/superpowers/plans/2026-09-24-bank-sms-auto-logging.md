# Bank SMS + Order Email Auto-Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bank SMS (Kalupur/KCCBL + SBI), forwarded by MacroDroid, and order emails, forwarded by an Apps Script, become Life OS transactions automatically, each with a Telegram ping.

**Architecture:** Two bearer-authenticated ingest routes store every raw message in `inbound_signals`, then run pure parsers (`parse.ts`), a pure classifier (`classify.ts`) and a Groq fallback before writing `transactions`. Telegram callbacks (category / Udhaar / TA / wallet) are handled in `src/lib/autolog/callbacks.ts`, which the existing webhook delegates to. The budget page gains a review-inbox card and source badges.

**Tech Stack:** Next.js 16 route handlers, Supabase (service-role admin client), Groq through `getAIProvider()`, Telegram Bot API, Node 22 type-stripping for fixture tests.

**Spec:** `docs/superpowers/specs/2026-09-24-bank-sms-auto-logging-design.md`

## Global Constraints

- The repo has no test framework. Tests are `node scripts/test-autolog.mts` (Node 22.18 strips types natively) plus `npx tsc --noEmit` and `npm run build`.
- `src/lib/autolog/parse.ts` and `src/lib/autolog/classify.ts` must stay free of runtime imports. Only `import type` is allowed, and only between those two files, so that Node can run them without the `@/` alias.
- Wallet table is `finance_accounts`; categories table is `finance_categories`.
- Dates are the IST local date: `new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })`.
- Never create `lend` / `borrow` / `repayment` rows without an explicit Telegram tap.
- Telegram `callback_data` must be ≤ 64 bytes.
- Migrations go through Supabase MCP `apply_migration` (project `hwygulsmtanmdovdcozw`), followed by `get_advisors security`. The pre-existing group/auth/leaked-password warnings can be ignored.
- Shell is PowerShell 5.1: no `&&`. Build with `$env:NODE_OPTIONS="--max-old-space-size=6144"; npm run build`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

| File | Responsibility |
|---|---|
| `src/lib/autolog/parse.ts` (new) | Pure SMS parsing: bank detection, noise guard, dates, amounts, refs, counterparty, balance |
| `src/lib/autolog/classify.ts` (new) | Pure decision: wallet, type, category, Udhaar / TA prompts, review flag |
| `src/lib/autolog/ai.ts` (new) | Groq fallbacks: `aiParseSms`, `aiParseOrder` |
| `src/lib/autolog/auth.ts` (new) | Bearer check and single-owner resolution |
| `src/lib/autolog/context.ts` (new) | Loads wallets, categories, rules, transactions and open lends for a user |
| `src/lib/autolog/notify.ts` (new) | Telegram ping helpers |
| `src/lib/autolog/sms.ts` (new) | `ingestSms` pipeline, including self-transfer pairing and the balance check |
| `src/lib/autolog/email.ts` (new) | `ingestEmails`, `sweepPendingEmails`, platform and total helpers |
| `src/lib/autolog/callbacks.ts` (new) | Telegram callback handling for `c:` `cs:` `r:` `ta:` `w:` |
| `src/app/api/ingest/sms/route.ts` (new) | MacroDroid endpoint |
| `src/app/api/ingest/email/route.ts` (new) | Apps Script endpoint |
| `src/app/api/telegram/route.ts` (modify) | Delegate autolog callbacks |
| `src/lib/telegram/api.ts` (modify) | `editMessageText` gains optional buttons; add `editMessageReplyMarkup` |
| `src/lib/types.ts` (modify) | New columns and the `InboundSignal` type |
| `src/lib/data.ts` (modify) | `getReviewSignals`, `dismissSignal`, `getLastSignalTimes` |
| `src/app/(dashboard)/budget/ReviewInboxCard.tsx` (new) | Review inbox card and modal |
| `src/app/(dashboard)/budget/page.tsx` (modify) | Mount the card |
| `src/app/(dashboard)/budget/TransactionsTab.tsx` (modify) | 📱/✉️ badges and order items |
| `src/app/(dashboard)/budget/budget.css` (modify) | `rv-` styles |
| `scripts/test-autolog.mts` (new) | Fixture tests |
| `tsconfig.json` (modify) | Exclude `scripts` |

---

### Task 1: Database schema + seed data

**Files:** Supabase migration `autolog_schema`, a data SQL run, and `src/lib/types.ts`

**Interfaces — Produces:** `finance_accounts.account_last4`; `transactions.source|merchant|bank_ref|details`; tables `inbound_signals` and `merchant_rules`; TS types `InboundSignal` and `SignalStatus`.

- [ ] **Step 1: Apply the migration** (`apply_migration`, name `autolog_schema`)

```sql
alter table public.finance_accounts add column if not exists account_last4 text;

alter table public.transactions
  add column if not exists source text not null default 'manual'
    check (source in ('manual','sms','email','telegram')),
  add column if not exists merchant text,
  add column if not exists bank_ref text,
  add column if not exists details jsonb;
create unique index if not exists transactions_user_bank_ref_uniq
  on public.transactions (user_id, bank_ref) where bank_ref is not null;

create table if not exists public.inbound_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('sms','email')),
  external_id text,
  sender text,
  subject text,
  body text not null,
  received_at timestamptz not null default now(),
  parsed jsonb,
  status text not null default 'needs_review'
    check (status in ('logged','enriched','pending_match','needs_review','ignored','duplicate')),
  transaction_id uuid references public.transactions(id) on delete set null,
  error text,
  created_at timestamptz not null default now()
);
create unique index if not exists inbound_signals_external_uniq
  on public.inbound_signals (user_id, kind, external_id) where external_id is not null;
create index if not exists inbound_signals_user_status_idx
  on public.inbound_signals (user_id, status, received_at desc);
create index if not exists inbound_signals_tx_idx on public.inbound_signals (transaction_id);
alter table public.inbound_signals enable row level security;
create policy "inbound_signals own select" on public.inbound_signals
  for select using ((select auth.uid()) = user_id);
create policy "inbound_signals own update" on public.inbound_signals
  for update using ((select auth.uid()) = user_id);
create policy "inbound_signals own delete" on public.inbound_signals
  for delete using ((select auth.uid()) = user_id);

create table if not exists public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match text not null,
  category_id uuid not null references public.finance_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, match)
);
create index if not exists merchant_rules_category_idx on public.merchant_rules (category_id);
alter table public.merchant_rules enable row level security;
create policy "merchant_rules own all" on public.merchant_rules
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```

- [ ] **Step 2: Seed data** (`execute_sql`; user `24b299d4-9ef2-420d-b7ff-39a547e628b0`, the only Telegram-linked profile)

```sql
update finance_accounts set account_last4 = '2270', name = 'Kalupur' where id = '35d0cc4b-7012-4034-9900-359480b8b3ec';
update finance_accounts set account_last4 = '3424' where id = 'e8db443d-56ff-44f5-a8c6-6b9472eaa017';
update finance_accounts set is_active = false where id = '8efa2feb-2d29-4e3e-beb4-d1c50ae4eae6'; -- old UPI wallet, archived not deleted

insert into finance_categories (user_id, name, kind, color, sort_order, is_archived, default_scope)
select '24b299d4-9ef2-420d-b7ff-39a547e628b0', v.name, v.kind, v.color, v.sort, false, 'self'
from (values ('Subscriptions','expense','#9B7EDE',20), ('Fitness & Sports','expense','#4CAF7D',21),
             ('Bank Charges','expense','#888888',22), ('TA Salary','income','#96fac2',10)) v(name,kind,color,sort)
where not exists (select 1 from finance_categories c where c.user_id = '24b299d4-9ef2-420d-b7ff-39a547e628b0'
                  and lower(c.name) = lower(v.name) and c.kind = v.kind);

insert into merchant_rules (user_id, match, category_id)
select '24b299d4-9ef2-420d-b7ff-39a547e628b0', r.match, c.id
from (values ('jignesh','Allowance','income'), ('spotify','Subscriptions','expense'), ('netflix','Subscriptions','expense'),
             ('youtube','Subscriptions','expense'), ('prime','Subscriptions','expense'), ('swiggy','Food & Dining','expense'),
             ('zomato','Food & Dining','expense'), ('amazon','Shopping','expense'), ('flipkart','Shopping','expense'),
             ('myntra','Shopping','expense'), ('decathlon','Fitness & Sports','expense')) r(match, cat, kind)
join finance_categories c on c.user_id = '24b299d4-9ef2-420d-b7ff-39a547e628b0' and c.name = r.cat and c.kind = r.kind and not c.is_archived
on conflict (user_id, match) do nothing;
```

Verify: `select a.name, a.account_last4 from finance_accounts a where is_active and user_id='24b2…'` shows Kalupur 2270, SBI 3424, Cash; `select count(*) from merchant_rules` = 11.

- [ ] **Step 3: Run `get_advisors security`.** Expect no new warnings for `inbound_signals` or `merchant_rules`.

- [ ] **Step 4: Update the types in `src/lib/types.ts`.** Add to `FinanceAccount`, after `sort_order`:

```ts
  account_last4?: string | null
```

Add to `Transaction`, after `is_settled?`:

```ts
  // Auto-logging
  source?: 'manual' | 'sms' | 'email' | 'telegram'
  merchant?: string | null
  bank_ref?: string | null
  details?: { platform?: string; order_id?: string | null; items?: { name: string; qty: number; price: number | null }[] } | null
```

Add after the `DebtStatus` type:

```ts
export type SignalStatus = 'logged' | 'enriched' | 'pending_match' | 'needs_review' | 'ignored' | 'duplicate'
export type InboundSignal = {
  id: string
  user_id: string
  kind: 'sms' | 'email'
  external_id: string | null
  sender: string | null
  subject: string | null
  body: string
  received_at: string
  parsed: Record<string, unknown> | null
  status: SignalStatus
  transaction_id: string | null
  error: string | null
  created_at: string
}
```

- [ ] **Step 5:** `npx tsc --noEmit` → no errors. Commit `Add auto-logging schema types`.

---

### Task 2: Pure SMS parser + fixtures

**Files:** Create `src/lib/autolog/parse.ts` and `scripts/test-autolog.mts`; modify `tsconfig.json`.

**Interfaces — Produces:**
`type SmsBank = 'KCCBL'|'SBI'`;
`type ParsedSms = { bank, direction: 'debit'|'credit', amount: number, date: string, last4: string|null, ref: string|null, counterparty: string|null, balance: number|null, narration: string|null }`;
`detectBank(body): SmsBank|null`; `isNoise(body): boolean`; `parseSmsDate(raw): string|null`; `parseBankSms(body): ParsedSms|null`; `todayIST(): string`.

- [ ] **Step 1: Exclude scripts from tsc.** In `tsconfig.json`, change `"exclude": ["node_modules"]` to `"exclude": ["node_modules", "scripts"]`.

- [ ] **Step 2: Write the failing fixture test** `scripts/test-autolog.mts`

```ts
// Run: node scripts/test-autolog.mts   (Node 22.18+ strips TS types)
import { parseBankSms, isNoise, parseSmsDate, detectBank } from '../src/lib/autolog/parse.ts'

let failed = 0
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) console.log(`  ok  ${name}`)
  else { failed++; console.log(`FAIL  ${name}\n      expected ${e}\n      actual   ${a}`) }
}

const K1 = 'A/c XX2270 debited by Rs.90.00 on 25-08-26 and credited to a/c XX0051 (RefNo 128492486150).Not you? forward this SMS to 9028048500 to block UPI - KCCBL'
const K2 = 'A/C XX2270 IS DEBITED BY RS.15.34 ON 31-03-2026 BY TRANSFER.BAL RS.7723.65 BAL WITH FFD RS.7723.65.INFO: QUARTERLY SMS CHRG  - KCCBL'
const K3 = 'A/C XX2270 IS CREDITED BY RS.2000.00 ON 16-09-2026 BY TRANSFER. AVL BAL IS RS.2025.04.INFO: UPI/CR/662520579086/JIGNESH KA /UBIN/31360201001834 662520579 -KCCBL'
const S1 = 'Dear UPI user A/C X3424 debited by 179.00 on date 08May26 trf to Spotify India LL Refno 109769487390 If not u? call-1800111109 for other services-18001234-SBI'
const S2 = 'Dear SBI User, your A/c X2270-credited by Rs.360 on 13Nov25 transfer from TIRTH KAUSHALKUMAR SHAH Ref No 531717252410 -SBI'

console.log('parse')
eq('date dd-mm-yy', parseSmsDate('25-08-26'), '2026-08-25')
eq('date dd-mm-yyyy', parseSmsDate('31-03-2026'), '2026-03-31')
eq('date ddMonyy', parseSmsDate('08May26'), '2026-05-08')
eq('date bad', parseSmsDate('99-99-99'), null)
eq('bank K', detectBank(K1), 'KCCBL')
eq('bank S', detectBank(S1), 'SBI')
eq('noise OTP', isNoise('Your OTP is 123456 for txn of Rs.500 -SBI'), true)
eq('noise real', isNoise(S1), false)

eq('K1', parseBankSms(K1), { bank: 'KCCBL', direction: 'debit', amount: 90, date: '2026-08-25', last4: '2270', ref: '128492486150', counterparty: 'a/c XX0051', balance: null, narration: null })
eq('K2', parseBankSms(K2), { bank: 'KCCBL', direction: 'debit', amount: 15.34, date: '2026-03-31', last4: '2270', ref: 'bal:KCCBL:2270:2026-03-31:15.34:7723.65', counterparty: null, balance: 7723.65, narration: 'QUARTERLY SMS CHRG' })
eq('K3', parseBankSms(K3), { bank: 'KCCBL', direction: 'credit', amount: 2000, date: '2026-09-16', last4: '2270', ref: '662520579086', counterparty: 'JIGNESH KA', balance: 2025.04, narration: 'UPI/CR/662520579086/JIGNESH KA /UBIN/31360201001834 662520579' })
eq('S1', parseBankSms(S1), { bank: 'SBI', direction: 'debit', amount: 179, date: '2026-05-08', last4: '3424', ref: '109769487390', counterparty: 'Spotify India LL', balance: null, narration: null })
eq('S2', parseBankSms(S2), { bank: 'SBI', direction: 'credit', amount: 360, date: '2025-11-13', last4: '2270', ref: '531717252410', counterparty: 'TIRTH KAUSHALKUMAR SHAH', balance: null, narration: null })
eq('unparseable', parseBankSms('Your a/c has been updated -SBI'), null)

if (failed) { console.log(`\n${failed} failed`); process.exit(1) } else console.log('\nall passed')
```

- [ ] **Step 3: Run** `node scripts/test-autolog.mts` → expect a module-not-found error for `parse.ts`.

- [ ] **Step 4: Implement** `src/lib/autolog/parse.ts`

```ts
// Pure bank-SMS parser for Kalupur (KCCBL) and SBI.
// No runtime imports: scripts/test-autolog.mts runs this file directly with node.

export type SmsBank = 'KCCBL' | 'SBI'
export type ParsedSms = {
  bank: SmsBank
  direction: 'debit' | 'credit'
  amount: number
  date: string            // YYYY-MM-DD
  last4: string | null
  ref: string | null      // bank/UPI reference; dedupe key
  counterparty: string | null
  balance: number | null  // balance the bank reports after the txn
  narration: string | null
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
const pad = (n: number) => String(n).padStart(2, '0')
const toNum = (s: string) => Number(s.replace(/,/g, ''))

export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

export function detectBank(body: string): SmsBank | null {
  if (/KCCBL/i.test(body)) return 'KCCBL'
  if (/\bSBI\b/i.test(body)) return 'SBI'
  return null
}

// OTPs, promos and anything that is not a completed debit/credit.
export function isNoise(body: string): boolean {
  if (/\bOTP\b|one[- ]time password|pre-?approved|\boffer\b|\bloan\b|\bKYC\b|request(ed)? money/i.test(body)) return true
  return !/debited|credited|withdrawn/i.test(body)
}

function build(d: number, m: number, y: number): string | null {
  const yy = y < 100 ? 2000 + y : y
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${yy}-${pad(m)}-${pad(d)}`
}

export function parseSmsDate(raw: string): string | null {
  const s = raw.trim()
  let m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/)
  if (m) return build(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[- ]?([A-Za-z]{3})[- ]?(\d{2}|\d{4})$/)
  if (m && MONTHS[m[2].toLowerCase()]) return build(+m[1], MONTHS[m[2].toLowerCase()], +m[3])
  return null
}

const CORE = /A\/c\s*X*(\d{3,4})[\s-]*(?:is\s+)?(debited|credited)\s+by\s+(?:Rs\.?\s*|INR\s*)?([\d,]+(?:\.\d{1,2})?)\s+on\s+(?:date\s+)?([0-9A-Za-z-]+)/i

export function parseBankSms(body: string): ParsedSms | null {
  const bank = detectBank(body)
  const core = body.match(CORE)
  if (!bank || !core) return null
  const date = parseSmsDate(core[4])
  const amount = toNum(core[3])
  if (!date || !(amount > 0)) return null

  const direction = core[2].toLowerCase() === 'debited' ? 'debit' : 'credit'
  const last4 = core[1].slice(-4)
  const narration = body.match(/INFO:\s*(.+?)\s*-\s*KCCBL/i)?.[1]?.trim() || null
  const balM = body.match(/(?:AVL\s+)?BAL(?:\s+IS)?\s*[:.]?\s*RS\.?\s*([\d,]+(?:\.\d{1,2})?)/i)
  const balance = balM ? toNum(balM[1]) : null

  const upi = body.match(/UPI\/(?:CR|DR)\/(\d{6,})\/([^/]+)\//i)
  const counterparty =
    upi?.[2]?.trim() ||
    body.match(/(?:trf to|transfer to|trf from|transfer from|credited to|debited from)\s+(.+?)(?:\s+\(?Ref\s*no|\.\s|$)/i)?.[1]?.trim() ||
    null

  let ref = body.match(/Ref\s*No\.?\s*:?\s*(\d{6,})/i)?.[1] || upi?.[1] || null
  // Charges carry no reference; the reported balance makes a stable synthetic one.
  if (!ref && balance != null) ref = `bal:${bank}:${last4}:${date}:${amount}:${balance}`

  return { bank, direction, amount, date, last4, ref, counterparty, balance, narration }
}
```

- [ ] **Step 5: Run** `node scripts/test-autolog.mts` → `all passed`. If one fails, fix the regex, not the fixture. The fixtures are Het's real SMS.

- [ ] **Step 6: Commit** `Add bank SMS parser with fixtures`.

---

### Task 3: Pure classifier

**Files:** Create `src/lib/autolog/classify.ts`; modify `scripts/test-autolog.mts`.

**Interfaces:**
- Consumes: `ParsedSms` (Task 2).
- Produces:

```ts
type WalletLite = { id: string; name: string; type: string; account_last4?: string | null }
type CategoryLite = { id: string; name: string; kind: 'income' | 'expense' }
type RuleLite = { match: string; category_id: string }
type OpenLent = { txId: string; person: string; outstanding: number }
type ClassifyCtx = { wallets: WalletLite[]; categories: CategoryLite[]; rules: RuleLite[]; openLent: OpenLent[] }
type TxDecision = { kind: 'tx'; type: 'income'|'expense'|'transfer'; accountId: string; toAccountId: string|null; categoryId: string|null; merchant: string|null; note: string; needsReview: boolean; udhaar: OpenLent|null; askTa: boolean }
type Decision = { kind: 'review'; reason: string } | TxDecision
walletFor(wallets, last4): WalletLite | undefined
normalizeMerchant(s): string | null
matchRule(text, rules): RuleLite | null
firstNameMatch(counterparty, person): boolean
classify(p: ParsedSms, body: string, ctx: ClassifyCtx): Decision
```

- [ ] **Step 1: Append failing tests** to `scripts/test-autolog.mts`, before the final `if (failed)` line. Also add `import { classify, normalizeMerchant, firstNameMatch } from '../src/lib/autolog/classify.ts'` at the top.

```ts
console.log('classify')
const ctx = {
  wallets: [
    { id: 'wK', name: 'Kalupur', type: 'bank', account_last4: '2270' },
    { id: 'wS', name: 'SBI', type: 'bank', account_last4: '3424' },
    { id: 'wC', name: 'Cash', type: 'cash', account_last4: null },
  ],
  categories: [
    { id: 'cMisc', name: 'Misc', kind: 'expense' as const }, { id: 'cSub', name: 'Subscriptions', kind: 'expense' as const },
    { id: 'cBank', name: 'Bank Charges', kind: 'expense' as const }, { id: 'cAllow', name: 'Allowance', kind: 'income' as const },
    { id: 'cTA', name: 'TA Salary', kind: 'income' as const }, { id: 'cOther', name: 'Other', kind: 'income' as const },
  ],
  rules: [{ match: 'spotify', category_id: 'cSub' }, { match: 'jignesh', category_id: 'cAllow' }],
  openLent: [{ txId: 'd1', person: 'Tirth', outstanding: 500 }],
}
const pick = (d: any) => d.kind === 'review' ? d : { type: d.type, accountId: d.accountId, toAccountId: d.toAccountId, categoryId: d.categoryId, merchant: d.merchant, needsReview: d.needsReview, udhaar: d.udhaar?.txId ?? null, askTa: d.askTa }

eq('merchant norm', normalizeMerchant('Spotify India LL'), 'spotify india')
eq('first name', firstNameMatch('TIRTH KAUSHALKUMAR SHAH', 'Tirth'), true)
eq('first name no', firstNameMatch('TIRTHANKAR X', 'Tirth'), false)
eq('S1 spotify rule', pick(classify(parseBankSms(S1)!, S1, ctx)), { type: 'expense', accountId: 'wS', toAccountId: null, categoryId: 'cSub', merchant: 'spotify india', needsReview: false, udhaar: null, askTa: false })
eq('K3 father allowance', pick(classify(parseBankSms(K3)!, K3, ctx)), { type: 'income', accountId: 'wK', toAccountId: null, categoryId: 'cAllow', merchant: 'jignesh ka', needsReview: false, udhaar: null, askTa: false })
eq('K2 bank charge', pick(classify(parseBankSms(K2)!, K2, ctx)), { type: 'expense', accountId: 'wK', toAccountId: null, categoryId: 'cBank', merchant: null, needsReview: false, udhaar: null, askTa: false })
eq('K1 unknown → Misc review', pick(classify(parseBankSms(K1)!, K1, ctx)), { type: 'expense', accountId: 'wK', toAccountId: null, categoryId: 'cMisc', merchant: null, needsReview: true, udhaar: null, askTa: false })
eq('S2 X2270 → Kalupur + udhaar ask', pick(classify(parseBankSms(S2)!, S2, ctx)), { type: 'income', accountId: 'wK', toAccountId: null, categoryId: 'cOther', merchant: 'tirth kaushalkumar', needsReview: false, udhaar: 'd1', askTa: false })
const TA = 'A/C XX2270 IS CREDITED BY RS.4000.00 ON 01-10-2026 BY TRANSFER. AVL BAL IS RS.6025.04.INFO: NEFT/AHMEDABAD UNIVERSITY/SALARY -KCCBL'
eq('TA salary ask', pick(classify(parseBankSms(TA)!, TA, ctx)), { type: 'income', accountId: 'wK', toAccountId: null, categoryId: 'cTA', merchant: 'neft ahmedabad', needsReview: false, udhaar: null, askTa: true })
eq('TA learned rule', pick(classify(parseBankSms(TA)!, TA, { ...ctx, rules: [...ctx.rules, { match: 'neft ahmedabad', category_id: 'cTA' }] })), { type: 'income', accountId: 'wK', toAccountId: null, categoryId: 'cTA', merchant: 'neft ahmedabad', needsReview: false, udhaar: null, askTa: false })
const ATM = 'A/C XX2270 IS DEBITED BY RS.500.00 ON 02-10-2026 BY ATM CASH WDL. AVL BAL IS RS.5525.04.INFO: ATM WDL KALUPUR -KCCBL'
eq('ATM → transfer to cash', pick(classify(parseBankSms(ATM)!, ATM, ctx)), { type: 'transfer', accountId: 'wK', toAccountId: 'wC', categoryId: null, merchant: null, needsReview: false, udhaar: null, askTa: false })
const UNK = 'A/c XX9999 debited by Rs.10.00 on 25-08-26 RefNo 111111 - KCCBL'
eq('unknown last4 → review', classify(parseBankSms(UNK)!, UNK, ctx).kind, 'review')
```

(The TA case has no UPI counterparty, so the narration becomes the merchant key `neft ahmedabad`. After Het taps "Yes, TA salary" once, the learned rule makes later ones silent.)

- [ ] **Step 2: Run** `node scripts/test-autolog.mts` → expect a module-not-found error for `classify.ts`.

- [ ] **Step 3: Implement** `src/lib/autolog/classify.ts`

```ts
// Pure decision step: parsed SMS + user context → what to write.
// Only type imports, so node can run it in scripts/test-autolog.mts.
import type { ParsedSms } from './parse'

export type WalletLite = { id: string; name: string; type: string; account_last4?: string | null }
export type CategoryLite = { id: string; name: string; kind: 'income' | 'expense' }
export type RuleLite = { match: string; category_id: string }
export type OpenLent = { txId: string; person: string; outstanding: number }
export type ClassifyCtx = { wallets: WalletLite[]; categories: CategoryLite[]; rules: RuleLite[]; openLent: OpenLent[] }

export type TxDecision = {
  kind: 'tx'
  type: 'income' | 'expense' | 'transfer'
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  merchant: string | null
  note: string
  needsReview: boolean
  udhaar: OpenLent | null   // ask "is this a repayment?" — never auto-converted
  askTa: boolean            // ask "is this your TA salary?" once
}
export type Decision = { kind: 'review'; reason: string } | TxDecision

export function walletFor(wallets: WalletLite[], last4: string | null): WalletLite | undefined {
  if (!last4) return undefined
  return wallets.find(w => w.account_last4 && w.account_last4 === last4.slice(-4))
}

// "Spotify India LL" → "spotify india". The first two words are stable across a merchant's SMS.
export function normalizeMerchant(s: string | null): string | null {
  if (!s || /^a\/c\b/i.test(s.trim())) return null
  const words = s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
  return words.length ? words.slice(0, 2).join(' ') : null
}

// Longest rule whose text appears in `text` wins ("amazon pay" beats "amazon").
// Punctuation is normalised the same way normalizeMerchant does ("NEFT/AHMEDABAD" ⊃ "neft ahmedabad").
export function matchRule(text: string, rules: RuleLite[]): RuleLite | null {
  const t = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  return rules.filter(r => r.match && t.includes(r.match.toLowerCase()))
    .sort((a, b) => b.match.length - a.match.length)[0] ?? null
}

export function firstNameMatch(counterparty: string | null, person: string): boolean {
  const a = counterparty?.trim().split(/\s+/)[0]?.toLowerCase()
  const b = person.trim().split(/\s+/)[0]?.toLowerCase()
  return !!a && !!b && a === b
}

export function classify(p: ParsedSms, body: string, ctx: ClassifyCtx): Decision {
  const wallet = walletFor(ctx.wallets, p.last4)
  if (!wallet) return { kind: 'review', reason: `No wallet for account ending ${p.last4 ?? '?'}` }

  const cat = (name: string, kind: 'income' | 'expense') =>
    ctx.categories.find(c => c.kind === kind && c.name.toLowerCase() === name.toLowerCase())?.id ?? null
  const kind = p.direction === 'debit' ? 'expense' : 'income'
  const text = `${p.counterparty ?? ''} ${p.narration ?? ''}`
  // No named counterparty (e.g. NEFT salary) → the narration is the learnable key.
  const merchant = normalizeMerchant(p.counterparty) ?? normalizeMerchant(p.narration)
  const base: TxDecision = {
    kind: 'tx', type: kind, accountId: wallet.id, toAccountId: null, categoryId: null, merchant,
    note: p.counterparty || p.narration || `${p.bank} ${p.direction}`, needsReview: false, udhaar: null, askTa: false,
  }

  if (p.direction === 'debit' && /\bATM\b|CASH\s*WDL|CASH WITHDRAWAL|WITHDRAWN/i.test(`${text} ${body}`)) {
    const cash = ctx.wallets.find(w => w.type === 'cash')
    if (cash) return { ...base, type: 'transfer', toAccountId: cash.id, merchant: null, note: 'ATM withdrawal' }
  }
  if (p.direction === 'debit' && /\bCHRG\b|\bCHARGES?\b/i.test(text)) {
    return { ...base, categoryId: cat('Bank Charges', 'expense'), merchant: null }
  }

  const rule = matchRule(text, ctx.rules)
  const ruleCat = rule && ctx.categories.find(c => c.id === rule.category_id && c.kind === kind)
  if (ruleCat) return { ...base, categoryId: ruleCat.id }

  if (p.direction === 'credit') {
    if (p.bank === 'KCCBL' && p.amount === 4000 && /UNIV|AHMEDABAD/i.test(body)) {
      return { ...base, categoryId: cat('TA Salary', 'income'), askTa: true }
    }
    const udhaar = ctx.openLent.find(d => firstNameMatch(p.counterparty, d.person)) ?? null
    return { ...base, categoryId: cat('Other', 'income'), udhaar, needsReview: !udhaar }
  }
  return { ...base, categoryId: cat('Misc', 'expense'), needsReview: true }
}
```

- [ ] **Step 4: Run** `node scripts/test-autolog.mts` → `all passed`.
- [ ] **Step 5: Commit** `Add auto-logging classifier`.

---

### Task 4: SMS ingest route + Telegram ping (SMS goes live)

**Files:** Create `src/lib/autolog/{ai,auth,context,notify,sms,email}.ts` (email.ts starts as a stub sweep here and is completed in Task 6) and `src/app/api/ingest/sms/route.ts`; modify `src/lib/telegram/api.ts`.

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces:
  - `ingestSms(admin, userId, chatId, sender, body): Promise<{ status: SignalStatus; transactionId?: string }>`
  - `loadLedgerContext(admin, userId)`
  - `txButtons(txId, extra?)`, `notify(chatId, text, buttons?)`
  - `sweepPendingEmails(admin, userId, chatId): Promise<void>`
  - `isIngestAuthorized(req)`, `resolveIngestUser(admin)`, `type Admin`
  - `aiParseSms(body, bank)`, `aiParseOrder(from, subject, body)`, `type ParsedOrder`

- [ ] **Step 1: Telegram API additions** in `src/lib/telegram/api.ts`. Replace `editMessageText` with:

```ts
export async function editMessageText(chatId: number | string, messageId: number, text: string, buttons?: InlineButton[][]) {
  return call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  })
}

export async function editMessageReplyMarkup(chatId: number | string, messageId: number, buttons: InlineButton[][]) {
  return call('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: buttons } })
}
```

- [ ] **Step 2: `src/lib/autolog/auth.ts`**

```ts
import { createAdminClient } from '@/lib/supabase/admin'

export type Admin = ReturnType<typeof createAdminClient>

export function isIngestAuthorized(request: Request): boolean {
  const secret = process.env.INGEST_SECRET
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`
}

// Single-user app: the ingest owner is the one profile with Telegram linked.
export async function resolveIngestUser(admin: Admin): Promise<{ userId: string; chatId: string } | null> {
  const { data } = await admin.from('profiles').select('id,telegram_chat_id').not('telegram_chat_id', 'is', null).limit(2)
  if (!data || data.length !== 1) return null
  return { userId: data[0].id, chatId: String(data[0].telegram_chat_id) }
}
```

- [ ] **Step 3: `src/lib/autolog/context.ts`**

```ts
import type { Admin } from './auth'
import type { FinanceAccount, Transaction } from '@/lib/types'
import type { CategoryLite, RuleLite, OpenLent } from './classify'
import { computeDebtStatuses } from '@/lib/finance'

export type LedgerContext = {
  wallets: FinanceAccount[]
  categories: (CategoryLite & { sort_order: number })[]
  rules: RuleLite[]
  txns: Transaction[]
  openLent: OpenLent[]
}

export async function loadLedgerContext(admin: Admin, userId: string): Promise<LedgerContext> {
  const [w, c, r, t] = await Promise.all([
    admin.from('finance_accounts').select('*').eq('user_id', userId).eq('is_active', true).order('sort_order'),
    admin.from('finance_categories').select('id,name,kind,sort_order').eq('user_id', userId).eq('is_archived', false).order('sort_order'),
    admin.from('merchant_rules').select('match,category_id').eq('user_id', userId),
    admin.from('transactions').select('*').eq('user_id', userId),
  ])
  const txns = (t.data || []) as Transaction[]
  const openLent = computeDebtStatuses(txns)
    .filter(d => d.direction === 'lent' && d.outstanding > 0)
    .map(d => ({ txId: d.tx.id, person: d.person, outstanding: d.outstanding }))
  return {
    wallets: (w.data || []) as FinanceAccount[],
    categories: (c.data || []) as LedgerContext['categories'],
    rules: (r.data || []) as RuleLite[],
    txns, openLent,
  }
}
```

- [ ] **Step 4: `src/lib/autolog/notify.ts`**

```ts
import { sendMessage, type InlineButton } from '@/lib/telegram/api'

export function txButtons(txId: string, extra: InlineButton[][] = []): InlineButton[][] {
  return [...extra, [{ text: '✏️ Category', callback_data: `c:${txId}` }, { text: '↩️ Undo', callback_data: `u:tx:${txId}` }]]
}

// A Telegram outage must never fail an ingest.
export async function notify(chatId: string, text: string, buttons?: InlineButton[][]) {
  try { await sendMessage(chatId, text, buttons) } catch (e) { console.error('autolog notify failed', e) }
}
```

- [ ] **Step 5: `src/lib/autolog/ai.ts`**

```ts
import { getAIProvider } from '@/lib/ai'
import { todayIST, type ParsedSms, type SmsBank } from './parse'

export type ParsedOrder = {
  platform: string
  orderId: string | null
  total: number
  items: { name: string; qty: number; price: number | null }[]
}

// Returns null when the SMS is not a completed transaction. Throws on provider/JSON failure.
export async function aiParseSms(body: string, bank: SmsBank): Promise<ParsedSms | null> {
  const raw = await getAIProvider().complete([
    { role: 'system', content: 'Extract an Indian bank transaction SMS into JSON. Reply ONLY with JSON: {"is_transaction":boolean,"direction":"debit"|"credit","amount":number,"date":"YYYY-MM-DD"|null,"last4":string|null,"ref":string|null,"counterparty":string|null,"balance":number|null}. last4 = last 4 digits of the account. is_transaction=false for OTPs, promotions, payment requests, failed or reversed attempts.' },
    { role: 'user', content: body },
  ], { json: true, temperature: 0 })
  const j = JSON.parse(raw)
  if (!j?.is_transaction || !(Number(j.amount) > 0) || (j.direction !== 'debit' && j.direction !== 'credit')) return null
  const last4 = j.last4 ? String(j.last4).replace(/\D/g, '').slice(-4) || null : null
  return {
    bank, direction: j.direction, amount: Number(j.amount),
    date: typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : todayIST(),
    last4, ref: j.ref ? String(j.ref) : null, counterparty: j.counterparty ? String(j.counterparty) : null,
    balance: typeof j.balance === 'number' ? j.balance : null, narration: null,
  }
}

// Returns null when the email is not a charged order/booking/ride. Throws on provider/JSON failure.
export async function aiParseOrder(from: string, subject: string, body: string, platform: string): Promise<ParsedOrder | null> {
  const raw = await getAIProvider().complete([
    { role: 'system', content: 'You read Indian e-commerce/food/ride emails. Reply ONLY with JSON: {"is_order_payment":boolean,"order_id":string|null,"total":number|null,"items":[{"name":string,"qty":number,"price":number|null}]}. is_order_payment=true only when money was charged or is payable for an order, booking or ride. Shipping/delivery updates, promotions, refunds and OTPs are false. total = final amount paid in INR. Keep item names short (max 40 chars).' },
    { role: 'user', content: `From: ${from}\nSubject: ${subject}\n\n${body.slice(0, 6000)}` },
  ], { json: true, temperature: 0 })
  const j = JSON.parse(raw)
  if (!j?.is_order_payment || !(Number(j.total) > 0)) return null
  const items = Array.isArray(j.items) ? j.items.slice(0, 20).map((i: { name?: unknown; qty?: unknown; price?: unknown }) => ({
    name: String(i.name ?? '').slice(0, 60), qty: Number(i.qty) || 1, price: Number.isFinite(Number(i.price)) ? Number(i.price) : null,
  })).filter((i: { name: string }) => i.name) : []
  return { platform, orderId: j.order_id ? String(j.order_id) : null, total: Number(j.total), items }
}
```

- [ ] **Step 6: Stub `src/lib/autolog/email.ts`** (completed in Task 6)

```ts
import type { Admin } from './auth'

export async function sweepPendingEmails(_admin: Admin, _userId: string, _chatId: string): Promise<void> {
  // Filled in by Task 6.
}
```

- [ ] **Step 7: `src/lib/autolog/sms.ts`**

```ts
import type { Admin } from './auth'
import type { SignalStatus, Transaction } from '@/lib/types'
import type { InlineButton } from '@/lib/telegram/api'
import { escapeHtml } from '@/lib/telegram/api'
import { accountBalance, formatINR } from '@/lib/finance'
import { detectBank, isNoise, parseBankSms, type ParsedSms } from './parse'
import { classify, walletFor } from './classify'
import { aiParseSms } from './ai'
import { loadLedgerContext } from './context'
import { notify, txButtons } from './notify'
import { sweepPendingEmails } from './email'

export type IngestResult = { status: SignalStatus; transactionId?: string }

export async function ingestSms(admin: Admin, userId: string, chatId: string, sender: string, body: string): Promise<IngestResult> {
  // Store raw first: whatever happens next, the message is never lost.
  const { data: sig, error } = await admin.from('inbound_signals')
    .insert({ user_id: userId, kind: 'sms', sender, body, status: 'needs_review' }).select('id').single()
  if (error || !sig) throw error || new Error('signal insert failed')
  const setSig = async (patch: Record<string, unknown>) => { await admin.from('inbound_signals').update(patch).eq('id', sig.id) }

  try {
    return await processSms(admin, userId, chatId, body, setSig)
  } catch (e) {
    console.error('ingestSms failed', e)
    await setSig({ status: 'needs_review', error: String(e) })
    await notify(chatId, '⚠️ A bank SMS couldn\'t be auto-logged. It\'s waiting in the Review inbox on the Budget page.')
    return { status: 'needs_review' }
  }
}

async function processSms(
  admin: Admin, userId: string, chatId: string, body: string,
  setSig: (patch: Record<string, unknown>) => Promise<void>,
): Promise<IngestResult> {
  const bank = detectBank(body)
  if (!bank || isNoise(body)) { await setSig({ status: 'ignored' }); return { status: 'ignored' } }

  let parsed: ParsedSms | null = parseBankSms(body)
  if (!parsed) {
    parsed = await aiParseSms(body, bank)
    if (!parsed) { await setSig({ status: 'ignored', error: 'AI: not a transaction' }); return { status: 'ignored' } }
  }
  await setSig({ parsed })

  if (parsed.ref) {
    const { data: dup } = await admin.from('transactions').select('id').eq('user_id', userId).eq('bank_ref', parsed.ref).maybeSingle()
    if (dup) { await setSig({ status: 'duplicate', transaction_id: dup.id }); return { status: 'duplicate', transactionId: dup.id } }
  }

  const ctx = await loadLedgerContext(admin, userId)
  const wallet = walletFor(ctx.wallets, parsed.last4)

  // Self-transfer: the opposite leg of the same amount on my other bank within 15 min.
  if (wallet) {
    const others = ctx.wallets.filter(w => w.account_last4 && w.id !== wallet.id).map(w => w.id)
    if (others.length) {
      const { data: legs } = await admin.from('transactions').select('*')
        .eq('user_id', userId).eq('source', 'sms').eq('amount', parsed.amount)
        .eq('type', parsed.direction === 'credit' ? 'expense' : 'income')
        .in('account_id', others)
        .gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
        .order('created_at', { ascending: false }).limit(1)
      const leg = legs?.[0] as Transaction | undefined
      if (leg) {
        const from = parsed.direction === 'credit' ? leg.account_id! : wallet.id
        const to = parsed.direction === 'credit' ? wallet.id : leg.account_id!
        await admin.from('transactions').update({
          type: 'transfer', account_id: from, to_account_id: to, category_id: null, merchant: null, note: 'Self transfer',
        }).eq('id', leg.id)
        await admin.from('inbound_signals').update({ status: 'logged' }).eq('transaction_id', leg.id)
        await setSig({ status: 'logged', transaction_id: leg.id })
        const name = (id: string) => escapeHtml(ctx.wallets.find(w => w.id === id)?.name ?? '?')
        await notify(chatId, `🔁 Self-transfer ${formatINR(parsed.amount, true)} · ${name(from)} → ${name(to)}`,
          [[{ text: '↩️ Undo', callback_data: `u:tx:${leg.id}` }]])
        return { status: 'logged', transactionId: leg.id }
      }
    }
  }

  const d = classify(parsed, body, ctx)
  if (d.kind === 'review') {
    await setSig({ error: d.reason })
    await notify(chatId, `⚠️ ${escapeHtml(d.reason)}: ${formatINR(parsed.amount, true)} ${parsed.direction}. Check the Review inbox.`)
    return { status: 'needs_review' }
  }

  const { data: tx, error: txErr } = await admin.from('transactions').insert({
    user_id: userId, type: d.type, amount: parsed.amount, category_id: d.categoryId,
    account_id: d.accountId, to_account_id: d.toAccountId, goal_id: null, scope: 'self',
    txn_date: parsed.date, note: d.note, recurring_id: null,
    source: 'sms', merchant: d.merchant, bank_ref: parsed.ref, details: null,
  }).select('*').single()
  if (txErr) {
    if (txErr.code === '23505') { await setSig({ status: 'duplicate' }); return { status: 'duplicate' } }
    throw txErr
  }
  const status: SignalStatus = d.needsReview ? 'needs_review' : 'logged'
  await setSig({ status, transaction_id: tx.id })

  // Balance drift check against the bank's own number.
  let warn = ''
  const acct = ctx.wallets.find(w => w.id === d.accountId)
  if (parsed.balance != null && acct) {
    const computed = accountBalance(acct, [...ctx.txns, tx as Transaction])
    const diff = Math.round((parsed.balance - computed) * 100) / 100
    if (Math.abs(diff) > 1) warn = `\n⚠️ Bank says ${formatINR(parsed.balance, true)}, Life OS shows ${formatINR(computed, true)} (off by ${formatINR(diff, true)})`
  }

  const catName = ctx.categories.find(c => c.id === d.categoryId)?.name ?? (d.type === 'transfer' ? 'Cash' : 'Uncategorised')
  const who = parsed.counterparty ?? parsed.narration ?? ''
  let text = `📱 ${d.type === 'income' ? '+' : ''}${formatINR(parsed.amount, true)} · ${escapeHtml(acct?.name ?? '')}${who ? ` · ${escapeHtml(who)}` : ''} → <b>${escapeHtml(catName)}</b>${warn}`
  const extra: InlineButton[][] = []
  if (d.udhaar) {
    text += `\n🤝 Looks like ${escapeHtml(d.udhaar.person)} may be repaying ${formatINR(d.udhaar.outstanding)} udhaar.`
    extra.push([{ text: '✅ Yes, repayment', callback_data: `r:${tx.id}:y` }, { text: '❌ No', callback_data: `r:${tx.id}:n` }])
  }
  if (d.askTa) {
    text += '\n🎓 Is this your TA salary?'
    extra.push([{ text: '✅ Yes, TA salary', callback_data: `ta:${tx.id}` }])
  }
  if (d.needsReview) text += '\n❓ Pick a category and I\'ll remember it.'
  await notify(chatId, text, d.type === 'transfer' ? [[{ text: '↩️ Undo', callback_data: `u:tx:${tx.id}` }]] : txButtons(tx.id, extra))

  await sweepPendingEmails(admin, userId, chatId)
  return { status, transactionId: tx.id }
}
```

- [ ] **Step 8: `src/app/api/ingest/sms/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isIngestAuthorized, resolveIngestUser } from '@/lib/autolog/auth'
import { ingestSms } from '@/lib/autolog/sms'

// MacroDroid posts: ?from=<sender>, text/plain body = raw SMS. JSON {from, body} also accepted.
export const maxDuration = 30

export async function POST(request: Request) {
  if (!isIngestAuthorized(request)) return NextResponse.json({ ok: false }, { status: 401 })

  let sender = new URL(request.url).searchParams.get('from') || ''
  const raw = await request.text()
  let body = raw
  if ((request.headers.get('content-type') || '').includes('application/json')) {
    try { const j = JSON.parse(raw); body = String(j.body ?? ''); sender = String(j.from ?? sender) } catch { /* keep raw */ }
  }
  body = body.trim()
  if (!body) return NextResponse.json({ ok: false, error: 'empty body' }, { status: 400 })

  const admin = createAdminClient()
  const owner = await resolveIngestUser(admin)
  if (!owner) return NextResponse.json({ ok: false, error: 'no Telegram-linked user' }, { status: 500 })

  try {
    return NextResponse.json({ ok: true, ...(await ingestSms(admin, owner.userId, owner.chatId, sender, body)) })
  } catch (err) {
    console.error('ingest/sms: could not store signal', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
```

- [ ] **Step 9: Env var.** In PowerShell, run `vercel env add INGEST_SECRET production` and paste the token Het already has in MacroDroid. Repeat for `preview`. Add it to `.env.local` for local testing.

- [ ] **Step 10:** `npx tsc --noEmit` → clean; `node scripts/test-autolog.mts` → all passed.

- [ ] **Step 11: Local smoke test.** Start the dev server with preview_start, then in PowerShell:

```powershell
$h = @{ Authorization = "Bearer $env:INGEST_SECRET" }
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/ingest/sms?from=AD-SBIUPI" -Headers $h -ContentType 'text/plain' -Body 'Dear UPI user A/C X3424 debited by 1.00 on date 24Sep26 trf to Spotify India LL Refno 999000111222 If not u? call-1800111109 -SBI'
```

Expected: `{ ok: true, status: 'logged', transactionId: … }` and a Telegram ping "📱 ₹1.00 · SBI · Spotify India LL → Subscriptions". Re-posting the same body gives `status: 'duplicate'`. Tapping **↩️ Undo** in Telegram removes it. After that, delete the test signal: `delete from inbound_signals where body like '%999000111222%'`.

- [ ] **Step 12: Commit and push to `main`** (Vercel deploys). Then ask Het to press **Test actions** in MacroDroid and to reconcile Kalupur / SBI / Cash balances with the existing reconcile modal.

---

### Task 5: Telegram callbacks (category learning, Udhaar, TA, wallet)

**Files:** Create `src/lib/autolog/callbacks.ts`; modify `src/app/api/telegram/route.ts`.

**Interfaces:**
- Consumes: `loadLedgerContext`, `firstNameMatch`, `txButtons`, `editMessageText(chatId, messageId, text, buttons?)`, `editMessageReplyMarkup`.
- Produces: `handleAutologCallback(admin, callback): Promise<boolean>`. It returns true when it handled the callback.

- [ ] **Step 1: `src/lib/autolog/callbacks.ts`**

```ts
import type { Admin } from './auth'
import type { Transaction } from '@/lib/types'
import { answerCallbackQuery, editMessageText, editMessageReplyMarkup, escapeHtml, type InlineButton } from '@/lib/telegram/api'
import { formatINR, computeDebtStatuses } from '@/lib/finance'
import { loadLedgerContext } from './context'
import { firstNameMatch } from './classify'
import { txButtons } from './notify'

type Callback = { id: string; data?: string; message?: { message_id: number; text?: string; chat: { id: number } } }

const markLogged = (admin: Admin, txId: string) =>
  admin.from('inbound_signals').update({ status: 'logged' }).eq('transaction_id', txId).eq('status', 'needs_review')

export async function handleAutologCallback(admin: Admin, cb: Callback): Promise<boolean> {
  const m = (cb.data || '').match(/^(c|cs|r|ta|w):([0-9a-f-]{36})(?::(.+))?$/)
  if (!m || !cb.message) return false
  const [, action, txId, arg] = m
  const chatId = cb.message.chat.id
  const msgId = cb.message.message_id
  const prevText = escapeHtml(cb.message.text || '')

  const { data: profile } = await admin.from('profiles').select('id').eq('telegram_chat_id', String(chatId)).maybeSingle()
  const { data: txRow } = await admin.from('transactions').select('*').eq('id', txId).maybeSingle()
  const tx = txRow as Transaction | null
  if (!profile || !tx || tx.user_id !== profile.id) { await answerCallbackQuery(cb.id, 'That entry no longer exists'); return true }
  const ctx = await loadLedgerContext(admin, profile.id)

  if (action === 'c' || action === 'cs') {
    const kind = tx.type === 'income' ? 'income' : 'expense'
    const cats = ctx.categories.filter(c => c.kind === kind)
    if (action === 'c') {
      const rows: InlineButton[][] = []
      cats.forEach((c, i) => {
        if (i % 2 === 0) rows.push([])
        rows[rows.length - 1].push({ text: c.name, callback_data: `cs:${txId}:${i}` })
      })
      await editMessageReplyMarkup(chatId, msgId, rows)
      await answerCallbackQuery(cb.id)
      return true
    }
    const cat = cats[Number(arg)]
    if (!cat) { await answerCallbackQuery(cb.id, 'Unknown category'); return true }
    await admin.from('transactions').update({ category_id: cat.id }).eq('id', txId)
    if (tx.merchant) {
      await admin.from('merchant_rules').upsert({ user_id: profile.id, match: tx.merchant, category_id: cat.id }, { onConflict: 'user_id,match' })
    }
    await markLogged(admin, txId)
    await editMessageText(chatId, msgId, `${prevText}\n✅ Category → <b>${escapeHtml(cat.name)}</b>${tx.merchant ? ` · I'll remember "${escapeHtml(tx.merchant)}"` : ''}`, txButtons(txId))
    await answerCallbackQuery(cb.id, 'Saved')
    return true
  }

  if (action === 'r') {
    if (arg !== 'y') {
      await editMessageText(chatId, msgId, `${prevText}\n👍 Kept as income`, txButtons(txId))
      await answerCallbackQuery(cb.id)
      return true
    }
    const debt = computeDebtStatuses(ctx.txns)
      .filter(d => d.direction === 'lent' && d.outstanding > 0 && firstNameMatch(tx.note, d.person))
      .sort((a, b) => a.tx.txn_date.localeCompare(b.tx.txn_date))[0]
    if (!debt) { await answerCallbackQuery(cb.id, 'No open udhaar found'); return true }
    const applied = Math.min(Number(tx.amount), debt.outstanding)
    const extra = Math.round((Number(tx.amount) - applied) * 100) / 100
    // Repayment to me = transfer-style: money comes into the wallet (to_account_id).
    await admin.from('transactions').update({
      type: 'repayment', amount: applied, category_id: null, account_id: null, to_account_id: tx.account_id,
      person: debt.person, parent_tx_id: debt.tx.id,
    }).eq('id', txId)
    if (extra > 0) {
      await admin.from('transactions').insert({
        user_id: profile.id, type: 'income', amount: extra, category_id: tx.category_id, account_id: tx.account_id,
        to_account_id: null, goal_id: null, scope: 'self', txn_date: tx.txn_date, note: `${debt.person}: extra over udhaar`,
        recurring_id: null, source: tx.source ?? 'sms', merchant: tx.merchant ?? null,
      })
    }
    if (applied >= debt.outstanding) await admin.from('transactions').update({ is_settled: true }).eq('id', debt.tx.id)
    await markLogged(admin, txId)
    const left = debt.outstanding - applied
    await editMessageText(chatId, msgId,
      `${prevText}\n✅ ${escapeHtml(debt.person)} paid back ${formatINR(applied)}${left > 0 ? ` · ${formatINR(left)} still due` : ' · settled 🎉'}`,
      [[{ text: '↩️ Undo', callback_data: `u:tx:${txId}` }]])
    await answerCallbackQuery(cb.id, 'Recorded as repayment')
    return true
  }

  if (action === 'ta') {
    if (tx.merchant && tx.category_id) {
      await admin.from('merchant_rules').upsert({ user_id: profile.id, match: tx.merchant, category_id: tx.category_id }, { onConflict: 'user_id,match' })
    }
    await markLogged(admin, txId)
    await editMessageText(chatId, msgId, `${prevText}\n✅ TA salary. Future ones will log automatically.`, txButtons(txId))
    await answerCallbackQuery(cb.id, 'Saved')
    return true
  }

  if (action === 'w') {
    const wallet = ctx.wallets[Number(arg)]
    if (!wallet) { await answerCallbackQuery(cb.id, 'Unknown wallet'); return true }
    await admin.from('transactions').update({ account_id: wallet.id }).eq('id', txId)
    await markLogged(admin, txId)
    await editMessageText(chatId, msgId, `${prevText}\n✅ Paid from <b>${escapeHtml(wallet.name)}</b>`, txButtons(txId))
    await answerCallbackQuery(cb.id, 'Saved')
    return true
  }
  return false
}
```

- [ ] **Step 2: Delegate from the webhook.** In `src/app/api/telegram/route.ts`, add the import `import { handleAutologCallback } from '@/lib/autolog/callbacks'`. Inside `if (callback) {`, make this the first statement:

```ts
      if (await handleAutologCallback(admin, callback)) return NextResponse.json({ ok: true })
```

- [ ] **Step 3:** `npx tsc --noEmit` → clean.
- [ ] **Step 4: Manual check** (dev server + ngrok is not available, so verify on the deploy). Push, post a `Rs.1.00` test SMS with an unknown merchant (e.g. `trf to TEST SHOP`) to prod `/api/ingest/sms`, tap **✏️ Category → Food & Dining** in Telegram. Check `select * from merchant_rules where match='test shop'` returns 1 row. Undo the transaction and delete the rule and the test signal.
- [ ] **Step 5: Commit** `Add auto-logging Telegram callbacks`.

---

### Task 6: Email ingest + matching

**Files:** Replace `src/lib/autolog/email.ts`; create `src/app/api/ingest/email/route.ts`; add email-helper tests to `scripts/test-autolog.mts`.

**Interfaces:**
- Consumes: `aiParseOrder`, `ParsedOrder`, `loadLedgerContext`, `matchRule`, `notify`, `txButtons`.
- Produces: `platformFrom(from): string`, `regexOrderTotal(body): number | null`, `ingestEmails(admin, userId, chatId, messages: EmailIn[])`, `sweepPendingEmails(admin, userId, chatId)`.

The pure helpers go in `src/lib/autolog/parse.ts` so Node can test them.

- [ ] **Step 1: Failing tests.** Add `platformFrom, regexOrderTotal` to the parse import in `scripts/test-autolog.mts`, then append:

```ts
console.log('email helpers')
eq('platform amazon', platformFrom('Amazon.in <auto-confirm@amazon.in>'), 'amazon')
eq('platform zomato', platformFrom('Zomato <noreply@mail.zomato.com>'), 'zomato')
eq('platform ola', platformFrom('Ola <info@e.olacabs.com>'), 'olacabs')
eq('total grand', regexOrderTotal('Item total ₹600\nGrand Total: ₹649.00\nThanks'), 649)
eq('total rs', regexOrderTotal('Amount Paid Rs. 1,299'), 1299)
eq('total none', regexOrderTotal('Your package was delivered'), null)
```

- [ ] **Step 2: Run** → FAIL (`platformFrom` is not exported).

- [ ] **Step 3: Append to `src/lib/autolog/parse.ts`**

```ts
// "Zomato <noreply@mail.zomato.com>" → "zomato"
export function platformFrom(from: string): string {
  const domain = from.match(/@([\w.-]+)/)?.[1]?.toLowerCase() ?? from.toLowerCase()
  const skip = new Set(['com', 'in', 'co', 'net', 'bike', 'www', 'mail', 'email', 'e', 'm', 'mailer', 'info'])
  const parts = domain.split('.').filter(p => p && !skip.has(p))
  return parts[parts.length - 1] || domain
}

export function regexOrderTotal(body: string): number | null {
  const m = body.match(/(?:grand total|order total|total amount|amount paid|total paid|total payable|you paid)\s*:?\s*(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i)
  return m ? toNum(m[1]) : null
}
```

- [ ] **Step 4: Run** → all passed.

- [ ] **Step 5: Replace `src/lib/autolog/email.ts`**

```ts
import type { Admin } from './auth'
import type { Transaction } from '@/lib/types'
import { escapeHtml, type InlineButton } from '@/lib/telegram/api'
import { formatINR } from '@/lib/finance'
import { platformFrom, regexOrderTotal } from './parse'
import { matchRule } from './classify'
import { aiParseOrder, type ParsedOrder } from './ai'
import { loadLedgerContext } from './context'
import { notify, txButtons } from './notify'

export type EmailIn = { id: string; from: string; subject: string; date: string; body_text: string }

const GRACE_MS = 2 * 60 * 60_000
const WINDOW_MS = 30 * 60_000
const istDate = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const itemsLine = (o: ParsedOrder) =>
  o.items.length ? o.items.slice(0, 4).map(i => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') + (o.items.length > 4 ? '…' : '') : ''

export async function ingestEmails(admin: Admin, userId: string, chatId: string, messages: EmailIn[]): Promise<void> {
  for (const m of messages) {
    const { data: sig, error } = await admin.from('inbound_signals').insert({
      user_id: userId, kind: 'email', external_id: m.id, sender: m.from, subject: m.subject,
      body: m.body_text.slice(0, 15000), received_at: m.date, status: 'needs_review',
    }).select('id').single()
    if (error) { if (error.code === '23505') continue; throw error }

    const platform = platformFrom(m.from)
    let order: ParsedOrder | null
    try {
      order = await aiParseOrder(m.from, m.subject, m.body_text, platform)
    } catch (e) {
      const total = regexOrderTotal(m.body_text)
      order = total ? { platform, orderId: null, total, items: [] } : null
      if (!order) { await admin.from('inbound_signals').update({ error: `parse failed: ${e}` }).eq('id', sig.id); continue }
    }
    await admin.from('inbound_signals').update(order
      ? { parsed: order, status: 'pending_match' }
      : { status: 'ignored' }).eq('id', sig.id)
  }
  await sweepPendingEmails(admin, userId, chatId)
}

// Pending order emails either enrich a matching SMS expense, or after 2h become their own expense.
export async function sweepPendingEmails(admin: Admin, userId: string, chatId: string): Promise<void> {
  const { data: pending } = await admin.from('inbound_signals').select('id,received_at,parsed')
    .eq('user_id', userId).eq('status', 'pending_match').order('received_at')
  if (!pending?.length) return
  const ctx = await loadLedgerContext(admin, userId)
  const miscId = ctx.categories.find(c => c.kind === 'expense' && c.name === 'Misc')?.id ?? null

  for (const s of pending) {
    const order = s.parsed as ParsedOrder
    const at = new Date(s.received_at).getTime()
    const rule = matchRule(order.platform, ctx.rules)
    const ruleCat = rule && ctx.categories.find(c => c.id === rule.category_id && c.kind === 'expense') ? rule.category_id : null
    const details = { platform: order.platform, order_id: order.orderId, items: order.items }

    const { data: cands } = await admin.from('transactions').select('*')
      .eq('user_id', userId).eq('source', 'sms').eq('type', 'expense').is('details', null)
      .gte('amount', order.total - 1).lte('amount', order.total + 1)
      .gte('created_at', new Date(at - WINDOW_MS).toISOString()).lte('created_at', new Date(at + WINDOW_MS).toISOString())
      .order('created_at').limit(1)
    const match = cands?.[0] as Transaction | undefined

    if (match) {
      const patch: Record<string, unknown> = { details, merchant: order.platform }
      if (ruleCat && (!match.category_id || match.category_id === miscId)) patch.category_id = ruleCat
      await admin.from('transactions').update(patch).eq('id', match.id)
      await admin.from('inbound_signals').update({ status: 'enriched', transaction_id: match.id }).eq('id', s.id)
      await admin.from('inbound_signals').update({ status: 'logged' }).eq('transaction_id', match.id).eq('status', 'needs_review')
      const line = itemsLine(order)
      await notify(chatId, `✉️ ${formatINR(match.amount, true)} is <b>${escapeHtml(order.platform)}</b>${line ? `: ${escapeHtml(line)}` : ''}`)
      continue
    }
    if (Date.now() - at < GRACE_MS) continue

    // No bank SMS ever came: wallet/card/Amazon Pay spend. Default to Kalupur, ask which wallet.
    const primary = ctx.wallets.find(w => w.account_last4 === '2270') ?? ctx.wallets[0]
    if (!primary) continue
    const { data: tx, error } = await admin.from('transactions').insert({
      user_id: userId, type: 'expense', amount: order.total, category_id: ruleCat ?? miscId,
      account_id: primary.id, to_account_id: null, goal_id: null, scope: 'self', txn_date: istDate(at),
      note: `${order.platform} order`, recurring_id: null, source: 'email', merchant: order.platform, details,
    }).select('id').single()
    if (error || !tx) { await admin.from('inbound_signals').update({ status: 'needs_review', error: String(error?.message) }).eq('id', s.id); continue }
    await admin.from('inbound_signals').update({ status: 'needs_review', transaction_id: tx.id }).eq('id', s.id)
    const walletRow: InlineButton[] = ctx.wallets.slice(0, 4).map((w, i) => ({ text: w.name, callback_data: `w:${tx.id}:${i}` }))
    const line = itemsLine(order)
    await notify(chatId,
      `✉️ ${formatINR(order.total, true)} · <b>${escapeHtml(order.platform)}</b>${line ? `: ${escapeHtml(line)}` : ''}\nNo bank SMS matched. Logged to ${escapeHtml(primary.name)}. Which wallet paid?`,
      txButtons(tx.id, [walletRow]))
  }
}
```

- [ ] **Step 6: `src/app/api/ingest/email/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isIngestAuthorized, resolveIngestUser } from '@/lib/autolog/auth'
import { ingestEmails, type EmailIn } from '@/lib/autolog/email'

// Apps Script posts { messages: [...] } every 10 min; an empty batch still runs the pending sweep.
export const maxDuration = 60

export async function POST(request: Request) {
  if (!isIngestAuthorized(request)) return NextResponse.json({ ok: false }, { status: 401 })
  let payload: { messages?: unknown }
  try { payload = await request.json() } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }
  const list = Array.isArray(payload.messages) ? payload.messages.slice(0, 50) : []
  const messages: EmailIn[] = list
    .map((m: Record<string, unknown>) => ({
      id: String(m.id ?? ''), from: String(m.from ?? ''), subject: String(m.subject ?? ''),
      date: String(m.date ?? new Date().toISOString()), body_text: String(m.body_text ?? ''),
    }))
    .filter(m => m.id && m.body_text)

  const admin = createAdminClient()
  const owner = await resolveIngestUser(admin)
  if (!owner) return NextResponse.json({ ok: false, error: 'no Telegram-linked user' }, { status: 500 })
  try {
    await ingestEmails(admin, owner.userId, owner.chatId, messages)
    return NextResponse.json({ ok: true, received: messages.length })
  } catch (err) {
    console.error('ingest/email failed', err)
    return NextResponse.json({ ok: false }, { status: 500 })  // Apps Script keeps LAST_TS and retries
  }
}
```

- [ ] **Step 7:** `npx tsc --noEmit` → clean; fixtures pass.
- [ ] **Step 8: Deploy + verify.** Push. Ask Het to run `testConnection` in Apps Script (expect `200 {"ok":true,"received":0}`), then `setup`. Place or find a recent order email. After the next 10-minute run, check `select status, parsed from inbound_signals where kind='email' order by created_at desc limit 5`.
- [ ] **Step 9: Commit** `Add order email ingest and matching`.

---

### Task 7: Budget page: review inbox + source badges

**Files:** Modify `src/lib/data.ts`; create `src/app/(dashboard)/budget/ReviewInboxCard.tsx`; modify `page.tsx`, `TransactionsTab.tsx` and `budget.css`.

**Interfaces — Produces:** `getReviewSignals(userId): Promise<InboundSignal[]>`, `dismissSignal(id): Promise<void>`, `getLastSignalTimes(userId): Promise<{ sms: string | null; email: string | null }>`.

- [ ] **Step 1: Data functions.** Append to the finance section of `src/lib/data.ts` and add `InboundSignal` to the types import:

```ts
// ─── Auto-logging review inbox ───
export async function getReviewSignals(userId: string): Promise<InboundSignal[]> {
  const { data, error } = await supabase.from('inbound_signals').select('*')
    .eq('user_id', userId).eq('status', 'needs_review').order('received_at', { ascending: false }).limit(50)
  if (error) throw error
  return (data || []) as InboundSignal[]
}
export async function dismissSignal(id: string): Promise<void> {
  const { error } = await supabase.from('inbound_signals').update({ status: 'ignored' }).eq('id', id)
  if (error) throw error
}
export async function getLastSignalTimes(userId: string): Promise<{ sms: string | null; email: string | null }> {
  const last = async (kind: 'sms' | 'email') => {
    const { data } = await supabase.from('inbound_signals').select('received_at').eq('user_id', userId).eq('kind', kind)
      .order('received_at', { ascending: false }).limit(1).maybeSingle()
    return data?.received_at ?? null
  }
  const [sms, email] = await Promise.all([last('sms'), last('email')])
  return { sms, email }
}
```

- [ ] **Step 2: `ReviewInboxCard.tsx`** (card + portaled modal, following `UdhaarCard` conventions)

```tsx
'use client'

// Auto-logging review inbox: SMS/emails that couldn't be logged confidently.
// Portaled modal (transformed ancestors trap position:fixed).

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { InboundSignal } from '@/lib/types'
import { getReviewSignals, dismissSignal, getLastSignalTimes } from '@/lib/data'
import { Inbox, X, Check, MessageSquare, Mail } from 'lucide-react'

const ago = (iso: string | null) => {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${m}m ago`
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 1440)}d ago`
}

export default function ReviewInboxCard({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const [items, setItems] = useState<InboundSignal[]>([])
  const [last, setLast] = useState<{ sms: string | null; email: string | null }>({ sms: null, email: null })
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const [rows, times] = await Promise.all([getReviewSignals(userId), getLastSignalTimes(userId)])
    setItems(rows); setLast(times)
  }, [userId])
  useEffect(() => { load() }, [load])

  const dismiss = async (id: string) => { await dismissSignal(id); await load(); onChanged() }

  return (
    <>
      <button className="bg-card rv-card" onClick={() => setOpen(true)}>
        <div className="rv-card-icon"><Inbox size={18} /></div>
        <div className="rv-card-main">
          <div className="rv-card-title">Auto-log review {items.length > 0 && <span className="rv-badge">{items.length}</span>}</div>
          <div className="rv-card-sub">📱 last SMS {ago(last.sms)} · ✉️ last email {ago(last.email)}</div>
        </div>
      </button>
      {open && createPortal(
        <div className="bg-overlay" onClick={() => setOpen(false)}>
          <div className="bg-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="bg-modal-head">
              <h3>Needs a look ({items.length})</h3>
              <button className="bg-icon-btn" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>
            {items.length === 0 && <p className="rv-empty">All clear. Everything was logged automatically.</p>}
            <div className="rv-list">
              {items.map(s => (
                <div key={s.id} className="rv-item">
                  <div className="rv-item-head">
                    {s.kind === 'sms' ? <MessageSquare size={14} /> : <Mail size={14} />}
                    <span>{s.sender || s.kind}</span><span className="rv-time">{ago(s.received_at)}</span>
                  </div>
                  {s.subject && <div className="rv-subject">{s.subject}</div>}
                  <div className="rv-body">{s.body.slice(0, 280)}</div>
                  {s.error && <div className="rv-error">{s.error}</div>}
                  <div className="rv-actions">
                    <span className="rv-hint">{s.transaction_id ? 'Logged. Fix the category in Telegram or the Transactions tab.' : 'Not logged. Add it manually if needed.'}</span>
                    <button className="bg-btn bg-btn--ghost" onClick={() => dismiss(s.id)}><Check size={14} /> Done</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
```

Before writing, check that the class names `bg-icon-btn`, `bg-btn`, `bg-btn--ghost` and `bg-modal-head h3` exist in `budget.css` (`Select-String budget.css -Pattern 'bg-icon-btn|bg-btn--ghost'`). If they don't, use whatever `UdhaarCard.tsx` uses for its close and secondary buttons.

- [ ] **Step 3: Styles.** Append to `budget.css`, using theme vars only:

```css
/* Auto-log review inbox */
.rv-card { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; cursor: pointer; margin-bottom: 12px; }
.rv-card-icon { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--accent-soft, rgba(150,250,194,.12)); color: var(--accent); }
.rv-card-main { flex: 1; min-width: 0; }
.rv-card-title { font-weight: 600; display: flex; align-items: center; gap: 8px; }
.rv-card-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.rv-badge { background: var(--accent); color: var(--on-accent); border-radius: 999px; font-size: 11px; padding: 1px 7px; }
.rv-empty { color: var(--text-muted); padding: 12px 0; }
.rv-list { display: flex; flex-direction: column; gap: 10px; max-height: 60vh; overflow-y: auto; }
.rv-item { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.rv-item-head { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
.rv-time { margin-left: auto; }
.rv-subject { font-weight: 600; margin-top: 4px; }
.rv-body { font-size: 13px; margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
.rv-error { font-size: 12px; color: var(--danger, #E85D5D); margin-top: 4px; }
.rv-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.rv-hint { font-size: 12px; color: var(--text-muted); flex: 1; }
.tx-src { font-size: 11px; margin-left: 6px; opacity: .8; }
.tx-items { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
```

First check the actual variable names used in `budget.css` (`Select-String budget.css -Pattern 'var\(--' | Select -First 20`), and swap `--text-muted` / `--border` / `--accent-soft` for the names that exist there.

- [ ] **Step 4: Mount.** In `page.tsx`, import `ReviewInboxCard` and render it directly above `<UdhaarCard …/>`:

```tsx
      <ReviewInboxCard userId={userId!} onChanged={() => { load(); triggerRefresh() }} />
```

- [ ] **Step 5: Badges.** In `TransactionsTab.tsx`, find the element that renders a row's note or category label (`Select-String TransactionsTab.tsx -Pattern 'note'`). Append after the note text:

```tsx
{t.source === 'sms' && <span className="tx-src" title="Logged from bank SMS">📱</span>}
{t.source === 'email' && <span className="tx-src" title="Logged from order email">✉️</span>}
```

Inside the expanded-row block (`expandedId === t.id`), add:

```tsx
{t.details?.items?.length ? (
  <div className="tx-items">{t.details.platform}: {t.details.items.map(i => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ')}</div>
) : null}
```

- [ ] **Step 6: Verify.** Run `npx tsc --noEmit` and `$env:NODE_OPTIONS="--max-old-space-size=6144"; npm run build` (stop the dev server first). Then preview_start, open `/budget`, and confirm the card shows the last-SMS time. Open the modal, dismiss an item, and check a 📱 badge on an SMS transaction. Check both themes and a mobile width, and take a screenshot.
- [ ] **Step 7: Commit + push** `Add auto-log review inbox and source badges`.

---

## Self-Review Notes

- Spec coverage:
  - Wallet last4 → T1
  - Columns and tables → T1
  - Categories and rules seed → T1
  - Balance reset (existing modal) → T4 step 12
  - SMS guard, parse, AI, dedupe, self-transfer, ATM, charges, known income, fallback, balance check, Udhaar suggestion → T2–T4
  - Ping and callbacks → T4–T5
  - Email flow and grace-period sweep → T6
  - Review inbox, badges and last-seen times → T7
  - Error handling (store raw first, 200 after store, 401) → T4 and T6
- Signatures checked: `ingestSms` (5 args), `sweepPendingEmails(admin, userId, chatId)` (Task 4 stub matches Task 6), `aiParseOrder(from, subject, body, platform)` (T4 defines, T6 calls), `editMessageText(..., buttons?)` (T4 defines, T5 uses).
