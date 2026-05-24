import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
  const { userId } = await request.json()
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  // Gather user data for the AI
  const now = new Date()
  const weekAgo = new Date(now)
  weekAgo.setDate(now.getDate() - 7)
  const weekStart = weekAgo.toISOString()
  const today = now.toISOString().split('T')[0]

  const [sessions, habits, habitLogs, journal, goals, profile] = await Promise.all([
    supabase.from('deep_work_sessions').select('*').eq('user_id', userId).gte('started_at', weekStart).order('started_at', { ascending: false }),
    supabase.from('habits').select('*').eq('user_id', userId).eq('is_active', true),
    supabase.from('habit_logs').select('*').eq('user_id', userId).gte('log_date', weekAgo.toISOString().split('T')[0]).lte('log_date', today),
    supabase.from('journal_entries').select('*').eq('user_id', userId).gte('entry_date', weekAgo.toISOString().split('T')[0]).order('entry_date', { ascending: false }).limit(7),
    supabase.from('goals').select('*').eq('user_id', userId),
    supabase.from('profiles').select('*').eq('id', userId).single(),
  ])

  const sessionsData = sessions.data || []
  const habitsData = habits.data || []
  const habitLogsData = habitLogs.data || []
  const journalData = journal.data || []
  const goalsData = goals.data || []
  const profileData = profile.data

  // Compute stats
  const totalMinutes = sessionsData.reduce((s: number, r: { duration_minutes: number | null }) => s + (r.duration_minutes || 0), 0)
  const totalHours = (totalMinutes / 60).toFixed(1)
  const avgIntensity = sessionsData.length > 0
    ? (sessionsData.filter((s: { intensity_score: number | null }) => s.intensity_score).reduce((a: number, s: { intensity_score: number | null }) => a + (s.intensity_score || 0), 0) / sessionsData.filter((s: { intensity_score: number | null }) => s.intensity_score).length).toFixed(1)
    : '0'

  const totalHabitChecks = habitsData.length * 7
  const completedChecks = habitLogsData.filter((l: { completed: boolean }) => l.completed).length
  const habitPct = totalHabitChecks > 0 ? Math.round((completedChecks / totalHabitChecks) * 100) : 0

  const shutdownDays = journalData.filter((j: { shutdown_done: boolean }) => j.shutdown_done).length

  const prompt = `You are the AI coach for DeepWork OS, a deep work productivity system. Generate a comprehensive weekly performance report for this user.

USER PROFILE:
- Name: ${profileData?.display_name || 'User'}
- Level: ${profileData?.level || 1}
- XP: ${profileData?.xp_total || 0}
- Identity: ${profileData?.identity_statement || 'Not set'}

THIS WEEK'S DATA:
- Total Deep Work: ${totalHours} hours across ${sessionsData.length} sessions
- Average Intensity: ${avgIntensity}/10
- Habit Completion: ${habitPct}% (${completedChecks}/${totalHabitChecks})
- Shutdown Rituals: ${shutdownDays}/7
- Active Goals: ${goalsData.length}
- Active Habits: ${habitsData.length}

HABIT NAMES: ${habitsData.map((h: { name: string }) => h.name).join(', ') || 'None'}
GOAL TITLES: ${goalsData.map((g: { title: string }) => g.title).join(', ') || 'None'}

Respond in this exact JSON structure:
{
  "executionSnapshot": {
    "totalHours": "${totalHours}",
    "avgQuality": "${avgIntensity}",
    "habitCompletion": "${habitPct}%",
    "shutdownRituals": "${shutdownDays}/7",
    "hoursChange": "+X%",
    "qualityChange": "+X",
    "habitChange": "+X%",
    "shutdownStatus": "Consistent/Needs work"
  },
  "dripAudit": {
    "producing": 45,
    "investing": 30,
    "recharging": 15,
    "draining": 10
  },
  "insights": [
    { "type": "positive", "title": "Insight Title", "description": "Detailed insight..." },
    { "type": "positive", "title": "Insight Title", "description": "Detailed insight..." },
    { "type": "warning", "title": "Insight Title", "description": "Detailed insight..." },
    { "type": "warning", "title": "Insight Title", "description": "Detailed insight..." }
  ],
  "recommendations": [
    "Actionable recommendation 1",
    "Actionable recommendation 2",
    "Actionable recommendation 3",
    "Actionable recommendation 4",
    "Actionable recommendation 5"
  ],
  "weekSummary": "A 2-3 sentence motivational summary of the week."
}

Be specific, data-driven, encouraging yet honest. If data is sparse (new user), acknowledge it and provide general deep work tips.`

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    const geminiData = await geminiRes.json()
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      return NextResponse.json({ error: 'No response from Gemini' }, { status: 500 })
    }

    const report = JSON.parse(text)
    return NextResponse.json({ report, generatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('Gemini API error:', err)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
