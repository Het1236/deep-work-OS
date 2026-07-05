import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAIProvider, isAIConfigured, AINotConfiguredError } from '@/lib/ai'

// Pantry → pure-veg, high-protein, gut-health-aware dish suggestions,
// shaped as a daily rhythm: morning drink, meals, night finisher.
// Text-only — works with whichever provider AI_PROVIDER selects.

type SuggestDish = {
  name: string
  why: string
  recipe_hint: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  slot?: string
}

function coerce(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanDish(o: any, slot?: string): SuggestDish | null {
  if (!o || typeof o.name !== 'string' || !o.name.trim()) return null
  return {
    name: String(o.name).slice(0, 100),
    why: String(o.why || '').slice(0, 250),
    recipe_hint: String(o.recipe_hint || '').slice(0, 300),
    kcal: coerce(o.kcal), protein_g: coerce(o.protein_g),
    carbs_g: coerce(o.carbs_g), fat_g: coerce(o.fat_g),
    slot: slot || (typeof o.slot === 'string' ? o.slot : undefined),
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAIConfigured()) return NextResponse.json({ error: 'AI is not configured on the server.' }, { status: 503 })

  let extra = ''
  try { extra = String((await request.json())?.extra || '').slice(0, 200) } catch { /* optional body */ }

  // Load pantry + targets + today's totals with the authed client (RLS-scoped).
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const [pantryRes, targetsRes, mealsRes] = await Promise.all([
    supabase.from('pantry_items').select('name').eq('user_id', user.id).order('name'),
    supabase.from('nutrition_targets').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('meals').select('kcal,protein_g,carbs_g,fat_g').eq('user_id', user.id).eq('meal_date', today),
  ])

  const pantry = (pantryRes.data || []).map(p => p.name)
  if (pantry.length === 0) {
    return NextResponse.json({ error: 'Your pantry is empty — add a few ingredients first.' }, { status: 422 })
  }

  const t = targetsRes.data
  const eaten = (mealsRes.data || []).reduce(
    (s, m) => ({
      kcal: s.kcal + Number(m.kcal), p: s.p + Number(m.protein_g),
      c: s.c + Number(m.carbs_g), f: s.f + Number(m.fat_g),
    }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  )
  const remaining = t
    ? `Remaining today: ~${Math.max(0, t.target_kcal - eaten.kcal)} kcal, ${Math.max(0, t.protein_g - eaten.p)} g protein, ${Math.max(0, t.carbs_g - eaten.c)} g carbs, ${Math.max(0, t.fat_g - eaten.f)} g fat.`
    : 'No targets set — assume ~2200 kcal, 120 g protein for an active young man.'

  const prompt = [
    'You are an Indian vegetarian nutrition coach. Suggest dishes using ONLY these available ingredients',
    '(plus universal staples: salt, water, common Indian spices, small amounts of oil/ghee):',
    `AVAILABLE: ${pantry.join(', ')}${extra ? `, ${extra}` : ''}.`,
    'RULES:',
    '- PURE VEGETARIAN: no meat, no fish, no eggs.',
    '- Bias strongly toward HIGH PROTEIN density per serving.',
    '- Also support gut health and metabolism in your picks.',
    `- ${remaining}`,
    '- Realistic Indian home cooking — nothing that needs unavailable ingredients.',
    'Return ONLY JSON, exactly:',
    '{ "morning_drink": { "name": string, "why": string, "recipe_hint": string, "kcal": number, "protein_g": number, "carbs_g": number, "fat_g": number },',
    '  "meals": [ 2-3 dishes, same fields plus "slot": "breakfast"|"lunch"|"dinner"|"snack" ],',
    '  "night_finisher": { same fields as morning_drink } }',
    'morning_drink = a metabolism-kickstart drink to start the day (e.g. jeera water, methi water, lemon-ginger warm water).',
    'night_finisher = a gut-health wind-down item to end the day (e.g. haldi milk, spiced curd/buttermilk, isabgol with warm water).',
    'The "why" field: one line on the protein / gut / metabolism benefit.',
  ].join('\n')

  try {
    const raw = await getAIProvider().complete(
      [{ role: 'user', content: prompt }],
      { json: true, temperature: 0.6, maxTokens: 1400 },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any
    try { parsed = JSON.parse(raw) } catch {
      return NextResponse.json({ error: 'AI returned an unreadable result — try again.' }, { status: 502 })
    }

    const morning = cleanDish(parsed.morning_drink, 'drink')
    const night = cleanDish(parsed.night_finisher, 'drink')
    const meals = (Array.isArray(parsed.meals) ? parsed.meals : [])
      .map((m: unknown) => cleanDish(m))
      .filter(Boolean)
      .slice(0, 4) as SuggestDish[]

    if (!morning && !night && meals.length === 0) {
      return NextResponse.json({ error: 'No usable suggestions came back — try again.' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, morning_drink: morning, meals, night_finisher: night })
  } catch (err) {
    if (err instanceof AINotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 })
    console.error('nutrition/suggest error:', err)
    return NextResponse.json({ error: 'Suggestion failed — please try again.' }, { status: 500 })
  }
}
