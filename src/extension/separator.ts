// Runs inside the vocals frame (separator.html). Starts the separation worker (the same worker.ts as
// the playground) and relays messages between it and the widget script, which connects with a
// message channel (see frame-separator.ts).

const worker = new Worker(new URL('../audio/separation/worker.ts', import.meta.url), { type: 'module' })

// Audio in messages is handed over rather than copied.
const transfersOf = (message: Record<string, unknown>) =>
  Object.values(message ?? {}).flatMap((value) => (ArrayBuffer.isView(value) ? [value.buffer as ArrayBuffer] : []))

// Only the first connection is accepted: the widget script's, made as soon as this frame loads.
// Any later one (another script on the page) is ignored, so nothing else can use the model.
let connected = false

addEventListener('message', (event) => {
  const port = event.ports[0]
  if (connected || event.data?.type !== 'offkey-connect' || !port) return
  connected = true
  port.onmessage = (message) => worker.postMessage(message.data, transfersOf(message.data))
  worker.onmessage = (message) => port.postMessage(message.data, transfersOf(message.data))
})
