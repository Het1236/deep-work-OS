'use client'

// Real 3D muscle map. The figure is built procedurally from three.js primitives
// rather than loaded from a GLB — no model licensing, no multi-megabyte asset,
// and every muscle region is its own mesh so it can be shaded independently.
//
// Front/back groups that share a limb (chest vs back, quads vs hamstrings) are
// half-shell cylinders so the same body part can carry two different loads.

import { useRef, useEffect, useState, useMemo } from 'react'
import * as THREE from 'three'
import { RotateCcw, RotateCw, Maximize2 } from 'lucide-react'

export type MuscleLoad = Record<string, number>

// Slate → mint ramp. Five discrete bands, so "heavily worked" is visibly
// different from "moderately worked" at a glance.
const RAMP = ['#333a44', '#2f6f5f', '#38a184', '#54d1a8', '#8bf5cd']
const DIM = '#2b313a'

type Part = {
  name: string                    // '' = structural, not a muscle group
  geo: THREE.BufferGeometry
  pos: [number, number, number]
  rot?: [number, number, number]
}

// Half-shell facing +Z (front) or -Z (back).
function halfShell(rTop: number, rBot: number, h: number, front: boolean) {
  return new THREE.CylinderGeometry(
    rTop, rBot, h, 20, 1, false,
    front ? -Math.PI / 2 : Math.PI / 2, Math.PI,
  )
}

function buildParts(): Part[] {
  const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 6, 14)
  return [
    // ── structural ──
    { name: '', geo: new THREE.SphereGeometry(0.42, 24, 20), pos: [0, 3.35, 0] },
    { name: '', geo: cap(0.16, 0.2), pos: [0, 2.92, 0] },
    { name: '', geo: new THREE.SphereGeometry(0.2, 14, 12), pos: [-0.92, 1.28, 0] },
    { name: '', geo: new THREE.SphereGeometry(0.2, 14, 12), pos: [0.92, 1.28, 0] },
    { name: '', geo: cap(0.14, 0.1), pos: [-0.42, -0.62, 0] },
    { name: '', geo: cap(0.14, 0.1), pos: [0.42, -0.62, 0] },
    { name: '', geo: new THREE.SphereGeometry(0.17, 12, 10), pos: [-0.4, -2.72, 0] },
    { name: '', geo: new THREE.SphereGeometry(0.17, 12, 10), pos: [0.4, -2.72, 0] },

    // ── torso ──
    { name: 'Chest',      geo: halfShell(0.62, 0.56, 0.95, true),  pos: [0, 2.12, 0] },
    { name: 'Back',       geo: halfShell(0.62, 0.56, 0.95, false), pos: [0, 2.12, 0] },
    { name: 'Core',       geo: halfShell(0.56, 0.5, 1.05, true),   pos: [0, 1.12, 0] },
    { name: 'Back',       geo: halfShell(0.56, 0.5, 1.05, false),  pos: [0, 1.12, 0] },

    // ── shoulders ──
    { name: 'Shoulders',  geo: new THREE.SphereGeometry(0.31, 18, 14), pos: [-0.78, 2.5, 0] },
    { name: 'Shoulders',  geo: new THREE.SphereGeometry(0.31, 18, 14), pos: [0.78, 2.5, 0] },

    // ── arms ──
    { name: 'Arms',       geo: cap(0.19, 0.72), pos: [-0.94, 1.92, 0], rot: [0, 0, 0.1] },
    { name: 'Arms',       geo: cap(0.19, 0.72), pos: [0.94, 1.92, 0],  rot: [0, 0, -0.1] },
    { name: 'Arms',       geo: cap(0.155, 0.66), pos: [-1.08, 1.02, 0], rot: [0, 0, 0.06] },
    { name: 'Arms',       geo: cap(0.155, 0.66), pos: [1.08, 1.02, 0],  rot: [0, 0, -0.06] },

    // ── hips ──
    { name: 'Core',       geo: halfShell(0.5, 0.54, 0.5, true),  pos: [0, 0.36, 0] },
    { name: 'Glutes',     geo: halfShell(0.5, 0.56, 0.5, false), pos: [0, 0.36, 0] },

    // ── thighs: quads front, hamstrings back ──
    { name: 'Legs',       geo: halfShell(0.29, 0.24, 1.35, true),  pos: [-0.4, -0.62, 0] },
    { name: 'Hamstrings', geo: halfShell(0.29, 0.24, 1.35, false), pos: [-0.4, -0.62, 0] },
    { name: 'Legs',       geo: halfShell(0.29, 0.24, 1.35, true),  pos: [0.4, -0.62, 0] },
    { name: 'Hamstrings', geo: halfShell(0.29, 0.24, 1.35, false), pos: [0.4, -0.62, 0] },

    // ── calves ──
    { name: 'Calves',     geo: cap(0.21, 0.85), pos: [-0.4, -1.75, 0] },
    { name: 'Calves',     geo: cap(0.21, 0.85), pos: [0.4, -1.75, 0] },
  ]
}

function band(sets: number, max: number): number {
  if (!sets || max <= 0) return 0
  const r = sets / max
  if (r > 0.75) return 4
  if (r > 0.5) return 3
  if (r > 0.25) return 2
  return 1
}

