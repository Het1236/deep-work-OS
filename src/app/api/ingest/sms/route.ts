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
