// The widget on a real page (YouTube, YouTube Music). Loaded by content-loader.js.
// Finds the page's video, wraps it in a Player, and shows or hides the widget when the toolbar icon
// is clicked. The widget sits in a sealed box (a shadow root), so the page's styles can't change it
// and its styles can't leak onto the page.

import { StrictMode, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import SignalsmithStretch from 'signalsmith-stretch'
import { createMediaPlayer, type Player } from '../audio/player'
import type { Track } from '../widget/components/NowPlaying'
import fontUrl from '../widget/fonts/geist-latin-500-normal.woff2'
import monoFontUrl from '../widget/fonts/geist-mono-latin-500-normal.woff2'
import { placement } from '../widget/tokens'
import { TestPanel } from '../playground/TestPanel'
import { Widget } from '../widget/Widget'
import { makeDraggable, type Position } from './drag'
import { pageNext, pagePrevious } from './page-transport'
import { startFrameSeparator } from './frame-separator'
import { readStored, store } from './storage'
import { createYouTubeSource } from './youtube-source'
import { DEFAULT_SETTINGS, loadSongSettings, rememberSongSettings, type SongSettings } from './song-settings'
import { videoId, watchTrack, watchVideoChange } from './track-info'

// YouTube's security rules block the pitch library's default way of loading its audio code,
// so it loads a copy that ships with the extension instead.
SignalsmithStretch.moduleUrl = chrome.runtime.getURL('signalsmith-worklet.js')

const POSITION_KEY = 'widgetPosition'
const CUES_OPEN_KEY = 'cuesOpen' // whether the Cues row was left open
const FIND_VIDEO_EVERY_MS = 500
const KEEP_SPEED_EVERY_MS = 250

let media: HTMLMediaElement | null = null
let player: Player | null = null
let shown: { host: HTMLElement; root: Root; stopDrag: () => void } | null = null
let waitingForVideo: ReturnType<typeof setInterval> | undefined

// The page's main video. Both YouTube sites keep one video element and swap what plays in it.
const findMedia = () => document.querySelector<HTMLVideoElement>('video.html5-main-video') ?? document.querySelector('video')

// YouTube marks its player while an ad plays (both sites use the same player).
const isAdPlaying = () => document.querySelector('.html5-video-player.ad-showing') !== null

// Wraps the page's video in a Player, and handles songs changing: a new song resets the controls,
// and brings back its remembered settings if it was played recently.
// Speed: YouTube loads ads and songs as new sources, which silently puts the video's speed back to
// normal. So each song's intended settings are kept here, and while the song itself plays (not an
// ad), its speed is put back if it doesn't match. Speed changes you make (widget or YouTube's menu)
// update the intended settings; silent resets don't, because they send no "speed changed" event.
function createPagePlayer(media: HTMLMediaElement) {
  const audio = createYouTubeSource(media, isAdPlaying, videoId)
  const player = createMediaPlayer(media, { vocalsSource: audio, startSeparator: startFrameSeparator, isInterruption: isAdPlaying })
  Object.assign(globalThis, { __audio: audio }) // for checks, like __player
  let song: { id: string; settings: SongSettings } | null = null
  const onSongChange = rememberSongSettings()

  const isSongPlaying = () => song !== null && song.id === videoId() && !isAdPlaying()
  const change = (next: Partial<SongSettings>) => {
    if (!song) return
    song.settings = { ...song.settings, ...next }
    onSongChange(song.id, song.settings)
  }

  media.addEventListener('ratechange', () => {
    if (isSongPlaying()) change({ rate: media.playbackRate })
  })
  player.subscribe(() => {
    const { semitones, vocals, cues } = player.getState()
    if (isSongPlaying()) change({ semitones, vocals, cues })
  })
  setInterval(() => {
    if (isSongPlaying() && media.playbackRate !== song!.settings.rate) player.setRate(song!.settings.rate)
  }, KEEP_SPEED_EVERY_MS)

  const load = async () => {
    const id = videoId()
    if (!id) return
    const saved = await loadSongSettings(id)
    if (id !== videoId()) return // moved on in the meantime
    song = { id, settings: saved ?? DEFAULT_SETTINGS }
    player.setSemitones(song.settings.semitones)
    player.setVocals(song.settings.vocals)
    player.setCues(song.settings.cues)
    if (isSongPlaying()) player.setRate(song.settings.rate) // otherwise once the song plays
  }
  watchVideoChange(() => {
    song = null
    player.newTrack()
    void load()
  })
  void load()
  return player
}

function App({ media, player, onClose, cuesOpen }: { media: HTMLMediaElement; player: Player; onClose: () => void; cuesOpen: boolean }) {
  const [track, setTrack] = useState<Track>({ title: '', artist: '', artwork: '' })
  useEffect(() => watchTrack(media, setTrack), [media])
  return (
    <>
      <Widget
        track={track}
        player={player}
        onClose={onClose}
        onPrevious={pagePrevious}
        onNext={pageNext()}
        cuesOpen={cuesOpen}
        onCuesOpenChange={(open) => void store(CUES_OPEN_KEY, open)}
      />
      {/* Dev builds (npm run dev:ext): the vocals test panel under the widget. */}
      {import.meta.env.MODE === 'development' && <TestPanel player={player} docked />}
    </>
  )
}

// Chrome ignores fonts declared inside a shadow root, so the fonts are declared on the page itself.
function addFont() {
  if (document.getElementById('offkey-font')) return
  const style = document.createElement('style')
  style.id = 'offkey-font'
  style.textContent = [
    `@font-face { font-family: 'Geist'; font-style: normal; font-weight: 500; font-display: swap; src: url('${fontUrl}') format('woff2'); }`,
    `@font-face { font-family: 'Geist Mono'; font-style: normal; font-weight: 500; font-display: swap; src: url('${monoFontUrl}') format('woff2'); }`,
  ].join('\n')
  document.head.append(style)
}

async function show() {
  const found = media?.isConnected ? media : findMedia()
  if (!found) {
    // No video on this page yet (e.g. the home page); show the widget once there is one.
    clearInterval(waitingForVideo)
    waitingForVideo = setInterval(() => findMedia() && (clearInterval(waitingForVideo), void show()), FIND_VIDEO_EVERY_MS)
    return
  }
  if (found !== media) {
    media = found
    player = createPagePlayer(media)
    // For checks (scripts): only the extension's own scripts can see this, not the page.
    Object.assign(globalThis, { __player: player })
  }
  const [saved, cuesOpen] = await Promise.all([readStored<Position>(POSITION_KEY), readStored<boolean>(CUES_OPEN_KEY)])
  if (shown) return // toggled twice quickly
  addFont()

  const host = document.createElement('div')
  // Its own view-transition name: YouTube animates page changes with view transitions, which draw
  // named parts (its player) above everything else; named too, the widget stays on top.
  host.style.cssText = 'position: fixed; z-index: 2147483647; margin: 0; view-transition-name: offkey-widget;'
  host.style.left = `${placement.left}px`
  host.style.top = `${placement.top}px`
  const shadow = host.attachShadow({ mode: 'open' })
  const stylesheet = document.createElement('link')
  stylesheet.rel = 'stylesheet'
  stylesheet.href = chrome.runtime.getURL('content.css')
  const mount = document.createElement('div')
  shadow.append(stylesheet, mount)
  document.body.append(host)

  // Keep key presses in the widget from reaching the page (YouTube uses arrows and space as shortcuts).
  for (const type of ['keydown', 'keyup', 'keypress']) host.addEventListener(type, (e) => e.stopPropagation())
  // Any touch of the widget counts as permission to start sound processing (see graph.ts).
  const current = player!
  host.addEventListener('pointerdown', () => current.wake(), { capture: true })

  const drag = makeDraggable(host, (position) => void store(POSITION_KEY, position))
  const root = createRoot(mount)
  root.render(
    <StrictMode>
      <App media={media} player={current} onClose={hide} cuesOpen={cuesOpen ?? false} />
    </StrictMode>,
  )
  shown = { host, root, stopDrag: drag.stop }
  // Where it was last dragged; kept on screen once it has a size (see drag.ts).
  if (saved) drag.place(saved.left, saved.top)
  current.wake() // starts right away if the page already allows audio
}

// Hiding keeps the sound as it is (e.g. still transposed); showing again picks up where it was.
function hide() {
  clearInterval(waitingForVideo)
  if (!shown) return
  shown.root.unmount()
  shown.stopDrag()
  shown.host.remove()
  shown = null
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'toggle') {
    if (shown) hide()
    else void show()
  }
})
