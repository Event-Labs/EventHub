import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    headers: {
      'Cache-Control': 'public, max-age=31536000',
    },
  },
  preview: {
    headers: {
      'Cache-Control': 'public, max-age=31536000',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('exceljs')) {
              return 'vendor-excel'
            }
            if (id.includes('three')) {
              return 'vendor-three'
            }
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts'
            }
            if (id.includes('@zxing') || id.includes('qrcode')) {
              return 'vendor-scanner'
            }
            if (id.includes('react-quill-new') || id.includes('quill')) {
              return 'vendor-editor'
            }
            if (id.includes('leaflet')) {
              return 'vendor-maps'
            }
            if (id.includes('@tanstack') || id.includes('axios')) {
              return 'vendor-query'
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons'
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  optimizeDeps: {
    include: ['three'],
  },
})

