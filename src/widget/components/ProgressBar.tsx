import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { Cues } from '../../audio/player'
import { cueColors, size, space, motion as timing, spring } from '../tokens'
import { formatTime } from './Transport'
import styles from './ProgressBar.module.css'

// How far the ← and → keys jump.
const KEY_STEP_SECONDS = 5

type Props = {
  progress: number // 0–1 through the track
  duration: number // seconds; 0 when unknown (the bar can't be used then)
  onSeek: (fraction: number) => void // 0–1 through the track
  onPreview?: (fraction: number | null) => void // while dragging: where the pointer is (null when done)
  disabled?: boolean // e.g. during an ad
  cues?: Cues // shown as coloured markers on the bar
  onCue?: (slot: number) => void // a marker was clicked
}

const clamp = (n: number) => Math.min(1, Math.max(0, n))

// Thin bar: the played part is dark, the rest light. Hovering shows a handle at the playhead.
// Press to jump, drag to scrub (the song jumps when you let go), ← → for 5 s.
export function ProgressBar({ progress, duration, onSeek, onPreview, disabled = false, cues, onCue }: Props) {
  const [dragFraction, setDragFraction] = useState<number | null>(null)
  const [hovered, setHovered] = useState(false)
  const [focusVisible, setFocusVisible] = useState(false)
  const reduceMotion = useReducedMotion()

  const usable = !disabled && duration > 0
  // Still shows progress while disabled (e.g. how far into an ad), just dimmed and not grabbable.
  const shown = dragFraction ?? (duration > 0 ? progress : 0)
  const showHandle = usable && (hovered || focusVisible || dragFraction !== null)

  const drag = (fraction: number | null) => {
    setDragFraction(fraction)
    onPreview?.(fraction)
  }

  const fractionAt = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return clamp((e.clientX - rect.left) / rect.width)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!usable || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId) // keep dragging even outside the panel
    drag(fractionAt(e))
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragFraction !== null) drag(fractionAt(e))
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragFraction === null) return
    onSeek(fractionAt(e))
    drag(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!usable) return
    const step = KEY_STEP_SECONDS / duration
    if (e.key === 'ArrowRight') onSeek(clamp(progress + step))
    else if (e.key === 'ArrowLeft') onSeek(clamp(progress - step))
    else return
    e.preventDefault()
  }

  return (
    <div
      className={`${styles.bar} ${usable ? '' : styles.unusable} ${disabled ? styles.dimmed : ''}`}
      role="slider"
      tabIndex={usable ? 0 : -1}
      aria-label="Seek"
      aria-disabled={!usable}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown * duration)}
      onPointerEnter={(e) => e.pointerType !== 'touch' && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => drag(null)}
      onKeyDown={onKeyDown}
      onFocus={(e) => setFocusVisible(e.currentTarget.matches(':focus-visible'))}
      onBlur={() => setFocusVisible(false)}
    >
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${shown * 100}%` }} />
      </div>
      {usable && cues && onCue && <CueMarkers cues={cues} duration={duration} onCue={onCue} />}
      <motion.span
        className={styles.handle}
        style={{ left: `${shown * 100}%` }}
        initial={false}
        animate={{ opacity: showHandle ? 1 : 0, scale: showHandle ? 1 : timing.handleHiddenScale }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', ...spring.handle }}
      />
    </div>
  )
}

// One marker per set cue: a coloured dot with a ring in the panel's colour, so it stands out from
// the bar. Click one to jump there; hover shows its time. The newest cue is drawn on top, and
// markers at (nearly) the same spot are nudged apart so the ones underneath still show.
function CueMarkers({ cues, duration, onCue }: { cues: Cues; duration: number; onCue: (slot: number) => void }) {
  // The bar's width, only to tell which markers overlap. Kept current: on a web page the widget's
  // styles arrive a moment after it appears, and the bar is much wider until then.
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const layer = ref.current
    if (!layer) return
    const observer = new ResizeObserver(() => setWidth(layer.offsetWidth))
    observer.observe(layer)
    return () => observer.disconnect()
  }, [])
  const order = useDrawOrder(cues)

  // Placed in % of the bar, like the fill and handle; overlapping ones get nudged a few px.
  const placed: { slot: number; percent: number; x: number; nudge: number }[] = []
  for (const slot of order) {
    const cue = cues[slot]
    if (cue === null) continue
    const percent = (cue / duration) * 100
    const x = (percent / 100) * width
    const under = placed.filter((p) => Math.abs(p.x - x) < size.cueMarker).length
    placed.push({ slot, percent, x, nudge: under * space.cueMarkerStack })
  }

  return (
    <div ref={ref} className={styles.markers}>
      {placed.map(({ slot, percent, nudge }) => (
        <span
          key={slot}
          className={styles.marker}
          style={{ left: `calc(${percent}% + ${nudge}px)`, '--cue': cueColors[slot] } as CSSProperties}
          aria-label={`Jump to cue ${slot + 1}`}
          role="button"
          onPointerDown={(e) => e.stopPropagation()} // a click here jumps; it doesn't start scrubbing
          onClick={() => onCue(slot)}
        >
          <span className={styles.markerDot} />
          <span className={styles.markerTime}>{formatTime(cues[slot] ?? 0)}</span>
        </span>
      ))}
    </div>
  )
}

// Cue slots in the order they were set (oldest first), so the newest draws on top.
function useDrawOrder(cues: Cues) {
  const state = useRef<{ order: number[]; last: Cues }>({ order: cues.map((_, slot) => slot), last: cues })
  const { order, last } = state.current
  if (last !== cues) {
    const changed = order.filter((slot) => cues[slot] !== null && cues[slot] !== last[slot])
    state.current = { order: [...order.filter((slot) => !changed.includes(slot)), ...changed], last: cues }
  }
  return state.current.order
}
