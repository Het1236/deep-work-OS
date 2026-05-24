'use client'

import { Brain, FileText, Plus, BookOpen, Trash2, Loader2, Save } from 'lucide-react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser } from '@/components/UserContext'
import { getNotes, upsertNote, deleteNote } from '@/lib/data'
import type { Note } from '@/lib/types'

export default function SecondBrainPage() {
  const { userId } = useUser()
  const [scratchpad, setScratchpad] = useState<Note | null>(null)
  const [scratchpadText, setScratchpadText] = useState('')
  const [blueprints, setBlueprints] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [scratchNotes, bpNotes] = await Promise.all([
      getNotes(userId, 'scratchpad'),
      getNotes(userId, 'blueprint'),
    ])
    if (scratchNotes.length > 0) {
      setScratchpad(scratchNotes[0])
      setScratchpadText(scratchNotes[0].content || '')
    }
    setBlueprints(bpNotes)
    setLoading(false)
  }, [userId])

  useEffect(() => { loadData() }, [loadData])

  // Auto-save scratchpad with debounce
  function handleScratchpadChange(val: string) {
    setScratchpadText(val)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!userId) return
      setSaving(true)
      try {
        const result = await upsertNote({
          id: scratchpad?.id,
          user_id: userId,
          title: 'Quick Notes',
          content: val,
          note_type: 'scratchpad',
        })
        if (!scratchpad) setScratchpad(result as Note)
      } catch (err) {
        console.error('Failed to save scratchpad', err)
      }
      setSaving(false)
    }, 800)
  }

  async function handleAddBlueprint() {
    if (!userId) return
    try {
      const result = await upsertNote({
        user_id: userId,
        title: 'New Blueprint',
        content: '',
        note_type: 'blueprint',
      })
      setBlueprints([result as Note, ...blueprints])
    } catch (err) {
      console.error('Failed to create blueprint', err)
    }
  }

  async function handleUpdateBlueprint(id: string, field: 'title' | 'content', value: string) {
    setBlueprints(prev => prev.map(bp => bp.id === id ? { ...bp, [field]: value } : bp))
    // Save with debounce per blueprint
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const bp = blueprints.find(b => b.id === id)
      if (!bp || !userId) return
      const updated = { ...bp, [field]: value }
      try {
        await upsertNote({
          id: updated.id,
          user_id: userId,
          title: updated.title,
          content: updated.content,
          note_type: 'blueprint',
        })
      } catch (err) {
        console.error('Failed to update blueprint', err)
      }
    }, 800)
  }

  async function handleDeleteBlueprint(id: string) {
    try {
      await deleteNote(id)
      setBlueprints(prev => prev.filter(bp => bp.id !== id))
    } catch (err) {
      console.error('Failed to delete blueprint', err)
    }
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
    <div className="second-brain-page">
      <div className="header animate-fade-in">
        <div>
          <h1 className="text-heading" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Brain size={22} style={{ color: 'var(--accent)' }} /> Second Brain
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Your knowledge library, quick notes, and mental blueprints.
          </p>
        </div>
        {saving && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            <Save size={14} /> Saving...
          </span>
        )}
      </div>

      <div className="grid">
        {/* Quick Notes (Scratchpad) */}
        <div className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', animationDelay: '0.05s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600 }}>Quick Notes Scratchpad</span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
            Jot down rapid thoughts, ideas, or links here. Auto-saved to database.
          </p>
          <textarea
            className="input"
            placeholder="Write something..."
            style={{ flex: 1, minHeight: '300px', resize: 'none', background: 'var(--bg-base)' }}
            value={scratchpadText}
            onChange={(e) => handleScratchpadChange(e.target.value)}
          />
        </div>

        {/* Knowledge Blueprints */}
        <div className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', animationDelay: '0.1s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={18} style={{ color: 'var(--status-info)' }} />
              <span style={{ fontWeight: 600 }}>Knowledge Blueprints</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={handleAddBlueprint}>
              <Plus size={16} /> Add
            </button>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
            Structured frameworks and long-term knowledge. Auto-saved.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {blueprints.map((bp) => (
              <div key={bp.id} style={{ background: 'var(--bg-base)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <input
                    className="input"
                    value={bp.title}
                    onChange={(e) => handleUpdateBlueprint(bp.id, 'title', e.target.value)}
                    style={{ fontWeight: 600, background: 'transparent', border: 'none', padding: 0, fontSize: '0.875rem', flex: 1 }}
                  />
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '2px', color: 'var(--status-danger)' }}
                    onClick={() => handleDeleteBlueprint(bp.id)}
                    title="Delete blueprint"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <textarea
                  className="input"
                  placeholder="Blueprint content..."
                  value={bp.content}
                  onChange={(e) => handleUpdateBlueprint(bp.id, 'content', e.target.value)}
                  style={{ background: 'transparent', border: 'none', padding: 0, fontSize: '0.8125rem', resize: 'vertical', minHeight: '60px', width: '100%' }}
                />
              </div>
            ))}

            {blueprints.length === 0 && (
              <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8125rem', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                No blueprints created yet.
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .second-brain-page { display: flex; flex-direction: column; gap: var(--space-xl); height: 100%; }
        .header { display: flex; align-items: center; justify-content: space-between; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-xl); align-items: stretch; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
