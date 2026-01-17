import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Web-only config (no Electron)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  root: '.',
  build: {
    outDir: 'dist-web'
  },
  server: {
    port: 3000,
    open: true
  }
})
