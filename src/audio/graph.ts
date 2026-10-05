// The sound path between an audio/video element and the speakers. Two routes, crossfaded:
//   original:  element → pitch shifter → duck → analyser → speakers
//   separated: separated audio (instrumental + vocals) → stem player → mixer → volume → duck → analyser → speakers
// The separated route is used while Vocals is below 100 and the audio at the playhead has been
// separated (see separation/engine.ts). The stem player is the same library as the pitch shifter,
// playing the separated audio at the element's speed and key, kept in step with its clock.
// The pitch shifter delays the sound by 0.12 s, so at Pitch 0 the original route goes around it.
// Cue pads (cue-pads.ts) play straight to the analyser: a cue key plays its pad at once while the duck
// silences the element, which jumps to the cue meanwhile; once it plays there too, it takes over.
// The analyser measures what you hear (for the spectrum) without changing it.

import SignalsmithStretch, { type StretchNode } from 'signalsmith-stretch'
import { createCuePads } from './cue-pads'
import type { SeparationEngine } from './separation/engine'
import { SAMPLE_RATE, SEGMENT } from './separation/mdx'

const SEGMENT_SECONDS = SEGMENT / SAMPLE_RATE

// Spectrum tuning (about sound, not visuals).
// Bands are spread between these frequencies the way we hear pitch (evenly per octave).
const SPECTRUM_LOW_HZ = 60
const SPECTRUM_HIGH_HZ = 14000
// Fixed loudness scale: at or below QUIET a band is empty, at LOUD it's full. Tune by eye.
const SPECTRUM_QUIET_DB = -60
const SPECTRUM_LOUD_DB = -24
// Music has far more energy in the bass; this lifts higher bands so the right side isn't empty.
const SPECTRUM_TILT_DB_PER_OCTAVE = 3
// How much the analyser averages over time (0–1). Lower reacts faster to beats.
const SPECTRUM_SMOOTHING = 0.6

// Switching between the original and separated routes.
const CROSSFADE_SECONDS = 0.03 // time constant of the fade (≈ 3× this to finish)
const SWITCH_AHEAD_SECONDS = 0.08 // start the stem player this far ahead, so it's running when faded in
// Keeping the separated audio in step with the element: resync when they drift further apart than this.
// (The stem player reports its position with a small lag, so drift is measured against a baseline
// taken shortly after each sync, not against zero.)
const MAX_DRIFT_SECONDS = 0.08
const BASELINE_AFTER_SECONDS = 0.5
// Switch to the separated route only once this much is separated ahead of the playhead. After a jump,
// the next part may still be waiting for the page to download it; switching as soon as the first bit
// was ready made the vocals come back for a moment. Once switched, the current moment is enough.
const READY_AHEAD_TO_SWITCH_SECONDS = 10
// Stop using the separated route this close to the end of what's been separated.
const RUN_END_MARGIN_SECONDS = 0.3
// The stem player forgets audio this far behind what it's playing (the engine keeps its own copy).
const STEM_KEEP_BEHIND_SECONDS = 10

// Cue pads (time constants of fades are ≈ ⅓ of how long they take).
const PAD_FADE_IN_SECONDS = 0.001 // a pad starts mid-song; a tiny fade avoids a click
const DUCK_SECONDS = 0.002 // the element's sound going quiet when a pad starts
// pad → element crossfade. Long enough (~30 ms) that the few ms the element lands off by after a jump
// can't be heard.
const HANDOFF_FADE_SECONDS = 0.01
const HANDOFF_CHECK_MS = 10 // how often to check whether the element has caught up
const HANDOFF_SETTLE_SECONDS = 0.1 // after the element's jump, let its playback settle before comparing
const HANDOFF_REAIM_SECONDS = 0.02 // jump the element again if it's further than this from the pad (song time)…
const HANDOFF_MAX_REAIMS = 2 // …at most this often per press
const FIRST_SEEK_DELAY_SECONDS = 0.02 // how long the element takes to play again after a jump; then learned
// The element's sound reaches the sound path this long after its reported time (Chrome's own buffering).
// Measured in the playground by recording the output and matching it against the song: 23–25 ms.
const ELEMENT_OUTPUT_DELAY_SECONDS = 0.024

export type WhenNotReady = 'fade' | 'pause' // fade: keep playing with vocals, fade them down once ready; pause: wait

