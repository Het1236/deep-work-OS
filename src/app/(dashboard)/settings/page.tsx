'use client'

import { Settings, Bell, User, Shield, Palette, Save, Loader2, Check } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import { getProfile, updateProfile } from '@/lib/data'
import type { Profile } from '@/lib/types'
import TelegramConnect from './TelegramConnect'

export default function SettingsPage() {
  const { userId } = useUser()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [identity, setIdentity] = useState('')

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const p = await getProfile(userId)
    setProfile(p)
    if (p) {
      setDisplayName(p.display_name || '')
      setIdentity(p.identity_statement || '')
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { loadData() }, [loadData])

  async function handleSave() {
    if (!userId) return
    setSaving(true)
    try {
      await updateProfile(userId, {
        display_name: displayName,
        identity_statement: identity,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <style jsx>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <div className="settings-header animate-fade-in">
        <h1 className="text-heading" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={22} style={{ color: 'var(--accent)' }} /> Settings
        </h1>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="settings-grid animate-fade-in" style={{ animationDelay: '0.05s' }}>
        {/* Profile */}
        <div className="settings-section card">
          <h3 className="settings-section-title"><User size={16} /> Profile</h3>
          <div className="settings-field">
            <label className="settings-label">Display Name</label>
            <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          <div className="settings-field">
            <label className="settings-label">Email</label>
            <input className="input" defaultValue={profile?.username || ''} disabled style={{ opacity: 0.5 }} />
          </div>
          <div className="settings-field">
            <label className="settings-label">Higher Self Vision</label>
            <textarea className="input" rows={3} value={identity} onChange={e => setIdentity(e.target.value)} style={{ resize: 'vertical' }} placeholder="I am a disciplined builder who ships meaningful products..." />
          </div>
          <div className="settings-field">
            <label className="settings-label">Level / XP</label>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.875rem' }}>
              <span className="text-mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>Level {profile?.level || 1}</span>
              <span className="text-mono" style={{ color: 'var(--text-secondary)' }}>{(profile?.xp_total || 0).toLocaleString()} XP</span>
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="settings-section card">
          <h3 className="settings-section-title"><Palette size={16} /> Appearance</h3>
          <div className="settings-field">
            <label className="settings-label">Theme</label>
            <div className="settings-toggle-group">
              <button className="settings-toggle settings-toggle-active">Dark</button>
              <button className="settings-toggle" disabled>Light (Coming Soon)</button>
            </div>
          </div>
          <div className="settings-field">
            <label className="settings-label">Accent Color</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['#4CAF7D', '#5B9BD5', '#F5A623', '#E74C3C', '#9B59B6'].map(c => (
                <button
                  key={c}
                  className={`color-swatch ${c === '#4CAF7D' ? 'color-active' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="settings-section card">
          <h3 className="settings-section-title"><Bell size={16} /> Notifications</h3>
          <div className="settings-field">
            <div className="settings-switch-row">
              <span>Daily reminder</span>
              <div className="switch switch-on" />
            </div>
          </div>
          <div className="settings-field">
            <div className="settings-switch-row">
              <span>Shutdown ritual prompt</span>
              <div className="switch switch-on" />
            </div>
          </div>
          <div className="settings-field">
            <div className="settings-switch-row">
              <span>Weekly AI report ready</span>
              <div className="switch switch-on" />
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="settings-section card">
          <h3 className="settings-section-title"><Shield size={16} /> Security</h3>
          <button className="btn btn-secondary" style={{ width: '100%' }}>Change Password</button>
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: '8px', color: 'var(--status-danger)' }}>Delete Account</button>
        </div>

        {/* Telegram Capture */}
        <TelegramConnect />
      </div>

      <style jsx>{`
        .settings-page { display: flex; flex-direction: column; gap: var(--space-xl); }
        .settings-header { display: flex; align-items: center; justify-content: space-between; }
        .settings-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-xl); }
        .settings-section-title { display: flex; align-items: center; gap: var(--space-sm); font-size: 0.9375rem; font-weight: 600; margin-bottom: var(--space-xl); }
        .settings-field { margin-bottom: var(--space-lg); }
        .settings-label { display: block; font-size: 0.8125rem; font-weight: 500; color: var(--text-secondary); margin-bottom: var(--space-sm); }
        .settings-toggle-group { display: flex; gap: var(--space-sm); }
        .settings-toggle { padding: var(--space-sm) var(--space-lg); font-size: 0.8125rem; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-secondary); cursor: pointer; font-family: var(--font-sans); }
        .settings-toggle-active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); font-weight: 600; }
        .settings-toggle:disabled { opacity: 0.4; cursor: not-allowed; }
        .color-swatch { width: 28px; height: 28px; border-radius: var(--radius-full); border: 2px solid transparent; cursor: pointer; padding: 0; }
        .color-active { border-color: white; box-shadow: 0 0 0 2px var(--accent); }
        .settings-switch-row { display: flex; align-items: center; justify-content: space-between; font-size: 0.875rem; color: var(--text-secondary); }
        .switch { width: 36px; height: 20px; border-radius: var(--radius-full); background: var(--bg-hover); position: relative; cursor: pointer; transition: background var(--transition-fast); }
        .switch::after { content: ''; position: absolute; width: 16px; height: 16px; border-radius: var(--radius-full); background: var(--text-tertiary); top: 2px; left: 2px; transition: all var(--transition-fast); }
        .switch-on { background: var(--accent); }
        .switch-on::after { left: 18px; background: var(--on-accent); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
