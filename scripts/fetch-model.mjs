// Makes sure the vocal model is in public/models/ (it isn't in git: too big). Downloads it from
// Ultimate Vocal Remover's official release if missing, and checks it's the exact file we tested.
// Run by `npm run build:demo` (so a fresh copy of the project, e.g. Netlify's, can build the demo)
// and by the extension build (scripts/build-extension.mjs).
// The app itself names the same file in src/audio/separation/mdx.ts (MODEL_FILE); keep them in step.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const MODEL_FILE = 'UVR_MDXNET_1_9703.onnx'
export const MODEL_PATH = `public/models/${MODEL_FILE}`
const URL = `https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/${MODEL_FILE}`
const SHA256 = '229ad3bb96a037e89d8ed86732d6d3675856e6a07c3e3f02896eac01ec7ee4be'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

export async function ensureModel() {
  if (existsSync(MODEL_PATH) && sha(readFileSync(MODEL_PATH)) === SHA256) {
    console.log(`Model already here: ${MODEL_PATH}`)
    return
  }
  console.log(`Downloading the vocal model from ${URL} …`)
  const response = await fetch(URL)
  if (!response.ok) throw new Error(`Model download failed: ${response.status} ${response.statusText}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (sha(bytes) !== SHA256) throw new Error('The downloaded model is not the expected file (fingerprint differs). Stopping.')
  mkdirSync('public/models', { recursive: true })
  writeFileSync(MODEL_PATH, bytes)
  console.log(`Model saved: ${MODEL_PATH} (${(bytes.length / 1e6).toFixed(1)} MB)`)
}

// Run directly: node scripts/fetch-model.mjs
if (import.meta.url === pathToFileURL(process.argv[1]).href) await ensureModel()
