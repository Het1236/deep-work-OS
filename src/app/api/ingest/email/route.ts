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
