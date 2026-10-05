import { useState } from 'react'
import { color, effect, motion, size } from '../widget/tokens'
import { resetTuning, setTuning, useTuning } from '../widget/tuning'
import styles from './TestPanel.module.css'

// "Glow" section of the test panel: tune the Vocals glow live, then copy the values for tokens.ts.

type Values = {
  strength: number
  breathMin: number
  breathMs: number
  driftMs: number
  poolAMs: number
  poolBMs: number
  reachX: number
  reachY: number
  hues: string[] // the drifting colours; the first is repeated at the end so it loops
  poolA: string
  poolB: string
}

const fromTokens = (): Values => ({
  strength: effect.glowStrength,
  breathMin: effect.glowBreathMin,
  breathMs: motion.glowBreathMs,
  driftMs: motion.glowDriftMs,
  poolAMs: motion.glowPoolAMs,
  poolBMs: motion.glowPoolBMs,
  reachX: size.glowReachX,
  reachY: size.glowReachY,
  hues: color.glowBase.split(',').map((c) => c.trim()).slice(0, -1),
  poolA: color.glowPoolA,
  poolB: color.glowPoolB,
})

const baseStops = (hues: string[]) => [...hues, hues[0]].join(', ')

// The CSS variables the glow reads (the same names tokens.ts creates).
const toVars = (v: Values): Record<string, string> => ({
  '--effect-glow-strength': String(v.strength),
  '--effect-glow-breath-min': String(v.breathMin),
  '--motion-glow-breath-ms': `${v.breathMs}ms`,
  '--motion-glow-drift-ms': `${v.driftMs}ms`,
  '--motion-glow-pool-a-ms': `${v.poolAMs}ms`,
  '--motion-glow-pool-b-ms': `${v.poolBMs}ms`,
  '--size-glow-reach-x': `${v.reachX}px`,
  '--size-glow-reach-y': `${v.reachY}px`,
  '--color-glow-base': baseStops(v.hues),
  '--color-glow-pool-a': v.poolA,
  '--color-glow-pool-b': v.poolB,
})

const snippet = (v: Values) =>
  [
    `color.glowBase: '${baseStops(v.hues).toUpperCase()}'`,
    `color.glowPoolA: '${v.poolA.toUpperCase()}'`,
    `color.glowPoolB: '${v.poolB.toUpperCase()}'`,
    `size.glowReachX: ${v.reachX}`,
    `size.glowReachY: ${v.reachY}`,
    `effect.glowStrength: ${v.strength}`,
    `effect.glowBreathMin: ${v.breathMin}`,
    `motion.glowBreathMs: ${v.breathMs}`,
    `motion.glowDriftMs: ${v.driftMs}`,
    `motion.glowPoolAMs: ${v.poolAMs}`,
    `motion.glowPoolBMs: ${v.poolBMs}`,
  ].join('\n')

type Range = { label: string; key: keyof Values; min: number; max: number; step: number; show: (n: number) => string }

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
const RANGES: Range[] = [
  { label: 'Strength', key: 'strength', min: 0, max: 1, step: 0.05, show: (n) => n.toFixed(2) },
  { label: 'Breath dip', key: 'breathMin', min: 0, max: 1, step: 0.05, show: (n) => n.toFixed(2) },
  { label: 'Breath', key: 'breathMs', min: 1000, max: 6000, step: 100, show: seconds },
  { label: 'Colour drift', key: 'driftMs', min: 4000, max: 30000, step: 500, show: seconds },
  { label: 'Pool A speed', key: 'poolAMs', min: 3000, max: 20000, step: 500, show: seconds },
  { label: 'Pool B speed', key: 'poolBMs', min: 3000, max: 20000, step: 500, show: seconds },
  { label: 'Reach, ends', key: 'reachX', min: 8, max: 80, step: 1, show: (n) => `${n} px` },
  { label: 'Reach, top/bottom', key: 'reachY', min: 6, max: 23, step: 1, show: (n) => `${n} px` },
]

export function GlowControls() {
  const { glowPreview } = useTuning()
  const [values, setValues] = useState(fromTokens)
  const [copied, setCopied] = useState(false)

  const change = (next: Partial<Values>) => {
    const updated = { ...values, ...next }
    setValues(updated)
    setTuning({ vars: toVars(updated) })
  }

  const reset = () => {
    setValues(fromTokens())
    resetTuning()
    setTuning({ glowPreview })
  }

  const copy = async () => {
    await navigator.clipboard.writeText(snippet(values))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className={styles.glow}>
      <h2>Glow</h2>
      <div className={styles.switch}>
        <span>Show</span>
        <div>
          <button className={!glowPreview ? styles.on : ''} onClick={() => setTuning({ glowPreview: false })}>While loading</button>
          <button className={glowPreview ? styles.on : ''} onClick={() => setTuning({ glowPreview: true })}>Always on</button>
        </div>
      </div>
      {RANGES.map(({ label, key, min, max, step, show }) => (
        <label key={key} className={styles.range}>
          <span>{label}</span>
          <input type="range" min={min} max={max} step={step} value={values[key] as number} onChange={(e) => change({ [key]: Number(e.target.value) })} />
          <output>{show(values[key] as number)}</output>
        </label>
      ))}
      <div className={styles.colours}>
        <span>Drifting hues</span>
        <div>
          {values.hues.map((hue, i) => (
            <input key={i} type="color" value={hue} aria-label={`Hue ${i + 1}`} onChange={(e) => change({ hues: values.hues.map((h, j) => (j === i ? e.target.value : h)) })} />
          ))}
        </div>
      </div>
      <div className={styles.colours}>
        <span>Pools A · B</span>
        <div>
          <input type="color" value={values.poolA} aria-label="Pool A" onChange={(e) => change({ poolA: e.target.value })} />
          <input type="color" value={values.poolB} aria-label="Pool B" onChange={(e) => change({ poolB: e.target.value })} />
        </div>
      </div>
      <div className={styles.actions}>
        <button onClick={copy}>{copied ? 'Copied' : 'Copy values'}</button>
        <button onClick={reset}>Reset</button>
      </div>
    </section>
  )
}
