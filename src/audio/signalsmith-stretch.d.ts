// Type descriptions for the signalsmith-stretch library, which doesn't ship its own.
// Only the parts we use. See node_modules/signalsmith-stretch/README.md.
declare module 'signalsmith-stretch' {
  export type StretchChange = {
    output?: number // audio-context time for the change
    active?: boolean // processing audio
    input?: number // buffer mode: position in the added buffers, seconds
    rate?: number // buffer mode: playback speed, 1 = normal
    semitones?: number // pitch shift
    tonalityHz?: number
    formantCompensation?: boolean
    formantSemitones?: number
    formantBaseHz?: number
  }

  export type StretchNode = AudioWorkletNode & {
    start: (when?: number) => Promise<unknown>
    stop: (when?: number) => Promise<unknown>
    schedule: (change: StretchChange) => Promise<unknown>
    latency: () => Promise<number> // seconds of delay when processing live input
    inputTime: number // buffer mode: current position in the added buffers, seconds
    setUpdateInterval: (seconds: number, callback?: (inputTime: number) => void) => void
    addBuffers: (channels: Float32Array[]) => Promise<number> // buffer mode: append audio, one array per channel
    dropBuffers: (toSeconds?: number) => Promise<unknown> // buffer mode: forget all (or earlier) audio
  }

  const SignalsmithStretch: ((context: BaseAudioContext, options?: AudioWorkletNodeOptions) => Promise<StretchNode>) & {
    // Where the audio thread loads the library from. Unset, it builds a temporary in-memory file,
    // which pages with strict security rules (e.g. YouTube) block.
    moduleUrl?: string
  }
  export default SignalsmithStretch
}
