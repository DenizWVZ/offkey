// Cue pads: for each cue, the first few seconds from that point, prepared ahead of time in the
// current key and speed, so a cue key can play it the instant it's pressed (graph.ts plays it and
// hands over to the page's own playback a moment later). Made from the copy of the song that vocal
// separation keeps (separation/engine.ts). With Vocals below 100 a pad holds the instrumental and the
// vocals separately (4 channels), so the Vocals amount is applied as it plays and needs no remake.

import SignalsmithStretch from 'signalsmith-stretch'
import type { SeparationEngine } from './separation/engine'
import { SAMPLE_RATE } from './separation/mdx'

// How much of the song a pad holds from its cue. The page's playback takes over well within this,
// unless it has to download that part first.
const PAD_SECONDS = 4
// Key or speed changes: made with the pitch library, which starts softly (it fades in over its own
// delay), so it starts this far before the cue and that part is skipped. (Checked with clicks: the
// prepared sound lands within ~1 ms of where it should at any key and speed.)
const PRE_ROLL_SECONDS = 0.25
// Wait for the key and speed to stay put this long before making pads (e.g. while dragging Speed).
const SETTLE_MS = 300

export type PadSettings = { semitones: number; rate: number; stems: boolean }

export type Pad = PadSettings & {
  cue: number // song time, seconds
  buffer: AudioBuffer // 2 channels, or 4 with stems (instrumental left/right, vocals left/right)
  offset: number // where the cue is in the buffer, seconds
}

const settingsKeyOf = (s: PadSettings) => `${s.semitones}|${s.rate.toFixed(3)}|${s.stems}`
const keyOf = (cue: number, s: PadSettings) => `${cue}|${settingsKeyOf(s)}`

export function createCuePads(engine: SeparationEngine, getSettings: () => PadSettings) {
  let cues: readonly (number | null)[] = []
  const pads = new Map<number, Pad & { key: string }>() // slot → its latest pad
  let rendering = false
  let turn = 0 // the cue slot to try first next time
  let settingsKey = ''
  let settledAt = 0
  let generation = 0 // bumped by clear(), so a pad finished for a previous song is thrown away

  async function render(cue: number, settings: PadSettings): Promise<Pad | null> {
    const { semitones, rate, stems } = settings
    // At the original key and speed, the song's own samples are used as they are.
    if (semitones === 0 && rate === 1) {
      const channels = engine.audio(cue, Math.round(PAD_SECONDS * SAMPLE_RATE), stems)
      if (!channels) return null
      const buffer = new AudioBuffer({ numberOfChannels: channels.length, length: channels[0].length, sampleRate: SAMPLE_RATE })
      channels.forEach((data, c) => buffer.copyToChannel(data, c))
      return { cue, semitones, rate, stems, buffer, offset: 0 }
    }
    const pre = Math.min(PRE_ROLL_SECONDS, cue)
    const channels = engine.audio(cue - pre, Math.round((pre + PAD_SECONDS) * SAMPLE_RATE), stems)
    if (!channels) return null
    const context = new OfflineAudioContext(channels.length, Math.ceil(channels[0].length / rate), SAMPLE_RATE)
    const node = await SignalsmithStretch(context, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [channels.length] })
    await node.addBuffers(channels)
    await node.schedule({ active: true, input: 0, output: 0, rate, semitones })
    node.connect(context.destination)
    const buffer = await context.startRendering()
    return { cue, semitones, rate, stems, buffer, offset: pre / rate }
  }

  // Makes the next missing pad, one at a time. Called often (graph.ts's timer); cheap when nothing's to do.
  function refresh() {
    const settings = getSettings()
    const key = settingsKeyOf(settings)
    if (key !== settingsKey) {
      settingsKey = key
      settledAt = performance.now() + SETTLE_MS
    }
    if (rendering || performance.now() < settledAt) return
    // Cues take turns, so one whose pad can't be made yet doesn't hold up the others.
    const slot = cues.map((_, i) => (turn + i) % cues.length).find((i) => cues[i] !== null && pads.get(i)?.key !== keyOf(cues[i]!, settings))
    if (slot === undefined) return
    turn = slot + 1
    const cue = cues[slot]!
    const wanted = keyOf(cue, settings)
    const current = generation
    rendering = true
    render(cue, settings)
      .then((pad) => {
        if (pad && current === generation && cues[slot] === cue) pads.set(slot, { ...pad, key: wanted })
      })
      .catch((error) => console.warn('[cue pads] could not make a pad:', error))
      .finally(() => (rendering = false))
  }

  return {
    setCues(next: readonly (number | null)[]) {
      cues = next
      for (const slot of [...pads.keys()]) if (pads.get(slot)!.cue !== cues[slot]) pads.delete(slot)
      refresh()
    },
    refresh,
    // The pad for a cue, if one is ready for the current key, speed and vocals.
    get(slot: number): Pad | null {
      const cue = cues[slot]
      const pad = pads.get(slot)
      return cue != null && pad?.key === keyOf(cue, getSettings()) ? pad : null
    },
    clear() {
      generation++
      pads.clear()
      cues = []
    },
    debug: () => [...pads.values()].map((p) => `${p.cue.toFixed(1)}s${p.semitones ? ` ${p.semitones}st` : ''}${p.rate !== 1 ? ` ×${p.rate}` : ''}${p.stems ? ' stems' : ''}`).join(', '),
  }
}
