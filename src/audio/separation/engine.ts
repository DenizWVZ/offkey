// Keeps the song's separated vocals a step ahead of the playhead.
// Audio arrives in pieces from a source (a simulated stream in the playground; YouTube's own
// downloads in the extension). The song is cut into fixed segments (~5.8 s, see mdx.ts); the
// engine sends the next unseparated segment nearest the playhead to the background worker.

import { CHUNK, EDGE, SAMPLE_RATE, SEGMENT } from './mdx'

export type VocalsStatus = 'idle' | 'loading-model' | 'preparing' | 'ready' | 'unavailable'
export type Storage = 'recent' | 'song' // recent: keep only the last minute behind the playhead; song: keep everything heard
export type Stereo = { l: Float32Array; r: Float32Array }
// A separated segment. After a jump, audio may only have arrived from partway into the segment;
// then only the part from `validFrom` (a song sample) on is usable.
type Separated = Stereo & { validFrom: number }

// Where the engine gets its audio from. `onAudio` is called with each piece as it arrives.
export type AudioSource = {
  start: (onAudio: (startSample: number, piece: Stereo) => void, onDuration: (seconds: number) => void) => void
  restart?: () => void // a new song is playing: call onDuration (and onAudio) again for it
}

// Where separation runs: a background worker running worker.ts, or anything that passes the same
// messages to one (the extension runs it in a frame of its own, since pages like YouTube block workers).
export type Separator = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent) => void) | null
}
const startWorker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as Separator // a Worker does all this

const LOOK_AHEAD_SECONDS = 60 // separate at most this far ahead of the playhead
const NEAR_SECONDS = 12 // this much ahead comes first, before the cues (graph.ts needs 10 s ready to switch)
const KEEP_BEHIND_SECONDS = 60 // with storage 'recent', how much already-played audio to keep (rewinds within it are instant; ~20 MB)
// Cue points: the vocals from just before each cue to this far after it are separated in the background
// and kept, so a jump to a cue has its pad (see cue-pads.ts) and 10 s ready ahead (graph.ts) straight away.
// ~6 MB per cue.
const PIN_BEFORE_SECONDS = 0.5
const PIN_AFTER_SECONDS = 16

export type SeparationEngine = ReturnType<typeof createSeparationEngine>

