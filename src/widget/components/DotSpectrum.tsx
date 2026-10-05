import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion } from '../tokens'
import styles from './DotSpectrum.module.css'

const COLUMNS = 26
// Tallest a column can get. The spectrum keeps this height even when paused,
// so the single idle row sits at the bottom.
const MAX_LEVEL = 6

const restingLevels = () => new Array<number>(COLUMNS).fill(1)

type Props = {
  active: boolean // playing: columns follow the music; paused: they fall, then turn gray
  readLevels?: (columns: number) => number[] // live 0–1 per column, low to high
}

// Columns of orange dots, bottom-aligned, like a segmented spectrum analyzer.
// Columns jump up at once and fall one dot at a time.
export function DotSpectrum({ active, readLevels }: Props) {
  const [levels, setLevels] = useState(restingLevels)
  const [idle, setIdle] = useState(!active) // gray single row
  const levelsRef = useRef(levels)
  const lastChangeRef = useRef(new Array<number>(COLUMNS).fill(0)) // per column, when it last moved

  useEffect(() => {
    if (active) setIdle(false)
    let frame = 0
    let lastStep = 0

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (motion.spectrumStepMs && now - lastStep < motion.spectrumStepMs) return
      lastStep = now

      const live = active && readLevels ? readLevels(COLUMNS) : null
      const lastChange = lastChangeRef.current
      let changed = false

      const next = levelsRef.current.map((level, i) => {
        const target = live ? 1 + Math.round(live[i] * (MAX_LEVEL - 1)) : 1
        if (target >= level) {
          // Rise straight away, and hold while the sound stays at this level.
          lastChange[i] = now
          if (target !== level) changed = true
          return target
        }
        if (now - lastChange[i] < motion.spectrumFallMs) return level
        lastChange[i] = now
        changed = true
        return level - 1
      })

      if (changed) {
        levelsRef.current = next
        setLevels(next)
      }
      // Paused and fully settled: turn gray and stop until playback resumes.
      if (!active && next.every((level) => level === 1)) {
        setIdle(true)
        cancelAnimationFrame(frame)
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, readLevels])

  return (
    <div
      className={`${styles.spectrum} ${idle ? styles.idle : ''}`}
      style={{ '--max-level': MAX_LEVEL } as CSSProperties}
      aria-hidden
    >
      {levels.map((level, i) => (
        <div key={i} className={styles.column}>
          {Array.from({ length: level }, (_, j) => (
            <span key={j} className={styles.dot} />
          ))}
        </div>
      ))}
    </div>
  )
}
