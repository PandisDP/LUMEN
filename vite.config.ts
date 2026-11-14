import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // `npm run dev` opens the browser on whatever port Vite ends up using (5173, or the next free
  // one when another dev server is still running).
  server: { port: 5173, open: true },
  preview: { open: true },
  build: {
    // three.js + drei alone are ~1.2 MB minified; they live in their own cacheable chunk.
    chunkSizeWarningLimit: 1300,
    rolldownOptions: {
      output: {
        // Vendor chunks: three.js + R3F change rarely, so they stay cached between deploys.
        codeSplitting: {
          groups: [
            {
              name: 'three',
              test: /node_modules[\\/](three|three-stdlib|@react-three|troika|camera-controls|maath|meshline|stats-gl)/,
            },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|zustand)[\\/]/ },
            { name: 'astro', test: /node_modules[\\/]astronomy-engine/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
    },
  },
})
