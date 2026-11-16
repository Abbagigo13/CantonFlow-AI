import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [react(), nodePolyfills()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      'wagmi/connectors',
      'viem',
      'viem/chains',
      'connectkit',
      'framer-motion',
      'lucide-react',
      'sonner',
      'clsx',
      'tailwind-merge',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the wallet and data libraries in their own cached files, so changing the app does not make people download them again.
        manualChunks(id) {
          // Vite's own helpers must stay with the small shared chunk, or the landing page would pull in the wallet libraries.
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers') || id.includes('vite/modulepreload-polyfill')) return 'vendor-react'
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
          if (/[\\/]node_modules[\\/](wagmi|@wagmi|viem|connectkit|abitype|ox|@noble|@scure|@tanstack)[\\/]/.test(id)) return 'vendor-web3'
          return undefined
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  server: {
    allowedHosts: true,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