export default function BodyMap3D({ load, title = 'Muscles worked' }: { load: MuscleLoad; title?: string }) {
  const mount = useRef<HTMLDivElement>(null)
  const groupRef = useRef<THREE.Group | null>(null)
  const meshesRef = useRef<{ mesh: THREE.Mesh; name: string }[]>([])
  const targetY = useRef(0)
  const [hover, setHover] = useState<{ name: string; sets: number } | null>(null)
  const [ready, setReady] = useState(false)

  const max = useMemo(() => Math.max(1, ...Object.values(load)), [load])

  // ── Scene, built once ──
  useEffect(() => {
    const el = mount.current
    if (!el) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(0, 0.4, 12.5)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 1.15))
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(4, 6, 8)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x88bbff, 0.85)
    rim.position.set(-5, 2, -6)
    scene.add(rim)

    const group = new THREE.Group()
    scene.add(group)
    groupRef.current = group

    const meshes: { mesh: THREE.Mesh; name: string }[] = []
    for (const p of buildParts()) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(p.name ? RAMP[0] : DIM),
        roughness: 0.62, metalness: 0.06,
        transparent: !p.name, opacity: p.name ? 1 : 0.55,
      })
      const mesh = new THREE.Mesh(p.geo, mat)
      mesh.position.set(...p.pos)
      if (p.rot) mesh.rotation.set(...p.rot)
      group.add(mesh)
      meshes.push({ mesh, name: p.name })
    }
    meshesRef.current = meshes

    // ── Sizing ──
    const resize = () => {
      const w = el.clientWidth || 300
      const h = el.clientHeight || 380
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    // ── Interaction ──
    const ray = new THREE.Raycaster()
    const ptr = new THREE.Vector2()
    let dragging = false
    let lastX = 0
    let velocity = 0

    const onDown = (e: PointerEvent) => {
      dragging = true; lastX = e.clientX; velocity = 0
      el.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1
      ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1

      if (dragging) {
        const dx = e.clientX - lastX
        lastX = e.clientX
        velocity = dx * 0.008
        targetY.current += velocity
        setHover(null)
        return
      }
      ray.setFromCamera(ptr, camera)
      const hit = ray.intersectObjects(group.children, false)[0]
      const found = hit && meshesRef.current.find(m => m.mesh === hit.object)
      setHover(found && found.name ? { name: found.name, sets: 0 } : null)
    }
    const onUp = (e: PointerEvent) => {
      dragging = false
      try { el.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    }
    const onLeave = () => { dragging = false; setHover(null) }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', onLeave)

    // ── Loop ──
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!dragging) {
        if (Math.abs(velocity) > 0.0002) { targetY.current += velocity; velocity *= 0.94 }
        else if (!reduced) targetY.current += 0.0022      // slow idle turn
      }
      group.rotation.y += (targetY.current - group.rotation.y) * 0.12
      renderer.render(scene, camera)
    }
    tick()
    setReady(true)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onLeave)
      meshes.forEach(m => {
        m.mesh.geometry.dispose()
        ;(m.mesh.material as THREE.Material).dispose()
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
    }
  }, [])

  // ── Recolour when load changes (cheap: mutate materials, no scene rebuild) ──
  // react-hooks/immutability flags writes to objects reached through a ref, but
  // three.js materials are GPU handles: mutating them in place is the only way
  // to recolour, and rebuilding the scene instead would tear down the canvas.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    if (!ready) return
    for (const { mesh, name } of meshesRef.current) {
      if (!name) continue
      const mat = mesh.material as THREE.MeshStandardMaterial
      const lvl = band(load[name] || 0, max)
      mat.color.set(RAMP[lvl])
      mat.emissive.set(lvl >= 3 ? RAMP[lvl] : '#000000')
      mat.emissiveIntensity = lvl >= 3 ? 0.22 : 0
    }
  }, [load, max, ready])
  /* eslint-enable react-hooks/immutability */

  const legend = Object.entries(load).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 7)

  return (
    <div className="bm3">
      <div className="bm3-head">
        <h3 className="ft-card-title" style={{ marginBottom: 0 }}>{title}</h3>
        <div className="bm3-ctrl">
          <button className="ft-mini" onClick={() => { targetY.current -= Math.PI }} aria-label="Rotate left"><RotateCcw size={14} /></button>
          <button className="ft-mini" onClick={() => { targetY.current = 0 }} aria-label="Reset view"><Maximize2 size={13} /></button>
          <button className="ft-mini" onClick={() => { targetY.current += Math.PI }} aria-label="Rotate right"><RotateCw size={14} /></button>
        </div>
      </div>

      <div className="bm3-stage" ref={mount}>
        {hover && (
          <div className="bm3-tip">
            {hover.name} · <b>{load[hover.name] || 0}</b> sets
          </div>
        )}
      </div>

      <div className="bm3-scale">
        <span>less</span>
        {RAMP.map((c, i) => <span key={i} className="bm3-sw" style={{ background: c }} />)}
        <span>more</span>
      </div>

      {legend.length > 0 && (
        <div className="bm3-legend">
          {legend.map(([muscle, sets]) => (
            <div key={muscle} className="bm3-leg">
              <span className="bm3-dot" style={{ background: RAMP[band(sets, max)] }} />
              <span className="bm3-leg-name">{muscle}</span>
              <span className="bm3-leg-n">{sets}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
