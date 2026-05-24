'use client'

import { Users, Copy, Trophy, Clock, Flame, Loader2, LogIn } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import { getProfile, getGroup, getGroupMembers, getGroupWeeklyStats, joinGroup, calculateLevel } from '@/lib/data'
import type { Profile, Group } from '@/lib/types'

type MemberStat = {
  profile: Profile
  weekHours: number
  rank: number
}

export default function GroupPage() {
  const { userId } = useUser()
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<MemberStat[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [hasGroup, setHasGroup] = useState<boolean | null>(null)

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)

    const profile = await getProfile(userId)
    if (!profile?.group_id) {
      setHasGroup(false)
      setLoading(false)
      return
    }

    setHasGroup(true)
    const [g, memberProfiles] = await Promise.all([
      getGroup(profile.group_id),
      getGroupMembers(profile.group_id),
    ])
    setGroup(g)

    // Get weekly hours for all members
    const memberIds = memberProfiles.map(m => m.id)
    const weeklyStats = await getGroupWeeklyStats(memberIds)

    // Aggregate hours per member
    const hoursByUser: Record<string, number> = {}
    weeklyStats.forEach(s => {
      hoursByUser[s.user_id] = (hoursByUser[s.user_id] || 0) + (s.duration_minutes || 0)
    })

    const sorted = memberProfiles
      .map(p => ({ profile: p, weekHours: Math.round((hoursByUser[p.id] || 0) / 60 * 10) / 10, rank: 0 }))
      .sort((a, b) => b.weekHours - a.weekHours)
      .map((m, i) => ({ ...m, rank: i + 1 }))

    setMembers(sorted)
    setLoading(false)
  }, [userId])

  useEffect(() => { loadData() }, [loadData])

  function copyCode() {
    if (group?.invite_code) {
      navigator.clipboard.writeText(group.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !joinCode) return
    setJoining(true)
    setJoinError('')
    try {
      await joinGroup(userId, joinCode.trim())
      loadData()
    } catch (err) {
      setJoinError('Invalid invite code. Please check and try again.')
    }
    setJoining(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <style jsx>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // No group - show join UI
  if (!hasGroup) {
    return (
      <div className="group-page">
        <div className="group-header animate-fade-in">
          <div>
            <h1 className="text-heading" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={22} style={{ color: 'var(--accent)' }} /> Accountability Group
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
              Join a group to compete and stay accountable
            </p>
          </div>
        </div>

        <div className="card animate-fade-in" style={{ maxWidth: '480px', padding: '40px', animationDelay: '0.05s' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <LogIn size={36} style={{ color: 'var(--accent)', marginBottom: '16px' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '8px' }}>Join a Group</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Enter an invite code from your professor or group leader
            </p>
          </div>
          <form onSubmit={handleJoin}>
            <input
              className="input"
              placeholder="Enter invite code (e.g. AUDEEP-2026)"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value)}
              style={{ marginBottom: '12px', textAlign: 'center', letterSpacing: '0.05em', fontSize: '1rem', fontWeight: 600 }}
              required
            />
            {joinError && <p style={{ color: 'var(--status-danger)', fontSize: '0.8125rem', marginBottom: '12px', textAlign: 'center' }}>{joinError}</p>}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={joining}>
              {joining ? 'Joining...' : 'Join Group'}
            </button>
          </form>
        </div>

        <style jsx>{`
          .group-page { display: flex; flex-direction: column; gap: var(--space-xl); }
          .group-header { display: flex; align-items: center; justify-content: space-between; }
        `}</style>
      </div>
    )
  }

  const totalGroupHours = members.reduce((s, m) => s + m.weekHours, 0)
  const bestStreak = Math.max(...members.map(m => m.profile.streak_current || 0))
  const avgHours = members.length > 0 ? (totalGroupHours / members.length).toFixed(1) : '0'

  return (
    <div className="group-page">
      <div className="group-header animate-fade-in">
        <div>
          <h1 className="text-heading" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={22} style={{ color: 'var(--accent)' }} /> {group?.name || 'Group'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Accountability group · {members.length} members
          </p>
        </div>
        <button className="btn btn-primary btn-sm">Share Report</button>
      </div>

      {/* Invite Code */}
      <div className="invite-card card animate-fade-in" style={{ animationDelay: '0.05s' }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Invite Code</span>
        <div className="invite-code-row">
          <code className="invite-code text-mono">{group?.invite_code || '—'}</code>
          <button className="btn btn-ghost btn-sm" onClick={copyCode}>
            <Copy size={14} /> {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="group-stats animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="group-stat card">
          <Clock size={18} style={{ color: 'var(--accent)' }} />
          <div className="text-mono" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalGroupHours.toFixed(1)}h</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Group Hours</div>
        </div>
        <div className="group-stat card">
          <Flame size={18} style={{ color: 'var(--status-warning)' }} />
          <div className="text-mono" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{bestStreak}d</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Best Streak</div>
        </div>
        <div className="group-stat card">
          <Trophy size={18} style={{ color: 'var(--status-info)' }} />
          <div className="text-mono" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{avgHours}h</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Avg per Member</div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="group-leaderboard card animate-fade-in" style={{ animationDelay: '0.15s' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '20px' }}>Weekly Leaderboard</h3>
        <div className="lb-rows">
          {members.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
              No members yet
            </div>
          )}
          {members.map(m => {
            const { level } = calculateLevel(m.profile.xp_total || 0)
            const isMe = m.profile.id === userId
            return (
              <div key={m.profile.id} className={`lb-row ${m.rank === 1 ? 'lb-row-first' : ''} ${isMe ? 'lb-row-me' : ''}`}>
                <span className="lb-rank text-mono">#{m.rank}</span>
                <div className={`lb-av ${m.rank === 1 ? 'lb-av-first' : ''}`}>
                  {(m.profile.display_name || m.profile.username || '?').charAt(0).toUpperCase()}
                </div>
                <div className="lb-info">
                  <span className="lb-name">
                    {m.profile.display_name || m.profile.username || 'User'}
                    {isMe && <span style={{ color: 'var(--accent)', fontSize: '0.6875rem', marginLeft: '6px' }}>(you)</span>}
                  </span>
                  <span className="lb-sub">Level {level} · {m.profile.streak_current || 0}d streak</span>
                </div>
                <div className="lb-hours text-mono">{m.weekHours}h</div>
                <div className="lb-bar-wrap">
                  <div className="lb-bar" style={{ width: `${Math.min((m.weekHours / 30) * 100, 100)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <style jsx>{`
        .group-page { display: flex; flex-direction: column; gap: var(--space-xl); }
        .group-header { display: flex; align-items: center; justify-content: space-between; }
        .invite-code-row { display: flex; align-items: center; gap: var(--space-md); margin-top: var(--space-sm); }
        .invite-code { font-size: 1.25rem; font-weight: 700; color: var(--accent); background: var(--accent-subtle); padding: var(--space-sm) var(--space-lg); border-radius: var(--radius-sm); letter-spacing: 0.05em; }
        .group-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-lg); }
        .group-stat { display: flex; flex-direction: column; align-items: center; gap: var(--space-sm); text-align: center; }
        .lb-rows { display: flex; flex-direction: column; gap: var(--space-sm); }
        .lb-row { display: flex; align-items: center; gap: var(--space-md); padding: var(--space-md); border-radius: var(--radius-sm); transition: background var(--transition-fast); }
        .lb-row:hover { background: var(--bg-hover); }
        .lb-row-first { background: var(--accent-subtle); }
        .lb-row-me { border-left: 2px solid var(--accent); }
        .lb-rank { font-size: 0.75rem; color: var(--text-tertiary); width: 28px; }
        .lb-row-first .lb-rank { color: var(--accent); font-weight: 700; }
        .lb-av { width: 32px; height: 32px; border-radius: var(--radius-full); background: var(--bg-surface); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.8125rem; color: var(--text-secondary); flex-shrink: 0; }
        .lb-av-first { background: var(--accent); color: #0F0F0F; }
        .lb-info { flex: 1; }
        .lb-name { font-size: 0.875rem; font-weight: 500; color: var(--text-primary); display: block; }
        .lb-sub { font-size: 0.6875rem; color: var(--text-tertiary); }
        .lb-hours { font-size: 0.875rem; font-weight: 600; color: var(--text-secondary); min-width: 40px; text-align: right; }
        .lb-row-first .lb-hours { color: var(--accent); }
        .lb-bar-wrap { width: 80px; height: 4px; background: var(--bg-hover); border-radius: var(--radius-full); overflow: hidden; }
        .lb-bar { height: 100%; background: var(--accent); border-radius: var(--radius-full); transition: width 0.6s ease; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
