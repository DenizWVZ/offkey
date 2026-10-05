import { useEffect, useState } from 'react'
import { cueColors } from '../widget/tokens'
import { cueDefaults, setCueTuning, type CueParams, type Curve } from '../widget/tuning'
import styles from './TestPanel.module.css'

// "Cues" section of the test panel: tune the cue dots' hold-to-reset animation live, separately for
// each dot (pick 1–5), so different values can be compared side by side. Then copy the values for tokens.ts.

const fresh = () => [0, 1, 2, 3, 4].map(cueDefaults)

type Range = { label: string; key: keyof CueParams; min: number; max: number; step: number; show: (n: number) => string }
type CurveField = { label: string; key: 'shrinkCurve' | 'popCurve' | 'inCurve' }

const ms = (n: number) => `${n} ms`
const share = (n: number) => `${Math.round(n * 100)}%`

const GROUPS: { title: string; ranges: Range[]; curve?: CurveField }[] = [
  {
    title: 'Hold and shrink',
    ranges: [
      { label: 'Hold to reset', key: 'holdMs', min: 300, max: 1500, step: 25, show: ms },
      { label: 'Tap grace', key: 'graceMs', min: 0, max: 500, step: 25, show: ms },
      { label: 'Shrinks to', key: 'endScale', min: 0.1, max: 0.9, step: 0.05, show: share },
    ],
    curve: { label: 'Shrink curve', key: 'shrinkCurve' },
  },
  {
    title: 'Halo',
    ranges: [
      { label: 'Fade in', key: 'haloFadeMs', min: 0, max: 300, step: 10, show: ms },
      { label: 'Ends at', key: 'haloEnd', min: 0, max: 1, step: 0.05, show: share },
    ],
  },
  {
    title: 'Pop (colour disappears)',
    ranges: [{ label: 'Duration', key: 'popMs', min: 30, max: 400, step: 5, show: ms }],
    curve: { label: 'Pop curve', key: 'popCurve' },
  },
  {
    title: 'Grey dot comes in',
    ranges: [
      { label: 'Duration', key: 'inMs', min: 30, max: 500, step: 10, show: ms },
      { label: 'Starts at size', key: 'inScale', min: 0.3, max: 1, step: 0.01, show: share },
      { label: 'Starts at strength', key: 'inOpacity', min: 0, max: 1, step: 0.05, show: share },
      { label: 'Hover fade', key: 'emptyFadeMs', min: 0, max: 300, step: 10, show: ms },
    ],
    curve: { label: 'Settle curve', key: 'inCurve' },
  },
]

const num = (n: number) => String(Number(n.toFixed(3)))

const snippet = (v: CueParams) =>
  [
    `motion.cueHoldMs: ${v.holdMs}`,
    `motion.cueHoldGraceMs: ${v.graceMs}`,
    `motion.cueHoldEndScale: ${v.endScale}`,
    `ease.cueHold: [${v.shrinkCurve.map(num).join(', ')}]`,
    `motion.cueHaloFadeMs: ${v.haloFadeMs}`,
    `effect.cueHaloEnd: ${v.haloEnd}`,
    `motion.cuePopMs: ${v.popMs}`,
    `ease.cuePop: [${v.popCurve.map(num).join(', ')}]`,
    `motion.cueEmptyInMs: ${v.inMs}`,
    `motion.cueEmptyInScale: ${v.inScale}`,
    `motion.cueEmptyInOpacity: ${v.inOpacity}`,
    `ease.cueEmptyIn: [${v.inCurve.map(num).join(', ')}]`,
    `motion.cueEmptyFadeMs: ${v.emptyFadeMs}`,
  ].join('\n')

function CurveInputs({ label, value, onChange }: { label: string; value: Curve; onChange: (c: Curve) => void }) {
  return (
    <div className={styles.curve}>
      <span>{label}</span>
      <div>
        {value.map((n, i) => (
          <input
            key={i}
            type="number"
            step={0.05}
            min={i % 2 ? -1 : 0}
            max={i % 2 ? 2 : 1}
            value={n}
            aria-label={`${label} ${['x1', 'y1', 'x2', 'y2'][i]}`}
            onChange={(e) => onChange(value.map((c, j) => (j === i ? Number(e.target.value) : c)) as Curve)}
          />
        ))}
      </div>
    </div>
  )
}

export function CueControls() {
  const [values, setValues] = useState(fresh)
  const [slot, setSlot] = useState(0)
  const [copied, setCopied] = useState(false)

  // Switch the dots over to these values while the panel is open; back to the tokens' when it closes.
  useEffect(() => {
    setCueTuning(values)
  }, [values])
  useEffect(() => () => setCueTuning(null), [])

  const v = values[slot]
  const change = (next: Partial<CueParams>) => setValues((all) => all.map((p, i) => (i === slot ? { ...p, ...next } : p)))

  const copy = async () => {
    await navigator.clipboard.writeText(snippet(v))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className={styles.glow}>
      <h2>Cue dots</h2>
      <div className={styles.chips}>
        <span>Editing dot</span>
        <div>
          {values.map((_, i) => (
            <button key={i} className={i === slot ? styles.on : ''} style={{ '--chip': cueColors[i] } as React.CSSProperties} onClick={() => setSlot(i)}>
              {i + 1}
            </button>
          ))}
        </div>
      </div>
      {GROUPS.map(({ title, ranges, curve }) => (
        <div key={title} className={styles.group}>
          <h3>{title}</h3>
          {ranges.map(({ label, key, min, max, step, show }) => (
            <label key={key} className={styles.range}>
              <span>{label}</span>
              <input type="range" min={min} max={max} step={step} value={v[key] as number} onChange={(e) => change({ [key]: Number(e.target.value) })} />
              <output>{show(v[key] as number)}</output>
            </label>
          ))}
          {curve && <CurveInputs label={curve.label} value={v[curve.key]} onChange={(c) => change({ [curve.key]: c })} />}
        </div>
      ))}
      <div className={styles.actions}>
        <button onClick={() => setValues((all) => all.map(() => ({ ...v, shrinkCurve: [...v.shrinkCurve], popCurve: [...v.popCurve], inCurve: [...v.inCurve] })))}>Copy to all dots</button>
        <button onClick={copy}>{copied ? 'Copied' : 'Copy values'}</button>
      </div>
      <div className={styles.actions}>
        <button onClick={() => change(cueDefaults())}>Reset dot {slot + 1}</button>
        <button onClick={() => setValues(fresh())}>Reset all</button>
      </div>
    </section>
  )
}
