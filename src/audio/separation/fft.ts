// Fast Fourier transform for any size made of 2s, 3s and 5s (e.g. 4096, 6144, 7680),
// plus the short-time transforms the separation models expect (matching PyTorch's torch.stft / istft).
// Used by the vocal separation model (mdx.ts).

export class FFT {
  readonly size: number
  private radices: number[] = []
  private cos: Float64Array
  private sin: Float64Array
  private aRe: Float64Array
  private aIm: Float64Array
  private bRe: Float64Array
  private bIm: Float64Array

  constructor(size: number) {
    this.size = size
    let n = size
    for (const p of [4, 2, 3, 5]) while (n % p === 0) { this.radices.push(p); n /= p }
    if (n !== 1) throw new Error(`FFT size ${size} must only have factors 2, 3 and 5`)
    this.cos = new Float64Array(size)
    this.sin = new Float64Array(size)
    for (let i = 0; i < size; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size)
      this.sin[i] = Math.sin((2 * Math.PI * i) / size)
    }
    this.aRe = new Float64Array(size)
    this.aIm = new Float64Array(size)
    this.bRe = new Float64Array(size)
    this.bIm = new Float64Array(size)
  }

  // In place. The inverse is not divided by the size.
  // Stockham autosort: one pass per factor, no reordering step.
  transform(re: Float32Array | Float64Array, im: Float32Array | Float64Array, inverse = false) {
    const { size: N, cos, sin } = this
    const sign = inverse ? 1 : -1
    let xRe = this.aRe, xIm = this.aIm, yRe = this.bRe, yIm = this.bIm
    xRe.set(re)
    xIm.set(im)
    const tRe = [0, 0, 0, 0, 0], tIm = [0, 0, 0, 0, 0]
    let n = N
    let s = 1
    for (const p of this.radices) {
      const m = n / p
      const step = N / n // twiddle table step for this stage
      const unit = N / p // table step for the p-point transform
      for (let q = 0; q < m; q++) {
        for (let s0 = 0; s0 < s; s0++) {
          for (let r = 0; r < p; r++) {
            const i = s0 + s * (q + r * m)
            tRe[r] = xRe[i]
            tIm[r] = xIm[i]
          }
          for (let t = 0; t < p; t++) {
            let sr = tRe[0], si = tIm[0]
            for (let r = 1; r < p; r++) {
              const w = ((r * t) % p) * unit
              const wr = cos[w], wi = sign * sin[w]
              sr += tRe[r] * wr - tIm[r] * wi
              si += tRe[r] * wi + tIm[r] * wr
            }
            const o = s0 + s * (p * q + t)
            if (t === 0 || q === 0) {
              yRe[o] = sr
              yIm[o] = si
            } else {
              const w = q * t * step
              const wr = cos[w], wi = sign * sin[w]
              yRe[o] = sr * wr - si * wi
              yIm[o] = sr * wi + si * wr
            }
          }
        }
      }
      ;[xRe, yRe] = [yRe, xRe]
      ;[xIm, yIm] = [yIm, xIm]
      n = m
      s *= p
    }
    re.set(xRe)
    im.set(xIm)
  }
}

const ffts = new Map<number, FFT>()
export const fftOf = (size: number) => ffts.get(size) ?? ffts.set(size, new FFT(size)).get(size)!

export const hann = (size: number) => Float32Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size))

// Mirror-pads a signal at both ends (PyTorch's "reflect" padding).
export function reflectPad(signal: Float32Array, left: number, right: number) {
  const n = signal.length
  const out = new Float32Array(left + n + right)
  for (let i = 0; i < left; i++) out[i] = signal[Math.min(left - i, n - 1)]
  out.set(signal, left)
  for (let i = 0; i < right; i++) out[left + n + i] = signal[Math.max(0, n - 2 - i)]
  return out
}

export type StereoSpectrum = { lRe: Float32Array; lIm: Float32Array; rRe: Float32Array; rIm: Float32Array; frames: number; bins: number }

// Short-time transform of a stereo signal that is already padded; frames start every `hop` samples.
// Keeps only the lowest `bins` frequency slots. Both channels go through one complex transform.
export function stereoStft(l: Float32Array, r: Float32Array, size: number, hop: number, bins: number, scale = 1): StereoSpectrum {
  const fft = fftOf(size)
  const win = hann(size)
  const frames = Math.floor((l.length - size) / hop) + 1
  const out = { lRe: new Float32Array(frames * bins), lIm: new Float32Array(frames * bins), rRe: new Float32Array(frames * bins), rIm: new Float32Array(frames * bins), frames, bins }
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  for (let t = 0; t < frames; t++) {
    const start = t * hop
    for (let i = 0; i < size; i++) {
      re[i] = l[start + i] * win[i]
      im[i] = r[start + i] * win[i]
    }
    fft.transform(re, im)
    for (let k = 0; k < bins; k++) {
      const n = (size - k) % size
      const o = t * bins + k
      out.lRe[o] = ((re[k] + re[n]) / 2) * scale
      out.lIm[o] = ((im[k] - im[n]) / 2) * scale
      out.rRe[o] = ((im[k] + im[n]) / 2) * scale
      out.rIm[o] = ((re[n] - re[k]) / 2) * scale
    }
  }
  return out
}

// Inverse of stereoStft: overlap-adds the frames back into sound of the given length.
// Frequency slots above spec.bins are treated as silent.
export function stereoIstft(spec: StereoSpectrum, size: number, hop: number, length: number, scale = 1) {
  const fft = fftOf(size)
  const win = hann(size)
  const l = new Float32Array(length)
  const r = new Float32Array(length)
  const weight = new Float32Array(length)
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  const top = Math.min(spec.bins, size / 2 + 1)
  for (let t = 0; t < spec.frames; t++) {
    re.fill(0)
    im.fill(0)
    for (let k = 0; k < top; k++) {
      const o = t * spec.bins + k
      const lr = spec.lRe[o], li = spec.lIm[o], rr = spec.rRe[o], ri = spec.rIm[o]
      re[k] = lr - ri
      im[k] = li + rr
      const n = (size - k) % size
      if (n !== k) {
        re[n] = lr + ri
        im[n] = rr - li
      }
    }
    fft.transform(re, im, true)
    const start = t * hop
    for (let i = 0; i < size && start + i < length; i++) {
      l[start + i] += (re[i] / size) * win[i] * scale
      r[start + i] += (im[i] / size) * win[i] * scale
      weight[start + i] += win[i] * win[i]
    }
  }
  for (let i = 0; i < length; i++) {
    if (weight[i] > 1e-8) {
      l[i] /= weight[i]
      r[i] /= weight[i]
    }
  }
  return { l, r }
}
