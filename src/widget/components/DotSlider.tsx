import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { motion as timing, size, spring } from '../tokens'
import styles from './DotSlider.module.css'

type Props = {
  label: string // what it controls, for screen readers
  value: number // whole steps away from center, e.g. -2, 0, +4
  valueText: string // the value as shown in the badge, for screen readers
  onChange: (step: number) => void
  range?: number // steps on each side of center
}

// A row of dots with a darker center dot. Dots between the center and the
// current value turn orange.
// - Hover (or keyboard focus): the dots become pills, spreading out from the center.
// - Press anywhere: jumps to the nearest step, which grows tall. Drag to change it live.
// - Release: back to pills while still hovered, dots once the pointer leaves.
// - ← → when focused: the new step grows tall for a moment.
export function DotSlider({ label, value, valueText, onChange, range = 7 }: Props) {
  const dots = Array.from({ length: range * 2 + 1 }, (_, i) => i - range) // -range … +range
  const clampStep = (step: number) => Math.max(-range, Math.min(range, step))

  const [hovered, setHovered] = useState(false)
  const [focusVisible, setFocusVisible] = useState(false) // focused by keyboard, not by a click
  const [dragStep, setDragStep] = useState<number | null>(null) // step under the pointer while pressed
  const [nudged, setNudged] = useState(false) // an arrow key was just pressed
  const [rippling, setRippling] = useState(false) // pills are spreading out after the pointer entered
  const nudgeTimer = useRef(0)
  const rippleTimer = useRef(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => () => { clearTimeout(nudgeTimer.current); clearTimeout(rippleTimer.current) }, [])

  // While dragging, show the step under the pointer right away, without waiting for the player.
  const shown = dragStep ?? value
  const expanded = hovered || focusVisible || dragStep !== null
  const tallStep = dragStep ?? (nudged ? value : null)

  const isActive = (step: number) =>
    step !== 0 && (shown > 0 ? step > 0 && step <= shown : step < 0 && step >= shown)

  const heightOf = (step: number) => (!expanded ? size.dot : step === tallStep ? size.pillTall : size.pill)

  const startRipple = () => {
    setRippling(true)
    clearTimeout(rippleTimer.current)
    rippleTimer.current = window.setTimeout(() => setRippling(false), range * timing.pillRippleMs + timing.pillRippleSettleMs)
  }

  // The dot nearest to where the pointer is.
  const stepAt = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = (e.clientX - rect.left) / rect.width
    return clampStep(Math.round(fraction * range * 2) - range)
  }

  const moveTo = (step: number) => {
    setDragStep(step)
    if (step !== value) onChange(step)
  }

  const onPointerEnter = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return // no hover on touch screens
    setHovered(true)
    if (dragStep === null) startRipple()
  }

  const onPointerLeave = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') setHovered(false)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId) // keep dragging if the pointer leaves the row
    setRippling(false)
    moveTo(stepAt(e))
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragStep === null) return
    const step = stepAt(e)
    if (step !== dragStep) moveTo(step)
  }

  const onPointerUp = () => setDragStep(null)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    setFocusVisible(true)
    const step = clampStep(value + delta)
    if (step !== value) onChange(step)
    setNudged(true)
    clearTimeout(nudgeTimer.current)
    nudgeTimer.current = window.setTimeout(() => setNudged(false), timing.keyNudgeMs)
  }

  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.matches(':focus-visible')) return
    setFocusVisible(true)
    startRipple()
  }

  const onBlur = () => {
    setFocusVisible(false)
    setNudged(false)
  }

  return (
    <div
      className={styles.slider}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={-range}
      aria-valuemax={range}
      aria-valuenow={value}
      aria-valuetext={valueText}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {dots.map((step) => (
        <motion.span
          key={step}
          className={`${styles.dot} ${step === 0 ? styles.center : ''} ${isActive(step) ? styles.active : ''}`}
          initial={false}
          animate={{ height: heightOf(step) }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: 'spring', ...spring.pill, delay: rippling && expanded ? (Math.abs(step) * timing.pillRippleMs) / 1000 : 0 }
          }
        />
      ))}
    </div>
  )
}
