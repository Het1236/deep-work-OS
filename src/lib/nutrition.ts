// Pure nutrition helpers — no Supabase, no React.

export type BodyStats = {
  weightKg: number
  heightCm: number
  age: number
  sex: 'male' | 'female'
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
  goal: 'cut' | 'maintain' | 'bulk'
}

export type ComputedTargets = {
  tdeeKcal: number
  targetKcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

const ACTIVITY_FACTOR: Record<BodyStats['activityLevel'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

// Mifflin-St Jeor BMR.
export function mifflinStJeor(s: Pick<BodyStats, 'weightKg' | 'heightCm' | 'age' | 'sex'>): number {
  const base = 10 * s.weightKg + 6.25 * s.heightCm - 5 * s.age
  return Math.round(base + (s.sex === 'male' ? 5 : -161))
}

// TDEE + high-protein macro split (protein 1.8 g/kg, fat 25% kcal, carbs = remainder).
export function computeTargets(s: BodyStats): ComputedTargets {
  const bmr = mifflinStJeor(s)
  const tdee = Math.round(bmr * ACTIVITY_FACTOR[s.activityLevel])
  const goalAdj = s.goal === 'cut' ? 0.8 : s.goal === 'bulk' ? 1.1 : 1
  const targetKcal = Math.round(tdee * goalAdj)
  const proteinG = Math.round(1.8 * s.weightKg)
  const fatG = Math.round((targetKcal * 0.25) / 9)
  const carbsG = Math.max(0, Math.round((targetKcal - proteinG * 4 - fatG * 9) / 4))
  return { tdeeKcal: tdee, targetKcal, proteinG, carbsG, fatG }
}

export type MacroTotals = { kcal: number; protein_g: number; carbs_g: number; fat_g: number }

export function sumMacros(items: MacroTotals[]): MacroTotals {
  return items.reduce(
    (t, i) => ({
      kcal: t.kcal + (Number(i.kcal) || 0),
      protein_g: t.protein_g + (Number(i.protein_g) || 0),
      carbs_g: t.carbs_g + (Number(i.carbs_g) || 0),
      fat_g: t.fat_g + (Number(i.fat_g) || 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  )
}

export function round1(n: number): number { return Math.round(n * 10) / 10 }

// Local calendar date (YYYY-MM-DD) — unlike toISOString(), respects the user's timezone,
// so a 1 AM IST snack logs on the right day.
export function localYmd(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Client-side compress for meal photos: max edge 1280px, JPEG ~0.8.
// Keeps the analyze payload small and stored images cheap.
export async function compressImage(file: File, maxEdge = 1280, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('compress failed'))), 'image/jpeg', quality)
  })
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const s = reader.result?.toString() || ''
      resolve(s.substring(s.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
