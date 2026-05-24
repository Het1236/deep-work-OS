import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  // Derive identity from secure session
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = user.id

  // Gather user data for the AI
  const now = new Date()
  const weekAgo = new Date(now)
  weekAgo.setDate(now.getDate() - 7)
  const weekStart = weekAgo.toISOString()
  const periodStart = weekAgo.toISOString().split('T')[0]
  const today = now.toISOString().split('T')[0]

  const [sessions, habits, habitLogs, journal, goals, profile] = await Promise.all([
    supabase.from('deep_work_sessions').select('*').eq('user_id', userId).gte('started_at', weekStart).order('started_at', { ascending: false }),
    supabase.from('habits').select('*').eq('user_id', userId).eq('is_active', true),
    supabase.from('habit_logs').select('*').eq('user_id', userId).gte('log_date', periodStart).lte('log_date', today),
    supabase.from('journal_entries').select('*').eq('user_id', userId).gte('entry_date', periodStart).order('entry_date', { ascending: false }).limit(7),
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

  // Calculate week-over-week changes
  const prevWeekAgo = new Date(weekAgo)
  prevWeekAgo.setDate(prevWeekAgo.getDate() - 7)
  const prevSessions = await supabase
    .from('deep_work_sessions')
    .select('duration_minutes')
    .eq('user_id', userId)
    .gte('started_at', prevWeekAgo.toISOString())
    .lt('started_at', weekStart)
  const prevMinutes = (prevSessions.data || []).reduce((s, r) => s + (r.duration_minutes || 0), 0)
  const hoursChange = prevMinutes > 0 ? Math.round(((totalMinutes - prevMinutes) / prevMinutes) * 100) : 100

  const prompt = `You are the AI coach for DeepWork OS, a deep work productivity system. Generate a comprehensive weekly performance report for this user.

USER PROFILE:
- Name: ${profileData?.display_name || 'User'}
- Level: ${profileData?.level || 1}
- XP: ${profileData?.xp_total || 0}
- Identity: ${profileData?.identity_statement || 'Not set'}

THIS WEEK'S DATA:
- Total Deep Work: ${totalHours} hours across ${sessionsData.length} sessions (Previous week: ${(prevMinutes / 60).toFixed(1)} hours)
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
    "hoursChange": "${hoursChange >= 0 ? '+' : ''}${hoursChange}%",
    "qualityChange": "+0.0",
    "habitChange": "+0%",
    "shutdownStatus": "${shutdownDays >= 5 ? 'Consistent' : 'Needs work'}"
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

  let reportText = ''
  let apiUsed = 'Grok'

  try {
    if (process.env.GROK_API_KEY) {
      const grokRes = await fetch('https://api.xai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-2-1212',
          messages: [
            { role: 'system', content: 'You are a helpful assistant that outputs only JSON.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' }
        })
      })

      const grokData = await grokRes.json()
      reportText = grokData?.choices?.[0]?.message?.content || ''
    } else if (process.env.GEMINI_API_KEY) {
      apiUsed = 'Gemini'
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
      reportText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } else {
      return NextResponse.json({ error: 'No AI API Key configured. Please add GROK_API_KEY or GEMINI_API_KEY to your environment.' }, { status: 500 })
    }

    if (!reportText) {
      throw new Error(`Empty response from ${apiUsed} API`)
    }

    const reportObj = JSON.parse(reportText)

    // Store the report in public.ai_reports table
    const { data: insertedReport, error: insertError } = await supabase
      .from('ai_reports')
      .insert({
        user_id: userId,
        report_type: 'weekly',
        period_start: periodStart,
        period_end: today,
        execution_snapshot: {
          ...reportObj.executionSnapshot,
          weekSummary: reportObj.weekSummary
        },
        drip_audit: reportObj.dripAudit,
        pattern_insights: JSON.stringify(reportObj.insights),
        recommendations: reportObj.recommendations,
        input_snapshot: {
          sessionsCount: sessionsData.length,
          totalHours,
          habitPct,
          shutdownDays,
          goalsCount: goalsData.length,
          apiUsed
        }
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to store AI report:', insertError)
      // Return transient report as fallback
      return NextResponse.json({ report: reportObj, generatedAt: new Date().toISOString() })
    }

    return NextResponse.json({
      id: insertedReport.id,
      report: reportObj,
      generatedAt: insertedReport.generated_at
    })
  } catch (err: any) {
    console.error('AI generation error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to generate report' }, { status: 500 })
  }
}
