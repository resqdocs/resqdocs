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
    // Das geteilte UI-Paket hat ein eigenes node_modules/vue (für node --test). Ohne dedupe würde Vite
    // beim Bündeln der Paket-Komponenten eine ZWEITE Vue-Instanz ziehen -> gebrochene Reaktivität/inject.
    dedupe: ['vue'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // shared logic (protocol renderer/runtime/creator/medplan/scores) ships as the
      // @resqdocs/protocol-core package (packages/shared); alias points at the source dir
      '@resqdocs/protocol-core': fileURLToPath(new URL('../../packages/shared', import.meta.url)),
      // shared Vue editor components + composables (App + Online-Editor); source dir like protocol-core
      '@resqdocs/protocol-core-ui': fileURLToPath(new URL('../../packages/protocol-core-ui', import.meta.url)),
      // canonical, CI-validated protocol seeds live in protocols/ (single source of truth)
      '@protocols': fileURLToPath(new URL('../../protocols', import.meta.url)),
    },
  },
  server: {
    // allow the dev server to read the canonical seed outside the app root
    fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] },
  },
})
