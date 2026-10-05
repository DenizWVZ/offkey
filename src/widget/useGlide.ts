import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import { motion as timing, spring } from './tokens'

// Follows `value` gradually when it's set from outside (reset, a new song), unless told the next
// value should show right away (changes made on the control itself).
// - 'steps': one whole step at a time (Pitch dots and badge, `motion.glideStepMs` per step).
// - 'spring': smoothly, with `spring.fill` (Speed and Vocals).
export function useGlide(value: number, style: 'steps' | 'spring') {
  const [shown, setShown] = useState(value)
  const shownRef = useRef(value)
  const skipTo = useRef<number | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const show = (v: number) => {
      shownRef.current = v
      setShown(v)
    }
    if (value === skipTo.current || reduceMotion) {
      skipTo.current = null
      show(value)
      return
    }
    skipTo.current = null
    if (style === 'spring') {
      const glide = animate(shownRef.current, value, { type: 'spring', ...spring.fill, onUpdate: show })
      return () => glide.stop()
    }
    const timer = setInterval(() => {
      const current = shownRef.current
      if (current === value) clearInterval(timer)
      else show(current + Math.sign(value - current))
    }, timing.glideStepMs)
    return () => clearInterval(timer)
  }, [value, reduceMotion, style])

  return {
    value: shown,
    skipGlideTo: (v: number) => (skipTo.current = v),
  }
}
