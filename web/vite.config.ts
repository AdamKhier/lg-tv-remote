import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths, so the same build works at the domain root or under
  // a subdirectory (http://server/ or http://server/remote/).
  base: './',
  server: { port: 5173 },
})
