// Wächter für den Vorlagen-Tab am Handy: erst die Liste der Vorlagen, ein Tipp öffnet die Vorlage als eigene Seite.
// Die Kopfzeile zeigt dann ‹ und den Namen der Vorlage (Titelzeile, siehe shell/kopfzeile.test.ts). Ab lg steht
// alles nebeneinander wie bisher. Quellen: docs/sources.md, Abschnitt „Vorlagen-Tab: Liste, dann Vorlage“.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (f: string): string => readFileSync(new URL(f, import.meta.url), 'utf8')
const view = read('./EditorView.vue')
const list = read('./LibraryBar.vue')
const app = read('../../App.vue')

test('zwei Seiten nur unter lg: Liste oder Vorlage', () => {
  assert.match(view, /const screen = ref<'liste' \| 'vorlage'>\('liste'\)/, 'der Tab beginnt mit der Liste')
  assert.match(view, /const showList = computed\(\(\) => isLg\.value \|\| screen\.value === 'liste'\)/)
  assert.match(view, /const showEditor = computed\(\(\) => isLg\.value \|\| screen\.value === 'vorlage'\)/)
  // Die Liste bleibt eingehängt (v-show): Sie nimmt eingehende Links und Dateien an.
  assert.match(view, /<LibraryBar v-show="showList" :navigate="!isLg" @open="openTemplate" \/>/)
  assert.match(view, /<template v-if="showEditor">/)
  assert.match(view, /watch\(incomingOpen, \(item\) => \{\s*if \(item\) screen\.value = 'liste'/)
})

test('die geöffnete Vorlage meldet ihre Titelzeile; „Zurück“ geht erst in den Aufbau, dann zur Liste', () => {
  const page = view.indexOf("registerSubpage('protokolle', () => !isLg.value && screen.value === 'vorlage', backToList, () => ({ title: templateLabel(root.value), backLabel: 'Zurück zu den Vorlagen' }))")
  const sub = view.indexOf("registerSubpage('protokolle', () => !isLg.value && screen.value === 'vorlage' && view.value !== 'aufbau', () => { view.value = 'aufbau' })")
  assert.ok(page > 0, 'Seite der Vorlage mit Titelzeile gemeldet')
  assert.ok(sub > page, 'die Ansicht (Eigenschaften, Vorschau) ist nach der Seite gemeldet und schließt deshalb zuerst')
})

test('die Liste behält ihre Stelle, die Vorlage beginnt oben', () => {
  assert.match(view, /function openTemplate\(\): void \{\s*listScrollTop = tabScroller\('protokolle'\)\?\.scrollTop \?\? 0\s*screen\.value = 'vorlage'\s*view\.value = 'aufbau'\s*void nextTick\(\(\) => scrollTabToTop\('protokolle', false\)\)/)
  assert.match(view, /function backToList\(\): void \{\s*screen\.value = 'liste'\s*view\.value = 'aufbau'\s*void nextTick\(\(\) => tabScroller\('protokolle'\)\?\.scrollTo\(\{ top: listScrollTop \}\)\)/)
})

test('Liste am Handy: die Zeile führt weiter (›), kein Häkchen und keine Hervorhebung', () => {
  assert.match(list, /function pick\(id: string\): void \{\s*switchTo\(id\)\s*if \(props\.navigate\) emit\('open', id\)/)
  assert.match(list, /<span v-if="navigate" class="shrink-0 text-base-content\/75" aria-hidden="true">›<\/span>/)
  assert.match(list, /<span v-if="!navigate && p\.id === editorActiveId" class="shrink-0" aria-hidden="true">✓<\/span>/)
  assert.match(list, /:class="!navigate && p\.id === editorActiveId \? 'bg-primary\/10 font-semibold text-primary' : 'hover:bg-base-200'"/)
  // Die Liste ist dort die Seite: nicht einklappbar.
  assert.match(list, /<h2 v-if="navigate"[^>]*>Vorlagen<\/h2>/)
  assert.match(list, /<ul v-if="navigate \|\| !collapsed"/)
})

test('der Speicher-Status bleibt auf der Seite der Vorlage sichtbar', () => {
  // Eigene Zeile mit fester Höhe: Der Status kommt und geht, der Text darüber darf dabei nicht umbrechen.
  assert.match(view, /<div v-if="!isLg" class="flex min-h-4 justify-end" data-editor-save-status><SaveStatusBadge \/><\/div>/)
})

test('Tipp auf den aktiven Tab führt zur Liste zurück', () => {
  assert.match(app, /if \(pageHeader\.value\) pageHeader\.value\.close\(\)\s*else scrollTabToTop\(tab\)/)
})
