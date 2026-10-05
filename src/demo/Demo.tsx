import { useRef, useState, type DragEvent } from 'react'
import { createMediaPlayer } from '../audio/player'
import type { Track } from '../widget/components/NowPlaying'
import { PLACEHOLDER_ARTWORK } from '../widget/placeholder-artwork'
import { placement } from '../widget/tokens'
import { Widget } from '../widget/Widget'
import { createFileSource } from './file-source'
import styles from './Demo.module.css'

// The public demo page: the widget on a neutral page, playing a song the visitor picks from
// their own computer (nothing is uploaded). Built with `npm run build:demo`.

// Link to the zipped Chrome extension (the latest GitHub release, made with `npm run zip`). Empty = the section is hidden.
const EXTENSION_ZIP_URL = 'https://github.com/DenizWVZ/offkey/releases/latest'

const NO_SONG: Track = { artist: 'Offkey demo', title: 'Choose a song to try it', artwork: PLACEHOLDER_ARTWORK }

const AUDIO_FILE = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i

// One audio element and player for the page; picking a song swaps what's in them.
const audio = new Audio()
audio.preload = 'auto'
const file = createFileSource()
const player = createMediaPlayer(audio, { vocalsSource: file.source })

// Lets the check script (scripts/check-playback.mjs) read and set the player, also on the built page.
Object.assign(window, { __player: player })

export function Demo() {
  const [open, setOpen] = useState(true)
  const [track, setTrack] = useState<Track>(NO_SONG)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef('')

  const pick = (chosen: File | undefined) => {
    if (!chosen) return
    if (!chosen.type.startsWith('audio/') && !AUDIO_FILE.test(chosen.name)) {
      setError('That doesn’t look like an audio file. Try an mp3, m4a or wav.')
      return
    }
    setError('')
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(chosen)
    urlRef.current = url
    audio.pause()
    player.newTrack()
    audio.src = url
    file.load(url).catch(() => setError('Couldn’t read this file for the vocals. Pitch and Speed still work.'))
    setTrack({ artist: 'Your file', title: chosen.name.replace(/\.[^.]+$/, ''), artwork: PLACEHOLDER_ARTWORK })
    setOpen(true)
    player.play() // the pick itself counts as the click browsers need before playing sound
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    pick(e.dataTransfer.files[0])
  }

  return (
    <div
      className={styles.page}
      onClick={() => setOpen(true)}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
    >
      {open && (
        <div className={styles.widgetSlot} style={{ top: placement.top, left: placement.left }} onClick={(e) => e.stopPropagation()}>
          <Widget track={track} player={player} onClose={() => setOpen(false)} />
        </div>
      )}

      <main className={styles.intro} onClick={(e) => e.stopPropagation()}>
        <h1>Offkey</h1>
        <p className={styles.lede}>A small browser extension for singers and musicians: change the key, speed and vocals of the music you’re playing.</p>

        <button type="button" className={`${styles.drop} ${dragging ? styles.dragging : ''}`} onClick={() => inputRef.current?.click()}>
          <strong>Choose a song</strong>
          <span>or drop an audio file here. It stays on your computer.</span>
        </button>
        <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        {error && <p className={styles.error}>{error}</p>}

        <h2>How to try it</h2>
        <ol>
          <li>Pick a song, then play and pause from the widget.</li>
          <li>Drag Pitch and Speed; the sound changes as you drag.</li>
          <li>Lower Vocals. The first time, it downloads a 30 MB AI model, then separates the voice right on your computer.</li>
        </ol>

        {EXTENSION_ZIP_URL && (
          <details>
            <summary>Get the Chrome extension (works on YouTube and YouTube Music)</summary>
            <ol>
              <li>
                <a href={EXTENSION_ZIP_URL} target="_blank" rel="noreferrer">Download the latest offkey zip</a> and unzip it somewhere it can stay, like Documents.
              </li>
              <li>Open chrome://extensions and turn on Developer mode (top right).</li>
              <li>Click Load unpacked and choose the offkey folder.</li>
              <li>Pin Offkey, open a song on YouTube and click its icon.</li>
              <li>To update later: replace the folder's contents with a newer zip, then click reload on Offkey's card.</li>
            </ol>
          </details>
        )}

        <p className={styles.note}>Works best in Chrome, Edge or Arc on a laptop. The AI vocals need a recent browser; phones and Safari may be slow or unsupported.</p>
        <p className={styles.footer}>A side project by Deniz</p>
      </main>
    </div>
  )
}
