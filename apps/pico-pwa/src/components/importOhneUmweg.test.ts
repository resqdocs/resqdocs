// Ein angetippter Transfer-Link brauchte früher fünf Bestätigungen (Maintainer 2026-11-21): „Link empfangen?“,
// Namenswahl, „übernehmen“, „Fertig“ und „Schließen“ am Fenster „Daten“. Gefragt wird jetzt nur noch beim Übernehmen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')
const templateIo = read('./rebuild/TemplateIO.vue')
const libraryBar = read('./rebuild/LibraryBar.vue')
const choice = read('./ImportChoiceDialog.vue')

test('Von außen geöffnet: keine eigene Rückfrage vor dem Abruf, LibraryBar ruft gleich ab', () => {
  assert.doesNotMatch(templateIo, /Link empfangen\?|Datei importieren\?/)
  assert.match(libraryBar, /dataIo\.value\?\.acceptIncoming\(\)/)
  assert.match(templateIo, /defineExpose\(\{[^}]*acceptIncoming/)
})

test('Von außen geöffnet: auch ein einzelner Abschnitt oder Textbaustein geht erst über „übernehmen“', () => {
  const run = templateIo.slice(templateIo.indexOf('async function runLoad'), templateIo.indexOf('function onFile'))
  const incoming = run.indexOf('if (incoming)')
  assert.ok(incoming > 0 && incoming < run.indexOf('routeDetected(r)'), 'incoming muss vor dem direkten Ablegen abzweigen')
  assert.match(run.slice(incoming), /^if \(incoming\) \{\s*msg\.value = null\s*offerCollection\(/)
})

test('„1× lesen“ gilt erst beim Übernehmen als geöffnet: Übernehmen verbraucht, Abbrechen gibt frei', () => {
  assert.match(templateIo, /link = await openTransfer\(/)
  assert.doesNotMatch(templateIo, /receiveTransfer\(/)
  const after = templateIo.slice(templateIo.indexOf('function afterImport'))
  // Jeder Import verbraucht bzw. gibt genau SEINEN Link frei (mine), nie einen später geöffneten.
  assert.match(after, /^function afterImport\(added: Container\[\], l: OpenedTransfer \| null\): void \{\s*consumeLink\(l\)/)
  assert.match(templateIo, /const mine = link && link\.text === text \? link : null/)
  assert.match(templateIo, /if \(link && !mine\) await releaseLink\(link\)/)
  assert.match(templateIo, /onCancel: \(\) => void releaseLink\(mine\)/)
  assert.match(templateIo, /const done = \(added: Container\[\]\): void => afterImport\(added, mine\)/)
  // Vor einem neuen Abruf wird der frühere abgewartet freigegeben (sonst meldet der Dienst „anderes Gerät“).
  assert.match(templateIo, /await releaseLink\(link\)\s*link = await openTransfer\(/)
  // Ohne Reservierung (älterer Dienst hat schon verbraucht) bleibt der Inhalt zum späteren „Laden“ sichtbar; das Feld
  // wird nur angefasst, wenn dort noch der Inhalt dieses Links steht.
  const rel = templateIo.slice(templateIo.indexOf('async function releaseLink'), templateIo.indexOf('async function receiveViaLink'))
  assert.match(rel, /const released = l\.reserved && \(await l\.release\(\)\)/)
  assert.match(rel, /if \(importText\.value !== l\.text\) return/)
  assert.match(rel, /if \(focus\.value === 'link'\) focus\.value = 'file'/)
  assert.match(choice, /p\?\.onCancel\?\.\(\)/)
  // Ein ersetzter wartender Import gilt als abgebrochen; nicht Gespeichertes verbraucht den Link nicht.
  assert.match(readFileSync(new URL('../composables/useImportChoice.ts', import.meta.url), 'utf8'), /prev\?\.onCancel\?\.\(\)/)
  assert.match(choice, /if \(blocks\?\.failed\.length \|\| snippets\?\.failed\.length\) p\.onCancel\?\.\(\)\s*else p\.onDone\?\.\(t\.added\)/)
})

test('Nach dem Übernehmen kein „Fertig“: Fenster schließt, Ergebnis als Hinweis in einer Live-Region', () => {
  const tpl = choice.slice(choice.indexOf('<template>'))
  assert.doesNotMatch(tpl, />Fertig</)
  assert.match(tpl, /role="status" aria-live="polite"/)
  const take = choice.slice(choice.indexOf('async function take'), choice.indexOf('function close'))
  assert.ok(take.indexOf('clearImport()') > 0 && take.indexOf('clearImport()') < take.indexOf('showNote('))
})
