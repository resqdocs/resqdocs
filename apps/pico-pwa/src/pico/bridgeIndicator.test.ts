// Wächter: Der Lade-Kreis im Bridge-Symbol der Kopfzeile dreht nur, wenn jemand wartet. Die stille Prüfung im
// Hintergrund (alle paar Sekunden) führt nur den Zustand nach.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { indicatorBusy, indicatorLabel, indicatorTitle } from './bridgeIndicator.ts'

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')
const code = (rel: string): string => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('Kreis dreht bei angeforderter Prüfung und solange die Bridge tippt, sonst nicht', () => {
  assert.equal(indicatorBusy({ requested: false, typing: false }), false, 'Ruhe und stille Hintergrundprüfung')
  assert.equal(indicatorBusy({ requested: true, typing: false }), true)
  assert.equal(indicatorBusy({ requested: false, typing: true }), true)
})

test('Vorlesetexte bleiben: „wird geprüft“ nur bei angeforderter Prüfung, sonst der Zustand', () => {
  assert.equal(indicatorLabel({ requested: true, reachable: false }), 'Bridge-Verbindung wird geprüft')
  assert.equal(indicatorLabel({ requested: false, reachable: true }), 'Bridge verbunden — tippen zum Prüfen')
  assert.equal(indicatorLabel({ requested: false, reachable: false }), 'keine Bridge — tippen zum Prüfen')
  assert.equal(indicatorLabel({ requested: false, reachable: null }), 'keine Bridge — tippen zum Prüfen')
  assert.equal(indicatorTitle({ requested: true, reachable: true }), 'Prüfung läuft …')
  assert.equal(indicatorTitle({ requested: false, reachable: true }), 'Bridge verbunden')
  assert.equal(indicatorTitle({ requested: false, reachable: false }), 'keine Bridge')
})

test('angefordert heißt: check(true). Die Hintergrundprüfung setzt es nie', () => {
  const c = code('./useBridgeConnection.ts')
  assert.match(c, /const requested = ref\(false\)/)
  // Start einer Prüfung: angefordert genau dann, wenn force.
  assert.match(c, /checking\.value = true\s*requested\.value = force\s*try \{/)
  // Tipp während einer laufenden stillen Prüfung: Sie gilt ab jetzt als angefordert, ohne zweite Anfrage.
  assert.match(c, /if \(checking\.value\) \{\s*if \(force\) requested\.value = true/)
  // Ende jeder Prüfung räumt auf, auch nach einem Fehler.
  assert.match(c, /\} finally \{\s*checking\.value = false\s*requested\.value = false\s*\}/)
  // Die Schleife im Hintergrund prüft ohne force.
  assert.match(c, /if \(document\.visibilityState === 'visible'\) await check\(\)/)
  // Der Zustand wird von jeder Prüfung nachgeführt.
  assert.match(c, /const ok = await client\.health\(\)\s*reachable\.value = ok/)
})

test('Kopfzeile: Kreis hängt an der Regel, Farbe und Symbol am Zustand, Symbole unverändert', () => {
  const app = read('../App.vue')
  assert.match(app, /indicatorBusy\(\{ requested: requested\.value, typing: typingProgress\.snapshot\.value\?\.phase === 'typing' \}\)/)
  assert.match(app, /<span v-if="indicatorSpins" class="loading loading-spinner loading-sm" data-bridge-busy><\/span>/)
  assert.doesNotMatch(app.slice(app.indexOf('<template>')), /v-if="checking"/, 'nicht mehr bei jeder Prüfung')
  assert.match(app, /:aria-label="indicatorLabel\(\{ requested, reachable \}\)"/)
  assert.match(app, /:class="reachable === true \? 'bg-success' : 'bg-error'"/)
  assert.match(app, /<svg v-else-if="reachable === true"/)
  assert.match(app, /@click="check\(true\)"/, 'Tipp auf das Symbol fordert eine Prüfung an')
  for (const label of ['aria-label="Text für den Knopf an der Bridge"', 'aria-label="Einführung und Anleitung"']) assert.ok(app.includes(label), label)
})
