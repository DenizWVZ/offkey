// Runs the separation model on a background thread, so the page never stutters.
// Messages in:
//   { type: 'load', slowdown }            download the model and get it ready
//   { type: 'separate', segment, l, r }   separate one segment (CHUNK samples per channel, see mdx.ts)
//   { type: 'slowdown', factor }          testing: take this many times longer, like a slower computer
// Messages out:
//   { type: 'loaded', backend, ms } | { type: 'error', message }
//   { type: 'separated', segment, l, r, ms }

import * as ort from 'onnxruntime-web/webgpu'
import { MODEL_FILE, separateSegment } from './mdx'

// Where the model runtime's own files are served from: the playground's dev server. (Built versions,
// like the extension, bundle them next to this file and find them on their own.)
if (import.meta.env.DEV && location.protocol !== 'chrome-extension:') ort.env.wasm.wasmPaths = '/node_modules/onnxruntime-web/dist/'

let session: ort.InferenceSession | null = null
let slowdown = 1
const scope = self as unknown as { postMessage: (message: unknown, transfer?: Transferable[]) => void; onmessage: ((event: MessageEvent) => void) | null }

async function load() {
  const start = performance.now()
  const bytes = await (await fetch(MODEL_FILE)).arrayBuffer()
  // The graphics chip if the browser offers it, otherwise the processor.
  const problems: string[] = []
  for (const backend of ['webgpu', 'wasm']) {
    try {
      session = await ort.InferenceSession.create(bytes, { executionProviders: [backend], graphOptimizationLevel: 'all' })
      return { backend, ms: Math.round(performance.now() - start) }
    } catch (error) {
      console.warn(`[separation] ${backend} unavailable:`, error)
      problems.push(`${backend}: ${String((error as Error)?.message ?? error).slice(0, 300)}`)
    }
  }
  throw new Error(`no way to run the model on this device (${problems.join(' | ')})`)
}

scope.onmessage = async (event) => {
  const message = event.data
  try {
    if (message.type === 'load') {
      slowdown = message.slowdown ?? 1
      scope.postMessage({ type: 'loaded', ...(await load()) })
    } else if (message.type === 'slowdown') {
      slowdown = message.factor
    } else if (message.type === 'separate') {
      if (!session) throw new Error('model not loaded')
      const start = performance.now()
      const vocals = await separateSegment(ort, session, message.l, message.r)
      const took = performance.now() - start
      if (slowdown > 1) await new Promise((resolve) => setTimeout(resolve, took * (slowdown - 1)))
      scope.postMessage({ type: 'separated', segment: message.segment, l: vocals.l, r: vocals.r, ms: Math.round(performance.now() - start) }, [vocals.l.buffer, vocals.r.buffer])
    }
  } catch (error) {
    scope.postMessage({ type: 'error', message: String((error as Error)?.message ?? error) })
  }
}
