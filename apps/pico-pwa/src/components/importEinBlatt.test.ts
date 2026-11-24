// Wächter: Import aus Datei fühlt sich wie EIN Vorgang an. Früher lag „Vorlage übernehmen“ als zweites Blatt über
// „Daten“, der Hinweis danach nannte den Tab, in dem man schon war, die Empfehlung des KI-Tools stand auch bei
// vorhandenen Vorlagen da, und das Textfeld zeigte rohes JSON als Platzhalter.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { importOrt } from './importNote.ts'
import { ohneEigeneVorlage } from './rebuild/aiToolHint.ts'

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')
const libraryBar = read('./rebuild/LibraryBar.vue')
const templateIo = read('./rebuild/TemplateIO.vue')
const choice = read('./ImportChoiceDialog.vue')
const tpl = (s: string): string => s.slice(s.indexOf('<template>'))

test('nie zwei Blätter: „Daten“ schließt, sobald „Vorlage übernehmen“ aufgeht, und kommt nur beim Abbrechen zurück', () => {
  const w = libraryBar.slice(libraryBar.indexOf('watch(pendingImport'))
  assert.match(w, /^watch\(pendingImport, \(p\) => \{\s*if \(!p \|\| !dataOpen\.value\) return\s*dataOpen\.value = false/)
  // Abbrechen: erst der eigene Rückruf (gibt z. B. den Link frei), dann „Daten“ wieder auf.
  assert.match(w, /const cancel = p\.onCancel\s*p\.onCancel = \(\) => \{\s*cancel\?\.\(\)\s*dataOpen\.value = true/)
  // TemplateIO bleibt eingehängt (kein v-if am Blatt), damit Text und Link-Reservierung erhalten bleiben.
  assert.doesNotMatch(tpl(libraryBar), /<TemplateIO[^>]*v-if/)
})

test('„Aus Datei importieren…“ öffnet die Dateiauswahl direkt im selben Tipp, Einfügen bleibt zweiter Weg', () => {
  const fn = libraryBar.slice(libraryBar.indexOf('function importNewTemplate'), libraryBar.indexOf('function onPickedFile'))
  assert.match(fn, /^function importNewTemplate\(\): void \{\s*fileInput\.value\?\.click\(\)/, 'click() vor allem anderen, ohne await')
  assert.doesNotMatch(fn, /await/)
  assert.match(tpl(libraryBar), /<input ref="fileInput" type="file"[^>]*class="sr-only"[^>]*@change="onPickedFile"/)
  assert.match(libraryBar, /dataIo\.value\?\.loadFile\(file\)/)
  assert.match(templateIo, /defineExpose\(\{[^}]*loadFile/)
  // Im Blatt: Datei auswählen als Hauptknopf, darunter Text einfügen mit „Weiter“.
  const t = tpl(templateIo)
  assert.ok(t.indexOf('Datei auswählen…') > 0 && t.indexOf('Datei auswählen…') < t.indexOf('Oder Text einfügen'))
  assert.match(t, /data-import-paste @click="load\(importText\)">Weiter</)
  assert.match(tpl(libraryBar), /dataKind === 'file' \? 'Aus Datei importieren' : 'Daten'/)
  assert.match(tpl(libraryBar), /<p v-if="dataKind === 'export'"/, 'Erklärzeile zu Teilen/Export nur dort')
})

test('Hinweis nach dem Übernehmen nennt nur Tabs, in denen man gerade nicht ist', () => {
  assert.equal(importOrt('vorlagen', 'protokolle'), 'keiner')
  assert.equal(importOrt('vorlagen', 'einsatz'), 'vorlagen')
  assert.equal(importOrt('bausteine', 'bausteine'), 'keiner')
  assert.equal(importOrt('bausteine', 'protokolle'), 'bausteine')
  assert.equal(importOrt('beide', 'protokolle'), 'nurBausteine')
  assert.equal(importOrt('beide', 'bausteine'), 'nurVorlagen')
  assert.equal(importOrt('beide', 'einstellungen'), 'beide')
  // Der Dialog liest den geteilten Tab, App.vue schreibt ihn.
  assert.match(choice, /importOrt\(note\.value\.where, activeTab\.value\)/)
  assert.match(read('../App.vue'), /import \{ activeTab, type AppTab \} from '@\/composables\/useActiveTab'/)
  assert.doesNotMatch(read('../App.vue'), /const activeTab = ref/)
})

test('KI-Tool wird nur ohne Vorlage mit Inhalt empfohlen, ohne Druck', () => {
  assert.equal(ohneEigeneVorlage([{ children: [] }]), true, 'die leere Start-Vorlage zählt nicht')
  assert.equal(ohneEigeneVorlage([{ children: [] }, { children: [{}] }]), false)
  assert.equal(ohneEigeneVorlage([]), true)
  const notice = read('./rebuild/AiToolNotice.vue')
  assert.match(notice, /const visible = computed\(\(\) => notDismissed\.value && ohneEigeneVorlage\(protocols\.value\)\)/)
  assert.doesNotMatch(notice, /dringend/)
  assert.match(templateIo, /<p v-if="ohneEigeneVorlage\(protocols\)"/, 'der Tipp im Blatt folgt derselben Regel')
})

// Der Online-Editor hat ein eigenes öffentliches Repo und fehlt im öffentlichen App-Repo: dort nur die App prüfen.
const EDITOR_IMPORT = '../../../protocol-editor/src/components/ImportDialog.vue'
const withEditor = existsSync(new URL(EDITOR_IMPORT, import.meta.url))

test('Textfelder zum Einfügen zeigen kein rohes JSON als Platzhalter', () => {
  for (const f of ['./rebuild/TemplateIO.vue', './library/BlockLibrarySection.vue', './library/SnippetLibrarySection.vue', ...(withEditor ? [EDITOR_IMPORT] : [])]) {
    for (const m of read(f).matchAll(/<textarea\b[^>]*>/g)) assert.doesNotMatch(m[0], /placeholder=['"][^'"]*\{/, `${f}: JSON-Platzhalter`)
  }
})
