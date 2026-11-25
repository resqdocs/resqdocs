// Zielgerät „Dieses Gerät“ (Maintainer 2026-11-24): Dokumentiert wird auf dem Gerät, auf dem auch die App läuft.
// Dann gibt es im Einsatz unten nur „Protokolltext kopieren“ (der Text wechselt nur zwischen zwei Apps), und die
// Kopfzeile zeigt nichts von der Bridge. Kopieren als Hauptaktion bleibt streng auf diesen Fall beschränkt
// (Datensparsamkeit). Der Wert geht nie an die Bridge, die einen unbekannten Wert als Windows tippen würde.
// Struktur-Test (kein DOM-Setup für .vue-Dateien in der App).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { THIS_DEVICE, bridgeOs, isThisDevice } from '../../pico/targetDevice.ts'

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const einsatz = read('./EinsatzView.vue')
const app = read('../../App.vue')

test('Werte: „Dieses Gerät“ erkannt, an die Bridge geht nur ein Bridge-Ziel', () => {
  assert.equal(isThisDevice(THIS_DEVICE), true)
  for (const os of ['win_de', 'mac_de', 'ios', undefined, null, '']) assert.equal(isThisDevice(os), false, String(os))
  for (const os of ['win_de', 'mac_de', 'ios'] as const) assert.equal(bridgeOs(os), os)
  for (const os of [THIS_DEVICE, undefined, null, '', 'linux']) assert.equal(bridgeOs(os), 'win_de', String(os))
})

test('Einstellungen: vierte Option „Dieses Gerät“ unter den Bridge-Zielen', () => {
  const s = read('../settings/AppSettingsSection.vue')
  const sel = s.slice(s.indexOf('Standard-Zielgerät (OS)'), s.indexOf('</select>', s.indexOf('Standard-Zielgerät (OS)')))
  assert.match(sel, /<option value="ios">iPad \(ios\)<\/option>[\s\S]*<option :value="THIS_DEVICE">Dieses Gerät<\/option>/)
  // Die Probe-Eingabe auf der Bridge-Seite tippt immer über die Bridge: dort keine solche Option.
  assert.doesNotMatch(read('../settings/DeviceSection.vue'), /THIS_DEVICE|Dieses Gerät/)
})

test('Einsatz: bei „Dieses Gerät“ nur Kopieren, sonst Bridge wie bisher', () => {
  const unten = einsatz.slice(einsatz.indexOf('Untere Aktionen'))
  const a = unten.indexOf('<template v-if="thisDevice">')
  const b = unten.indexOf('<template v-else>')
  assert.ok(a > 0 && b > a, 'zwei Zweige')
  const hier = unten.slice(a, b)
  assert.match(hier, /data-einsatz-kopieren :disabled="!text\.trim\(\)" @click="kopieren"/)
  assert.doesNotMatch(hier, /openBridgeConnect|senden|UntypeableHint|requestButtonText/, 'nichts von der Bridge')
  const sonst = unten.slice(b, unten.indexOf('</template>', b))
  for (const t of ['data-connect-bridge', 'An Zielgerät senden', '<UntypeableHint', 'Auf Knopf speichern']) assert.ok(sonst.includes(t), t)
  assert.match(einsatz, /const thisDevice = computed\(\(\) => isThisDevice\(storage\.settings\.defaultOs\)\)/)
  assert.match(einsatz, /if \(!thisDevice\.value\) void check\(\)/, 'keine Bridge-Abfrage bei „Dieses Gerät“')
  assert.match(einsatz, /pico\.typeText\(sent, bridgeOs\(storage\.settings\.defaultOs\)/, 'an die Bridge nur ein Bridge-Ziel')
})

test('bei „Dieses Gerät“ fragt die App die Bridge nicht ab', () => {
  assert.match(app, /watch\(thisDevice, \(local\) => \{\s*if \(local\) stopPolling\(\)\s*else \{ void check\(\); startPolling\(\) \}/)
})

test('Knopftext und Probe-Eingabe der Bridge: nie „Dieses Gerät“ an die Bridge', () => {
  assert.match(read('../BridgeButtonTextDialog.vue'), /os: bridgeOs\(storage\.settings\.defaultOs\)/)
  assert.match(read('../../pico/usePicoDevice.ts'), /ref<OsMode>\(bridgeOs\(storage\.settings\.defaultOs\)\)/)
})
