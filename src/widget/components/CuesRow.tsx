import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useAnimate, useReducedMotion } from 'motion/react'
import type { Cues } from '../../audio/player'
import { cueColors, effect, motion as timing, spring } from '../tokens'
import { useCueParams } from '../tuning'
import { formatTime } from './Transport'
import styles from './CuesRow.module.css'

// A key press on a cue (see useCueKeys): `hit` is false when that cue isn't set. `id` makes each
// press new, so pressing the same key twice plays the feedback twice.
export type CueTrigger = { slot: number; hit: boolean; id: number }

type Props = {
  cues: Cues
  open: boolean
  onOpenChange: (open: boolean) => void
  onSet: (slot: number) => void // at the current position
  onPlay: (slot: number) => void // click on a set cue: same as its key
  onClear: (slot: number) => void // hold on a set cue
  trigger: CueTrigger | null
  disabled?: boolean // e.g. during an ad: dimmed like the other rows (the row keeps its colour) and can't be used
}

// Cues: a row like the others with a caret instead of a value; opens to show five cue dots.
// Click an empty dot to set a cue where the song is now, click a set one to play it, hold a set one to clear it.
// Collapsed, the set cues show as small dots next to the caret.
export function CuesRow({ cues, open, onOpenChange, onSet, onPlay, onClear, trigger, disabled = false }: Props) {
  const reduceMotion = useReducedMotion()
  const set = cues.flatMap((cue, slot) => (cue === null ? [] : [slot]))

  return (
    <div className={`${styles.panel} ${disabled ? styles.disabled : ''}`} inert={disabled}>
      <button type="button" className={styles.header} aria-expanded={open} onClick={() => onOpenChange(!open)}>
        <span className={styles.label}>Cues</span>
        <span className={`${styles.mini} ${open ? styles.miniHidden : ''}`} aria-hidden>
          {set.map((slot) => (
            <span key={slot} className={styles.miniDot} style={{ background: cueColors[slot] }} />
          ))}
        </span>
        <svg className={`${styles.caret} ${open ? styles.caretOpen : ''}`} viewBox="0 0 10 6" aria-hidden>
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>
      <motion.div
        className={styles.body}
        initial={false}
        animate={{ height: open ? 'auto' : 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', ...spring.accordion }}
        inert={!open}
      >
        <div className={styles.dots}>
          {cues.map((cue, slot) => (
            <CueDot key={slot} slot={slot} cue={cue} onSet={onSet} onPlay={onPlay} onClear={onClear} trigger={trigger?.slot === slot ? trigger : null} />
          ))}
        </div>
      </motion.div>
    </div>
  )
}

type DotProps = {
  slot: number
  cue: number | null
  onSet: (slot: number) => void
  onClear: (slot: number) => void
  onPlay: (slot: number) => void
  trigger: CueTrigger | null
}

type Timer = ReturnType<typeof setTimeout>

function CueDot({ slot, cue, onSet, onClear, onPlay, trigger }: DotProps) {
  const [scope, animate] = useAnimate()
  const reduceMotion = useReducedMotion()
  const p = useCueParams(slot) // the animation values (the tokens', unless the test panel changed them for this dot)
  const lastSet = useRef(0)
  const graceTimer = useRef<Timer | undefined>(undefined)
  const holdTimer = useRef<Timer | undefined>(undefined)
  const shrinking = useRef(false) // the halo and shrinking have started
  const completed = useRef(false) // the shrinking started or finished: the click that follows the release is ignored
  const popId = useRef(0) // which pop is current: a new cue set during a pop ends it
  const [clearing, setClearing] = useState(false) // the pop is playing: the dot still draws its colour although the cue is gone
  const [generation, setGeneration] = useState(0) // new halo and fill elements after a pop was cut short (they'd still be shrunk)
  const isSet = cue !== null
  const shown = isSet || clearing

  const part = (name: string) => scope.current?.querySelector(`[data-${name}]`) as HTMLElement | null

  // Lighter for a moment, then back: when set, and when played with its key.
  const flash = () => {
    const overlay = part('flash')
    if (overlay) void animate(overlay, { opacity: [effect.cueFlashWhite, 0] }, { duration: timing.cueFlashMs / 1000, ease: 'easeOut' })
  }
  // A small, quick shake: its key was pressed but it isn't set.
  const shake = () => {
    if (reduceMotion || !scope.current) return
    const d = timing.cueShakePx
    void animate(scope.current, { x: [0, -d, d, -d / 2, 0] }, { duration: timing.cueShakeMs / 1000, ease: 'easeInOut' })
  }

  useEffect(() => {
    if (!trigger) return
    if (trigger.hit) flash()
    else shake()
    // Only when a new key press arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger?.id])

  const stopTimers = () => {
    clearTimeout(graceTimer.current)
    clearTimeout(holdTimer.current)
  }

  // Hold to reset, part 1 (after a plain tap's worth of time): the halo shows the dot's full size
  // while the colour (and its number) shrinks inside it, easing out so it slows toward the end.
  const startShrinking = () => {
    const fill = part('fill')
    const halo = part('halo')
    const number = part('number')
    if (!fill || !halo) return
    shrinking.current = true
    const seconds = (p.holdMs - p.graceMs) / 1000
    void animate(halo, { opacity: [0, 1, p.haloEnd] }, { duration: seconds, times: [0, Math.min(p.haloFadeMs / 1000 / seconds, 0.5), 1], ease: ['easeOut', 'linear'] })
    void animate(fill, reduceMotion ? { opacity: 0 } : { scale: p.endScale }, { duration: seconds, ease: p.shrinkCurve })
    if (number && !reduceMotion) void animate(number, { opacity: [1, 1, 0] }, { duration: seconds, times: [0, 0.6, 1], ease: 'linear' })
  }

  // Let go (or slide off) before it's done: the dot grows back.
  const cancelHold = () => {
    stopTimers()
    if (!shrinking.current) return
    shrinking.current = false
    completed.current = true // the shrinking had started: this wasn't a tap, so the click that follows the release doesn't play the cue
    const fill = part('fill')
    const halo = part('halo')
    const number = part('number')
    if (fill) void animate(fill, reduceMotion ? { opacity: 1 } : { scale: 1 }, reduceMotion ? { duration: 0 } : { type: 'spring', ...spring.cueRelease })
    if (halo) void animate(halo, { opacity: 0 }, { duration: p.haloFadeMs / 1000 })
    if (number) void animate(number, { opacity: 1 }, { duration: p.haloFadeMs / 1000 })
  }

  // Hold to reset, part 2: the pop. The cue is cleared right away; the dot keeps its look until the pop ends.
  const clearWithPop = async () => {
    stopTimers()
    shrinking.current = false
    completed.current = true
    setClearing(true)
    onClear(slot)
    const fill = part('fill')
    const halo = part('halo')
    const duration = reduceMotion ? 0 : p.popMs / 1000
    const pop = ++popId.current
    await Promise.all([
      fill ? animate(fill, reduceMotion ? { opacity: 0 } : { scale: 0 }, { duration, ease: p.popCurve }) : undefined,
      halo ? animate(halo, { opacity: 0 }, { duration }) : undefined,
    ])
    if (popId.current !== pop) return // a cue was set again meanwhile
    // Only now the grey dot comes in (never under the colour): a little smaller and fainter, settling to full.
    setClearing(false)
    if (!reduceMotion && scope.current) {
      void animate(scope.current, { scale: [p.inScale, 1], opacity: [p.inOpacity, 1] }, { duration: p.inMs / 1000, ease: p.inCurve })
    }
  }

  // The cue went away some other way (new song): nothing left to hold.
  useEffect(() => {
    if (!isSet) {
      stopTimers()
      shrinking.current = false
    }
  }, [isSet])
  useEffect(() => stopTimers, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    completed.current = false
    if (!isSet) return
    graceTimer.current = setTimeout(startShrinking, p.graceMs)
    holdTimer.current = setTimeout(() => void clearWithPop(), p.holdMs)
  }

  const onLeave = () => {
    cancelHold()
    completed.current = false // sliding off: no click follows
  }

  const onClick = () => {
    if (completed.current) {
      completed.current = false
      return
    }
    const now = performance.now()
    // A quick second click (a double click) after setting would jump to where you just were; ignore it.
    if (isSet) {
      if (now - lastSet.current >= timing.cueDoubleClickMs) onPlay(slot)
      return
    }
    lastSet.current = now
    if (clearing) {
      // Tapped again while the pop was still playing: cut it short, so the new cue shows at once.
      popId.current++
      setClearing(false)
      setGeneration((g) => g + 1)
    }
    onSet(slot)
    flash()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isSet || (e.key !== 'Delete' && e.key !== 'Backspace')) return
    e.preventDefault()
    e.stopPropagation()
    void clearWithPop()
  }

  return (
    <button
      ref={scope}
      type="button"
      className={`${styles.dot} ${shown ? styles.set : ''}`}
      style={{ '--cue': cueColors[slot], '--motion-cue-empty-fade-ms': `${p.emptyFadeMs}ms` } as CSSProperties}
      aria-label={isSet ? `Play cue ${slot + 1} at ${formatTime(cue)}. Hold or press Delete to clear it` : `Set cue ${slot + 1} here`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={cancelHold}
      onPointerLeave={onLeave}
      onPointerCancel={onLeave}
      onKeyDown={onKeyDown}
    >
      {shown && <span key={`halo${generation}`} className={styles.halo} data-halo />}
      {shown && (
        <span key={`fill${generation}`} className={styles.fill} data-fill>
          <span className={styles.number} data-number>
            {slot + 1}
          </span>
        </span>
      )}
      <span className={styles.flash} data-flash />
    </button>
  )
}
