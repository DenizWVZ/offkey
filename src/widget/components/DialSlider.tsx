import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Slider } from 'dialkit'
import { motion as timing, space } from '../tokens'
import { useGlide } from '../useGlide'
import styles from './DialSlider.module.css'

type Props = {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  defaultValue: number // clicking the number goes back to this
  disabled?: boolean // shown dimmed with "–", can't be changed
  ticks?: boolean // tick marks at every tenth, shown on hover (DialKit's own)
  busy?: boolean // working on it: a glow around the edge, and the label, handle and number dim
}

// DialKit's slider (label on the fill, number on the right, handle at the fill's edge, a spring
// on click, tick marks on hover, a little stretch when dragged past the ends), styled with our
// tokens in DialSlider.module.css. Added here, because DialKit doesn't have them:
// - the handle always shows, and fades while it passes the label or number (DialKit's own rule);
// - clicking the number resets (DialKit's type-a-value box is turned off);
// - values set from outside (reset, a new song) glide there instead of jumping;
// - disabled, and busy with a "thinking" glow (the slider still works while it shows).
export function DialSlider({ label, value, onChange, min, max, defaultValue, ticks = true, disabled = false, busy = false }: Props) {
  const shown = useGlide(value, 'spring')
  const rootRef = useRef<HTMLDivElement>(null)
  const dodge = useHandleDodge(rootRef, (shown.value - min) / (max - min))
  const glowing = useSteadyFlag(busy && !disabled)
  const reduceMotion = useReducedMotion()

  const change = (next: number) => {
    const rounded = Math.round(next)
    if (rounded === value) return
    shown.skipGlideTo(rounded)
    onChange(rounded)
  }

  // Enter would open DialKit's type-a-value box; we don't use it.
  const onKeyDownCapture = (e: KeyboardEvent) => {
    if (e.key === 'Enter') e.stopPropagation()
  }

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${dodge ? styles.dodge : ''} ${glowing ? styles.busy : ''} ${disabled ? styles.disabled : ''} ${ticks ? '' : styles.noTicks}`}
      inert={disabled}
      onKeyDownCapture={onKeyDownCapture}
    >
      <Slider label={label} value={shown.value} onChange={change} min={min} max={max} step={1} />
      <button
        type="button"
        className={styles.value}
        onClick={() => onChange(defaultValue)}
        disabled={disabled || value === defaultValue}
        aria-label={`Reset ${label} (now ${disabled ? 'unavailable' : value})`}
      >
        {disabled ? '–' : Math.round(shown.value)}
      </button>
      <AnimatePresence>
        {glowing && (
          <motion.div
            className={styles.glow}
            role="status"
            aria-label={`${label} working`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : timing.glowFadeMs / 1000 }}
          >
            <div className={styles.glowLight}>
              <div className={styles.glowBase} />
              <div className={`${styles.glowPool} ${styles.glowPoolA}`} />
              <div className={`${styles.glowPool} ${styles.glowPoolB}`} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// DialKit's rule for when the handle is over the label or the number: it then fades and shortens.
function useHandleDodge(rootRef: RefObject<HTMLDivElement | null>, fraction: number) {
  const [dodge, setDodge] = useState(false)
  useLayoutEffect(() => {
    const root = rootRef.current
    const label = root?.querySelector<HTMLElement>('.dialkit-slider-label')
    const number = root?.querySelector<HTMLElement>(`.${styles.value}`)
    if (!root || !label || !number) return
    const width = root.offsetWidth
    const left = (space.sliderLabelLeft + label.offsetWidth + space.handleDodgeBuffer) / width
    const right = (width - space.sliderValueRight - number.offsetWidth - space.handleDodgeBuffer) / width
    setDodge(fraction < left || fraction > right)
  }, [rootRef, fraction])
  return dodge
}

// Turns on only once `on` has lasted a moment, and once on stays on for a minimum time,
// so quick flips don't make the glow flash.
function useSteadyFlag(on: boolean) {
  const [steady, setSteady] = useState(false)
  const shownAt = useRef(0)
  useEffect(() => {
    if (on === steady) return
    const wait = on ? timing.glowShowDelayMs : Math.max(0, shownAt.current + timing.glowMinShowMs - performance.now())
    const timer = setTimeout(() => {
      if (on) shownAt.current = performance.now()
      setSteady(on)
    }, wait)
    return () => clearTimeout(timer)
  }, [on, steady])
  return steady
}
