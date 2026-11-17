// In der App läuft der native Scanner (eigener ViewController bzw. eigene Activity). Zeichnet CodeScanOverlay
// dabei seine Web-Kameraansicht, stehen zwei Kameras übereinander und die native fährt darüber (Gerätevideo
// 2026-11-17). Die Web-Ansicht darf deshalb nur im Browser oder bei einem Fehler erscheinen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('CodeScanOverlay zeichnet bei nativem Scanner nichts, außer bei einem Fehler', () => {
  const src = readFileSync(new URL('./CodeScanOverlay.vue', import.meta.url), 'utf8')
  const tpl = src.slice(src.indexOf('<template>'))
  const root = tpl.match(/<div[^>]*data-scan-overlay[^>]*>/)?.[0] ?? ''
  assert.ok(root, 'Wurzel des Overlays nicht gefunden')
  assert.match(root, /v-if="!nativeAvailable \|\| error"/)
})