export type SoundPath = {
  start: () => void // call when playback starts; must follow a click the first time
  setSemitones: (semitones: number) => void // key change; 0 = original key
  setVocals: (amount: number) => void // 1 = vocals as released, 0 = none
  setWhenNotReady: (behavior: WhenNotReady) => void
  newTrack: () => void // a different song: stop playing separated audio of the previous one
  setCues: (cues: readonly (number | null)[]) => void // the song's cue times, so their pads get made
  // Plays a cue's pad now and jumps the element there behind it. False if its pad isn't ready (or
  // the element is paused): then just jump the element.
  playCue: (slot: number) => boolean
  debugCues: () => Record<string, number | string>
  heardTime: () => number // the song time you're hearing right now (behind the element's reported time)
  route: () => 'original' | 'separated' // which one is playing (for the test panel)
  isPlayingSong: () => boolean // false while something else (e.g. an ad) plays in the element
  readSpectrum: (bands: number) => number[] // one 0–1 value per band, low to high
  latency: () => number | null // seconds the pitch shifter delays the sound, once known
}

const clamp = (n: number) => Math.min(1, Math.max(0, n))

// The element's length must be within this of the separated song's to count as playing it.
const SAME_LENGTH_SECONDS = 1

// engine: where separated audio comes from; null when vocal separation isn't available.
// onRouteChange: called when switching between the original and separated routes.
// isInterruption: true while something else plays in the element (e.g. a YouTube ad).
export function createSoundPath(media: HTMLMediaElement, engine: SeparationEngine | null, onRouteChange: () => void, isInterruption = () => false): SoundPath {
  let context: AudioContext | null = null
  let source: MediaElementAudioSourceNode | null = null
  let analyser: AnalyserNode | null = null
  let shifter: StretchNode | null = null
  let stems: StretchNode | null = null
  let originalGain: GainNode | null = null
  let direct: GainNode | null = null // original route around the pitch shifter (at Pitch 0)…
  let shifted: GainNode | null = null // …and through it
  let throughShifter = false
  let separatedGain: GainNode | null = null
  let duck: GainNode | null = null // the element's sound (both routes); silenced while a cue pad plays
  let padVolume: GainNode | null = null // the element's volume, applied to cue pads
  // The element's own volume (e.g. YouTube's volume slider and loudness normalisation) already applies
  // to the original route; the separated route plays our copy of the audio, so it's applied here too.
  let elementVolume: GainNode | null = null
  const volumeOf = () => (media.muted ? 0 : media.volume)
  let vocalsGain: GainNode | null = null
  let semitones = 0
  let vocals = 1
  let whenNotReady: WhenNotReady = 'fade'
  let route: 'original' | 'separated' = 'original'
  let heldForVocals = false // paused by us while the vocals get ready
  let latencySeconds: number | null = null
  let frequencies: Float32Array<ArrayBuffer> | null = null

  // Cue pads, and the one playing (if any).
  const pads = engine ? createCuePads(engine, () => ({ semitones, rate: media.playbackRate, stems: vocals < 1 })) : null
  type Voice = {
    source: AudioBufferSourceNode
    gain: GainNode
    vocals: GainNode | null
    cue: number
    rate: number
    startedAt: number // audio-context time the pad's cue moment played
    end: number // audio-context time the pad runs out
    expectSeek: boolean // a jump of ours is on its way (any other jump is the listener's)
    seekedAt: number | null // audio-context time the element finished its latest jump
    reaims: number
    timer: ReturnType<typeof setInterval>
  }
  let voice: Voice | null = null
  let seekDelay = FIRST_SEEK_DELAY_SECONDS
  let lastHandoff: { behindMs: number; reaims: number; afterMs: number } | null = null // for checks

  // What the stem player holds, in one unbroken run: `origin` is the song time of its position 0;
  // it has audio for song times `from` to `end`; `next` is the next segment to add.
  let run: { origin: number; from: number; end: number; next: number } | null = null
  let syncedAt = 0 // audio-context time of the last sync
  let baseline: number | null = null // drift measured just after the last sync

  // Browsers only allow audio processing after a user action (a click on the page, or a site the
  // browser trusts to autoplay). Once the element is routed through the context there's no way
  // back, and a context that isn't running is silent, so the element is only routed once it runs.
  const connect = () => {
    const ctx = context!
    analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = SPECTRUM_SMOOTHING
    frequencies = new Float32Array(analyser.frequencyBinCount)
    analyser.connect(ctx.destination)
    duck = ctx.createGain()
    duck.connect(analyser)
    padVolume = ctx.createGain()
    padVolume.gain.value = volumeOf()
    padVolume.connect(analyser)
    media.addEventListener('volumechange', () => padVolume!.gain.setTargetAtTime(volumeOf(), ctx.currentTime, CROSSFADE_SECONDS))

    // Original route. Sound goes around the pitch shifter at first, so playback starts instantly…
    source = ctx.createMediaElementSource(media)
    originalGain = ctx.createGain()
    direct = ctx.createGain()
    source.connect(originalGain).connect(direct).connect(duck)

    // …and the pitch shifter is added alongside as soon as it has loaded (a fraction of a second). It
    // keeps running at Pitch 0 too, so its sound is ready the moment the key changes.
    SignalsmithStretch(ctx)
      .then((node) => {
        shifter = node
        void node.schedule({ active: true, semitones })
        shifted = ctx.createGain()
        shifted.gain.value = 0
        originalGain!.connect(node).connect(shifted).connect(duck!)
        void node.latency().then((seconds) => (latencySeconds = seconds))
        chooseShifter()
      })
      .catch((error) => console.warn('[sound] pitch shifter unavailable, playing without it:', error))

    // Separated route: a 4-channel stem player (instrumental left/right, vocals left/right) and a mixer.
    if (!engine) return
    separatedGain = ctx.createGain()
    separatedGain.gain.value = 0
    vocalsGain = ctx.createGain()
    vocalsGain.gain.value = vocals
    elementVolume = ctx.createGain()
    elementVolume.gain.value = volumeOf()
    separatedGain.connect(elementVolume).connect(duck)
    media.addEventListener('volumechange', () => elementVolume!.gain.setTargetAtTime(volumeOf(), ctx.currentTime, CROSSFADE_SECONDS))
    SignalsmithStretch(ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [4] })
      .then((node) => {
        stems = node
        node.onprocessorerror = (event) => console.warn('[sound] stem player stopped after an error:', (event as ErrorEvent).message, 'at', ctx.currentTime.toFixed(2))
        const split = ctx.createChannelSplitter(4)
        const instrumental = ctx.createChannelMerger(2)
        const voice = ctx.createChannelMerger(2)
        node.connect(split)
        split.connect(instrumental, 0, 0)
        split.connect(instrumental, 1, 1)
        split.connect(voice, 2, 0)
        split.connect(voice, 3, 1)
        instrumental.connect(separatedGain!)
        voice.connect(vocalsGain!).connect(separatedGain!)
        node.setUpdateInterval(0.1)
        update()
      })
      .catch((error) => console.warn('[sound] stem player unavailable:', error))
  }

  // Whether the element is playing the song that was separated, and not e.g. an ad (which plays in
  // the same element, from 0:00, so the separated song would otherwise play over it).
  const isPlayingSong = () => {
    if (!engine || isInterruption()) return false
    const length = engine.duration()
    return length === 0 || !Number.isFinite(media.duration) || Math.abs(media.duration - length) <= SAME_LENGTH_SECONDS
  }

  // Where in the song the original route is audible right now: behind the element's reported time by
  // its own buffering, and through the shifter, by the shifter's delay too.
  // (The library reports 0.12 s; confirmed by passing clicks through it at several keys.)
  const shifterDelay = () => (throughShifter ? (latencySeconds ?? 0) : 0)
  const audibleTime = () => media.currentTime - (ELEMENT_OUTPUT_DELAY_SECONDS + shifterDelay()) * media.playbackRate

  // At Pitch 0 the original route goes around the pitch shifter (no delay); otherwise through it.
  // Switching skips or repeats the shifter's delay (~0.12 s) once, softened by a crossfade.
  function chooseShifter() {
    const use = shifter !== null && semitones !== 0
    if (use === throughShifter || !context || !direct || !shifted) return
    throughShifter = use
    direct.gain.setTargetAtTime(use ? 0 : 1, context.currentTime, CROSSFADE_SECONDS)
    shifted.gain.setTargetAtTime(use ? 1 : 0, context.currentTime, CROSSFADE_SECONDS)
    if (route === 'separated') sync() // the separated route follows what's audible, which just moved
  }

  // Cue pads. Where the pad is in the song at audio-context time t.
  const padTime = (v: Voice, t: number) => v.cue + (t - v.startedAt) * v.rate

  // Jumps the element to where the pad will be once the element plays again, so they meet.
  function seekBehindPad(v: Voice) {
    if (!context) return
    v.expectSeek = true
    v.seekedAt = null
    media.currentTime = padTime(v, context.currentTime) + (seekDelay + ELEMENT_OUTPUT_DELAY_SECONDS + shifterDelay()) * v.rate
  }

  // Stops a pad. handOver: the element's sound comes back (crossfaded); otherwise another pad follows.
  function endVoice(handOver: boolean) {
    if (!voice || !context) return
    const v = voice
    voice = null
    clearInterval(v.timer)
    const now = context.currentTime
    const fade = handOver ? HANDOFF_FADE_SECONDS : DUCK_SECONDS
    v.gain.gain.setTargetAtTime(0, now, fade)
    v.source.stop(now + 10 * fade)
    if (handOver && duck) duck.gain.setTargetAtTime(1, now, HANDOFF_FADE_SECONDS)
  }

  // While a pad plays: hand over to the element once it plays the same moment (jumping it again if
  // it's clearly off), or straight away if something else happens (paused, speed change, an ad…).
  function checkVoice() {
    if (!voice || !context) return
    const v = voice
    const now = context.currentTime
    if (media.paused || isInterruption() || media.playbackRate !== v.rate) return endVoice(true)
    const runningOut = now > v.end - 2 * HANDOFF_FADE_SECONDS
    const waiting = v.seekedAt === null || media.seeking || media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || now < v.seekedAt + HANDOFF_SETTLE_SECONDS + shifterDelay()
    // With vocals turned down, wait for the separated sound too, so the vocals don't come back for a moment.
    const vocalsPending = engine !== null && vocals < 1 && engine.status() !== 'unavailable' && route !== 'separated'
    if ((waiting || vocalsPending) && !runningOut) return
    const behind = padTime(v, now) - audibleTime() // song seconds the element is behind the pad
    if (!waiting) seekDelay = Math.min(0.5, Math.max(0, seekDelay + behind / v.rate)) // learn how long jumps take here
    if (!waiting && Math.abs(behind) > HANDOFF_REAIM_SECONDS && v.reaims < HANDOFF_MAX_REAIMS && now < v.end - 1) {
      v.reaims++
      seekBehindPad(v)
      return
    }
    lastHandoff = { behindMs: Math.round(behind * 10000) / 10, reaims: v.reaims, afterMs: Math.round((now - v.startedAt) * 1000) }
    endVoice(true)
  }

  media.addEventListener('seeking', () => {
    if (!voice) return
    if (voice.expectSeek) voice.expectSeek = false
    else endVoice(true) // the listener jumped somewhere else
  })
  media.addEventListener('seeked', () => {
    if (voice && context) voice.seekedAt = context.currentTime
  })
  media.addEventListener('emptied', () => endVoice(true))

  // Points the stem player at the element's position, speed and key.
  function sync(ahead = 0) {
    if (!stems || !context || !run) return
    syncedAt = context.currentTime
    baseline = null
    void stems.schedule({
      active: !media.paused,
      input: audibleTime() + ahead * media.playbackRate - run.origin,
      rate: media.playbackRate,
      semitones,
      output: context.currentTime + ahead,
    })
  }

  // Starts a new run at the segment under the playhead, then adds what follows.
  function startRun(segment: number) {
    if (!stems || !engine) return
    void stems.dropBuffers()
    const start = engine.segmentStart(segment)
    run = { origin: start, from: start, end: start, next: segment }
    extendRun()
  }

  // Adds separated segments that continue the current run.
  function extendRun() {
    if (!stems || !engine || !run) return
    for (let buffers = engine.stems(run.next); buffers; buffers = engine.stems(run.next)) {
      void stems.addBuffers(buffers)
      run.end += buffers[0].length / (context?.sampleRate ?? 44100)
      run.next++
    }
  }

  function fadeTo(next: 'original' | 'separated', at: number) {
    if (!context || !originalGain || !separatedGain || next === route) return
    route = next
    onRouteChange()
    originalGain.gain.setTargetAtTime(next === 'original' ? 1 : 0, at, CROSSFADE_SECONDS)
    separatedGain.gain.setTargetAtTime(next === 'separated' ? 1 : 0, at, CROSSFADE_SECONDS)
    if (next === 'original' && stems) void stems.schedule({ active: false, output: at + 4 * CROSSFADE_SECONDS })
  }

  // Decides which route plays. Runs on media events, engine changes and a timer.
  function update() {
    if (!context || !source || !engine) return
    const wanted = vocals < 1 && stems !== null && isPlayingSong()
    if (!wanted) {
      fadeTo('original', context.currentTime)
      if (heldForVocals) resume()
      return
    }
    const time = audibleTime()
    const inRun = () => run !== null && time >= run.from && time < run.end - RUN_END_MARGIN_SECONDS && engine.isReady(time)
    let covered = inRun()
    if (!covered && engine.isReady(time)) {
      startRun(engine.segmentAt(time))
      covered = inRun()
    }
    extendRun()

    if (covered && route === 'original' && !engine.isReady(time, READY_AHEAD_TO_SWITCH_SECONDS)) covered = false
    if (covered) {
      if (route === 'original') {
        sync(SWITCH_AHEAD_SECONDS)
        fadeTo('separated', context.currentTime + SWITCH_AHEAD_SECONDS)
      }
      if (heldForVocals) resume()
    } else {
      fadeTo('original', context.currentTime)
      if (whenNotReady === 'pause' && !media.paused) {
        heldForVocals = true
        media.pause()
      }
    }
  }

  const resume = () => {
    heldForVocals = false
    void media.play().catch(() => {})
  }

  // Keeps the stem player in step: on jumps, speed changes, play/pause, and when it drifts.
  const resync = () => {
    update()
    if (route === 'separated') sync()
  }
  // (A new source, e.g. an ad, is noticed as soon as it loads: 'emptied', 'durationchange'.)
  ;['play', 'pause', 'seeked', 'ratechange', 'emptied', 'durationchange'].forEach((event) => media.addEventListener(event, resync))
  setInterval(() => {
    pads?.refresh()
    update()
    if (route !== 'separated' || !stems || !run || !context || media.paused) return
    if (context.currentTime - syncedAt < BASELINE_AFTER_SECONDS) return
    // Free what's well behind.
    const keepFrom = stems.inputTime - STEM_KEEP_BEHIND_SECONDS
    if (keepFrom > run.from - run.origin + SEGMENT_SECONDS) {
      const current = run
      void stems.dropBuffers(keepFrom).then((extent) => {
        if (run === current && extent && typeof extent === 'object' && 'start' in extent) current.from = current.origin + (extent as { start: number }).start
      })
    }
    const drift = stems.inputTime - (audibleTime() - run.origin)
    if (baseline === null) baseline = drift
    else if (Math.abs(drift - baseline) > MAX_DRIFT_SECONDS) sync()
  }, 200)

  return {
    start: () => {
      if (!context) {
        // At the separation model's sample rate, so the separated audio plays at the right pitch and
        // speed (the browser converts to the speakers' rate, usually 48 kHz, on the way out).
        const ctx = (context = new AudioContext({ sampleRate: SAMPLE_RATE }))
        const connectOnceRunning = () => {
          if (ctx.state !== 'running' || source) return
          ctx.removeEventListener('statechange', connectOnceRunning)
          connect()
        }
        ctx.addEventListener('statechange', connectOnceRunning)
        connectOnceRunning()
      }
      // Ask to run (allowed after a click); the element is routed once it does.
      if (context.state === 'suspended') void context.resume()
      engine?.tick()
    },
    setSemitones: (value) => {
      semitones = value
      // If a node isn't ready yet, it picks up the value when it is.
      if (shifter) void shifter.schedule({ semitones })
      if (stems && route === 'separated') sync()
      chooseShifter()
      endVoice(true) // a playing pad has the old key
    },
    setVocals: (value) => {
      vocals = value
      if (vocals < 1) engine?.activate()
      if (context && vocalsGain) vocalsGain.gain.setTargetAtTime(vocals, context.currentTime, CROSSFADE_SECONDS)
      if (context && voice?.vocals) voice.vocals.gain.setTargetAtTime(vocals, context.currentTime, CROSSFADE_SECONDS)
      update()
    },
    setWhenNotReady: (behavior) => {
      whenNotReady = behavior
      update()
    },
    newTrack: () => {
      endVoice(true)
      pads?.clear()
      run = null
      if (stems) void stems.dropBuffers()
      if (context) fadeTo('original', context.currentTime)
      update()
    },
    setCues: (cues) => pads?.setCues(cues),
    playCue: (slot) => {
      const ctx = context
      if (!ctx || ctx.state !== 'running' || !padVolume || !duck || media.paused || !isPlayingSong()) return false
      const pad = pads?.get(slot)
      if (!pad) return false
      endVoice(false)
      const now = ctx.currentTime
      const source = new AudioBufferSourceNode(ctx, { buffer: pad.buffer })
      const gain = ctx.createGain()
      gain.gain.value = 0
      gain.gain.setTargetAtTime(1, now, PAD_FADE_IN_SECONDS)
      let vocalsNode: GainNode | null = null
      if (pad.stems) {
        // Instrumental + vocals, mixed at the current Vocals amount (as on the separated route).
        const split = ctx.createChannelSplitter(4)
        const instrumental = ctx.createChannelMerger(2)
        const voiceMerger = ctx.createChannelMerger(2)
        source.connect(split)
        split.connect(instrumental, 0, 0)
        split.connect(instrumental, 1, 1)
        split.connect(voiceMerger, 2, 0)
        split.connect(voiceMerger, 3, 1)
        vocalsNode = ctx.createGain()
        vocalsNode.gain.value = vocals
        instrumental.connect(gain)
        voiceMerger.connect(vocalsNode).connect(gain)
      } else source.connect(gain)
      gain.connect(padVolume)
      source.start(now, pad.offset)
      duck.gain.cancelScheduledValues(now)
      duck.gain.setTargetAtTime(0, now, DUCK_SECONDS)
      const v: Voice = {
        source, gain, vocals: vocalsNode, cue: pad.cue, rate: pad.rate, startedAt: now,
        end: now + pad.buffer.duration - pad.offset, expectSeek: false, seekedAt: null, reaims: 0,
        timer: setInterval(checkVoice, HANDOFF_CHECK_MS),
      }
      voice = v
      seekBehindPad(v)
      return true
    },
    debugCues: () => ({
      pads: pads?.debug() ?? 'none',
      seekDelayMs: Math.round(seekDelay * 1000),
      lastHandoff: lastHandoff ? JSON.stringify(lastHandoff) : '',
      throughShifter: String(throughShifter),
      sampleRate: context?.sampleRate ?? 0,
    }),
    // What's audible, minus the speakers' own delay (Chrome reports it; more with Bluetooth).
    heardTime: () => (context && source ? audibleTime() - (context.outputLatency || 0) * media.playbackRate : media.currentTime),
    route: () => route,
    isPlayingSong,
    readSpectrum: (bands) => {
      if (!context || !analyser || !frequencies) return new Array<number>(bands).fill(0)
      analyser.getFloatFrequencyData(frequencies) // loudness in dB for each narrow frequency slot
      const hzPerSlot = context.sampleRate / analyser.fftSize
      const ratio = SPECTRUM_HIGH_HZ / SPECTRUM_LOW_HZ

      return Array.from({ length: bands }, (_, band) => {
        const low = SPECTRUM_LOW_HZ * ratio ** (band / bands)
        const high = SPECTRUM_LOW_HZ * ratio ** ((band + 1) / bands)
        const first = Math.floor(low / hzPerSlot)
        const last = Math.max(first + 1, Math.ceil(high / hzPerSlot))

        // The loudest slot in the band decides its height.
        let db = -Infinity
        for (let i = first; i < last && i < frequencies!.length; i++) db = Math.max(db, frequencies![i])

        db += SPECTRUM_TILT_DB_PER_OCTAVE * Math.log2(Math.sqrt(low * high) / 1000)
        return clamp((db - SPECTRUM_QUIET_DB) / (SPECTRUM_LOUD_DB - SPECTRUM_QUIET_DB))
      })
    },
    latency: () => latencySeconds,
  }
}
