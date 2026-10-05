// Where vocal separation gets a YouTube song's audio: the pieces the audio tap (hook.ts) reads as
// YouTube loads them for playback, held in memory only. Same job as the playground's stream-simulator.ts.
//
// YouTube plays each song and each ad from its own Media Source ("stream" here). Audio can arrive
// for a stream before we know what it is, so it's decoded and held until the stream has been playing
// in the video for a moment; then it's either the current song's (passed on) or an ad's (dropped).

import type { AudioSource, Stereo } from '../audio/separation/engine'
import { SAMPLE_RATE } from '../audio/separation/mdx'
import { createWebmReader, type Cluster } from './webm'

const CHANNEL = 'offkey-audio'
const CHECK_EVERY_MS = 250
// How long a stream plays before deciding which video it belongs to. After a song change, YouTube
// may switch the video's source and its address in either order; this covers the gap.
const DECIDE_AFTER_MS = 1000
// Longer videos (mixes, streams) get no vocal separation: the song is held in memory whole.
const MAX_SONG_SECONDS = 20 * 60
// Each batch of clusters is decoded with the cluster before it, so the decoder is warmed up and
// batches join without clicks; only if that cluster is at most this far before.
const WARM_UP_MAX_GAP_SECONDS = 30
// Decoding trims a few milliseconds that can't be predicted exactly, so a warmed-up batch is lined up
// with the end of the previous one by matching their overlapping sound: a short stretch from the end
// of the previous batch is searched for in the new one, within this many samples of where it should be.
const MATCH_LENGTH = 2048
const MATCH_SEARCH = 1500
const MATCH_MIN_SIMILARITY = 0.9 // 1 = identical; below this, fall back to the timestamps

type Stream = {
  reader: ReturnType<typeof createWebmReader> | null // null: a format we can't read (not WebM)
  last: Cluster | null // the last cluster read, to warm up the decoder for the next batch
  end: { sample: number; tail: Float32Array } | null // where the last decoded batch ended, and its last sound
  held: { start: number; piece: Stereo }[] // decoded, waiting until we know whose it is
  video: string | null // the video it belongs to, once decided
  ad: boolean
  playingSince: number | null // when the video started playing from this stream
  decoding: Promise<void> // batches are decoded one after another, in order
}

