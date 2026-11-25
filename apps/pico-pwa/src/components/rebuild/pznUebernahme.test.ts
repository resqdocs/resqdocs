// Eigene PZN-Bibliothek aus dem Medikationsplan füllen und pflegen. Entscheidungen des Maintainers:
//  - Symbol statt Pfeil, eine Erklärzeile, Haken nach dem Tipp.
//  - Neu aufnehmen nur, wenn statt des Platzhalters „PZN …“ ein Name eingetragen ist.
//  - Ein Eintrag, den die Bibliothek schon kennt, lässt sich speichern, wenn man ihn selbst geändert hat.
//  - Angeboten wird nur, wo es etwas zu tun gibt: sonst kein Knopf und keine Erklärzeile.
//  - Im Prüf-Fenster nach dem Plan-Scan und in der Karte eines Eintrags der Liste gilt dieselbe Regel
//    (libraryOffer in packages/protocol-core-ui/packageScanResult.ts, dort mit eigenen Tests).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const s = readFileSync(join(HERE, 'MedplanReviewSheet.vue'), 'utf8')
const tpl = s.slice(s.indexOf('<template>'))
const med = readFileSync(join(HERE, '../../../../../packages/protocol-core-ui/components/functions/MedplanFunction.vue'), 'utf8')

test('Prüf-Fenster: Angebot nach der gemeinsamen Regel, nur eigene Änderungen zählen', () => {
  const fn = s.slice(s.indexOf('function transferOffer(i: number)'), s.indexOf('const anyTransfer'))
  assert.match(fn, /if \(savedSig\.value\[i\] === librarySignature\(row\.name\)\) return 'done'/)
  assert.match(fn, /return libraryOffer\(\{ entry: libEntries\.value\.get\(pzn\), name: row\.name, edited: editedRows\.value\.has\(i\) \}\)/)
  // „Selbst geändert“ entsteht nur am Eingabefeld, nicht beim Nachziehen des Namens aus der Bibliothek.
  assert.match(tpl, /@input="onRowNameInput\(i, \(\$event\.target as HTMLInputElement\)\.value\)"/)
  const resolve = s.slice(s.indexOf('async function resolveFromLibrary()'), s.indexOf('async function onDecoded('))
  assert.doesNotMatch(resolve, /editedRows|onRowNameInput/)
  // Nachgeschlagen wird für JEDE Zeile mit PZN, bevor der Filter für Platzhalter-Namen greift.
  assert.ok(resolve.indexOf('libEntries.value = new Map') < resolve.indexOf("if (!/^PZN \\d/.test(name)) continue"))
})

test('Prüf-Fenster: Knopf, Haken und Erklärzeile', () => {
  const knopf = tpl.slice(tpl.indexOf('v-if="transferOffer(i)"') - 60, tpl.indexOf('data-pzn-transfer') + 400)
  assert.match(knopf, /class="btn btn-ghost btn-sm min-h-11 min-w-11 px-0"/, 'Trefferfläche mindestens 44 px')
  assert.match(knopf, /in die PZN-Bibliothek übernehmen`/)
  assert.match(knopf, /in der PZN-Bibliothek speichern`/)
  assert.match(knopf, /<svg v-if="transferOffer\(i\) === 'done'"/, 'Haken nach dem Speichern')
  assert.doesNotMatch(tpl, />→<\/button>/, 'kein unbeschrifteter Pfeil')
  assert.match(s, /const anyTransfer = computed\(\(\) => structuredRows\.value\.some\(\(_, i\) => transferOffer\(i\) === 'add' \|\| transferOffer\(i\) === 'update'\)\)/)
  const legende = tpl.indexOf('<p v-if="anyTransfer"')
  assert.ok(legende > 0 && legende < tpl.indexOf('<ul class="flex shrink-0 flex-col gap-1.5">'), 'Erklärzeile über der Liste, nur bei einem Angebot')
})

test('Prüf-Fenster: genau eine PZN je Tipp; ein vorhandener Eintrag bekommt nur den geänderten Namen', () => {
  const fn = s.slice(s.indexOf('async function transferRow(i: number)'), s.indexOf('/** Nach dem Parse:'))
  assert.match(fn, /if \(!pzn \|\| \(offer !== 'add' && offer !== 'update'\)\) return/)
  assert.match(fn, /await savePznEntry\(pznLibrary, pzn, name, offer === 'add' \? structuredRows\.value\[i\]\?\.staerke : undefined\)/)
  assert.equal((s.match(/savePznEntry\(/g) ?? []).length, 1)
  assert.doesNotMatch(s, /pznLibrary\.add/)
})

test('Liste im Medikationsplan: dieselbe Regel in der Karte, Name und Stärke zählen als eigene Änderung', () => {
  const fn = med.slice(med.indexOf('function libraryState('), med.indexOf('async function saveToLibrary('))
  assert.match(fn, /if \(libSaved\.value\.get\(key\) === librarySignature\(r\.name, r\.staerke\)\) return 'done'/)
  assert.match(fn, /return libraryOffer\(\{ entry: libEntries\.value\.get\(key\), name: r\.name, staerke: r\.staerke, edited: libEdited\.value\.has\(key\) \}\)/)
  assert.match(med, /@input="markLibraryEdit\(i\); onNameInput\(i, /)
  assert.match(med, /aria-label="Wirkstärke" @input="markLibraryEdit\(i\); setRow\(i, \{ staerke:/)
  const save = med.slice(med.indexOf('async function saveToLibrary('), med.indexOf('// --- Typeahead'))
  assert.match(save, /\(state !== 'add' && state !== 'update'\)\) return/)
  assert.match(save, /await medplanScan\.saveToLibrary\(r\.pzn, name, r\.staerke\)/)
  assert.match(med, /<button\s+v-if="libraryState\(r\)"[\s\S]{0,260}min-h-11 min-w-11/, 'Trefferfläche mindestens 44 px')
  assert.match(med, /speichert deine Änderung in der PZN-Bibliothek\./)
  assert.match(med, /übernimmt die PZN mit diesem Namen in deine PZN-Bibliothek\./)
  const cap = readFileSync(join(HERE, 'listCapture.ts'), 'utf8')
  assert.match(cap, /saveToLibrary: \(pzn, name, staerke\) => savePznEntry\(usePznLibrary\(\), pzn, name, staerke\)/)
})
