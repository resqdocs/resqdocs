// Wächter: „Zurück“ auf Android an einer Stelle. Reihenfolge: oberstes Fenster, Unterseite des sichtbaren Tabs,
// Tab Einsatz, dann das System (App in den Hintergrund, nie beenden). iOS bleibt unberührt.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { HOME_TAB, nextBackStep, openSubpage, type Subpage } from './backRules.ts'

const app = new URL('../..', import.meta.url).pathname
const read = (f: string): string => readFileSync(join(app, f), 'utf8')
const code = (f: string): string => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('Reihenfolge: Fenster vor Unterseite vor Tab vor System', () => {
  assert.equal(HOME_TAB, 'einsatz')
  assert.equal(nextBackStep({ window: 'open', subpage: true, tab: 'einstellungen' }), 'window')
  assert.equal(nextBackStep({ window: null, subpage: true, tab: 'einstellungen' }), 'subpage')
  assert.equal(nextBackStep({ window: null, subpage: false, tab: 'einstellungen' }), 'tab')
  assert.equal(nextBackStep({ window: null, subpage: false, tab: 'protokolle' }), 'tab')
  assert.equal(nextBackStep({ window: null, subpage: false, tab: 'bausteine' }), 'tab')
  assert.equal(nextBackStep({ window: null, subpage: false, tab: 'einsatz' }), 'system')
})

test('ein Fenster ohne Schließen-Weg bleibt offen und darunter wird nichts verstellt', () => {
  // Hinweis beim Start: nicht wegschaltbar. Unterseite und Tab bleiben, die App geht in den Hintergrund.
  assert.equal(nextBackStep({ window: 'locked', subpage: true, tab: 'einstellungen' }), 'system')
  assert.equal(nextBackStep({ window: 'locked', subpage: false, tab: 'einsatz' }), 'system')
})

test('Unterseite: nur die des sichtbaren Tabs, die zuletzt gemeldete zuerst', () => {
  const closed: string[] = []
  const page = (tab: Subpage['tab'], name: string, open: boolean): Subpage => ({ tab, isOpen: () => open, close: () => closed.push(name) })
  const list = [page('einstellungen', 'bridge', true), page('protokolle', 'eigenschaften', true), page('einstellungen', 'zu', false)]
  assert.equal(openSubpage(list, 'einsatz'), null)
  assert.equal(openSubpage(list, 'bausteine'), null)
  openSubpage(list, 'einstellungen')?.close()
  openSubpage(list, 'protokolle')?.close()
  assert.deepEqual(closed, ['bridge', 'eigenschaften'])
  assert.equal(openSubpage([page('einstellungen', 'zu', false)], 'einstellungen'), null)
})

