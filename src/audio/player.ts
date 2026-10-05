// The widget's only way to control audio. Wraps any audio or video element: the playground's and
// the demo's <audio>, or a page's <video> (e.g. YouTube), without the widget changing.

import { createSoundPath, type WhenNotReady } from './graph'
import { createSeparationEngine, type AudioSource, type Separator, type Storage, type VocalsStatus } from './separation/engine'

export type { AudioSource, Separator, Storage, VocalsStatus, WhenNotReady }

export type PlayerOptions = {
  // Where vocal separation gets the song's audio (a copy of what the page downloads).
  // Without one, the Vocals control is unavailable.
  vocalsSource?: AudioSource
  // Where the separation model runs; a background worker if not given.
  startSeparator?: () => Separator
  // True while something other than the song plays in the element (e.g. a YouTube ad).
  isInterruption?: () => boolean
}

export type PlayerState = {
  isPlaying: boolean
  isAudible: boolean // playing and actually making sound (not waiting for the next song or buffering)
  interrupted: boolean // something other than the song is playing (an ad): no jumping or speed changes then
  currentTime: number // seconds
  duration: number // seconds, 0 until known
  rate: number // playback speed, 1 = normal (the key stays the same)
  semitones: number // key change, 0 = original key
  vocals: number // 0–100: 100 = vocals as released, 0 = as little voice as possible
  vocalsAvailable: boolean // false when separation can't run here
  vocalsStatus: VocalsStatus // idle until first used; then loading-model → preparing ⇄ ready
  vocalsWorking: boolean // Vocals is below 100 but the separated sound isn't playing yet (show a loader)
  cues: Cues // the song's cue points, one per slot (keys 1–5)
}

// Cue points: song times in seconds, one per slot; null = not set.
export const CUE_COUNT = 5
export type Cues = readonly (number | null)[]
const NO_CUES: Cues = Array<null>(CUE_COUNT).fill(null)

export type Player = {
  play: () => void
  // A different song is now in the media element (e.g. the next YouTube video): forget its separated
  // vocals and put the key and vocals back to their defaults. (Sites reset the speed themselves.)
  newTrack: () => void
  // Starts sound processing if the page allows audio yet (see graph.ts). Playing and changing
  // the key or vocals do this too; call it when the widget opens or is touched.
  wake: () => void
  pause: () => void
  toggle: () => void
  seek: (seconds: number) => void
  setRate: (rate: number) => void
  setSemitones: (semitones: number) => void
  setVocals: (vocals: number) => void // 0–100
  setCue: (slot: number) => void // sets a cue at the current position (not during ads or the song's last moments)
  clearCue: (slot: number) => void
  jumpToCue: (slot: number) => boolean // false when that cue isn't set or jumping isn't allowed (an ad)
  setCues: (cues: Cues) => void // e.g. a song's remembered cues
  getState: () => PlayerState
  // Live frequency levels, one 0–1 value per band (low to high). Read on demand, e.g. every frame,
  // rather than kept in the state, so the whole widget doesn't redraw 60 times a second.
  getSpectrum: (bands: number) => number[]
  getLatency: () => number | null // seconds the pitch shifter delays the sound, once known (for checks)
  // Testing only (playground test panel): vocal separation settings and live numbers.
  setVocalsOptions: (options: { storage?: Storage; whenNotReady?: WhenNotReady; slowdown?: number }) => void
  getVocalsDebug: () => Record<string, number | string> | null
  getCuesDebug: () => Record<string, number | string> // for checks: cue pads and the last handover
  subscribe: (onChange: () => void) => () => void // returns an unsubscribe function
}

// Cues are set this much before the moment you heard when setting them, to catch the start of the beat
// (people also click a touch late). Tune by ear.
const CUE_LEAD_SECONDS = 0.02

// In the song's last moments (and once it has ended) there's nothing left to separate, so no loader.
const END_SECONDS = 0.5

