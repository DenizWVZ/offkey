// Builds the Chrome extension into dist-extension/ (load it in chrome://extensions → Load unpacked).
//   npm run build:ext         build once
//   npm run dev:ext           rebuild on every save; then press reload on the extension and refresh the tab
//   npm run build:ext:dev     build once for development: readable code, and the vocals test panel under the widget
// The playground (npm run dev / npm run build) is separate and unaffected.

import { existsSync, readFileSync } from 'node:fs'
import { build, transformWithOxc } from 'vite'
import react from '@vitejs/plugin-react'
import { ensureModel, MODEL_FILE, MODEL_PATH } from './fetch-model.mjs'

const watch = process.argv.includes('--watch')
const dev = watch || process.argv.includes('--dev')
const root = new URL('..', import.meta.url).pathname
const OUT = 'dist-extension'

await ensureModel()

// Files copied into the extension as they are.
const copies = {
  'manifest.json': 'src/extension/manifest.json',
  'content-loader.js': 'src/extension/content-loader.js',
  // The pitch library, loaded by the audio thread from the extension (see content.tsx).
  'signalsmith-worklet.js': 'node_modules/signalsmith-stretch/SignalsmithStretch.mjs',
  // The vocal separation model (30 MB; not in git, downloaded if missing, see fetch-model.mjs).
  [`models/${MODEL_FILE}`]: MODEL_PATH,
  // Credits for the model, libraries and fonts inside (their licences ask for this to travel with them).
  'NOTICES.txt': 'src/extension/NOTICES.txt',
  // The toolbar and store icons (made from store/Icon.svg by `npm run icons`).
  ...Object.fromEntries([16, 32, 48, 128].map((size) => [`icons/icon-${size}.png`, `src/extension/icons/icon-${size}.png`])),
}
// The pitch library needs a fix (scripts/patch-signalsmith.mjs, run by npm install); without it the audio
// thread crashes within seconds of separated vocals playing. Stop rather than ship that.
if (!readFileSync(root + copies['signalsmith-worklet.js'], 'utf8').includes('patched by scripts/patch-signalsmith.mjs')) {
  throw new Error('signalsmith-stretch is not patched. Run `npm install` (or node scripts/patch-signalsmith.mjs) and check its output.')
}

for (const [fileName, source] of Object.entries(copies)) {
  if (!existsSync(root + source)) {
    console.warn(`Missing ${source}: ${fileName} is left out of the extension.`)
    delete copies[fileName]
  }
}

// The audio tap runs inside YouTube's page before anything else, so it must be one plain file
// with no imports; its TypeScript is only stripped of types, wrapped so its names stay private.
const HOOK = 'src/extension/hook.ts'

const copyFiles = {
  name: 'copy-extension-files',
  buildStart() {
    for (const source of [...Object.values(copies), HOOK]) this.addWatchFile(root + source)
  },
  async generateBundle() {
    for (const [fileName, source] of Object.entries(copies)) this.emitFile({ type: 'asset', fileName, source: readFileSync(root + source) })
    const { code } = await transformWithOxc(readFileSync(root + HOOK, 'utf8'), HOOK, { lang: 'ts' })
    this.emitFile({ type: 'asset', fileName: 'hook.js', source: `(() => {\n${code}})();\n` })
  },
}

await build({
  root,
  configFile: false,
  publicDir: false, // the model is added separately, from public/models/
  mode: dev ? 'development' : 'production',
  plugins: [react(), copyFiles],
  // Code running on YouTube must point at the extension's files with full chrome-extension:// addresses.
  // Background workers (the model's) have no chrome.runtime, but run on the extension's own address.
  experimental: {
    renderBuiltUrl: (fileName, { hostType }) =>
      hostType === 'js'
        ? { runtime: `(globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL(${JSON.stringify(fileName)}) : new URL(${JSON.stringify('/' + fileName)}, location.origin).href)` }
        : { relative: true },
  },
  build: {
    outDir: OUT,
    emptyOutDir: true,
    minify: !dev,
    sourcemap: dev,
    modulePreload: false,
    cssCodeSplit: false, // one stylesheet, loaded into the widget's shadow root
    watch: watch ? {} : null,
    rollupOptions: {
      input: {
        content: 'src/extension/content.tsx',
        background: 'src/extension/background.ts',
        separator: 'src/extension/separator.html', // the hidden vocals frame
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (asset) => (asset.names?.[0]?.endsWith('.css') ? 'content.css' : 'assets/[name]-[hash][extname]'),
      },
    },
  },
})
