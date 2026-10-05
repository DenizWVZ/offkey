// The vocal separation model: MDX-Net "UVR 1" (UVR_MDXNET_1_9703, Ultimate Vocal Remover community),
// picked in a model comparison (see docs/history.md) as fast and light with no audible loss against
// heavier models.
// It works on ~6 s chunks of sound turned into frequencies, and outputs the vocals' frequencies.
// Settings from UVR's model_data.json.

import type * as Ort from 'onnxruntime-web'
import { reflectPad, stereoIstft, stereoStft, type StereoSpectrum } from './fft'

// Where the app loads the model from. The scripts name the same file in scripts/fetch-model.mjs.
export const MODEL_FILE = '/models/UVR_MDXNET_1_9703.onnx'
export const SAMPLE_RATE = 44100

const N_FFT = 6144
const DIM_F = 2048 // frequency slots the model sees (up to ~14.7 kHz; above that counts as instrumental)
const DIM_T = 256 // time frames per chunk
const HOP = 1024
const COMPENSATE = 1.03 // the model's vocals come out slightly quiet

// Samples the model reads per chunk, and how many of them come out usable: the edges are thrown away.
export const CHUNK = HOP * (DIM_T - 1)
export const EDGE = N_FFT / 2
export const SEGMENT = CHUNK - 2 * EDGE // 254,976 samples ≈ 5.8 s

// Separates one segment. `l` and `r` are CHUNK samples: EDGE before the segment, the segment, EDGE after.
// Returns the segment's vocals (SEGMENT samples per channel).
export async function separateSegment(ort: typeof Ort, session: Ort.InferenceSession, l: Float32Array, r: Float32Array) {
  const spec = stereoStft(reflectPad(l, N_FFT / 2, N_FFT / 2), reflectPad(r, N_FFT / 2, N_FFT / 2), N_FFT, HOP, DIM_F)
  const input = new Float32Array(4 * DIM_F * DIM_T)
  const parts = [spec.lRe, spec.lIm, spec.rRe, spec.rIm]
  for (let ch = 0; ch < 4; ch++) for (let f = 0; f < DIM_F; f++) for (let t = 0; t < DIM_T; t++) input[ch * DIM_F * DIM_T + f * DIM_T + t] = parts[ch][t * DIM_F + f]

  const result = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 4, DIM_F, DIM_T]) })
  const output = (await result[session.outputNames[0]].getData()) as Float32Array

  const out: StereoSpectrum = { lRe: new Float32Array(DIM_T * DIM_F), lIm: new Float32Array(DIM_T * DIM_F), rRe: new Float32Array(DIM_T * DIM_F), rIm: new Float32Array(DIM_T * DIM_F), frames: DIM_T, bins: DIM_F }
  const outParts = [out.lRe, out.lIm, out.rRe, out.rIm]
  for (let ch = 0; ch < 4; ch++) for (let f = 0; f < DIM_F; f++) for (let t = 0; t < DIM_T; t++) outParts[ch][t * DIM_F + f] = output[ch * DIM_F * DIM_T + f * DIM_T + t]
  const wave = stereoIstft(out, N_FFT, HOP, CHUNK + N_FFT)
  const from = N_FFT / 2 + EDGE
  return {
    l: wave.l.slice(from, from + SEGMENT).map((x) => x * COMPENSATE),
    r: wave.r.slice(from, from + SEGMENT).map((x) => x * COMPENSATE),
  }
}