test('eine Stelle: beim Start eingehängt, Android über @capacitor/app, iOS ohne Eingriff', () => {
  assert.match(code('src/main.ts'), /installAppBack\(\)/)
  const back = code('src/shell/back.ts')
  assert.match(back, /if \(Capacitor\.getPlatform\(\) === 'android'\) \{\s*void CapApp\.addListener\('backButton'/)
  assert.match(back, /if \(Capacitor\.isNativePlatform\(\)\) return/, 'iOS: nichts eingehängt')
  // Nur diese Datei hört auf die Zurück-Taste.
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n: string) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? files(p) : /\.(vue|ts)$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : []
    })
  const listeners = files(join(app, 'src')).filter((f) => /['"]backButton['"]/.test(readFileSync(f, 'utf8')))
  assert.deepEqual(listeners.map((f) => f.slice(app.length)), ['src/shell/back.ts'])
})

test('Wurzel: App in den Hintergrund, nie beenden; der Einsatz bleibt im Speicher', () => {
  const back = code('src/shell/back.ts')
  assert.match(back, /if \(handleBack\(\) === 'system'\) void CapApp\.minimizeApp\(\)/)
  assert.doesNotMatch(back, /exitApp/)
  // Der Tab-Wechsel zum Einsatz setzt nur den sichtbaren Tab; die Tabs bleiben eingehängt (v-show in App.vue).
  assert.match(back, /else if \(step === 'tab'\) activeTab\.value = HOME_TAB/)
})

test('Fenster: gefragt wird die Seite, geschlossen über den eigenen Weg des Fensters', () => {
  const back = code('src/shell/back.ts')
  assert.match(back, /import \{ closeLayer, installEscapeClose, topLayer \} from '@resqdocs\/protocol-core-ui\/backLayer'/)
  assert.match(back, /const layer = topLayer\(\)/)
  assert.match(back, /closeLayer\(layer\) === 'closed' \? 'open' : 'locked'/)
  assert.match(back, /const subpage = window \? null : openSubpage\(subpages, activeTab\.value\)/, 'solange ein Fenster offen ist, bleibt die Unterseite')
})

test('Unterseiten melden sich an: Einstellungen (Bridge, PZN-Bibliothek, Versionsverlauf) und Vorlagen-Ansichten', () => {
  const settings = code('src/components/settings/SettingsTab.vue')
  assert.match(settings, /onBeforeUnmount\(registerSubpage\('einstellungen', \(\) => page\.value !== 'overview', \(\) => \{ page\.value = 'overview' \}\)\)/)
  // Zurück wirkt wie „‹ Einstellungen“: derselbe Zustand, die alte Stelle der Übersicht kommt aus dem Seiten-Watcher.
  assert.match(settings, /@click="page = 'overview'"/)
  const editor = code('src/components/rebuild/EditorView.vue')
  assert.match(editor, /registerSubpage\('protokolle', \(\) => !isLg\.value && view\.value !== 'aufbau', \(\) => \{ view\.value = 'aufbau' \}\)/)
})

// Jede Datei, die ein Fenster zeichnet, hat einen Schließen-Weg, den die zentrale Stelle findet: den Rand von
// daisyUI (.modal-backdrop), einen gekennzeichneten Knopf (data-back-close), eine eigene Escape-Behandlung
// (data-back-escape) oder einen bildschirmfüllenden Rand-Knopf. Ausnahme ist nur, was bestätigt werden muss.
const LOCKED = ['src/components/DisclaimerGate.vue']
function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n: string) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : vueFiles(p)
    return n.endsWith('.vue') ? [p] : []
  })
}
test('jedes Fenster der App und des gemeinsamen Pakets hat einen Schließen-Weg für Zurück', () => {
  const roots = [join(app, 'src'), join(app, '../../packages/protocol-core-ui')]
  const missing: string[] = []
  const locked: string[] = []
  let windows = 0
  for (const file of roots.flatMap(vueFiles)) {
    const text = readFileSync(file, 'utf8')
    const template = text.slice(text.indexOf('<template>'))
    const isWindow = /<dialog\b|modal-open|class="[^"]*\bfixed inset-0\b/.test(template)
    if (!isWindow) continue
    windows++
    const hasRoute = /modal-backdrop|data-back-close|data-back-escape|<button[^>]*class="fixed inset-0\b/.test(template)
    const rel = file.startsWith(join(app, 'src')) ? file.slice(app.length) : file.slice(file.indexOf('packages/'))
    if (!hasRoute) (LOCKED.includes(rel) ? locked : missing).push(rel)
  }
  assert.ok(windows >= 25, `Fenster-Dateien gefunden: ${windows}`)
  assert.deepEqual(missing, [])
  assert.deepEqual(locked, LOCKED, 'der Hinweis beim Start muss bestätigt werden und bleibt bei Zurück offen')
})

test('gekennzeichnete Schließen-Knöpfe: Einführung, Testhinweis, Versionshinweis, Import, Scanner, Prüf-Blätter', () => {
  const marked: Record<string, RegExp> = {
    'src/components/TabGuide.vue': /data-back-close\s+@click="dismiss"/,
    'src/components/TestPhaseScreen.vue': /data-back-close @click="closed = true">Weiter zur App</,
    'src/components/AppUpdateDialog.vue': /data-back-close @click="close">Später</,
    'src/components/ImportChoiceDialog.vue': /data-back-close @click="close">Abbrechen</,
    'src/components/CodeScanOverlay.vue': /aria-label="Scanner schließen"\s+data-back-close\s+@click="emit\('cancel'\)"/,
    'src/components/rebuild/MedplanReviewSheet.vue': /aria-label="Schließen" data-back-close @click="requestDiscard"/,
    'src/components/rebuild/AerzteReviewSheet.vue': /aria-label="Schließen" data-back-close @click="discardAndClose"/,
  }
  for (const [file, pattern] of Object.entries(marked)) assert.match(read(file), pattern, file)
})
