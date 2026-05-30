'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  Sparkles, Compass, Target, CheckSquare, Award, ArrowRight, ArrowLeft, Loader2
} from 'lucide-react'
import { updateProfile, createGoal, createHabit, awardXP } from '@/lib/data'

const HABIT_TEMPLATES = [
  { name: '90-min Deep Work Block', category: 'Deep Work', time_of_day: 'morning', identity_tag: 'Focus' },
  { name: 'Daily Shutdown Ritual & Journaling', category: 'Mindfulness', time_of_day: 'evening', identity_tag: 'Discipline' },
  { name: 'Distraction-free Morning (No phone first 1h)', category: 'Productivity', time_of_day: 'morning', identity_tag: 'Focus' },
  { name: '30-min Health & Exercise Activity', category: 'Health', time_of_day: 'anytime', identity_tag: 'Health' },
]

export default function OnboardingPage() {
  const supabase = createClient()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(1)

  // Step 1: Higher Self / Identity
  const [futureIdentity, setFutureIdentity] = useState('')
  const [personality, setPersonality] = useState('')

  // Step 2: Wildly Important Goal (WIG)
  const [wigTitle, setWigTitle] = useState('')
  const [wigArea, setWigArea] = useState('Career')
  const [wigDate, setWigDate] = useState('')
  const [wigProblem, setWigProblem] = useState('')

  // Step 3: Starter Habits
  const [selectedHabits, setSelectedHabits] = useState<number[]>([0, 1])

  // Saving / XP state
  const [saving, setSaving] = useState(false)
  const [xpAwarded, setXpAwarded] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
      } else {
        router.push('/login')
      }
      setLoading(false)
    })
  }, [supabase, router])

  async function handleComplete() {
    if (!userId) return
    setSaving(true)
    try {
      // 1. Update Profile (Identity Statement & Personality Type)
      await updateProfile(userId, {
        identity_statement: futureIdentity || 'Builder of systems & master of focus.',
        personality_type: personality || 'Deep Thinker',
      })

      // 2. Create the WIG Goal
      if (wigTitle.trim()) {
        await createGoal({
          user_id: userId,
          title: wigTitle.trim(),
          problem: wigProblem || 'Overwhelm and constant distractions.',
          solution: 'Focused execution using Deep Work OS protocols.',
          status: 'developing',
          is_wig: true,
          is_domino_goal: true,
          life_area: wigArea,
          target_date: wigDate || undefined,
        })
      }

      // 3. Create selected habits
      for (const idx of selectedHabits) {
        const h = HABIT_TEMPLATES[idx]
        await createHabit({
          user_id: userId,
          name: h.name,
          time_of_day: h.time_of_day,
          category: h.category,
          identity_tag: h.identity_tag,
        })
      }

      // 4. Award Onboarding XP Bonus (+100 XP)
      const res = await awardXP(userId, 'journal_entry', { onboarding: true }, 100)
      setXpAwarded(res.xpAwarded)
      
      setStep(4) // Move to congratulations
    } catch (err) {
      console.error('Onboarding saving error:', err)
      alert('Failed to complete onboarding: ' + (err instanceof Error ? err.message : JSON.stringify(err)))
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="onboarding-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0e0e0e' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="onboarding-layout">
      {/* Aurora Ambient Glows */}
      <div className="onboarding-glow-1" />
      <div className="onboarding-glow-2" />

      <div className="onboarding-card animate-fade-in">
        {step < 4 && (
          <div className="onboarding-progress">
            <div className="progress-bar" style={{ height: '3px' }}>
              <div className="progress-bar-fill" style={{ width: `${(step / 3) * 100}%` }} />
            </div>
            <div className="onboarding-steps-label">
              STEP {step} OF 3
            </div>
          </div>
        )}

        {/* ─── STEP 1: IDENTITY ─── */}
        {step === 1 && (
          <div className="step-content">
            <div className="step-icon-wrapper">
              <Compass size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <h1 className="step-title">Your Higher Self</h1>
            <p className="step-desc">
              Define the future identity you are building. This acts as the baseline for your weekly reflection and planning.
            </p>

            <div className="form-group">
              <label className="field-label">Future Identity Statement</label>
              <textarea
                className="input"
                rows={3}
                placeholder="e.g. I am a highly focused engineer who builds robust software systems with absolute focus."
                value={futureIdentity}
                onChange={e => setFutureIdentity(e.target.value)}
                style={{ resize: 'none' }}
              />
            </div>

            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="field-label">Archetype / Personality (Optional)</label>
              <input
                className="input"
                placeholder="e.g. Deep Thinker / Builder / INTJ"
                value={personality}
                onChange={e => setPersonality(e.target.value)}
              />
            </div>

            <div className="button-group">
              <button 
                className="btn btn-primary" 
                onClick={() => setStep(2)}
                disabled={!futureIdentity.trim()}
                style={{ marginLeft: 'auto' }}
              >
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: WIG ─── */}
        {step === 2 && (
          <div className="step-content">
            <div className="step-icon-wrapper">
              <Target size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <h1 className="step-title">Wildly Important Goal (WIG)</h1>
            <p className="step-desc">
              What is the one goal that, if achieved, will make everything else secondary or irrelevant? Set your core quarterly target.
            </p>

            <div className="form-group">
              <label className="field-label">WIG Description</label>
              <input
                className="input"
                placeholder="e.g. Master React Native and deploy a finished app to production."
                value={wigTitle}
                onChange={e => setWigTitle(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
              <div className="form-group">
                <label className="field-label">Life Area</label>
                <select className="input" value={wigArea} onChange={e => setWigArea(e.target.value)}>
                  <option value="Career">Career / Work</option>
                  <option value="Health">Health / Fitness</option>
                  <option value="Mindset">Mindset / Focus</option>
                  <option value="Academics">Academics</option>
                </select>
              </div>

              <div className="form-group">
                <label className="field-label">Target Date</label>
                <input
                  className="input"
                  type="date"
                  value={wigDate}
                  onChange={e => setWigDate(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="field-label">What is the biggest obstacle to this goal?</label>
              <input
                className="input"
                placeholder="e.g. Endless checking of social feeds and lack of block time."
                value={wigProblem}
                onChange={e => setWigProblem(e.target.value)}
              />
            </div>

            <div className="button-group">
              <button className="btn btn-secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={16} /> Back
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => setStep(3)}
                disabled={!wigTitle.trim()}
              >
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: HABITS ─── */}
        {step === 3 && (
          <div className="step-content">
            <div className="step-icon-wrapper">
              <CheckSquare size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <h1 className="step-title">Select Core Habits</h1>
            <p className="step-desc">
              Choose starter habits aligned with Deep Work OS rules. You can edit, stack, or delete these later.
            </p>

            <div className="habits-list">
              {HABIT_TEMPLATES.map((item, idx) => (
                <label key={idx} className={`habit-item-card ${selectedHabits.includes(idx) ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedHabits.includes(idx)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedHabits(prev => [...prev, idx])
                      } else {
                        setSelectedHabits(prev => prev.filter(i => i !== idx))
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                  <div className="habit-checkbox">
                    {selectedHabits.includes(idx) ? '✓' : ''}
                  </div>
                  <div className="habit-info">
                    <span className="habit-name">{item.name}</span>
                    <span className="habit-tag">Tag: {item.identity_tag} ({item.time_of_day})</span>
                  </div>
                </label>
              ))}
            </div>

            <div className="button-group">
              <button className="btn btn-secondary" onClick={() => setStep(2)}>
                <ArrowLeft size={16} /> Back
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleComplete}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Processing...
                  </>
                ) : (
                  <>
                    Finish Setup <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 4: CONGRATULATIONS ─── */}
        {step === 4 && (
          <div className="step-content text-center animate-fade-in" style={{ textAlign: 'center' }}>
            <div className="step-icon-wrapper success animate-pulse-glow" style={{ margin: '0 auto 16px', background: 'rgba(150,250,194,0.15)', boxShadow: '0 0 24px rgba(150,250,194,0.25)' }}>
              <Award size={32} style={{ color: 'var(--accent)' }} />
            </div>
            <h1 className="step-title">Welcome to Deep Work OS</h1>
            <p className="step-desc">
              Your profile, quarterly WIG, and focus habit stacks have been successfully initialized.
            </p>

            <div className="xp-card card" style={{ background: 'rgba(150, 250, 194, 0.04)', border: '1px solid rgba(150, 250, 194, 0.2)', padding: '16px', margin: '24px auto', maxWidth: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', letterSpacing: '0.08em', fontWeight: 600 }}>INITIALIZATION REWARD</span>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>+100 XP</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Awarded for completing Onboarding</span>
            </div>

            <button 
              className="btn btn-primary" 
              onClick={() => router.push('/')}
              style={{ width: '100%' }}
            >
              Enter Dashboard
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .onboarding-layout {
          position: fixed; inset: 0;
          background: #080808;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-primary);
          z-index: 1000;
          overflow: hidden;
          font-family: var(--font-sans);
        }
        .onboarding-glow-1 {
          position: absolute; width: 600px; height: 600px;
          border-radius: 50%; top: -10%; left: -10%;
          background: radial-gradient(circle, rgba(150,250,194,0.06) 0%, transparent 70%);
          pointer-events: none;
        }
        .onboarding-glow-2 {
          position: absolute; width: 500px; height: 500px;
          border-radius: 50%; bottom: -10%; right: -10%;
          background: radial-gradient(circle, rgba(150,250,194,0.04) 0%, transparent 70%);
          pointer-events: none;
        }
        .onboarding-card {
          width: 90%; max-width: 520px;
          background: rgba(20,20,22,0.85);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 32px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.6);
        }
        .onboarding-progress {
          margin-bottom: 24px;
        }
        .onboarding-steps-label {
          font-size: 0.625rem; font-weight: 700; color: var(--accent);
          letter-spacing: 0.1em; margin-top: 8px;
          font-family: var(--font-mono, monospace);
        }
        .step-content {
          display: flex; flex-direction: column;
        }
        .step-icon-wrapper {
          width: 56px; height: 56px; border-radius: 14px;
          background: rgba(150, 250, 194, 0.1);
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 20px;
        }
        .step-title {
          font-size: 1.5rem; font-weight: 800; color: #fff;
          letter-spacing: -0.02em; margin-bottom: 8px;
        }
        .step-desc {
          font-size: 0.8125rem; color: var(--text-secondary);
          line-height: 1.5; margin-bottom: 24px;
        }
        .form-group {
          display: flex; flex-direction: column; gap: 6px;
        }
        .field-label {
          font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);
        }
        .button-group {
          display: flex; gap: 12px; margin-top: 32px;
        }
        .habits-list {
          display: flex; flex-direction: column; gap: 10px;
          max-height: 240px; overflow-y: auto;
          margin-bottom: 16px;
        }
        .habit-item-card {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 16px; border-radius: 10px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          cursor: pointer; transition: all 0.2s;
        }
        .habit-item-card:hover {
          border-color: rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
        }
        .habit-item-card.active {
          border-color: var(--accent);
          background: rgba(150,250,194,0.05);
        }
        .habit-checkbox {
          width: 20px; height: 20px; border-radius: 5px;
          border: 1.5px solid rgba(255,255,255,0.15);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; color: var(--accent);
          font-weight: 700;
        }
        .habit-item-card.active .habit-checkbox {
          border-color: var(--accent);
          background: var(--accent);
          color: #0e0e0e;
        }
        .habit-info {
          display: flex; flex-direction: column; gap: 2px;
        }
        .habit-name {
          font-size: 0.875rem; font-weight: 600; color: #fff;
        }
        .habit-tag {
          font-size: 0.6875rem; color: var(--text-tertiary);
        }
      `}</style>
    </div>
  )
}
