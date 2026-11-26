import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const clearDevCachePlugin = {
  name: 'clear-dev-cache',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.method === 'GET' && String(req.headers.accept || '').includes('text/html')) {
        res.setHeader('Clear-Site-Data', '"cache"')
      }
      next()
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), clearDevCachePlugin],
  resolve: {
    alias: {
      '@': '/src',
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    headers: {
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  },
  preview: {
    headers: {
      'Cache-Control': 'public, max-age=31536000',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
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

