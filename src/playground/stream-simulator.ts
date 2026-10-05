// Playground only: hands the song to vocal separation the way YouTube would, instead of all at once.
// Audio "downloads" in 5 s pieces, starting at the playhead and running up to 35 s ahead
// (measured on YouTube: 30–40 s). After a jump to a part not downloaded yet, nothing arrives for a
// moment, like YouTube fetching from the new spot. The <audio> element itself still plays the local
// file instantly; only what vocal separation receives is delayed.

import type { AudioSource } from '../audio/player'
import { SAMPLE_RATE } from '../audio/separation/mdx'

export type Network = 'normal' | 'slow'

const PIECE_SECONDS = 5
const AHEAD_SECONDS = 35
const TICK_MS = 100
// How the network behaves: wait after a jump, and download speed (seconds of audio per second).
// A 5 s piece of YouTube audio is only ~40 KB, so on a normal connection the wait dominates.
const NETWORKS: Record<Network, { jumpDelayMs: number; speed: number }> = {
  normal: { jumpDelayMs: 500, speed: 40 },
  slow: { jumpDelayMs: 2000, speed: 3 },
}
// Audio arrives from the start of the piece holding a point this far before the playhead,
// like YouTube's pieces, which rarely start exactly where you jump to.
const BEFORE_PLAYHEAD_SECONDS = 0.5

type Callbacks = Parameters<AudioSource['start']>

// The song is picked on the page, so it's handed over with load(url), any number of times.
export function createStreamSimulator(media: HTMLMediaElement) {
  let network: Network = 'normal'
  let callbacks: Callbacks | null = null
  let songUrl = '' // the song being loaded; a newer pick wins
  let song: AudioBuffer | null = null
  const downloaded = new Set<number>() // piece indexes
  let waitUntil = 0 // after a jump: when downloading resumes
  let progress = 0 // seconds of the current piece downloaded so far
  let lastPiece = -1 // piece the playhead was in on the last tick

  const load = async (url: string) => {
    songUrl = url
    song = null
    downloaded.clear()
    progress = 0
    lastPiece = -1
    if (!callbacks) return // start() will load it
    const decoded = await new OfflineAudioContext(2, 1, SAMPLE_RATE).decodeAudioData(await (await fetch(url)).arrayBuffer())
    if (url !== songUrl) return
    song = decoded
    callbacks[1](song.duration)
  }

  const source: AudioSource = {
    start(onAudio, onDuration) {
      callbacks = [onAudio, onDuration]
      if (songUrl) void load(songUrl)
      setInterval(() => {
        if (!song) return
        const pieces = Math.ceil(song.duration / PIECE_SECONDS)
        const { jumpDelayMs, speed } = NETWORKS[network]
        const playing = Math.floor(Math.max(0, media.currentTime - BEFORE_PLAYHEAD_SECONDS) / PIECE_SECONDS)
        // A jump to a piece that isn't downloaded: nothing arrives for a moment.
        if (playing !== lastPiece && !downloaded.has(playing) && Math.abs(playing - lastPiece) > 1) {
          waitUntil = performance.now() + jumpDelayMs
          progress = 0
        }
        lastPiece = playing
        if (performance.now() < waitUntil) return

        // Download the first missing piece from the playhead on, within reach.
        let next = playing
        while (downloaded.has(next)) next++
        if (next >= pieces || next * PIECE_SECONDS > media.currentTime + AHEAD_SECONDS) return
        progress += (speed * TICK_MS) / 1000
        if (progress < PIECE_SECONDS) return
        progress = 0
        downloaded.add(next)
        const from = next * PIECE_SECONDS * SAMPLE_RATE
        const to = Math.min(song.length, from + PIECE_SECONDS * SAMPLE_RATE)
        const r = song.numberOfChannels > 1 ? 1 : 0 // mono: same on both sides
        onAudio(from, { l: song.getChannelData(0).slice(from, to), r: song.getChannelData(r).slice(from, to) })
      }, TICK_MS)
    },
  }

  return {
    source,
    load,
    setNetwork: (next: Network) => (network = next),
    // Seconds downloaded ahead of the playhead, in one unbroken stretch.
    downloadedAhead() {
      let k = Math.floor(media.currentTime / PIECE_SECONDS)
      if (!downloaded.has(k)) return 0
      while (downloaded.has(k)) k++
      return k * PIECE_SECONDS - media.currentTime
    },
  }
}
