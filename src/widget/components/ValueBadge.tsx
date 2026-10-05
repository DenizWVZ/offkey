import { motion, useReducedMotion } from 'motion/react'
import { size, spring } from '../tokens'
import styles from './ValueBadge.module.css'

type Props = {
  text: string // the value as shown, e.g. "+2", "−15", "0"
  changed: boolean // orange when away from 0
  resetLabel: string // for screen readers, e.g. "Reset Pitch"
  onReset: () => void
}

// Round badge showing the current value: gray at zero, orange otherwise.
// It widens into a pill for two digits. Clicking it resets to zero.
export function ValueBadge({ text, changed, resetLabel, onReset }: Props) {
  const reduceMotion = useReducedMotion()
  const digits = text.replace(/\D/g, '').length
  return (
    <motion.button
      type="button"
      className={`${styles.badge} ${changed ? styles.changed : ''}`}
      onClick={onReset}
      disabled={!changed}
      aria-label={`${resetLabel} (now ${text})`}
      initial={false}
      animate={{ width: digits > 1 ? size.badgeWide : size.badge }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', ...spring.pill }}
    >
      {text}
    </motion.button>
  )
}
