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

// Covers every sample format: "A/c XX2270 debited by Rs.90.00 on 25-08-26",
// "A/C XX2270 IS DEBITED BY RS.15.34 ON 31-03-2026", "A/C X3424 debited by 179.00 on date 08May26",
// "A/c X2270-credited by Rs.360 on 13Nov25".
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
