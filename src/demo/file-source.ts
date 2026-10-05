// Demo page only: gives vocal separation a song the visitor picked from their own computer.
// The whole file is decoded at once (unlike YouTube, where it arrives in pieces).

import type { AudioSource } from '../audio/player'
import { SAMPLE_RATE } from '../audio/separation/mdx'


type Callbacks = Parameters<AudioSource['start']>

export function createFileSource() {
  let callbacks: Callbacks | null = null
  let current = '' // the file being loaded; a newer pick wins

  const load = async (url: string) => {
    current = url
    if (!callbacks) return // start() will load it
    const [onAudio, onDuration] = callbacks
    const buffer = await new OfflineAudioContext(2, 1, SAMPLE_RATE).decodeAudioData(await (await fetch(url)).arrayBuffer())
    if (url !== current) return
    onDuration(buffer.duration)
    const l = buffer.getChannelData(0)
    const r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : l // mono: same on both sides
    onAudio(0, { l, r })
  }

  const source: AudioSource = {
    start(...next) {
      callbacks = next
      if (current) void load(current)
    },
  }

  return { source, load }
}