export function createSeparationEngine(source: AudioSource, getPlayhead: () => number, onChange: () => void, startSeparator = startWorker) {
  let length = 0 // samples
  let original: Stereo | null = null
  const received: [number, number][] = [] // sample ranges of the original that have arrived, merged
  const vocals = new Map<number, Separated>() // segment index → its vocals
  let worker: Separator | null = null
  let status: VocalsStatus = 'idle'
  let busy: { segment: number; validFrom: number; song: number } | null = null // segment being separated
  let song = 0 // counts songs, so a result for a previous song is thrown away
  let storage: Storage = 'recent'
  let slowdown = 1
  let backend = ''
  let lastSegmentMs = 0
  let pins: readonly number[] = [] // cue times, seconds

  source.start(
    (start, piece) => {
      if (!original) return
      original.l.set(piece.l.subarray(0, Math.max(0, length - start)), start)
      original.r.set(piece.r.subarray(0, Math.max(0, length - start)), start)
      addRange(start, Math.min(length, start + piece.l.length))
      tick()
    },
    (seconds) => {
      forget() // a new song
      length = Math.ceil(seconds * SAMPLE_RATE)
      original = { l: new Float32Array(length), r: new Float32Array(length) }
      onChange()
    },
  )

  // Forgets the song: its audio and everything separated from it.
  function forget() {
    song++
    length = 0
    original = null
    received.length = 0
    vocals.clear()
    if (status === 'ready') setStatus('preparing')
  }

  function addRange(from: number, to: number) {
    received.push([from, to])
    received.sort((a, b) => a[0] - b[0])
    for (let i = 0; i < received.length - 1; ) {
      if (received[i + 1][0] <= received[i][1]) {
        received[i][1] = Math.max(received[i][1], received[i + 1][1])
        received.splice(i + 1, 1)
      } else i++
    }
  }
  const hasAudio = (from: number, to: number) => {
    from = Math.max(0, from)
    to = Math.min(length, to)
    return received.some(([a, b]) => a <= from && b >= to)
  }

  const segmentAt = (seconds: number) => Math.floor((seconds * SAMPLE_RATE) / SEGMENT)
  const segmentCount = () => Math.ceil(length / SEGMENT)
  const isPinned = (k: number) => pins.some((t) => k >= segmentAt(Math.max(0, t - PIN_BEFORE_SECONDS)) && k <= segmentAt(t + PIN_AFTER_SECONDS))

  function setStatus(next: VocalsStatus) {
    if (next !== status) {
      status = next
      onChange()
    }
  }

  // Sends the next segment to the worker, if it's free and there's something to do.
  function tick() {
    if (!worker || status === 'loading-model' || status === 'unavailable' || !original) return
    const playhead = getPlayhead()
    const first = segmentAt(playhead)
    setStatus(isReady(playhead) ? 'ready' : 'preparing')
    if (busy !== null) return

    // With storage 'recent', forget what's well behind the playhead (but not what's around a cue).
    if (storage === 'recent') for (const k of vocals.keys()) if ((k + 1) * SEGMENT < (playhead - KEEP_BEHIND_SECONDS) * SAMPLE_RATE && !isPinned(k)) vocals.delete(k)

    // What's ahead of the playhead, in order, from segment `from` to `to`. 'wait': the audio hasn't arrived yet.
    const ahead = (from: number, to: number) => {
      for (let k = from; k <= to; k++) {
        const result = trySeparate(k, k === first ? Math.floor(playhead * SAMPLE_RATE) : null)
        if (result !== 'done') return result
      }
      return 'done'
    }
    const last = Math.min(segmentCount() - 1, segmentAt(playhead + LOOK_AHEAD_SECONDS))
    const near = Math.min(last, segmentAt(playhead + NEAR_SECONDS))
    // First what's needed to keep playing now, then what's around the cues, then the rest ahead.
    const nearResult = ahead(first, near)
    if (nearResult === 'sent') return
    for (let k = 0; k < segmentCount(); k++) {
      if (!isPinned(k)) continue
      // A cue set just after a jump may only have audio from shortly before it; its segment is
      // separated from where the audio begins, like the one under the playhead.
      const cue = pins.find((t) => segmentAt(t) === k)
      if (trySeparate(k, cue === undefined ? null : Math.floor(cue * SAMPLE_RATE)) === 'sent') return
    }
    if (nearResult === 'done') ahead(near + 1, last)
  }

  // Sends segment k to the worker if it needs separating and its audio is here. `playheadSample`:
  // for the segment under the playhead (or a cue), which after a jump may be separated from wherever
  // its audio begins, as long as that's before this point (the part before is left silent, never played).
  function trySeparate(k: number, playheadSample: number | null): 'sent' | 'done' | 'wait' {
    if (!original || !worker) return 'wait'
    const from = k * SEGMENT - EDGE
    const whole = hasAudio(from, from + CHUNK)
    const done = vocals.get(k)
    if (done && (done.validFrom <= k * SEGMENT || !whole)) return 'done'
    let start = from
    if (!whole) {
      const range = playheadSample !== null ? received.find(([a, b]) => a <= playheadSample && b >= Math.min(length, from + CHUNK)) : undefined
      if (!range) return 'wait'
      start = range[0]
    }
    const l = new Float32Array(CHUNK), r = new Float32Array(CHUNK)
    const a = Math.max(0, start), b = Math.min(length, from + CHUNK)
    l.set(original.l.subarray(a, b), a - from)
    r.set(original.r.subarray(a, b), a - from)
    // Near a silent gap the result isn't reliable, so a partial segment is usable a little after it.
    busy = { segment: k, validFrom: whole ? k * SEGMENT : start + EDGE, song }
    worker.postMessage({ type: 'separate', segment: k, l, r }, [l.buffer, r.buffer])
    return 'sent'
  }

  // The song's audio from `seconds` on, `count` samples (copies), or null if it hasn't all arrived.
  function slice(seconds: number, count: number): { l: Float32Array<ArrayBuffer>; r: Float32Array<ArrayBuffer> } | null {
    const a = Math.round(seconds * SAMPLE_RATE), b = a + count
    if (!original || a < 0 || b > length || !hasAudio(a, b)) return null
    return { l: original.l.slice(a, b), r: original.r.slice(a, b) }
  }

  function isReady(seconds: number, ahead = 0.5) {
    const at = seconds * SAMPLE_RATE
    for (let k = segmentAt(seconds); k <= segmentAt(Math.min(seconds + ahead, length / SAMPLE_RATE - 0.01)); k++) {
      const v = vocals.get(k)
      if (!v || v.validFrom > Math.max(k * SEGMENT, at)) return false
    }
    return length > 0
  }

  setInterval(tick, 250)

  return {
    // Starts downloading the model and separating. Called the first time Vocals goes below 100.
    activate() {
      if (worker) return
      setStatus('loading-model')
      try {
        worker = startSeparator()
      } catch (error) {
        console.warn('[separation] could not start:', error) // e.g. on a page whose rules block it
        setStatus('unavailable')
        return
      }
      worker.onmessage = (event) => {
        const message = event.data
        if (message.type === 'loaded') {
          backend = message.backend
          setStatus('preparing')
          tick()
        } else if (message.type === 'separated') {
          if (busy?.song !== song) {
            busy = null // separated for a song that's no longer playing
            tick()
            return
          }
          vocals.set(message.segment, { l: message.l, r: message.r, validFrom: busy?.validFrom ?? message.segment * SEGMENT })
          lastSegmentMs = message.ms
          busy = null
          tick()
          onChange()
        } else if (message.type === 'error') {
          console.warn('[separation]', message.message)
          busy = null
          if (status === 'loading-model') setStatus('unavailable')
        }
      }
      worker.postMessage({ type: 'load', slowdown })
    },
    status: () => status,
    hasSong: () => length > 0, // the song's audio has started arriving
    // A new song: forget the last one and wait for the new one's audio.
    reset() {
      forget()
      source.restart?.()
    },
    isReady,
    tick,
    // The separated audio for one segment, as instrumental + vocals (4 channels), or null if not ready.
    stems(k: number) {
      const v = vocals.get(k)
      if (!v || !original) return null
      const from = k * SEGMENT
      const n = Math.min(SEGMENT, length - from)
      const il = new Float32Array(n), ir = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        il[i] = original.l[from + i] - v.l[i]
        ir[i] = original.r[from + i] - v.r[i]
      }
      return [il, ir, v.l.slice(0, n), v.r.slice(0, n)]
    },
    // For cue pads: the song's audio (sample rate SAMPLE_RATE) from `seconds` on, `count` samples,
    // as [left, right], or as instrumental + vocals [left, right, left, right] with `stems`.
    // Null if not all of it has arrived (or, with stems, been separated) yet.
    audio(seconds: number, count: number, stems: boolean): Float32Array<ArrayBuffer>[] | null {
      const song = slice(seconds, count)
      if (!song) return null
      if (!stems) return [song.l, song.r]
      const a = Math.round(seconds * SAMPLE_RATE)
      const vl = new Float32Array(count), vr = new Float32Array(count)
      for (let k = Math.floor(a / SEGMENT); k * SEGMENT < a + count; k++) {
        const v = vocals.get(k)
        const from = Math.max(a, k * SEGMENT), to = Math.min(a + count, (k + 1) * SEGMENT)
        if (!v || v.validFrom > from) return null
        vl.set(v.l.subarray(from - k * SEGMENT, to - k * SEGMENT), from - a)
        vr.set(v.r.subarray(from - k * SEGMENT, to - k * SEGMENT), from - a)
      }
      for (let i = 0; i < count; i++) {
        song.l[i] -= vl[i]
        song.r[i] -= vr[i]
      }
      return [song.l, song.r, vl, vr]
    },
    // The cues' times: the vocals around them are separated and kept (see PIN_AFTER_SECONDS).
    setPinned(times: readonly number[]) {
      pins = times
      tick()
    },
    segmentAt,
    segmentStart: (k: number) => (k * SEGMENT) / SAMPLE_RATE,
    duration: () => length / SAMPLE_RATE, // the song's length in seconds, 0 until known
    setStorage(next: Storage) {
      storage = next
      tick()
    },
    setSlowdown(factor: number) {
      slowdown = factor
      worker?.postMessage({ type: 'slowdown', factor })
    },
    // Numbers for the playground's test panel.
    debug() {
      const playhead = getPlayhead()
      const at = playhead * SAMPLE_RATE
      const range = received.find(([a, b]) => a <= at && b > at)
      let k = segmentAt(playhead)
      while (vocals.has(k)) k++
      return {
        status,
        backend,
        downloadedAhead: range ? (range[1] - at) / SAMPLE_RATE : 0,
        separatedAhead: Math.max(0, (k * SEGMENT - at) / SAMPLE_RATE),
        separatedSeconds: (vocals.size * SEGMENT) / SAMPLE_RATE,
        memoryMB: (vocals.size * SEGMENT * 2 * 4) / 1e6, // the separated vocals
        songMB: (length * 2 * 4) / 1e6, // the song's original audio, kept whole (both channels)
        segmentSpeed: lastSegmentMs ? SEGMENT / SAMPLE_RATE / (lastSegmentMs / 1000) : 0, // × faster than playback
      }
    },
  }
}
