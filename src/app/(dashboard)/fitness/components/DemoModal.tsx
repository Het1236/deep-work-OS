'use client'

// Form demo viewer. If `demo_url` is a real YouTube watch/embed/short link we
// embed the player; anything else (including the seeded search URLs) opens in a
// new tab. We link rather than rehost — the videos belong to their creators.

import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { X, ExternalLink, Video } from 'lucide-react'
import type { Exercise } from '@/lib/types'

// Returns a youtube-nocookie embed src for a single-video URL, else null.
export function youtubeEmbed(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    let id: string | null = null
    if (host === 'youtu.be') id = u.pathname.slice(1)
    else if (host.endsWith('youtube.com')) {
      if (u.pathname === '/watch') id = u.searchParams.get('v')
      else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/')[2]
      else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2]
    }
    if (!id || !/^[\w-]{11}$/.test(id)) return null
    return `https://www.youtube-nocookie.com/embed/${id}?rel=0`
  } catch { return null }
}

export default function DemoModal({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  // Only ever rendered in response to a click, so `document` is always present.
  if (typeof document === 'undefined') return null
  const embed = youtubeEmbed(exercise.demo_url)

  // Portalled to body — transformed ancestors trap position:fixed.
  return createPortal(
    <div className="dm-back" onClick={onClose} role="dialog" aria-label={`${exercise.name} demonstration`}>
      <div className="dm" onClick={e => e.stopPropagation()}>
        <div className="dm-head">
          <div>
            <h3>{exercise.name}</h3>
            <span>{exercise.primary_muscle} · {exercise.equipment}</span>
          </div>
          <button className="ft-mini" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {embed ? (
          <div className="dm-video">
            <iframe src={embed} title={`${exercise.name} demonstration`} allowFullScreen
                    allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture" />
          </div>
        ) : (
          <a className="dm-open" href={exercise.demo_url || '#'} target="_blank" rel="noopener noreferrer">
            <Video size={22} />
            <div>
              <b>Watch demonstrations</b>
              <span>Opens video search for this movement</span>
            </div>
            <ExternalLink size={16} />
          </a>
        )}

        {exercise.form_cues.length > 0 ? (
          <div className="dm-cues">
            <h4>Form cues</h4>
            <ul>{exercise.form_cues.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        ) : (
          <p className="dm-nocues">
            No written cues for this movement yet — add them from the exercise library.
          </p>
        )}

        {exercise.is_isometric && (
          <div className="dm-iso">
            <b>Isometric protocol.</b> Hold the loaded position for the full time before you rep out.
            It will shake — that is the tendon and connective tissue being recruited, which ordinary
            reps miss. This is the injury-prevention work; do not rush it.
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
