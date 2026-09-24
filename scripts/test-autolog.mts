// Run: node scripts/test-autolog.mts   (Node 22.18+ strips TS types)
import { parseBankSms, isNoise, parseSmsDate, detectBank, platformFrom, regexOrderTotal } from '../src/lib/autolog/parse.ts'
import { classify, normalizeMerchant, firstNameMatch } from '../src/lib/autolog/classify.ts'

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

console.log('email helpers')
eq('platform amazon', platformFrom('Amazon.in <auto-confirm@amazon.in>'), 'amazon')
eq('platform zomato', platformFrom('Zomato <noreply@mail.zomato.com>'), 'zomato')
eq('platform ola', platformFrom('Ola <info@e.olacabs.com>'), 'olacabs')
eq('total grand', regexOrderTotal('Item total ₹600\nGrand Total: ₹649.00\nThanks'), 649)
eq('total rs', regexOrderTotal('Amount Paid Rs. 1,299'), 1299)
eq('total none', regexOrderTotal('Your package was delivered'), null)

if (failed) { console.log(`\n${failed} failed`); process.exit(1) } else console.log('\nall passed')
