import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/ws': {
        target: 'http://127.0.0.1:8000',
        ws: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8000',
      },
      '/pcm-worklet.js': {
        target: 'http://127.0.0.1:8000/static',
        rewrite: () => '/pcm-worklet.js',
      },
    },
  },
})
