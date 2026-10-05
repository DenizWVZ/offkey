// Builds the public demo page (demo.html) into dist-demo/, ready to host as a plain website
// (e.g. by dragging the folder onto Netlify Drop). Run: npm run build:demo
// Only what the demo needs goes in: no playground, test panel, songs or screenshots, and only the
// AI model the widget uses.
// No cross-origin isolation headers: with them, the built AI engine hangs while loading; without
// them it runs like in the extension.

import { copyFileSync, mkdirSync, renameSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { MODEL_FILE } from './src/audio/separation/mdx'

const OUT = 'dist-demo'
const MODEL = MODEL_FILE.split('/').pop()!

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'demo-files',
      closeBundle() {
        renameSync(`${OUT}/demo.html`, `${OUT}/index.html`) // the site's front page
        mkdirSync(`${OUT}/models`, { recursive: true })
        copyFileSync(`public/models/${MODEL}`, `${OUT}/models/${MODEL}`)
      },
    },
  ],
  publicDir: false,
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  build: {
    outDir: OUT,
    emptyOutDir: true,
    rollupOptions: { input: 'demo.html' },
  },
})
