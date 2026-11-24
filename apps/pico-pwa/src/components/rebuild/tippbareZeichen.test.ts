// Struktur-Test: Hinweis auf nicht tippbare Zeichen und Emoji-Filter im Einsatz.
// Hält fest, WO beides sitzt: der Hinweis beim Senden-Knopf und beim Text für den Knopf an der Bridge (nur
// Hinweis, keine Sperre), der Filter an EINER Stelle für alle Felder des Einsatzes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')
const einsatz = read('./EinsatzView.vue')
const button = read('../BridgeButtonTextDialog.vue')

test('der Hinweis steht direkt unter „An Zielgerät senden“, vor „Auf Knopf speichern“', () => {
  const actions = einsatz.slice(einsatz.indexOf('<!-- Untere Aktionen'))
  const send = actions.indexOf('An Zielgerät senden')
  const hint = actions.indexOf('<UntypeableHint')
  const store = actions.indexOf('Auf Knopf speichern')
  assert.ok(send > 0 && hint > send && hint < store)
  // Der fertige Protokolltext und das, was am gewählten Zielgerät stattdessen ankommt.
  assert.match(actions, /<UntypeableHint :text="text" :marker="marker" class="w-full" \/>/)
  assert.match(einsatz, /const marker = computed\(\(\) => typingMarker\(storage\.settings\.defaultOs\)\)/)
})

test('nur ein Hinweis: Senden hängt nicht an den Zeichen', () => {
  const disabled = /:disabled="([^"]*)" @click="senden"/.exec(einsatz)
  assert.ok(disabled)
  assert.equal(disabled[1], 'sending || reachable !== true || typing.busy.value')
  assert.doesNotMatch(/async function senden\(\)[\s\S]*?\n}\n/.exec(einsatz)![0], /untypeable|marker/)
})

test('Text für den Knopf an der Bridge: gezählt, geprüft und gespeichert wird die getippte Form; derselbe Hinweis', () => {
  assert.match(button, /const typed = computed\(\(\) => normalizeForTyping\(text\.value\)\)/)
  assert.match(button, /const chars = computed\(\(\) => countChars\(typed\.value\)\)/)
  assert.match(button, /const guard = computed\(\(\) => checkStoredText\(typed\.value\)\)/)
  assert.match(button, /text: typed\.value,/)
  assert.match(button, /<UntypeableHint :text="typed" :marker="marker" \/>/)
  // Speichern bleibt möglich, auch wenn Zeichen nicht tippbar sind.
  assert.doesNotMatch(/const canSave = computed\(([\s\S]*?)\n\)/.exec(button)![1], /untypeable|marker/i)
})

test('EIN Emoji-Filter am Dokument für den ganzen Einsatz, dazu das Feld für den Knopf-Text', () => {
  assert.match(einsatz, /installEmojiFreeInput\(document, \(el\) => activeTab\.value === 'einsatz' \|\| !!el\.closest\?\.\('\[data-emoji-free\]'\)\)/)
  assert.match(einsatz, /stopEmojiFilter\?\.\(\)/, 'beim Abbau wieder abgeschaltet')
  assert.match(button, /<textarea[^>]*data-emoji-free/s)
  // Die Felder selbst brauchen keinen eigenen Code: Der Filter wird nur an dieser einen Stelle eingeschaltet.
  for (const f of ['./EinsatzField.vue', './EinsatzSection.vue']) assert.doesNotMatch(read(f), /installEmojiFreeInput/)
})

test('ein Textbaustein wird im Einsatz ohne Emojis eingesetzt', () => {
  // Kein Tippen, also kein input-Ereignis: Hier greift der Filter nicht von selbst.
  assert.match(read('./EinsatzField.vue'), /caseValues\.setCustom\(props\.node\.id, stripEmoji\(combined\)\)/)
})

test('Testtext der Bridge-Seite geht in der getippten Form hinaus', () => {
  assert.match(read('../../pico/usePicoDevice.ts'), /const sent = normalizeForTyping\(testText\.value\)/)
})
