import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { motion as timing, spring } from '../tokens'
import styles from './PlayPauseButton.module.css'

type Props = {
  isPlaying: boolean
  onToggle?: () => void
}

// Orange round button in the middle of the player controls. Shows pause while playing,
// play while paused; the icons cross-fade with a small scale when they swap.
export function PlayPauseButton({ isPlaying, onToggle }: Props) {
  const reduceMotion = useReducedMotion()
  const swap = reduceMotion ? { duration: 0 } : { duration: timing.iconSwapMs / 1000, ease: 'easeOut' as const }

  return (
    <motion.button
      type="button"
      className={styles.button}
      onClick={onToggle}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      whileTap={reduceMotion ? undefined : { scale: timing.buttonPressScale }}
      transition={{ type: 'spring', ...spring.press }}
    >
      <svg className={styles.icon} viewBox="0 0 40 40" aria-hidden>
        <AnimatePresence initial={false}>
          <motion.path
            key={isPlaying ? 'pause' : 'play'}
            style={{ transformOrigin: '20px 20px', transformBox: 'view-box' }}
            initial={{ opacity: 0, scale: timing.iconSwapScale }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: timing.iconSwapScale }}
            transition={swap}
            d={isPlaying ? PAUSE : PLAY}
          />
        </AnimatePresence>
      </svg>
    </motion.button>
  )
}

// Pause icon, from Figma.
const PAUSE =
  'M15.1104 12C16.5831 12 17.7773 13.1942 17.7773 14.667V25.334C17.7772 26.8066 16.583 28 15.1104 28C13.6379 27.9997 12.4445 26.8065 12.4443 25.334V14.667C12.4443 13.1944 13.6378 12.0003 15.1104 12ZM24.8887 12C26.3615 12 27.5557 13.1942 27.5557 14.667V25.334C27.5555 26.8066 26.3614 28 24.8887 28C23.416 28 22.2219 26.8066 22.2217 25.334V14.667C22.2217 13.1942 23.4159 12 24.8887 12Z'

// Play icon: the Figma next-button triangle, scaled to the pause icon's height and centered.
const PLAY =
  'M27.62 18.73C28.57 19.31 28.57 20.69 27.62 21.27L17.05 27.73C16.05 28.34 14.78 27.62 14.78 26.46V13.54C14.78 12.38 16.05 11.66 17.05 12.27L27.62 18.73Z'
