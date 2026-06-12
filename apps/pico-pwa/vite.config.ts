import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

// Build-Kennung: App-Version + Build-Zeitpunkt. Ändert sich mit JEDEM Build und
// damit mit jedem App-Update — der Haftungsausschluss (useDisclaimer) erscheint
// dadurch beim Erst-Start und nach jedem Update erneut.
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))
const APP_BUILD_ID = `${pkg.version}+${new Date().toISOString()}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // shared logic (e.g. the protocol renderer) lives in packages/shared
      '@shared': fileURLToPath(new URL('../../packages/shared', import.meta.url)),
      // canonical, CI-validated protocol seeds live in protocols/ (single source of truth)
      '@protocols': fileURLToPath(new URL('../../protocols', import.meta.url)),
    },
  },
  server: {
    // allow the dev server to read the canonical seed outside the app root
    fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] },
  },
})
