# Bank SMS + Order Email Auto-Logging — Design

**Date:** 2026-09-24
**Status:** Draft, awaiting user review
**Sub-project:** 1 of 2 (sub-project 2 = Book Library, separate spec)

## Goal

Stop logging bank spending by hand. Bank SMS from **Kalupur (KCCBL)** and **SBI**
are forwarded from Het's Android phone and logged instantly as transactions.
Online-order emails (Amazon, Flipkart, Swiggy, Zomato, Myntra, …) either enrich
the matching bank debit with item details or, if no bank debit ever arrives
(Amazon Pay, wallets, cards), become their own expense. Cash and lending remain
manual through the existing capture engine (Telegram / ⌘J).

## Non-goals

- Reading SMS from inside the PWA (impossible; a phone automation forwards them).
- Full Google OAuth in Life OS (unverified apps get 7-day token expiry in Testing mode).
- Automatically creating lend / borrow / repayment rows. Debt changes happen only after a user tap.
- Touching AI Report or Group features.

## Accounts

| Wallet  | Bank    | `account_last4` |
|---------|---------|-----------------|
| Kalupur | KCCBL   | `2270`          |
| SBI     | SBI     | `3424`          |
| Cash    | —       | —               |

**Wallet resolution uses the last 4 digits, never the sender.** One sample SMS was
branded SBI but referenced `X2270`, and it still maps to Kalupur. If the digits
match no wallet, the message goes to `needs_review`.

The existing seeded `UPI` / `Bank` wallets are archived (`is_active=false`),
never deleted, so their history is preserved.

## Data model changes

### `finance_accounts`
- `account_last4 text null`. The existing `kalupur` and `SBI` wallets get `2270` and `3424`.

### `transactions`
- `source text not null default 'manual'`, one of `manual|sms|email|telegram`
- `merchant text null`, normalised lowercase key (e.g. `spotify`)
- `bank_ref text null`, with a unique index on `(user_id, bank_ref) where bank_ref is not null` (the dedupe key)
- `details jsonb null`, e.g. `{ platform, order_id, items: [{ name, qty, price }] }`

### New: `inbound_signals`
Raw audit trail and review inbox. Every SMS and email is stored **before** parsing.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| kind | text | `sms` \| `email` |
| external_id | text null | Gmail message id; unique `(user_id, kind, external_id)` |
| sender | text | SMS sender ID or email from-address |
| subject | text null | email only |
| body | text | raw text |
| received_at | timestamptz | |
| parsed | jsonb null | parser output |
| status | text | `logged` \| `enriched` \| `pending_match` \| `needs_review` \| `ignored` \| `duplicate` |
| transaction_id | uuid null | fk → transactions, on delete set null |
| error | text null | |

RLS: owner-only select/update; inserts happen through the service role.

### New: `merchant_rules`
`id, user_id, match text` (lowercase substring tested against the normalised counterparty
and narration; the longest match wins), `category_id`, `created_at`, unique `(user_id, match)`.
Seeded rules:

- counterparty `JIGNESH` → **Allowance** (father)
- merchant keywords: spotify / netflix / youtube / prime → **Subscriptions**; swiggy / zomato → **Food & Dining**; amazon / flipkart / myntra → **Shopping**

### Categories added
**Subscriptions**, **Fitness & Sports**, **Bank Charges** (expense); **TA Salary** (income).

### Balance reset
The budget page already has `ReconcileModal` → `adjustWalletBalance`, which adds a dated
adjustment transaction. Het uses it once for Kalupur, SBI and Cash **before** SMS goes live.
No new screen is needed, and no existing transaction is changed or deleted.

## Ingest endpoints

Both endpoints require the header `Authorization: Bearer ${INGEST_SECRET}` (a new Vercel env var).
They use `createAdminClient()` and resolve the single user the same way the Telegram webhook does.

### `POST /api/ingest/sms?from=<sender>`
- Body: `text/plain` holding the raw SMS text. JSON `{from, body}` is also accepted.
  MacroDroid does not JSON-escape magic text, so plain text is the primary format.
- Returns 200 once the raw signal is stored, even if parsing fails, so the phone never retries.

### `POST /api/ingest/email`
- Body: JSON `{ messages: [{ id, from, subject, date, body_text }] }` from the Apps Script.
- Also runs the **pending-match sweep** (see below), because the Hobby-plan cron runs too rarely.

## SMS pipeline

1. Store the raw text in `inbound_signals`.
2. **Guard:** the body must contain `KCCBL` or `SBI`; skip OTP and promotional patterns (`OTP`, `offer`, `pre-approved`, …) → `ignored`.
3. **Parse** (`src/lib/finance/sms/`): `kccbl.ts`, then `sbi.ts`, then a Groq fallback that returns strict JSON.
   Output: `{ direction: 'debit'|'credit', amount, date, last4, ref, counterparty, balance? }`.
   - KCCBL formats: the mixed-case UPI debit (`debited by Rs.90.00 on 25-08-26 … RefNo`); the upper-case
     `IS DEBITED BY RS.x ON dd-mm-yyyy BY TRANSFER.BAL RS.y … INFO: <narration>`; the upper-case credit with
     `INFO: UPI/CR/<ref>/<name>/…`.
   - SBI formats: `Dear UPI user A/C X3424 debited by 179.00 on date 08May26 trf to <payee> Refno <ref>`;
     `Dear SBI User, your A/c X2270-credited by Rs.360 on 13Nov25 transfer from <name> Ref No <ref>`.
   - Date formats: `dd-mm-yy`, `dd-mm-yyyy`, `ddMonyy`. The transaction date is the IST date.
