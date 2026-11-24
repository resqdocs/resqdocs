import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import { hashWebSources } from '../../scripts/web-source-hash.mjs'

// Build-Kennung: App-Version + Build-Zeitpunkt. Ändert sich mit JEDEM Build (App-Version, Einführung).
// Der Hinweis beim Start (useDisclaimer) hängt NICHT daran, sondern an seiner Textversion.
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))
const APP_BUILD_ID = `${pkg.version}+${new Date().toISOString()}`

// GAP 4: stempelt nach jedem Build dist/build-info.json mit Version + Content-Hash der Quell-Inputs.
// cap sync kopiert die Datei ins native public/; der Release-Guard (scripts/check-bundle-fresh.mjs)
// vergleicht sie gegen die native Store-Version UND rechnet den Hash neu -> fängt Versions-Abweichung
// UND ein gleich-nummeriertes, veraltetes Bundle (der 1.2.1-Fall) vor dem Packaging ab.
function buildInfoPlugin() {
  return {
    name: 'resqdocs-build-info',
    apply: 'build' as const,
    closeBundle() {
      const info = { versionName: pkg.version, builtAt: new Date().toISOString(), srcHash: hashWebSources() }
      writeFileSync(fileURLToPath(new URL('./dist/build-info.json', import.meta.url)), JSON.stringify(info, null, 2) + '\n')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss(), buildInfoPlugin()],
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
  build: {
    // Die App liegt vollständig auf dem Gerät, es wird nichts über das Netz nachgeladen. Ein großes Paket ist
    // hier gewollt; die Grenze steht deutlich über dem heutigen Stand (rund 1,2 MB) und meldet erst echtes Wachstum.
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      // Einige Module werden an manchen Stellen bewusst erst bei Bedarf geladen (import()), damit die Logik
      // ohne Capacitor testbar bleibt, an anderen direkt. Der Hinweis dazu ist bekannt und folgenlos.
      onLog(level, log, handler) {
        if (log.code === 'INEFFECTIVE_DYNAMIC_IMPORT') return
        handler(level, log)
      },
    },
  },
  server: {
    // allow the dev server to read the canonical seed outside the app root
    fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] },
  },
})
