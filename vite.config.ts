import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The AI model runtime loads its own files at run time; bundling it ahead breaks that.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
})
