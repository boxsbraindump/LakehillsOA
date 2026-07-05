import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Update to match the actual GitHub repo name if it differs.
  base: '/lake-hills-acupuncture-oa/',
  plugins: [react(), tailwindcss()],
})
