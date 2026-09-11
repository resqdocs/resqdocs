// Struktur-Test auf dem <script setup> von EinsatzView.vue - fuer die EINE Datenverlust-Luecke, die
// sich mit den Mitteln dieses Projekts sonst nicht schliessen laesst.
//
// Anlass: der laufende Einsatz-Entwurf wurde beim Start als "verwaist" geloescht, wenn die
// Vorlagen-Bibliothek nur wegen eines Fehlers leer war. Behoben durch entscheideUeberEntwurf
// (caseDraftGuard.ts): bei libraryError !== null lautet die Entscheidung "unangetastet-lassen", und
// EinsatzView.maybeResolveOnReady kehrt VOR dem loeschenden caseDraft.remove() zurueck.
//
// Die reine Entscheidungslogik ist in caseDraftGuard.test.ts erschoepfend geprueft. NICHT geprueft war
// bisher, dass EinsatzView den Guard ueberhaupt aufruft und remove() dahinter liegt. Entfernt jemand
// diese Kopplung beim naechsten Umbau, bleiben alle Tests gruen und der Datenverlust ist zurueck -
// genau der Fehler, wegen dem der ganze Fix entstand, waere lautlos wieder da. Es gibt kein
// DOM-Testsetup (.vue-Dateien laufen in keinem Verhaltens-Test), deshalb sichern wir die Reihenfolge
// auf Quelltextebene ab - dasselbe Vorgehen wie templateRefs.test.ts.
//
// Der Test liest den <script setup>-Block ueber den echten Vue-Compiler heraus (nicht die Rohdatei),
// damit Kommentare/Formatierung nicht mitzaehlen, und prueft POSITIONEN statt exakten Wortlaut - er
// haelt die Datensicherheits-Invariante fest, ohne bei harmlosen Umbenennungen sproede zu werden.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sfc = require_('@vue/compiler-sfc/dist/compiler-sfc.cjs.js') as any

function scriptOf(name: string): string {
  const path = fileURLToPath(new URL(name, import.meta.url))
  const { descriptor } = sfc.parse(readFileSync(path, 'utf8'))
  assert.ok(descriptor.scriptSetup, `${name}: kein <script setup>`)
  return descriptor.scriptSetup.content as string
}

const script = scriptOf('EinsatzView.vue')

// Nur die Startaufloesung ist relevant: EinsatzView hat mehrere caseDraft.remove() (Abschluss,
// Vorlagenwechsel) - die sind bewusstes Loeschen und gehen den Guard nichts an. Geschuetzt gehoert
// allein das Loeschen beim START, das in maybeResolveOnReady steht. Deshalb isolieren wir genau diese
// Funktion, bevor wir Positionen vergleichen. Ende = naechste Top-Level-Funktionsdeklaration.
function koerperVon(fn: string): string {
  const start = script.search(new RegExp(`function\\s+${fn}\\s*\\(`))
  assert.ok(start !== -1, `Funktion ${fn} nicht gefunden`)
  const rest = script.slice(start + 1)
  const next = rest.search(/\n(?:async\s+)?function\s+\w+\s*\(/)
  return next === -1 ? rest : rest.slice(0, next)
}

const resolve = koerperVon('maybeResolveOnReady')

test('EinsatzView ruft den Datenverlust-Guard beim Start auf', () => {
  // Ohne diesen Aufruf entscheidet nichts mehr ueber "unangetastet-lassen" - der Fix waere wirkungslos.
  assert.match(resolve, /entscheideUeberEntwurf\s*\(/, 'entscheideUeberEntwurf muss in maybeResolveOnReady aufgerufen werden')
  assert.match(script, /from ['"]@\/composables\/caseDraftGuard['"]/, 'der Guard muss importiert sein')
})

test('das Start-remove() liegt HINTER dem Guard, nicht davor', () => {
  // Die eigentliche Invariante: caseDraft.remove() in der Startaufloesung darf erst erreichbar sein,
  // nachdem der Guard entschieden hat. Sonst loescht der Start den Entwurf, bevor "unangetastet-lassen"
  // greifen kann - genau der behobene Datenverlust.
  const guard = resolve.search(/entscheideUeberEntwurf\s*\(/)
  const remove = resolve.search(/caseDraft\.remove\s*\(/)
  assert.ok(guard !== -1, 'Guard-Aufruf in maybeResolveOnReady nicht gefunden')
  assert.ok(remove !== -1, 'caseDraft.remove() in maybeResolveOnReady nicht gefunden')
  assert.ok(guard < remove, 'entscheideUeberEntwurf muss VOR caseDraft.remove() stehen')
})

test('bei "unangetastet-lassen" wird abgebrochen, bevor geloescht wird', () => {
  // Der Guard nuetzt nur, wenn sein "unangetastet-lassen" zu einem echten Abbruch fuehrt. Wir pruefen,
  // dass zwischen Guard-Aufruf und dem Start-remove() ein Frueh-Return auf genau diesen Fall steht.
  const guard = resolve.search(/entscheideUeberEntwurf\s*\(/)
  const remove = resolve.search(/caseDraft\.remove\s*\(/)
  const dazwischen = resolve.slice(guard, remove)
  assert.match(
    dazwischen,
    /['"]unangetastet-lassen['"][\s\S]*?\breturn\b/,
    'zwischen Guard und remove() fehlt der Abbruch fuer "unangetastet-lassen"',
  )
})

test('der Guard bezieht libraryError ein - sonst erkennt er den Fehlerzustand nicht', () => {
  // entscheideUeberEntwurf trifft die Datensicherheits-Entscheidung an libraryError fest. Wird das
  // Feld nicht uebergeben, faellt die Sperre in sich zusammen, ohne dass ein anderer Test es merkt.
  const aufruf = resolve.slice(resolve.search(/entscheideUeberEntwurf\s*\(/))
  const bis = aufruf.indexOf(')')
  assert.match(aufruf.slice(0, bis + 1), /libraryError/, 'der Guard-Aufruf muss libraryError uebergeben')
})
