import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// Connection status
export async function GET() {
  const { supabase, user } = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await supabase.from('profiles').select('telegram_chat_id').eq('id', user.id).single()
  return NextResponse.json({ connected: !!data?.telegram_chat_id })
}

// Generate a one-time link code
export async function POST() {
  const { supabase, user } = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const code = makeCode()
  const { error } = await supabase.from('profiles').update({ telegram_link_code: code }).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ code, botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null })
}

// Disconnect
export async function DELETE() {
  const { supabase, user } = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await supabase.from('profiles').update({ telegram_chat_id: null, telegram_linked_at: null, telegram_link_code: null }).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connected: false })
}
