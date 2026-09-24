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
