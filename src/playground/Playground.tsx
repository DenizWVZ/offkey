import { useRef, useState, type DragEvent } from 'react'
import { createMediaPlayer } from '../audio/player'
import type { Track } from '../widget/components/NowPlaying'
import { PLACEHOLDER_ARTWORK } from '../widget/placeholder-artwork'
import { placement } from '../widget/tokens'
import { Widget } from '../widget/Widget'
import { createStreamSimulator } from './stream-simulator'
import { TestPanel } from './TestPanel'
import styles from './Playground.module.css'

// What the page would tell the widget about the current track, before a song is picked.
const NO_SONG: Track = { artist: 'Playground', title: 'Choose a song', artwork: PLACEHOLDER_ARTWORK }

// The playground's audio source: a plain audio element, standing in for a page's video.
// It plays a song picked from this computer (nothing is kept in the project).
const audio = new Audio()
audio.preload = 'auto'
// Open the page with ?test to show the vocals test panel next to the widget.
const showTestPanel = new URLSearchParams(location.search).has('test')

// Vocal separation gets the song in pieces, as it would from YouTube, to feel streaming's delays.
const stream = createStreamSimulator(audio)
const player = createMediaPlayer(audio, { vocalsSource: stream.source })

// While developing: stop this copy of the song when the file reloads, so two don't play at once.
import.meta.hot?.dispose(() => audio.pause())

// While developing: lets the check script (scripts/check-playback.mjs) read and set the player.
if (import.meta.env.DEV) Object.assign(window, { __player: player })

// Local stand-in for a real web page: a plain dark page (YouTube's background) the widget floats over.
// Pick a song with the button, or drop an audio file anywhere.
// The close button hides the widget; click anywhere on the page to bring it back.
export function Playground() {
  const [open, setOpen] = useState(true)
  const [track, setTrack] = useState<Track>(NO_SONG)
  const inputRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef('')

  const pick = (chosen: File | undefined) => {
    if (!chosen) return
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(chosen)
    urlRef.current = url
    audio.pause()
    player.newTrack()
    audio.src = url
    void stream.load(url)
    setTrack({ artist: 'Local file', title: chosen.name.replace(/\.[^.]+$/, ''), artwork: PLACEHOLDER_ARTWORK })
    setOpen(true)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    pick(e.dataTransfer.files[0])
  }

  return (
    <div className={styles.page} onClick={() => setOpen(true)} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      {open && (
        <div className={styles.widgetSlot} style={{ top: placement.top, left: placement.left }} onClick={(e) => e.stopPropagation()}>
          <Widget track={track} player={player} onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        type="button"
        className={styles.pick}
        onClick={(e) => {
          e.stopPropagation()
          inputRef.current?.click()
        }}
      >
        Choose a song
      </button>
      <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {showTestPanel && <TestPanel player={player} setNetwork={stream.setNetwork} downloadedAhead={stream.downloadedAhead} />}
    </div>
  )
}
