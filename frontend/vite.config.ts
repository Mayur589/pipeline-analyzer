import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/relationships': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      },
      '/node-types': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      },
      '/projects': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  }
})