export function createYouTubeSource(media: HTMLMediaElement, isAd: () => boolean, videoId: () => string | null) {
  const streams = new Map<number, Stream>()
  const addresses = new Map<string, number>() // blob: address → stream
  const decoder = new OfflineAudioContext(2, 1, SAMPLE_RATE) // decodes to the model's sample rate
  let track: string | null = null // the video whose audio is being passed on
  let announced = false // the track's length has been passed on (so its audio can follow)
  let passedSeconds = 0
  const passed: [number, number][] = [] // for checks: where passed pieces start and end, in seconds

  const streamFor = (id: number) => {
    let stream = streams.get(id)
    if (!stream) streams.set(id, (stream = { reader: null, last: null, end: null, held: [], video: null, ad: false, playingSince: null, decoding: Promise.resolve() }))
    return stream
  }
  const isSong = (stream: Stream) => announced && stream.video === track && !stream.ad
  // An ad's or another video's: its audio isn't needed.
  const isOther = (stream: Stream) => stream.ad || (stream.video !== null && stream.video !== track)

  const source: AudioSource & { restart: () => void } = {
    start(onAudio, onDuration) {
      const pass = (start: number, piece: Stereo) => {
        passedSeconds += piece.l.length / SAMPLE_RATE
        passed.push([start / SAMPLE_RATE, (start + piece.l.length) / SAMPLE_RATE].map((t) => Math.round(t * 100) / 100) as [number, number])
        if (passed.length > 30) passed.shift()
        onAudio(start, piece)
      }

      async function decode(stream: Stream, clusters: Cluster[], offset: number) {
        const warmUp = stream.last && clusters[0].seconds > stream.last.seconds && clusters[0].seconds - stream.last.seconds < WARM_UP_MAX_GAP_SECONDS ? stream.last : null
        stream.last = clusters[clusters.length - 1]
        const file = stream.reader?.file(warmUp ? [warmUp, ...clusters] : clusters)
        if (!file || isOther(stream)) return
        let audio: AudioBuffer
        try {
          audio = await decoder.decodeAudioData(file.buffer as ArrayBuffer)
        } catch (error) {
          console.warn('[youtube audio] could not decode a piece:', error)
          return
        }
        const left = audio.getChannelData(0)
        const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : left
        // By the timestamps: where the batch starts in the decoded audio, and in the song.
        let skip = warmUp ? Math.round((clusters[0].seconds - warmUp.seconds) * SAMPLE_RATE) : 0
        let start = Math.round((clusters[0].seconds + offset) * SAMPLE_RATE)
        // Better: continue exactly where the previous batch ended, found by its sound.
        const end = stream.end
        if (warmUp && end && Math.abs(end.sample - start) < MATCH_SEARCH) {
          const expected = skip - (start - end.sample) - end.tail.length // where the previous tail should begin
          const found = findSound(left, end.tail, expected)
          if (found !== null) {
            skip = found + end.tail.length
            start = end.sample
          }
        }
        const l = left.slice(skip)
        const r = right.slice(skip)
        stream.end = { sample: start + l.length, tail: l.slice(-MATCH_LENGTH) }
        if (isSong(stream)) pass(start, { l, r })
        else if (!isOther(stream)) stream.held.push({ start, piece: { l, r } })
      }

      window.addEventListener('message', (event) => {
        const message = event.data
        if (event.source !== window || message?.channel !== CHANNEL) return
        if (message.type === 'source') {
          addresses.set(message.url, message.source)
          streamFor(message.source)
        } else if (message.type === 'append') {
          const stream = streamFor(message.source)
          if (!stream.reader) {
            if (!message.mime.includes('webm')) return // e.g. MP4 audio: not supported yet
            stream.reader = createWebmReader()
          }
          const clusters = stream.reader.add(new Uint8Array(message.bytes))
          if (clusters.length) stream.decoding = stream.decoding.then(() => decode(stream, clusters, message.offset))
        }
      })
      window.postMessage({ channel: CHANNEL, type: 'hello' }, '*') // send what's been copied so far

      setInterval(() => {
        const id = videoId()
        if (id !== track) {
          track = id
          announced = false
        }
        // Decide what the stream playing now belongs to, once it has played for a moment.
        const playing = streams.get(addresses.get(media.src) ?? -1)
        for (const stream of streams.values()) if (stream !== playing) stream.playingSince = null
        if (playing && playing.video === null && media.readyState >= HTMLMediaElement.HAVE_METADATA) {
          playing.playingSince ??= performance.now()
          if (performance.now() - playing.playingSince >= DECIDE_AFTER_MS) {
            playing.video = id
            playing.ad = isAd()
            if (isOther(playing)) playing.held = []
          }
        }
        // Once the track's own stream is known, pass on its length, then its audio.
        if (!announced && playing && playing.video === track && track && !playing.ad && Number.isFinite(media.duration)) {
          if (media.duration > MAX_SONG_SECONDS) return
          onDuration(media.duration)
          announced = true
          passedSeconds = 0
        }
        for (const stream of streams.values()) {
          if (!isSong(stream) || !stream.held.length) continue
          for (const { start, piece } of stream.held) pass(start, piece)
          stream.held = []
        }
      }, CHECK_EVERY_MS)
    },

    // The player moved on to a new song: pass on its length (and audio) again once it's known.
    restart() {
      announced = false
    },
  }

  return Object.assign(source, {
    // Numbers for checks.
    debug: () => ({ streams: [...streams.values()].map((s) => `${s.video}${s.ad ? ' (ad)' : ''} held ${s.held.length}${s.reader ? '' : ' (not WebM)'}`).join(', '), playing: addresses.get(media.src) ?? null, track, announced, passedSeconds: Math.round(passedSeconds * 10) / 10, passed: passed.map((r) => r.join('–')).join(' ') }),
  })
}

// Where `sound` appears in `audio`, searching around `expected`; null if not clearly found.
function findSound(audio: Float32Array, sound: Float32Array, expected: number): number | null {
  let best = -1
  let bestAt = 0
  let soundEnergy = 0
  for (const x of sound) soundEnergy += x * x
  if (soundEnergy < 1e-6) return null // silence can't be matched
  for (let at = Math.max(0, expected - MATCH_SEARCH); at <= Math.min(audio.length - sound.length, expected + MATCH_SEARCH); at++) {
    let product = 0
    let energy = 0
    for (let i = 0; i < sound.length; i++) {
      product += audio[at + i] * sound[i]
      energy += audio[at + i] * audio[at + i]
    }
    const similarity = product / Math.sqrt(energy * soundEnergy + 1e-12)
    if (similarity > best) {
      best = similarity
      bestAt = at
    }
  }
  return best >= MATCH_MIN_SIMILARITY ? bestAt : null
}
