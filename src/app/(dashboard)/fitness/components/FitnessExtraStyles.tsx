'use client'

// Styles for the new Train / Stats / Runs / Meal Plan tabs and the body map.
// Extends the existing `ft-` system rather than replacing it — same tokens,
// same radii, so the new tabs read as part of the same app.

export default function FitnessExtraStyles() {
  return (
    <style jsx global>{`
      .ft-train, .ft-stats, .ft-runs, .ft-plan { display: flex; flex-direction: column; gap: 14px; }
      .ft-card-head { display: flex; align-items: center; justify-content: space-between;
        gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
      .ft-card-head .ft-card-title { margin-bottom: 0; }
      .ft-tiny { padding: 6px 11px; font-size: 0.74rem; }
      .ft-select { cursor: pointer; max-width: 210px; }

      /* ── Week strip ── */
      .ft-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
      .ft-wd { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 11px 4px;
        border-radius: 12px; cursor: pointer; min-height: 78px; justify-content: center;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.08));
        background: var(--card-bg, rgba(255,255,255,0.02)); color: var(--text-tertiary);
        transition: all .16s ease; }
      .ft-wd svg { opacity: 0.75; }
      .ft-wd:hover { background: rgba(255,255,255,0.05); }
      .ft-wd-d { font-size: 0.66rem; font-weight: 750; letter-spacing: 0.07em; text-transform: uppercase; }
      .ft-wd-t { font-size: 0.64rem; text-align: center; line-height: 1.2; color: var(--text-tertiary); }
      .ft-wd-h { font-size: 0.6rem; font-variant-numeric: tabular-nums; opacity: 0.75; }
      .ft-wd--today { border-color: color-mix(in srgb, var(--accent) 35%, transparent); }
      .ft-wd--on { background: color-mix(in srgb, var(--accent) 13%, transparent);
        border-color: var(--accent); color: var(--accent); }
      .ft-wd--on .ft-wd-t, .ft-wd--on svg { color: var(--accent); opacity: 1; }
      .ft-week--slim .ft-wd { min-height: 46px; }

      /* ── Day hero ── */
      .ft-dayhero-top { display: flex; align-items: flex-start; justify-content: space-between;
        gap: 14px; flex-wrap: wrap; }
      .ft-dayhero-lbl { font-size: 0.66rem; font-weight: 750; letter-spacing: 0.1em;
        text-transform: uppercase; color: var(--accent); }
      .ft-dayhero-title { font-size: 1.4rem; font-weight: 750; color: var(--text-primary);
        margin: 5px 0 4px; letter-spacing: -0.02em; }
      .ft-dayhero-meta { font-size: 0.8rem; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
      .ft-start { text-decoration: none; min-height: 44px; padding: 11px 20px; }
      .ft-daynote { display: flex; gap: 9px; align-items: flex-start; margin-top: 14px; padding: 11px 13px;
        border-radius: 10px; background: rgba(255,255,255,0.035); font-size: 0.8rem;
        color: var(--text-secondary); line-height: 1.5; }
      .ft-daynote svg { flex-shrink: 0; margin-top: 2px; color: var(--accent); }

      /* ── Exercise list ── */
      .ft-exlist { display: flex; flex-direction: column; gap: 8px; }
      .ft-exrow { border: 1px solid var(--nav-border, rgba(255,255,255,0.06)); border-radius: 11px;
        background: rgba(255,255,255,0.015); overflow: hidden; }
      .ft-exrow-head { display: flex; align-items: center; gap: 10px; padding: 11px 12px; }
      .ft-exrow-n { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;
        border-radius: 7px; background: rgba(255,255,255,0.06); color: var(--text-tertiary);
        font-size: 0.7rem; font-weight: 700; flex-shrink: 0; font-variant-numeric: tabular-nums; }
      .ft-exrow-main { flex: 1; min-width: 0; background: none; border: none; cursor: pointer;
        text-align: left; padding: 0; display: flex; flex-direction: column; gap: 3px; }
      .ft-exrow-name { font-size: 0.86rem; font-weight: 650; color: var(--text-primary);
        display: flex; align-items: center; gap: 7px; }
      .ft-exrow-meta { font-size: 0.72rem; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
      .ft-isotag { font-size: 0.54rem; font-weight: 800; letter-spacing: 0.09em; padding: 2px 5px;
        border-radius: 3px; color: #f5a623; border: 1px solid #f5a623; }
      .ft-cues { margin: 0 12px 11px 46px; padding: 11px 13px 11px 26px; border-radius: 9px;
        background: rgba(255,255,255,0.035); font-size: 0.78rem; color: var(--text-secondary);
        line-height: 1.5; display: flex; flex-direction: column; gap: 6px; }
      .ft-extargets { display: flex; gap: 8px; flex-wrap: wrap; padding: 0 12px 12px 46px; }
      .ft-extargets label { display: flex; flex-direction: column; gap: 4px; width: 68px; }
      .ft-extargets span { font-size: 0.62rem; color: var(--text-tertiary); font-weight: 650;
        text-transform: uppercase; letter-spacing: 0.05em; }

      .ft-addbox { border: 1px dashed var(--nav-border, rgba(255,255,255,0.14)); border-radius: 11px; padding: 12px; }
      .ft-addbox-head { display: flex; align-items: center; justify-content: space-between;
        font-size: 0.76rem; font-weight: 650; color: var(--text-tertiary); margin-bottom: 9px; }
      .ft-addbox-list { max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
      .ft-addpick { display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 9px 11px; border-radius: 8px; cursor: pointer; border: none;
        background: rgba(255,255,255,0.03); color: var(--text-primary); font-size: 0.8rem; text-align: left; }
      .ft-addpick:hover { background: rgba(255,255,255,0.07); }
      .ft-addpick-m { font-size: 0.7rem; color: var(--text-tertiary); flex-shrink: 0; }

      .ft-runtarget { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
      .ft-runtype { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
        padding: 6px 11px; border-radius: 7px; color: var(--accent);
        background: color-mix(in srgb, var(--accent) 12%, transparent); }

      /* ── Stats tiles ── */
      .ft-range { display: flex; gap: 6px; }
      .ft-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
      @media (max-width: 640px) { .ft-tiles { grid-template-columns: repeat(2, 1fr); } }
      .ft-tile { padding: 14px; border-radius: 13px;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.08));
        background: var(--card-bg, rgba(255,255,255,0.025)); }
      .ft-tile--accent { border-color: color-mix(in srgb, var(--accent) 28%, transparent);
        background: color-mix(in srgb, var(--accent) 9%, transparent); }
      .ft-tile-top { display: flex; align-items: center; gap: 7px; font-size: 0.68rem; font-weight: 700;
        letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-tertiary); }
      .ft-tile-top svg { color: var(--accent); }
      .ft-tile-val { font-size: 1.6rem; font-weight: 780; color: var(--text-primary); margin-top: 7px;
        letter-spacing: -0.03em; font-variant-numeric: tabular-nums; line-height: 1.1; }
      .ft-tile-val em { font-style: normal; font-size: 0.8rem; font-weight: 600;
        color: var(--text-tertiary); margin-left: 3px; }
      .ft-tile-sub { font-size: 0.72rem; color: var(--text-tertiary); margin-top: 3px;
        font-variant-numeric: tabular-nums; }

      /* ── Streak calendar ── */
      .ft-cal { display: flex; gap: 3px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: thin; }
      .ft-cal-col { display: flex; flex-direction: column; gap: 3px; flex-shrink: 0; }
      .ft-cal-cell { width: 12px; height: 12px; border-radius: 3px; display: inline-block; flex-shrink: 0; }
      .ft-cal--none { background: rgba(255,255,255,0.06); }
      .ft-cal--rest { background: rgba(255,255,255,0.14); }
      .ft-cal--run  { background: #5B9BD5; }
      .ft-cal--lift { background: var(--accent); }
      .ft-cal--both { background: linear-gradient(135deg, var(--accent) 50%, #5B9BD5 50%); }
      .ft-cal-key { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 11px;
        font-size: 0.68rem; color: var(--text-tertiary); }
      .ft-cal-key .ft-cal-cell { margin-left: 7px; }
      .ft-cal-key .ft-cal-cell:first-child { margin-left: 0; }

      .ft-nochart { display: flex; align-items: center; justify-content: center; height: 100%;
        color: var(--text-tertiary); font-size: 0.82rem; text-align: center; padding: 0 20px; }

      /* ── Report ── */
      .ft-report { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 16px; }
      @media (max-width: 560px) { .ft-report { grid-template-columns: repeat(2, 1fr); } }
      .ft-report div { display: flex; flex-direction: column; gap: 3px; }
      .ft-report b { font-size: 1.2rem; font-weight: 750; color: var(--text-primary);
        font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
      .ft-report span { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em;
        color: var(--text-tertiary); font-weight: 650; }
      .ft-adherence { border-top: 1px dashed var(--nav-border, rgba(255,255,255,0.1)); padding-top: 14px; }
      .ft-adherence-head { display: flex; align-items: baseline; justify-content: space-between;
        margin-bottom: 8px; font-size: 0.78rem; color: var(--text-tertiary); }
      .ft-adherence-head b { font-size: 1rem; color: var(--text-primary); font-variant-numeric: tabular-nums; }

      /* ── Body map ── */
      .bm { --bm-0: rgba(255,255,255,0.07); --bm-1: color-mix(in srgb, var(--accent) 26%, transparent);
        --bm-2: color-mix(in srgb, var(--accent) 45%, transparent);
        --bm-3: color-mix(in srgb, var(--accent) 68%, transparent); --bm-4: var(--accent);
        display: flex; flex-direction: column; gap: 10px; }
      .bm-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .bm-ctrl { display: flex; align-items: center; gap: 7px; }
      .bm-face { font-size: 0.68rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--text-tertiary); min-width: 38px; text-align: center; }
      .bm-stage { perspective: 1000px; display: flex; justify-content: center; padding: 6px 0;
        touch-action: pan-y; cursor: grab; user-select: none; }
      .bm-stage:active { cursor: grabbing; }
      .bm-spin { position: relative; width: 168px; height: 340px; transform-style: preserve-3d;
        transition: transform .5s cubic-bezier(.22,.9,.3,1); }
      .bm-spin--drag { transition: none; }
      .bm-face-svg { position: absolute; inset: 0; width: 100%; height: 100%; backface-visibility: hidden; }
      .bm-back { transform: rotateY(180deg); }
      .bm-body { fill: rgba(255,255,255,0.045); stroke: rgba(255,255,255,0.10); stroke-width: 1; }
      .bm-face-svg path[id] { stroke: rgba(0,0,0,0.22); stroke-width: 0.6; transition: fill .3s ease; }
      .bm-hint { text-align: center; font-size: 0.68rem; color: var(--text-tertiary);
        letter-spacing: 0.05em; margin: 0; }
      .bm-legend { display: flex; flex-direction: column; gap: 6px;
        border-top: 1px dashed var(--nav-border, rgba(255,255,255,0.1)); padding-top: 11px; }
      .bm-leg { display: flex; align-items: center; gap: 9px; font-size: 0.76rem; }
      .bm-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
      .bm-leg-name { flex: 1; color: var(--text-secondary); }
      .bm-leg-n { color: var(--text-tertiary); font-variant-numeric: tabular-nums; }

      /* ── Runs ── */
      .ft-runlist { display: flex; flex-direction: column; gap: 8px; }
      .ft-run { display: flex; align-items: center; gap: 11px; padding: 12px 13px; border-radius: 11px;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.06)); background: rgba(255,255,255,0.015); }
      .ft-run-main { flex: 1; min-width: 0; }
      .ft-run-top { display: flex; align-items: center; gap: 8px; }
      .ft-run-name { font-size: 0.87rem; font-weight: 650; color: var(--text-primary); }
      .ft-runtype-tag { font-size: 0.6rem; font-weight: 750; letter-spacing: 0.07em; text-transform: uppercase;
        padding: 2px 7px; border-radius: 5px; color: #5B9BD5;
        background: color-mix(in srgb, #5B9BD5 15%, transparent); }
      .ft-run-meta { font-size: 0.75rem; color: var(--text-tertiary); margin-top: 3px;
        font-variant-numeric: tabular-nums; }
      .ft-run-meta b { color: var(--text-secondary); }
      .ft-run-extra { display: flex; gap: 11px; align-items: center; margin-top: 4px;
        font-size: 0.68rem; color: var(--text-tertiary); flex-wrap: wrap; }
      .ft-run-extra span { display: inline-flex; align-items: center; gap: 4px; }
      .ft-run-src { text-transform: uppercase; letter-spacing: 0.07em; opacity: 0.6; font-weight: 650; }

      /* ── Meal plan ── */
      .ft-plantotals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
      @media (max-width: 560px) { .ft-plantotals { grid-template-columns: repeat(2, 1fr); } }
      .ft-plantotals div { display: flex; flex-direction: column; gap: 2px; }
      .ft-plantotals b { font-size: 1.15rem; font-weight: 750; color: var(--text-primary);
        font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
      .ft-plantotals span { font-size: 0.67rem; color: var(--text-tertiary); font-weight: 600; }
      .ft-plantotals .ft-total--p b { color: #5B9BD5; }
      .ft-plantotals .ft-total--c b { color: #F5A623; }
      .ft-plantotals .ft-total--f b { color: #E770A5; }

      .ft-slots { display: flex; flex-direction: column; gap: 8px; }
      .ft-slot { display: flex; gap: 12px; padding: 13px 14px; border-radius: 12px;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.07));
        background: var(--card-bg, rgba(255,255,255,0.02)); align-items: flex-start; }
      .ft-slot--train { border-left: 3px solid var(--accent); }
      .ft-slot--done { background: color-mix(in srgb, #34d399 7%, transparent);
        border-color: color-mix(in srgb, #34d399 24%, transparent); }
      .ft-slot-time { font-size: 0.76rem; font-weight: 700; color: var(--text-tertiary);
        font-variant-numeric: tabular-nums; width: 46px; flex-shrink: 0; display: flex;
        flex-direction: column; gap: 4px; align-items: flex-start; }
      .ft-slot-time svg { color: var(--accent); }
      .ft-slot-main { flex: 1; min-width: 0; }
      .ft-slot-label { font-size: 0.63rem; font-weight: 750; letter-spacing: 0.08em;
        text-transform: uppercase; color: var(--text-tertiary); }
      .ft-slot-title { font-size: 0.9rem; font-weight: 650; color: var(--text-primary); margin-top: 3px; }
      .ft-slot-detail { font-size: 0.76rem; color: var(--text-secondary); margin-top: 4px; line-height: 1.45; }
      .ft-slot-macros { font-size: 0.72rem; color: var(--text-tertiary); margin-top: 6px;
        font-variant-numeric: tabular-nums; }
      .ft-slot-macros b { color: #5B9BD5; }
      .ft-slot-edit { display: flex; gap: 7px; flex-wrap: wrap; align-items: flex-end; margin-top: 10px; }
      .ft-slot-edit label { display: flex; flex-direction: column; gap: 3px; width: 58px; }
      .ft-slot-edit span { font-size: 0.6rem; color: var(--text-tertiary); font-weight: 650; }
      .ft-slot-log { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px;
        border-radius: 10px; cursor: pointer; flex-shrink: 0;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.12));
        background: rgba(255,255,255,0.03); color: var(--text-tertiary); }
      .ft-slot-log:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
      .ft-slot-log.on { background: #34d399; border-color: #34d399; color: #06281c; }

      /* ── 3D body map ── */
      .bm3 { display: flex; flex-direction: column; gap: 11px; }
      .bm3-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .bm3-ctrl { display: flex; align-items: center; gap: 6px; }
      .bm3-stage { position: relative; width: 100%; height: 340px; cursor: grab;
        touch-action: pan-y; user-select: none; border-radius: 13px;
        background: radial-gradient(ellipse at 50% 32%, rgba(255,255,255,0.055), transparent 68%); }
      .bm3-stage:active { cursor: grabbing; }
      .bm3-stage canvas { display: block; width: 100% !important; height: 100% !important; }
      .bm3-tip { position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
        padding: 6px 12px; border-radius: 8px; font-size: 0.76rem; white-space: nowrap;
        pointer-events: none; color: var(--text-primary);
        background: var(--bg-elevated, rgba(20,20,20,0.94));
        border: 1px solid var(--nav-border, rgba(255,255,255,0.14)); }
      .bm3-tip b { color: var(--accent); font-variant-numeric: tabular-nums; }
      .bm3-scale { display: flex; align-items: center; justify-content: center; gap: 4px;
        font-size: 0.64rem; color: var(--text-tertiary); letter-spacing: 0.05em; }
      .bm3-sw { width: 22px; height: 8px; border-radius: 2px; display: inline-block; }
      .bm3-scale span:first-child { margin-right: 4px; }
      .bm3-scale span:last-child { margin-left: 4px; }
      .bm3-legend { display: flex; flex-direction: column; gap: 6px;
        border-top: 1px dashed var(--nav-border, rgba(255,255,255,0.1)); padding-top: 11px; }
      .bm3-leg { display: flex; align-items: center; gap: 9px; font-size: 0.76rem; }
      .bm3-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
      .bm3-leg-name { flex: 1; color: var(--text-secondary); }
      .bm3-leg-n { color: var(--text-tertiary); font-variant-numeric: tabular-nums; }

      /* ── Demo modal ── */
      .dm-back { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center;
        justify-content: center; padding: 18px; background: rgba(0,0,0,0.72);
        backdrop-filter: blur(3px); overflow-y: auto; }
      .dm { width: 100%; max-width: 620px; border-radius: 16px; padding: 20px;
        background: var(--bg-elevated, #17181c);
        border: 1px solid var(--nav-border, rgba(255,255,255,0.11));
        box-shadow: 0 24px 70px rgba(0,0,0,0.55); display: flex; flex-direction: column; gap: 15px; }
      .dm-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .dm-head h3 { font-size: 1.12rem; font-weight: 750; color: var(--text-primary);
        letter-spacing: -0.015em; }
      .dm-head span { font-size: 0.74rem; color: var(--text-tertiary); text-transform: capitalize; }
      .dm-video { position: relative; width: 100%; padding-top: 56.25%; border-radius: 12px;
        overflow: hidden; background: #000; }
      .dm-video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
      .dm-open { display: flex; align-items: center; gap: 14px; padding: 17px 18px; border-radius: 12px;
        text-decoration: none; color: var(--text-primary);
        border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
        background: color-mix(in srgb, var(--accent) 10%, transparent); }
      .dm-open > svg:first-child { color: var(--accent); flex-shrink: 0; }
      .dm-open > svg:last-child { color: var(--text-tertiary); flex-shrink: 0; margin-left: auto; }
      .dm-open div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .dm-open b { font-size: 0.9rem; font-weight: 650; }
      .dm-open span { font-size: 0.75rem; color: var(--text-tertiary); }
      .dm-cues h4 { font-size: 0.7rem; font-weight: 750; letter-spacing: 0.09em; text-transform: uppercase;
        color: var(--text-tertiary); margin-bottom: 9px; }
      .dm-cues ul { margin: 0; padding-left: 19px; display: flex; flex-direction: column; gap: 8px;
        font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; }
      .dm-nocues { font-size: 0.82rem; color: var(--text-tertiary); margin: 0; }
      .dm-iso { padding: 13px 15px; border-radius: 11px; font-size: 0.81rem; line-height: 1.55;
        color: var(--text-secondary); border-left: 3px solid #f5a623;
        background: color-mix(in srgb, #f5a623 9%, transparent); }
      .dm-iso b { color: #f5a623; }

      /* ── Strava setup ── */
      .ft-btn--off { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
      .ft-setup { margin-top: 12px; padding: 16px 17px; border-radius: 12px;
        border: 1px solid color-mix(in srgb, #f5a623 26%, transparent);
        background: color-mix(in srgb, #f5a623 7%, transparent); }
      .ft-setup-head { display: flex; align-items: center; gap: 8px; font-size: 0.85rem;
        font-weight: 700; color: #f5a623; margin-bottom: 10px; }
      .ft-setup p { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.55; margin: 0 0 12px; }
      .ft-setup ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 11px;
        font-size: 0.82rem; color: var(--text-secondary); line-height: 1.55; }
      .ft-setup b { color: var(--text-primary); }
      .ft-setup a { color: var(--accent); }
      .ft-setup code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.76rem;
        padding: 1px 5px; border-radius: 4px; background: rgba(255,255,255,0.09); }
      .ft-setup pre { margin: 9px 0 0; padding: 11px 13px; border-radius: 9px; overflow-x: auto;
        font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.74rem; line-height: 1.6;
        background: rgba(0,0,0,0.3); color: var(--text-primary);
        border: 1px solid var(--nav-border, rgba(255,255,255,0.09)); }
      .ft-setup-note { margin-top: 13px !important; margin-bottom: 0 !important;
        font-size: 0.76rem !important; color: var(--text-tertiary) !important; }

      @media (prefers-reduced-motion: reduce) {
        .bm-spin { transition: none; }
        .bm-face-svg path[id] { transition: none; }
      }
    `}</style>
  )
}
