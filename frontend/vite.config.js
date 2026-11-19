import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'KharchaSaathi - Ghar ko hisab, sajilai',
        short_name: 'KharchaSaathi',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
      }
    })
  ],
})