// The audio tap. Runs inside YouTube's own page, before YouTube's code (see manifest.json). It reads
// the audio YouTube is already loading for playback and passes it, in memory, to vocal separation,
// so separation can work ahead of what's playing (YouTube loads 30–40 s ahead; B0 in docs/plan.md).
// Nothing is saved, exported or sent anywhere: the audio only lives in this tab's memory.
//
// YouTube plays through Media Source: it creates a MediaSource, points the video at it with a
// blob: address, adds one buffer for video and one for audio, and hands the audio to them in pieces.
// This file wraps those three steps to note which buffers are audio and read the pieces handed to them.
// The widget script asks for the audio once it starts ('hello'), gets what's held so far, and then
// each new piece as it arrives.
//
// Until the widget is first opened on this tab, only the current video's audio is held (an earlier
// video's is let go when a new one starts), up to KEEP_BYTES.
//
// Must stay self-contained (no imports): it's built as one plain script that runs at page start.

const CHANNEL = 'offkey-audio'
const KEEP_BYTES = 20_000_000 // ~20 minutes of YouTube audio (Vocals stop at 20 min); the oldest pieces go first

type Message =
  | { channel: typeof CHANNEL; type: 'source'; url: string; source: number }
  | { channel: typeof CHANNEL; type: 'append'; source: number; mime: string; offset: number; bytes: ArrayBuffer }

let nextSource = 1
const sourceIds = new WeakMap<MediaSource, number>()
const audioBuffers = new WeakMap<SourceBuffer, { source: number; mime: string }>()
let kept: Message[] = []
let keptBytes = 0
let listening = false

const idOf = (source: MediaSource) => {
  let id = sourceIds.get(source)
  if (id === undefined) sourceIds.set(source, (id = nextSource++))
  return id
}

const send = (message: Message) => {
  if (message.type === 'append') {
    kept.push(message)
    keptBytes += message.bytes.byteLength
    while (keptBytes > KEEP_BYTES && kept.length) {
      const old = kept.shift()!
      if (old.type === 'append') keptBytes -= old.bytes.byteLength
    }
  } else kept.push(message)
  if (listening) window.postMessage(message, '*')
}

// Which blob: address belongs to which MediaSource, so the widget can tell what the video is playing.
const createObjectURL = URL.createObjectURL
URL.createObjectURL = function (object: Blob | MediaSource) {
  const url = createObjectURL.call(URL, object)
  if (object instanceof MediaSource) send({ channel: CHANNEL, type: 'source', url, source: idOf(object) })
  return url
}

const addSourceBuffer = MediaSource.prototype.addSourceBuffer
MediaSource.prototype.addSourceBuffer = function (mime: string) {
  const buffer = addSourceBuffer.call(this, mime)
  if (mime.startsWith('audio/')) {
    const source = idOf(this)
    audioBuffers.set(buffer, { source, mime })
    // A new video's audio: before the widget has asked for anything, let go of earlier videos' audio.
    if (!listening) {
      kept = kept.filter((message) => message.source === source)
      keptBytes = kept.reduce((sum, message) => sum + (message.type === 'append' ? message.bytes.byteLength : 0), 0)
    }
  }
  return buffer
}

const appendBuffer = SourceBuffer.prototype.appendBuffer
SourceBuffer.prototype.appendBuffer = function (data: BufferSource) {
  const audio = audioBuffers.get(this)
  if (audio) {
    try {
      const view = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      send({ channel: CHANNEL, type: 'append', source: audio.source, mime: audio.mime, offset: this.timestampOffset, bytes: view.slice().buffer })
    } catch {
      // Never get in the way of YouTube's own playback.
    }
  }
  return appendBuffer.call(this, data)
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.channel !== CHANNEL || event.data.type !== 'hello') return
  listening = true
  for (const message of kept) window.postMessage(message, '*')
})
