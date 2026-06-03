import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyCapture } from '@/lib/capture/apply'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let text = ''
  try { text = (await request.json())?.text ?? '' } catch { /* ignore */ }
  text = String(text).trim()
  if (!text) return NextResponse.json({ error: 'Empty input' }, { status: 400 })

  try {
    const { results } = await applyCapture(supabase, user.id, text)
    return NextResponse.json({ ok: results.some(r => r.ok), results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to capture'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
