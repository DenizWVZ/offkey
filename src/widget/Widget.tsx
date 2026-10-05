import { useState, type CSSProperties, type PointerEvent } from 'react'
import type { Player } from '../audio/player'
import { ControlRow } from './components/ControlRow'
import { CuesRow, type CueTrigger } from './components/CuesRow'
import { DialSlider } from './components/DialSlider'
import { Header } from './components/Header'
import { NowPlaying, type Track } from './components/NowPlaying'
import { ProgressBar } from './components/ProgressBar'
import { Transport } from './components/Transport'
import { cssVariables } from './tokens'
import { useTuning } from './tuning'
import { useCueKeys } from './useCueKeys'
import { usePlayerState } from './usePlayerState'
import './fonts/fonts.css'
import styles from './Widget.module.css'

type Props = {
  track: Track
  player: Player
  onClose?: () => void // shows a close button in the header
  onPrevious?: () => void // go to the previous song (only asked for near the start of a song)
  onNext?: () => void // go to the next song; without it the button is dimmed
  cuesOpen?: boolean // whether the Cues row starts open (e.g. as it was last time)
  onCuesOpenChange?: (open: boolean) => void
}

// A control pressed with the mouse or a finger lets go of focus afterwards. Otherwise the next key
// press (e.g. a cue key) makes Chrome show its keyboard focus ring there, and Space would press it.
// Tabbing to a control still focuses it as usual.
const releaseFocus = (e: PointerEvent<HTMLElement>) => {
  const focused = (e.currentTarget.getRootNode() as Document | ShadowRoot).activeElement
  if (focused instanceof HTMLElement && e.currentTarget.contains(focused)) focused.blur()
}

// Previous restarts the song when you're further in than this, like most music players.
const RESTART_AFTER_SECONDS = 3

// Pitch: one dot = one semitone (±7). Speed: 50–150%, 100 = normal, in 1% steps.

// Badge text: "+2", "−15" (a proper minus sign), "0".
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')

// The whole widget. Self-contained: it brings its own tokens as CSS variables
// and its own font, so the page it sits on only decides where it goes.
export function Widget({ track, player, onClose, onPrevious, onNext, cuesOpen: startOpen = false, onCuesOpenChange }: Props) {
  const { isPlaying, isAudible, interrupted, currentTime, duration, semitones, rate, vocals, vocalsAvailable, vocalsWorking, cues } = usePlayerState(player)
  const known = Number.isFinite(duration) && duration > 0
  const progress = known ? currentTime / duration : 0
  const [preview, setPreview] = useState<number | null>(null) // where the player bar is being dragged, 0–1
  const tuning = useTuning() // live overrides from the test panel (dev only)
  const [cuesOpen, setCuesOpen] = useState(startOpen)
  const [cueTrigger, setCueTrigger] = useState<CueTrigger | null>(null)

  // Keys 1–5, or a click on a set cue: jump to that cue; the dot flashes (or gently shakes if the cue isn't set).
  const playCue = (slot: number) => {
    const hit = player.jumpToCue(slot)
    setCueTrigger((last) => ({ slot, hit, id: (last?.id ?? 0) + 1 }))
  }
  useCueKeys(!interrupted && known, playCue)

  // During an ad there's no restarting (that would be jumping through the ad); the page's own
  // previous still works.
  const previous = () => {
    if (interrupted) onPrevious?.()
    else if (onPrevious && currentTime < RESTART_AFTER_SECONDS) onPrevious()
    else player.seek(0)
  }

  return (
    <div className={styles.card} style={{ ...cssVariables, ...tuning.vars } as CSSProperties} onPointerUp={releaseFocus}>
      <Header onClose={onClose} />
      <div className={styles.content}>
        <NowPlaying track={track} isAudible={isAudible} readSpectrum={player.getSpectrum}>
          <div className={styles.player}>
            <ProgressBar
              progress={progress}
              duration={known ? duration : 0}
              onSeek={(fraction) => player.seek(fraction * duration)}
              onPreview={setPreview}
              disabled={interrupted}
              cues={cues}
              onCue={(slot) => player.jumpToCue(slot)}
            />
            <Transport
              time={preview !== null ? preview * duration : currentTime}
              duration={known ? duration : 0}
              isPlaying={isPlaying}
              onTogglePlay={player.toggle}
              onPrevious={previous}
              onNext={onNext}
            />
          </div>
        </NowPlaying>
        <ControlRow label="Pitch" value={semitones} format={signed} onChange={player.setSemitones} disabled={interrupted} />
        <DialSlider label="Speed" value={Math.round(rate * 100)} onChange={(percent) => player.setRate(percent / 100)} min={50} max={150} defaultValue={100} disabled={interrupted} />
        <DialSlider
          label="Vocals"
          value={vocals}
          onChange={player.setVocals}
          min={0}
          max={100}
          defaultValue={100}
          ticks={false}
          disabled={!vocalsAvailable}
          busy={vocalsWorking || tuning.glowPreview}
        />
        <CuesRow
          cues={cues}
          open={cuesOpen}
          onOpenChange={(open) => {
            setCuesOpen(open)
            onCuesOpenChange?.(open)
          }}
          onSet={player.setCue}
          onPlay={playCue}
          onClear={player.clearCue}
          trigger={cueTrigger}
          disabled={interrupted || !known}
        />
      </div>
    </div>
  )
}
