/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const backendUrl = loadEnv(mode, process.cwd(), '').VITE_API_URL || 'http://localhost:3000'
  return {
  plugins: [react(), tailwindcss()],
  server: {
    // Aynı ağdaki cihazlardan (telefon vb.) dev server'a erişim için tüm arayüzlerde dinle
    host: true,
    // Dev'de tarayıcı backend'e doğrudan değil Vite üzerinden gider (bkz. src/lib/api/apiBase.ts):
    // telefon hangi LAN IP'siyle açarsa açsın backend'e ulaşır, CORS'a IP eklemek gerekmez.
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/socket.io': {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}
})
