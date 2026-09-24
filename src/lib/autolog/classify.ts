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
