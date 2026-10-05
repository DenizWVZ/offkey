// Fixes a bug in signalsmith-stretch 1.3.2 (runs automatically after `npm install`).
// When playing added buffers, reading across the boundary between two buffers, starting partway
// into the first, miscounts the position, so the audio thread crashes ("offset is out of bounds").
// Our separated vocals arrive as many ~6 s buffers, so this happens within seconds.
// The fix moves the read position to the end of the buffer just used.

import { readFileSync, writeFileSync } from 'node:fs'

const buggy = `						audioSamples += count;
						blockSamples += count;`
const fixed = `						audioSamples = bufferEnd; // patched by scripts/patch-signalsmith.mjs
						inputSamples += count;
						blockSamples += count;`

for (const file of ['SignalsmithStretch.mjs', 'SignalsmithStretch.js']) {
  const path = new URL(`../node_modules/signalsmith-stretch/${file}`, import.meta.url)
  const code = readFileSync(path, 'utf8')
  if (code.includes('patched by scripts/patch-signalsmith.mjs')) console.log(`${file}: already patched`)
  else if (code.includes(buggy)) {
    writeFileSync(path, code.replace(buggy, fixed))
    console.log(`${file}: patched`)
  } else console.warn(`${file}: code not found; signalsmith-stretch may have changed, check whether the fix is still needed`)
}
