import { motion, useReducedMotion } from 'motion/react'
import { motion as timing, spring } from '../tokens'
import { PlayPauseButton } from './PlayPauseButton'
import styles from './Transport.module.css'

type Props = {
  time: number // seconds into the song (or where the player bar is being dragged)
  duration: number // seconds; 0 when unknown
  isPlaying: boolean
  onTogglePlay: () => void
  onPrevious: () => void
  onNext?: () => void // no next song: the button is dimmed
}

// "1:08", or "1:02:08" past an hour.
export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// Time so far, previous / play-pause / next, and the time left.
export function Transport({ time, duration, isPlaying, onTogglePlay, onPrevious, onNext }: Props) {
  const known = Number.isFinite(duration) && duration > 0
  const elapsed = known ? formatTime(time) : '–:––'
  const left = known ? `-${formatTime(duration - Math.floor(time))}` : '–:––'

  return (
    <div className={styles.row}>
      <span className={styles.time}>{elapsed}</span>
      <div className={styles.buttons}>
        <TransportButton label="Previous" flip onClick={onPrevious} />
        <PlayPauseButton isPlaying={isPlaying} onToggle={onTogglePlay} />
        <TransportButton label="Next" onClick={onNext} />
      </div>
      <span className={`${styles.time} ${styles.right}`}>{left}</span>
    </div>
  )
}

function TransportButton({ label, flip = false, onClick }: { label: string; flip?: boolean; onClick?: () => void }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.button
      type="button"
      className={styles.button}
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      whileTap={reduceMotion || !onClick ? undefined : { scale: timing.buttonPressScale }}
      transition={{ type: 'spring', ...spring.press }}
    >
      <svg viewBox="0 0 31.1111 31.1111" style={flip ? { transform: 'scaleX(-1)' } : undefined} aria-hidden>
        {/* Rounded triangle, from Figma (previous is the same, mirrored) */}
        <path d="M20.8483 14.6707C21.51 15.075 21.51 16.0361 20.8483 16.4404L13.5037 20.9288C12.8127 21.3511 11.9259 20.8538 11.9259 20.0439L11.9259 11.0672C11.9259 10.2573 12.8127 9.76002 13.5037 10.1823L20.8483 14.6707Z" />
      </svg>
    </motion.button>
  )
}
