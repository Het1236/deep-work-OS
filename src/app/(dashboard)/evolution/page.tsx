'use client'

import { Brain, Zap, Award, Lock, Target, Loader2 } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import { getProfile, getXPEvents, getAchievements, getDashboardStats, calculateLevel } from '@/lib/data'
import type { Profile, XPEvent, Achievement, DashboardStats } from '@/lib/types'

const badgeDefinitions = [
  { key: 'first_session', title: 'First Focus', desc: 'Complete your first deep work session', icon: '🎯' },
  { key: 'week_warrior', title: 'Week Warrior', desc: '7 consecutive days of deep work', icon: '⚔️' },
  { key: 'habit_streak_7', title: 'Habit Master', desc: '7-day habit streak', icon: '🔥' },
  { key: 'quality_8', title: 'Flow State', desc: 'Achieve quality score 8+', icon: '🌊' },
  { key: '100_hours', title: 'Centurion', desc: '100 total deep work hours', icon: '💯' },
  { key: 'shutdown_30', title: 'Discipline', desc: '30 consecutive shutdown rituals', icon: '🌅' },
  { key: 'team_leader', title: 'Team Leader', desc: '#1 in group for 4 consecutive weeks', icon: '👑' },
  { key: 'perfect_week', title: 'Perfect Week', desc: '100% habits + 25h deep work in one week', icon: '💎' },
]

export default function EvolutionPage() {
  const { userId } = useUser()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [p, a, s] = await Promise.all([
      getProfile(userId),
      getAchievements(userId),
      getDashboardStats(userId),
    ])
    setProfile(p)
    setAchievements(a)
    setStats(s)
    setLoading(false)
  }, [userId])

  useEffect(() => { loadData() }, [loadData])

  if (loading || !profile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <style jsx>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const { level, xpInLevel, xpForNext, progress } = calculateLevel(profile.xp_total || 0)
  const earnedKeys = new Set(achievements.map(a => a.badge_key))
  const weekHours = stats ? Math.round((stats.weekMinutes / 60) * 10) / 10 : 0

  // Dynamic challenges based on real data
  const challenges = [
    { title: '25 Hours This Week', target: 25, current: weekHours, xp: 200, type: 'hours' as const },
    { title: 'Avg Intensity 7+', target: 7, current: stats?.avgIntensity || 0, xp: 100, type: 'score' as const },
    { title: `${Math.ceil(weekHours + 3)}h Next Milestone`, target: Math.ceil(weekHours + 3), current: weekHours, xp: 150, type: 'hours' as const },
  ]

  return (
    <div className="evo-page">
      <div className="evo-header animate-fade-in">
        <div>
          <h1 className="text-heading" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Brain size={22} style={{ color: 'var(--accent)' }} /> Evolution
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>Your growth journey & achievements</p>
        </div>
      </div>

      {/* XP & Level Card */}
      <div className="xp-card animate-fade-in" style={{ animationDelay: '0.05s' }}>
        <div className="xp-top">
          <div className="xp-level-badge">
            <Zap size={20} />
            <span className="text-mono">Level {level}</span>
          </div>
          <div className="xp-total">
            <span className="text-mono" style={{ fontSize: '2rem', fontWeight: 700 }}>{(profile.xp_total || 0).toLocaleString()}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginLeft: '4px' }}>XP</span>
          </div>
        </div>
        <div className="xp-progress-row">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Progress to Level {level + 1}</span>
          <span className="text-mono" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>{xpInLevel}/{xpForNext} XP</span>
        </div>
        <div className="progress-bar" style={{ height: '8px', marginTop: '8px' }}>
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="xp-actions">
          {[
            { label: 'Deep Work', xp: '+10/hr' },
            { label: 'Habit Done', xp: '+5' },
            { label: 'Shutdown', xp: '+15' },
            { label: 'Journal', xp: '+10' },
          ].map(a => (
            <div key={a.label} className="xp-action-item">
              <span>{a.label}</span>
              <span className="text-mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{a.xp}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Challenges */}
      <div className="challenges animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Target size={16} /> Weekly Challenges
        </h3>
        <div className="challenge-grid">
          {challenges.map(ch => {
            const pct = Math.min((ch.current / ch.target) * 100, 100)
            return (
              <div key={ch.title} className="challenge-card card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{ch.title}</span>
                  <span className="badge badge-green">+{ch.xp} XP</span>
                </div>
                <div className="progress-bar" style={{ height: '6px' }}>
                  <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-mono" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {ch.type === 'hours' ? `${ch.current}h / ${ch.target}h` : `${ch.current} / ${ch.target}`}
                  </span>
                  <span className="text-mono" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>{Math.round(pct)}%</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Achievement Wall */}
      <div className="badges-section animate-fade-in" style={{ animationDelay: '0.15s' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Award size={16} /> Achievement Wall
        </h3>
        <div className="badge-grid">
          {badgeDefinitions.map(badge => {
            const earned = earnedKeys.has(badge.key)
            return (
              <div key={badge.key} className={`badge-card ${earned ? 'badge-earned' : 'badge-locked'}`}>
                <div className="badge-icon">{earned ? badge.icon : <Lock size={20} />}</div>
                <div className="badge-title">{badge.title}</div>
                <div className="badge-desc">{badge.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      <style jsx>{`
        .evo-page { display: flex; flex-direction: column; gap: var(--space-xl); }
        .evo-header { display: flex; align-items: center; justify-content: space-between; }
        .xp-card { background: linear-gradient(135deg, rgba(76,175,125,0.08), rgba(76,175,125,0.02)); border: 1px solid rgba(76,175,125,0.2); border-radius: var(--radius-md); padding: var(--space-2xl); }
        .xp-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-xl); }
        .xp-level-badge { display: flex; align-items: center; gap: var(--space-sm); background: var(--accent); color: #0F0F0F; padding: var(--space-sm) var(--space-lg); border-radius: var(--radius-full); font-weight: 700; font-size: 0.875rem; }
        .xp-progress-row { display: flex; justify-content: space-between; }
        .xp-actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-sm); margin-top: var(--space-xl); }
        .xp-action-item { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: var(--space-sm) var(--space-md); font-size: 0.75rem; color: var(--text-secondary); display: flex; justify-content: space-between; }
        .challenge-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-lg); }
        .badge-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-md); }
        .badge-card { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: var(--space-xl); text-align: center; transition: all var(--transition-fast); }
        .badge-card:hover { border-color: var(--border-hover); }
        .badge-earned { border-color: rgba(76,175,125,0.2); }
        .badge-locked { opacity: 0.4; }
        .badge-icon { font-size: 2rem; margin-bottom: var(--space-md); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); }
        .badge-title { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-xs); }
        .badge-desc { font-size: 0.6875rem; color: var(--text-tertiary); line-height: 1.4; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