export function createMediaPlayer(media: HTMLMediaElement, { vocalsSource, startSeparator, isInterruption = () => false }: PlayerOptions = {}): Player {
  const listeners = new Set<() => void>()
  const engine = vocalsSource ? createSeparationEngine(vocalsSource, () => media.currentTime, () => update(), startSeparator) : null
  const sound = createSoundPath(media, engine, () => update(), isInterruption)
  let semitones = 0
  let vocals = 100
  let cues = NO_CUES // replaced (never changed in place) so React sees when it changes

  const isAtEnd = () => media.ended || (Number.isFinite(media.duration) && media.currentTime >= media.duration - END_SECONDS)

  const read = (): PlayerState => ({
    isPlaying: !media.paused && !media.ended,
    isAudible: !media.paused && !media.ended && media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA,
    interrupted: isInterruption(),
    currentTime: media.currentTime,
    duration: Number.isFinite(media.duration) ? media.duration : 0,
    rate: media.playbackRate,
    semitones,
    vocals,
    vocalsAvailable: engine !== null && engine.status() !== 'unavailable' && engine.hasSong(),
    vocalsStatus: engine?.status() ?? 'unavailable',
    vocalsWorking:
      engine !== null && vocals < 100 && engine.status() !== 'unavailable' && sound.route() !== 'separated' && sound.isPlayingSong() && !isAtEnd(),
    cues,
  })

  // Kept as one object that only changes when the media changes, so React can tell when to redraw.
  let state = read()
  const update = () => {
    const wasInterrupted = state.interrupted
    state = read()
    // Ads play in their own key; the song's key comes back after (the setting itself is kept).
    if (state.interrupted !== wasInterrupted) sound.setSemitones(state.interrupted ? 0 : semitones)
    listeners.forEach((listener) => listener())
  }

  const events = ['play', 'pause', 'ended', 'timeupdate', 'seeking', 'seeked', 'durationchange', 'loadedmetadata', 'ratechange', 'waiting', 'playing', 'canplay', 'emptied', 'loadstart']
  events.forEach((event) => media.addEventListener(event, update))

  const play = () => {
    sound.start()
    // Browsers can refuse to start audio (e.g. before any click); keep going quietly if so.
    media.play().catch((error) => console.warn('[player] could not start playback:', error))
  }

  const setSemitones = (value: number) => {
    semitones = value
    if (!isInterruption()) sound.setSemitones(value) // during an ad: kept for when the song is back
  }
  const setVocals = (value: number) => {
    vocals = Math.round(Math.min(100, Math.max(0, value)))
    sound.setVocals(vocals / 100)
  }
  const setCues = (next: Cues) => {
    cues = Array.from({ length: CUE_COUNT }, (_, i) => next[i] ?? null)
    sound.setCues(cues)
    engine?.setPinned(cues.filter((cue) => cue !== null))
    update()
  }
  const seek = (seconds: number) => {
    // Ads play in the same element. They're never jumped through or sped up (YouTube's terms).
    if (isInterruption()) return
    media.currentTime = Math.max(0, Math.min(seconds, state.duration || seconds))
    update() // show the new position right away instead of waiting for the browser
  }

  return {
    play,
    newTrack: () => {
      engine?.reset()
      sound.newTrack()
      setSemitones(0)
      setVocals(100)
      setCues(NO_CUES)
    },
    wake: () => sound.start(),
    pause: () => media.pause(),
    toggle: () => (media.paused ? play() : media.pause()),
    seek,
    setRate: (rate) => {
      if (isInterruption()) return
      media.preservesPitch = true // change speed without changing the key
      media.playbackRate = rate
    },
    setSemitones: (value) => {
      sound.start()
      setSemitones(value)
      update()
    },
    setVocals: (value) => {
      sound.start()
      setVocals(value)
      update()
    },
    setCue: (slot) => {
      if (isInterruption() || !state.duration || isAtEnd()) return
      // Where the sound you heard was, not the element's reported time (which runs ahead of it).
      const at = Math.max(0, sound.heardTime() - CUE_LEAD_SECONDS * media.playbackRate)
      setCues(cues.map((cue, i) => (i === slot ? at : cue)))
    },
    clearCue: (slot) => setCues(cues.map((cue, i) => (i === slot ? null : cue))),
    jumpToCue: (slot) => {
      const cue = cues[slot]
      if (cue == null || isInterruption()) return false
      sound.start() // a key press counts as permission to start sound processing
      // Instantly from the cue's pad if it's ready, the element following behind; otherwise a plain jump.
      if (sound.playCue(slot)) update()
      else seek(cue)
      return true
    },
    setCues,
    getState: () => state,
    getSpectrum: (bands) => sound.readSpectrum(bands),
    getLatency: () => sound.latency(),
    setVocalsOptions: ({ storage, whenNotReady, slowdown }) => {
      if (storage) engine?.setStorage(storage)
      if (whenNotReady) sound.setWhenNotReady(whenNotReady)
      if (slowdown) engine?.setSlowdown(slowdown)
    },
    getCuesDebug: () => sound.debugCues(),
    getVocalsDebug: () => (engine ? { ...engine.debug(), route: sound.route() } : null),
    subscribe: (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
}