4. **Dedupe** on `bank_ref` → status `duplicate`, stop.
5. **Classify:**
   1. **Self-transfer:** a debit on one of Het's wallets and a credit on the other for the same amount
      within ±15 min (either arrival order). The two become one `transfer` row; the second signal
      links to it.
   2. **ATM / cash withdrawal** → `transfer` from the bank wallet to Cash.
   3. **Bank charges** (`SMS CHRG`, `CHARGES`, `CHRG`) → expense, category Bank Charges.
   4. **Known income:** a counterparty rule hit (father → Allowance). A KCCBL credit of exactly ₹4000
      whose text contains `UNIV` / `AHMEDABAD` → TA Salary. The first such match asks for
      confirmation, and the tap saves the counterparty text as a rule.
   5. **Otherwise:** debit → expense, credit → income. The category comes from `merchant_rules`, then
      a keyword guess, then Misc (Misc also marks the signal `needs_review`).
6. **Insert** the transaction with `source='sms'`, `merchant`, `bank_ref`, and `note` = counterparty.
7. **Balance check:** if the SMS reports a balance that differs from `accountBalance()` by more
   than ₹1, the ping carries a ⚠️ with the difference. Nothing is auto-corrected.
8. **Udhaar suggestion (never automatic):** on a credit whose counterparty fuzzy-matches (first name)
   a person with an open debt, the transaction stays **income** and the ping offers
   `[✅ Yes, repayment] [❌ No]`. Only ✅ converts it to a `repayment` against the oldest open debt.
   Allowance and TA Salary credits never trigger this suggestion.

## Email pipeline

- The Apps Script (runs in Het's own Google account on a 10-min trigger) searches an allow-list of
  order senders with `newer_than:1d -label:LifeOS/logged`, posts the messages, then applies the label.
- The server extracts `{ platform, order_id, total, items[] }`: regex for the major platforms,
  Groq for the rest. Messages that aren't orders (shipping updates, promos) → `ignored`.
- **Match:** an `sms`-sourced expense with |amount − total| ≤ ₹1, `created_at` (≈ SMS arrival,
  since `txn_date` is a date only) within ±30 min of the email date, and no `details` yet.
  On a match: attach `details`, set the merchant, set the category via rules if it is still Misc
  or empty, mark the signal `enriched`, and send a short follow-up ping with the items.
- **No match** → `pending_match`. Each SMS insert and each email-endpoint call re-checks pending
  signals: a match enriches the expense. A signal older than 2 h with no match becomes its own
  expense (`source='email'`). Email alone can't tell which wallet paid, so the ping asks with
  wallet buttons `[Kalupur] [SBI] [Cash]`. Until one is tapped, the expense is logged to Kalupur
  (the primary spending account) and the signal stays `needs_review`.

## Telegram ping

```
📱 ₹179.00 · SBI · Spotify → Subscriptions
[✏️ Category] [↩️ Undo]
```
- `✏️` shows the categories of the right kind as buttons. A pick updates the transaction **and**
  upserts a `merchant_rules` row.
- `↩️` reuses the existing `u:tx:<id>` undo callback.
- Callback data must stay under 64 bytes: `c:<txShortId>` → category list → `cs:<txShortId>:<catIdx>`.
- Udhaar and TA-salary confirmations use `r:<txShortId>:y|n` and `ta:<txShortId>`.

## UI

- **Budget page:** a "Review inbox" card (signals with `needs_review`) where each row offers
  fix / assign wallet / ignore; 📱 / ✉️ source badges on transactions; order items shown when
  `details` is present.
- The review inbox header shows when the last SMS and the last email arrived, a quick way to
  notice that MacroDroid or the Apps Script has stopped. There is no separate Settings page;
  the setup steps live in this spec.

## Error handling

- The raw text is stored first, so parser or database failures leave a `needs_review` signal and
  nothing is lost. A fixed parser can replay failed signals.
- A Groq failure or timeout → `needs_review` and a ping saying "couldn't auto-log, tap to fix".
- A wrong or missing bearer token → 401, and nothing is stored.

## Setup (user side)

- **MacroDroid (done):** two *SMS Received* triggers (text contains `KCCBL` / `SBI`) → HTTP POST
  to `/api/ingest/sms?from=[sms_number]`, bearer header, `text/plain` body `[sms_message]`;
  battery optimisation off.
- **Apps Script:** paste the provided script, set the `INGEST_SECRET` script property, and run `setup()` once.

## Testing

- Parser fixtures built from Het's 5 real SMS plus synthetic ATM and charge cases, run with a
  `tsx` script (the repo has no test framework).
- Classification fixtures: self-transfer pairing in both orders, dedupe, father → Allowance,
  the Udhaar suggestion.
- `npx tsc --noEmit` and `npm run build`; live curl to a preview deploy, then a MacroDroid
  "Test actions" run.

## Rollout order

1. Migrations, wallet last-4 digits, and seed rules and categories. Het reconciles balances with the existing modal.
2. SMS parsers + fixtures, `/api/ingest/sms`, Telegram ping (SMS goes live).
3. Category change callback and merchant-rule learning.
4. Email ingest, matching, and the Apps Script.
5. Budget review inbox and source badges.
