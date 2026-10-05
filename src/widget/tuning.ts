import { useSyncExternalStore } from 'react'
import { effect, ease, motion } from './tokens'

// Live overrides for tuning the look by eye, set from the test panel (playground ?test and the
// extension's dev build). Nothing writes to it in the normal extension, so it stays empty there.
// - glowPreview: keeps the Vocals glow on, without waiting for vocals to load.
// - vars: CSS variables that replace the tokens' values, e.g. { '--effect-glow-strength': '0.6' }.

export type Tuning = {
  glowPreview: boolean
  vars: Record<string, string>
}

const empty: Tuning = { glowPreview: false, vars: {} }
let tuning = empty
const listeners = new Set<() => void>()

export function setTuning(change: Partial<Tuning>) {
  tuning = { ...tuning, ...change, vars: { ...tuning.vars, ...change.vars } }
  listeners.forEach((listener) => listener())
}

export function resetTuning() {
  tuning = empty
  listeners.forEach((listener) => listener())
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

export function useTuning(): Tuning {
  return useSyncExternalStore(subscribe, () => tuning)
}

// ---------------------------------------------------------------------------
// Cue dot animation values, adjustable per dot from the test panel to compare them side by side.
// A dot without overrides uses the tokens' values.

export type Curve = [number, number, number, number] // a cubic bézier: x1, y1, x2, y2

export type CueParams = {
  holdMs: number // hold to reset: total, the pop comes at the end
  graceMs: number // …of which a plain tap
  endScale: number // the colour's size just before the pop
  shrinkCurve: Curve
  haloFadeMs: number
  haloEnd: number // how faint the halo is when the colour has shrunk away
  popMs: number
  popCurve: Curve
  inMs: number // the grey dot settling in
  inScale: number
  inOpacity: number
  inCurve: Curve
  emptyFadeMs: number // the grey dot's colour change on hover
}

export const cueDefaults = (): CueParams => ({
  holdMs: motion.cueHoldMs,
  graceMs: motion.cueHoldGraceMs,
  endScale: motion.cueHoldEndScale,
  shrinkCurve: [...ease.cueHold],
  haloFadeMs: motion.cueHaloFadeMs,
  haloEnd: effect.cueHaloEnd,
  popMs: motion.cuePopMs,
  popCurve: [...ease.cuePop],
  inMs: motion.cueEmptyInMs,
  inScale: motion.cueEmptyInScale,
  inOpacity: motion.cueEmptyInOpacity,
  inCurve: [...ease.cueEmptyIn],
  emptyFadeMs: motion.cueEmptyFadeMs,
})

const DEFAULT_CUE_PARAMS = cueDefaults()
let cueTuning: CueParams[] | null = null // one per dot, or nothing (normal use)
const cueListeners = new Set<() => void>()

export function setCueTuning(values: CueParams[] | null) {
  cueTuning = values
  cueListeners.forEach((listener) => listener())
}

const subscribeCue = (onChange: () => void) => {
  cueListeners.add(onChange)
  return () => cueListeners.delete(onChange)
}

// The values for one cue dot (0-based).
export function useCueParams(slot: number): CueParams {
  const all = useSyncExternalStore(subscribeCue, () => cueTuning)
  return all?.[slot] ?? DEFAULT_CUE_PARAMS
}
