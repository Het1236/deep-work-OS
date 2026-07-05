'use client'

import {
  Dumbbell, Flame, Camera, ChefHat, Target, Loader2,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import { getNutritionTargets, getMealsForDate, getMacroTrend, getMealPhotoUrl } from '@/lib/data'
import { localYmd } from '@/lib/nutrition'
import type { NutritionTargets, Meal, MacroDay } from '@/lib/types'
import TodayTab from './components/TodayTab'
import LogMealTab from './components/LogMealTab'
import TargetsTab from './components/TargetsTab'
import SuggestTab from './components/SuggestTab'
import WorkoutsTab from './components/WorkoutsTab'

type Tab = 'today' | 'log' | 'suggest' | 'workouts' | 'targets'

const TABS: { key: Tab; label: string; icon: typeof Flame }[] = [
  { key: 'today', label: 'Today', icon: Flame },
  { key: 'log', label: 'Log Meal', icon: Camera },
  { key: 'suggest', label: 'Suggest', icon: ChefHat },
  { key: 'workouts', label: 'Workouts', icon: Dumbbell },
  { key: 'targets', label: 'Targets', icon: Target },
]

export default function FitnessPage() {
  const { userId } = useUser()
  const [tab, setTab] = useState<Tab>('today')
  const [loading, setLoading] = useState(true)
  const [targets, setTargets] = useState<NutritionTargets | null>(null)
  const [meals, setMeals] = useState<Meal[]>([])
  const [trend, setTrend] = useState<MacroDay[]>([])

  const loadAll = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const today = localYmd()
    const [t, m, tr] = await Promise.all([
      getNutritionTargets(userId),
      getMealsForDate(userId, today),
      getMacroTrend(userId, 14),
    ])
    setTargets(t)
    setMeals(m)
    setTrend(tr)
    setLoading(false)
  }, [userId])

  useEffect(() => { loadAll() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="ft-wrap">
      <header className="ft-head">
        <div>
          <h1 className="ft-title"><Dumbbell size={20} /> Fitness</h1>
          <p className="ft-sub">Fuel + train. Log meals precisely, hit your macros, track your lifting.</p>
        </div>
      </header>

      <nav className="ft-tabs">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} className={`ft-tab${tab === t.key ? ' ft-tab--active' : ''}`} onClick={() => setTab(t.key)}>
              <Icon size={15} /><span>{t.label}</span>
            </button>
          )
        })}
      </nav>

      {loading ? (
        <div className="ft-loading"><Loader2 size={22} className="ft-spin" /> Loading…</div>
      ) : !userId ? null : tab === 'today' ? (
        <TodayTab userId={userId} targets={targets} meals={meals} trend={trend}
          onChanged={loadAll} onGoTargets={() => setTab('targets')} getPhotoUrl={getMealPhotoUrl} />
      ) : tab === 'log' ? (
        <LogMealTab userId={userId} onLogged={loadAll} />
      ) : tab === 'targets' ? (
        <TargetsTab userId={userId} targets={targets} onSaved={loadAll} />
      ) : tab === 'suggest' ? (
        <SuggestTab userId={userId} onLogged={loadAll} />
      ) : (
        <WorkoutsTab userId={userId} />
      )}

      <FitnessStyles />
    </div>
  )
}

