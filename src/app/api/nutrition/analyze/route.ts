import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getVisionProvider, isVisionConfigured, AINotConfiguredError } from '@/lib/ai'

// Meal photo → itemized macro estimate (Gemini vision).
// Client compresses images to ≤1280px JPEG before sending, so base64 stays small.

export type AnalyzedItem = {
  name: string
  portion: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  confidence: 'high' | 'medium' | 'low'
}

const MAX_BASE64_CHARS = 3_000_000 // ~2.2 MB binary — under Vercel's body limit with headroom

function buildPrompt(hint?: string): string {
  return [
    'You are a precise nutrition analyst. Identify EVERY distinct food and drink item in this meal photo.',
    'The user is in India — recognize Indian dishes and preparations (roti, dal, sabzi, paneer, khichdi, poha, idli, dosa, curd, buttermilk, etc.).',
    'For each item: estimate the visible portion in household measures AND grams (e.g. "2 medium rotis (~80 g)", "1 katori dal (~150 g)"),',
    'then estimate calories and macros for THAT portion. Be conservative and realistic; if unsure between sizes, pick the middle.',
    'Rate your confidence per item: "high" (clearly identifiable, standard portion), "medium" (identifiable but portion uncertain), "low" (guessing the dish or hidden ingredients like oil/ghee).',
    hint ? `The user says the meal includes: ${hint}. Trust this over visual ambiguity.` : '',
    'Return ONLY JSON, exactly this shape:',
    '{ "meal_name": string, "items": [ { "name": string, "portion": string, "kcal": number, "protein_g": number, "carbs_g": number, "fat_g": number, "confidence": "high"|"medium"|"low" } ] }',
  ].filter(Boolean).join('\n')
}

function coerceNumber(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isVisionConfigured()) {
    return NextResponse.json({ error: 'Photo analysis needs GEMINI_API_KEY configured on the server.' }, { status: 503 })
  }

  let body: { imageBase64?: string; mimeType?: string; hint?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const imageBase64 = (body.imageBase64 || '').trim()
  const mimeType = body.mimeType || 'image/jpeg'
  if (!imageBase64) return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  if (imageBase64.length > MAX_BASE64_CHARS) return NextResponse.json({ error: 'Image too large — try again (it should auto-compress).' }, { status: 413 })
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) return NextResponse.json({ error: 'Unsupported image type' }, { status: 415 })

  try {
    const provider = getVisionProvider()
    if (!provider.completeVision) throw new Error('Vision provider unavailable')
    const raw = await provider.completeVision(
      buildPrompt(body.hint?.slice(0, 300)),
      [{ mimeType, dataBase64: imageBase64 }],
      { json: true, temperature: 0.2, maxTokens: 1500 },
    )

    let parsed: { meal_name?: unknown; items?: unknown }
    try { parsed = JSON.parse(raw) } catch {
      return NextResponse.json({ error: 'AI returned an unreadable result — try another photo or add a hint.' }, { status: 502 })
    }

    const rawItems = Array.isArray(parsed.items) ? parsed.items : []
    const items: AnalyzedItem[] = rawItems.slice(0, 20).map((it) => {
      const o = (it ?? {}) as Record<string, unknown>
      const conf = o.confidence === 'high' || o.confidence === 'low' ? o.confidence : 'medium'
      return {
        name: String(o.name || 'Unknown item').slice(0, 120),
        portion: String(o.portion || '').slice(0, 120),
        kcal: coerceNumber(o.kcal),
        protein_g: coerceNumber(o.protein_g),
        carbs_g: coerceNumber(o.carbs_g),
        fat_g: coerceNumber(o.fat_g),
        confidence: conf as AnalyzedItem['confidence'],
      }
    }).filter(i => i.name !== 'Unknown item' || i.kcal > 0)

    if (items.length === 0) {
      return NextResponse.json({ error: 'Could not identify any food in the photo — try a clearer angle or add a hint.' }, { status: 422 })
    }

    return NextResponse.json({
      ok: true,
      meal_name: String(parsed.meal_name || 'Meal').slice(0, 120),
      items,
    })
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    console.error('nutrition/analyze error:', err)
    return NextResponse.json({ error: 'Analysis failed — please try again.' }, { status: 500 })
  }
}
