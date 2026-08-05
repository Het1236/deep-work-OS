'use client'

// Styles for the My Day tab: timeline, readiness, prescription card, meal swap.

export default function DayStyles() {
  return (
    <style jsx global>{`
      .ft-dayview { display: flex; flex-direction: column; gap: 14px; }
      .ft-daytabs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .ft-daydate { margin-left: auto; font-size: 0.78rem; color: var(--text-tertiary); }

      /* Readiness */
      .ft-ready { display: flex; gap: 8px; }
      .ft-readybtn { flex: 1; min-height: 46px; border-radius: 11px; cursor: pointer;
        font-size: 1rem; font-weight: 700; font-variant-numeric: tabular-nums;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.1));
        background: rgba(255,255,255,0.02); color: var(--text-tertiary); transition: all .15s; }
      .ft-readybtn:hover:not(:disabled) { background: rgba(255,255,255,0.06); }
      .ft-readybtn.on { background: var(--primary-gradient, var(--accent)); color: var(--on-accent);
        border-color: transparent; }

      /* Prescription */
      .ft-rx { border-color: color-mix(in srgb, var(--accent) 26%, transparent);
        background: color-mix(in srgb, var(--accent) 7%, transparent); }
      .ft-rx-title { font-size: 1.22rem; font-weight: 750; color: var(--text-primary);
        letter-spacing: -0.02em; }
      .ft-rx-meta { font-size: 0.8rem; color: var(--text-tertiary); margin-top: 3px;
        font-variant-numeric: tabular-nums; }
      .ft-rx-why { font-size: 0.87rem; color: var(--text-secondary); line-height: 1.55;
        margin: 11px 0 0; }
      .ft-rx-flags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 11px; }
      .ft-flag { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
        padding: 3px 8px; border-radius: 5px; color: #f5a623;
        background: color-mix(in srgb, #f5a623 13%, transparent);
        border: 1px solid color-mix(in srgb, #f5a623 30%, transparent); }
      .ft-rx-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px;
        flex-wrap: wrap; margin-top: 14px; padding-top: 12px;
        border-top: 1px dashed var(--nav-border, rgba(255,255,255,0.12)); }
      .ft-rx-inputs { font-size: 0.72rem; color: var(--text-tertiary); }
      .ft-rx-actions { display: flex; gap: 8px; }
      .ft-rx-status { font-size: 0.7rem; font-weight: 750; letter-spacing: 0.08em;
        text-transform: uppercase; padding: 5px 11px; border-radius: 7px; }
      .ft-rx-status--accepted { color: #34d399; background: color-mix(in srgb, #34d399 14%, transparent); }
      .ft-rx-status--skipped { color: var(--text-tertiary); background: rgba(255,255,255,0.06); }
      .ft-rx-status--modified { color: #f5a623; background: color-mix(in srgb, #f5a623 14%, transparent); }

      /* Warnings — surfaced, never hidden */
      .ft-warns { display: flex; flex-direction: column; gap: 7px; }
      .ft-warn { display: flex; align-items: flex-start; gap: 9px; padding: 11px 14px; border-radius: 10px;
        font-size: 0.82rem; line-height: 1.5; color: #f5a623;
        background: color-mix(in srgb, #f5a623 9%, transparent);
        border: 1px solid color-mix(in srgb, #f5a623 24%, transparent); }
      .ft-warn svg { flex-shrink: 0; margin-top: 2px; }

      /* Timeline */
      .ft-tl { display: flex; flex-direction: column; }
      .ft-tlrow { display: grid; grid-template-columns: 52px 26px 1fr auto; gap: 11px;
        padding: 12px 15px; border-bottom: 1px solid var(--nav-border, rgba(255,255,255,0.05));
        align-items: flex-start; }
      .ft-tlrow:last-child { border-bottom: none; }
      .ft-tltime { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.72rem;
        font-weight: 650; color: var(--text-tertiary); font-variant-numeric: tabular-nums;
        display: flex; flex-direction: column; line-height: 1.4; }
      .ft-tltime span { opacity: 0.5; font-weight: 500; }
      .ft-tlicon { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;
        border-radius: 8px; background: rgba(255,255,255,0.05); color: var(--text-tertiary); flex-shrink: 0; }
      .ft-tlbody { min-width: 0; }
      .ft-tltitle { font-size: 0.88rem; font-weight: 650; color: var(--text-primary);
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .ft-tlmeta { font-size: 0.72rem; color: var(--text-tertiary); margin-top: 2px; }
      .ft-tldetail { font-size: 0.78rem; color: var(--text-secondary); margin-top: 4px; line-height: 1.45; }
      .ft-tlmacros { font-size: 0.72rem; color: var(--text-tertiary); margin-top: 4px;
        font-variant-numeric: tabular-nums; }
      .ft-tlmacros b { color: #5B9BD5; }
      .ft-tlconflict { display: flex; align-items: center; gap: 6px; font-size: 0.73rem; color: #f5a623;
        margin-top: 6px; }
      .ft-tlactions { display: flex; gap: 4px; flex-shrink: 0; }

      .ft-tlrow--run { background: color-mix(in srgb, var(--accent) 8%, transparent); }
      .ft-tlrow--run .ft-tlicon { color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, transparent); }
      .ft-tlrow--lift { background: color-mix(in srgb, #5B9BD5 8%, transparent); }
      .ft-tlrow--lift .ft-tlicon { color: #5B9BD5; background: color-mix(in srgb, #5B9BD5 15%, transparent); }
      .ft-tlrow--class .ft-tlicon { color: #9b8cff; background: color-mix(in srgb, #9b8cff 14%, transparent); }
      .ft-tlrow--meal .ft-tlicon { color: #34d399; background: color-mix(in srgb, #34d399 13%, transparent); }
      .ft-tlrow--sleep, .ft-tlrow--winddown { opacity: 0.65; }
      .ft-tlrow--now { background: color-mix(in srgb, var(--accent) 14%, transparent);
        box-shadow: inset 3px 0 0 var(--accent); }
      .ft-nowtag { font-size: 0.58rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
        padding: 2px 7px; border-radius: 4px; background: var(--accent); color: var(--on-accent); }

      .ft-daytotals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .ft-daytotals div { padding: 13px 15px; border-radius: 12px;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.08));
        background: var(--card-bg, rgba(255,255,255,0.025)); }
      .ft-daytotals b { display: block; font-size: 1.2rem; font-weight: 750; color: var(--text-primary);
        letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
      .ft-daytotals span { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em;
        color: var(--text-tertiary); font-weight: 650; margin-top: 3px; display: block; }

      /* Meal swap sheet */
      .ft-sheet-back { position: fixed; inset: 0; z-index: 200; display: flex; align-items: flex-end;
        justify-content: center; background: rgba(0,0,0,0.65); backdrop-filter: blur(3px); }
      @media (min-width: 640px) { .ft-sheet-back { align-items: center; } }
      .ft-sheet { width: 100%; max-width: 560px; max-height: 86vh; display: flex; flex-direction: column;
        border-radius: 18px 18px 0 0; padding: 20px; background: var(--bg-elevated, #17181c);
        border: 1px solid var(--nav-border, rgba(255,255,255,0.11)); }
      @media (min-width: 640px) { .ft-sheet { border-radius: 16px; } }
      .ft-sheet-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
        margin-bottom: 6px; }
      .ft-sheet-top h3 { font-size: 1.08rem; font-weight: 750; color: var(--text-primary); }
      .ft-sheet-top span { font-size: 0.76rem; color: var(--text-tertiary); }
      .ft-sheet-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 7px;
        margin-top: 10px; }
      .ft-optrow { display: flex; align-items: center; justify-content: space-between; gap: 12px;
        width: 100%; padding: 13px 14px; border-radius: 12px; cursor: pointer; text-align: left;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.07));
        background: rgba(255,255,255,0.02); color: var(--text-primary); }
      .ft-optrow:hover { background: rgba(255,255,255,0.06); }
      .ft-optrow.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 11%, transparent); }
      .ft-optrow svg { flex-shrink: 0; color: var(--text-tertiary); }
      .ft-optrow.on svg { color: var(--accent); }
      .ft-optname { font-size: 0.88rem; font-weight: 650; }
      .ft-optdetail { font-size: 0.75rem; color: var(--text-secondary); margin-top: 3px; line-height: 1.4; }
      .ft-optmacros { font-size: 0.72rem; color: var(--text-tertiary); margin-top: 5px;
        font-variant-numeric: tabular-nums; }
      .ft-optmacros b { color: #5B9BD5; }
      .ft-opttags { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px; }
      .ft-opttags span { font-size: 0.6rem; padding: 2px 7px; border-radius: 4px;
        background: rgba(255,255,255,0.06); color: var(--text-tertiary); }
    `}</style>
  )
}