function FitnessStyles() {
  return (
    <style jsx global>{`
      .ft-wrap { max-width: 920px; margin: 0 auto; padding: 8px 4px 64px; }
      .ft-head { margin-bottom: 18px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .ft-title { display: flex; align-items: center; gap: 9px; font-size: 1.5rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em; }
      .ft-title svg { color: var(--accent); }
      .ft-sub { color: var(--text-tertiary); font-size: 0.875rem; margin-top: 4px; }

      .ft-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px; }
      .ft-tab { display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; border-radius: 10px;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.08)); background: var(--card-bg, rgba(255,255,255,0.02));
        color: var(--text-tertiary); font-size: 0.8125rem; font-weight: 500; cursor: pointer; transition: all .18s ease; }
      .ft-tab:hover { color: var(--text-secondary); background: rgba(255,255,255,0.04); }
      .ft-tab--active { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 30%, transparent);
        background: color-mix(in srgb, var(--accent) 12%, transparent); font-weight: 600; }

      .ft-loading, .ft-empty { display: flex; align-items: center; justify-content: center; gap: 10px;
        padding: 56px 20px; color: var(--text-tertiary); font-size: 0.9rem; text-align: center; }

      .ft-card { background: var(--card-bg, rgba(255,255,255,0.025)); border: 1px solid var(--nav-border, rgba(255,255,255,0.08)); border-radius: 14px; }
      .ft-pad { padding: 18px; }
      .ft-card-title { display: flex; align-items: center; gap: 8px; font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 12px; }
      .ft-card-title svg { color: var(--accent); }
      .ft-hint { font-size: 0.8rem; color: var(--text-tertiary); line-height: 1.45; margin-bottom: 12px; }
      .ft-badge { font-size: 0.65rem; font-weight: 600; padding: 2px 8px; border-radius: 7px;
        background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }

      .ft-input { width: 100%; padding: 9px 11px; border-radius: 9px; border: 1px solid var(--nav-border, rgba(255,255,255,0.1));
        background: var(--input-bg, rgba(0,0,0,0.18)); color: var(--text-primary); font-size: 0.875rem; outline: none; }
      .ft-input:focus { border-color: var(--accent); }
      .ft-sm { padding: 7px 8px; font-size: 0.8rem; }
      .ft-num { text-align: right; }
      .ft-field { display: flex; flex-direction: column; gap: 5px; }
      .ft-field span { font-size: 0.72rem; color: var(--text-tertiary); font-weight: 600; }
      .ft-grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
      .ft-grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
      @media (max-width: 640px) { .ft-grid3, .ft-grid4 { grid-template-columns: repeat(2, 1fr); } }

      .ft-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 9px; cursor: pointer;
        font-size: 0.83rem; font-weight: 600; border: 1px solid var(--nav-border, rgba(255,255,255,0.12));
        background: rgba(255,255,255,0.03); color: var(--text-secondary); transition: all .15s; }
      .ft-btn:hover:not(:disabled) { background: rgba(255,255,255,0.07); color: var(--text-primary); }
      .ft-btn:disabled { opacity: 0.5; cursor: default; }
      .ft-btn--accent { background: var(--primary-gradient, var(--accent)); color: var(--on-accent); border: none; }
      .ft-btn--ghost { border-style: dashed; background: transparent; }
      .ft-mini { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; cursor: pointer;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.1)); background: rgba(255,255,255,0.02); color: var(--text-tertiary); transition: all .15s; }
      .ft-mini:hover:not(:disabled) { background: rgba(255,255,255,0.07); color: var(--text-primary); }
      .ft-mini--danger:hover:not(:disabled) { color: #ff6b6b; border-color: color-mix(in srgb, #ff6b6b 40%, transparent); }
      .ft-chip { display: inline-flex; align-items: center; gap: 4px; padding: 6px 11px; border-radius: 8px; cursor: pointer; font-size: 0.76rem; font-weight: 500;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.1)); background: rgba(255,255,255,0.02); color: var(--text-tertiary); transition: all .15s; }
      .ft-chip.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); font-weight: 600; }

      /* Meal editor */
      .ft-editor { display: flex; flex-direction: column; gap: 14px; }
      .ft-editor-name { font-size: 1rem; font-weight: 600; }
      .ft-typerow { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
      .ft-items { display: flex; flex-direction: column; gap: 6px; }
      .ft-item { display: grid; grid-template-columns: 1.6fr 1.3fr 62px 52px 52px 52px 52px; gap: 6px; align-items: center; }
      .ft-item--header { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; color: var(--text-tertiary); padding: 0 2px; }
      .ft-item--low .ft-input { border-color: color-mix(in srgb, #f5a623 45%, transparent); }
      .ft-item-tail { display: flex; align-items: center; gap: 4px; justify-content: flex-end; }
      .ft-conf { font-size: 0.7rem; }
      .ft-conf--high { color: #34d399; } .ft-conf--medium { color: #f5a623; } .ft-conf--low { color: #ff6b6b; }
      @media (max-width: 720px) { .ft-item { grid-template-columns: 1.4fr 1fr 52px 44px 44px 44px 44px; } }

      .ft-editor-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
        border-top: 1px dashed var(--nav-border, rgba(255,255,255,0.1)); padding-top: 12px; }
      .ft-totals { display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.8rem; color: var(--text-tertiary); }
      .ft-total b { color: var(--text-primary); font-variant-numeric: tabular-nums; }
      .ft-total--p b { color: #5B9BD5; } .ft-total--c b { color: #F5A623; } .ft-total--f b { color: #E770A5; }
      .ft-editor-actions { display: flex; gap: 8px; }

      /* Today */
      .ft-today { display: flex; flex-direction: column; gap: 14px; }
      .ft-banner { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 16px; border-radius: 11px; cursor: pointer;
        font-size: 0.85rem; font-weight: 600; color: var(--accent); background: color-mix(in srgb, var(--accent) 11%, transparent);
        border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent); width: 100%; }
      .ft-rings { display: flex; justify-content: space-around; flex-wrap: wrap; gap: 8px; }
      .ft-ring { display: flex; flex-direction: column; align-items: center; gap: 4px; }
      .ft-ring-label { font-size: 0.72rem; color: var(--text-tertiary); font-weight: 600; }
      .ft-ring-label--over { color: #f5a623; }
      .ft-meals { display: flex; flex-direction: column; gap: 8px; }
      .ft-meal { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 11px;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.07)); background: rgba(255,255,255,0.015); }
      .ft-meal-main { flex: 1; min-width: 0; }
      .ft-meal-name { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
      .ft-meal-macros { font-size: 0.74rem; color: var(--text-tertiary); margin-top: 2px; font-variant-numeric: tabular-nums; }
      .ft-meal-actions { display: flex; gap: 5px; flex-shrink: 0; }
      .ft-thumb { width: 44px; height: 44px; border-radius: 9px; object-fit: cover; flex-shrink: 0; }

      /* Targets + Log */
      .ft-targets, .ft-log { display: flex; flex-direction: column; gap: 14px; }
      .ft-modes { display: flex; gap: 6px; }
      .ft-file { display: none; }
      .ft-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 40px 20px;
        border: 2px dashed var(--nav-border, rgba(255,255,255,0.15)); border-radius: 13px; cursor: pointer;
        color: var(--text-tertiary); font-size: 0.85rem; transition: all .18s; }
      .ft-drop:hover { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 5%, transparent); }
      .ft-photo-stage { display: flex; flex-direction: column; gap: 10px; }
      .ft-preview { width: 100%; max-height: 300px; object-fit: contain; border-radius: 11px; background: rgba(0,0,0,0.25); margin-bottom: 10px; }
      .ft-photo-actions { display: flex; gap: 8px; justify-content: flex-end; }
      .ft-error { display: flex; align-items: center; gap: 7px; padding: 10px 13px; border-radius: 9px; margin-bottom: 12px; font-size: 0.8rem;
        color: #ff6b6b; background: color-mix(in srgb, #ff6b6b 10%, transparent); border: 1px solid color-mix(in srgb, #ff6b6b 25%, transparent); }
      .ft-saved { display: flex; align-items: center; gap: 8px; padding: 11px 15px; border-radius: 10px; font-size: 0.83rem; font-weight: 600;
        color: #34d399; background: color-mix(in srgb, #34d399 11%, transparent); border: 1px solid color-mix(in srgb, #34d399 24%, transparent); }

      /* Suggest */
      .ft-suggest { display: flex; flex-direction: column; gap: 14px; }
      .ft-pantry { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 12px; }
      .ft-pantry-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 9px; font-size: 0.8rem;
        color: var(--text-primary); border: 1px solid var(--nav-border, rgba(255,255,255,0.1)); background: rgba(255,255,255,0.02); }
      .ft-pantry-x { display: inline-flex; cursor: pointer; color: var(--text-tertiary); background: none; border: none; padding: 0; }
      .ft-pantry-x:hover { color: #ff6b6b; }
      .ft-pantry-add { display: flex; gap: 8px; }
      .ft-dishes { display: flex; flex-direction: column; gap: 12px; }
      .ft-dish { padding: 15px 17px; }
      .ft-dish-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
      .ft-dish-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.05em; color: var(--accent); }
      .ft-dish-log { padding: 6px 11px; font-size: 0.76rem; }
      .ft-dish-name { font-size: 1.02rem; font-weight: 700; color: var(--text-primary); }
      .ft-dish-macros { font-size: 0.8rem; color: var(--text-tertiary); margin-top: 4px; font-variant-numeric: tabular-nums; }
      .ft-dish-macros b { color: #5B9BD5; }
      .ft-dish-why { font-size: 0.79rem; color: var(--text-secondary); margin-top: 8px; line-height: 1.45; }
      .ft-dish-recipe { font-size: 0.76rem; color: var(--text-tertiary); margin-top: 6px; line-height: 1.45;
        border-left: 2px solid color-mix(in srgb, var(--accent) 35%, transparent); padding-left: 9px; }

      /* Workouts */
      .ft-workouts { display: flex; flex-direction: column; gap: 14px; }
      .ft-import-preview { display: flex; flex-direction: column; gap: 10px; font-size: 0.85rem; color: var(--text-secondary); }
      .ft-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      @media (max-width: 720px) { .ft-two { grid-template-columns: 1fr; } }
      .ft-muscles { display: flex; flex-direction: column; gap: 8px; }
      .ft-muscle { display: flex; align-items: center; gap: 9px; }
      .ft-muscle-name { width: 76px; font-size: 0.76rem; color: var(--text-secondary); flex-shrink: 0; }
      .ft-muscle-bar { flex: 1; height: 8px; border-radius: 4px; background: rgba(255,255,255,0.07); overflow: hidden; }
      .ft-muscle-fill { height: 100%; background: var(--primary-gradient, var(--accent)); border-radius: 4px; }
      .ft-muscle-n { width: 30px; text-align: right; font-size: 0.72rem; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
      .ft-prs { display: flex; flex-direction: column; gap: 7px; }
      .ft-pr { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
      .ft-pr-ex { font-size: 0.78rem; color: var(--text-secondary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ft-pr-val { font-size: 0.74rem; color: var(--accent); font-weight: 600; flex-shrink: 0; font-variant-numeric: tabular-nums; }
      .ft-sessions { display: flex; flex-direction: column; gap: 8px; }
      .ft-session { border: 1px solid var(--nav-border, rgba(255,255,255,0.07)); border-radius: 11px; background: rgba(255,255,255,0.015); overflow: hidden; }
      .ft-session-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
        padding: 12px 14px; background: none; border: none; cursor: pointer; color: var(--text-tertiary); text-align: left; }
      .ft-session-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .ft-session-title { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
      .ft-session-meta { font-size: 0.73rem; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
      .ft-session-body { padding: 4px 14px 13px; display: flex; flex-direction: column; gap: 10px; border-top: 1px dashed var(--nav-border, rgba(255,255,255,0.08)); }
      .ft-ex-name { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); margin: 8px 0 5px; }
      .ft-ex-sets { display: flex; flex-wrap: wrap; gap: 5px; }
      .ft-set { font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; background: rgba(255,255,255,0.05); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }

      .ft-spin { animation: ftspin 1s linear infinite; }
      @keyframes ftspin { to { transform: rotate(360deg); } }
    `}</style>
  )
}
