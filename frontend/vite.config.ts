import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const PROD_API = 'https://violet-meadow-7392.fly.dev'
const LOCAL_API = 'http://localhost:8000'

// Use VITE_API_TARGET env var to switch between local and prod backend
// VITE_API_TARGET=prod -> proxy to production
// VITE_API_TARGET=local (default) -> proxy to localhost:8000
const apiTarget = process.env.VITE_API_TARGET === 'prod' ? PROD_API : LOCAL_API

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': apiTarget,
      '/health': apiTarget,
    },
  },
})
