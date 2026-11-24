// Wächter: Haptik über @capacitor/haptics, sparsam und abschaltbar. Der Regler „Vibration“ (Aus, Wenig, Normal,
// Viel) bestimmt, an wie vielen Stellen die App eine Rückmeldung gibt. Die Zuordnung steht an einer Stelle
// (hapticsRules.ts); im Browser und bei Fehlern bleibt die Schicht still.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  eventForClick,
  HAPTIC_ATTR,
  HAPTIC_CLICK_TARGETS,
  HAPTIC_DRAG_HANDLE,
  HAPTIC_DRAG_SLOP,
  HAPTIC_EVENTS,
  HAPTIC_SETTING_SWITCH,
  HAPTICS_LEVEL_DEFAULT,
  HAPTICS_LEVEL_MAX,
  HAPTICS_LEVEL_MIN,
  hapticFor,
  hapticsLevelLabel,
  normalizeHapticsLevel,
  previewKind,
  type HapticEvent,
  type HapticTarget,
} from './hapticsRules.ts'

const app = new URL('../..', import.meta.url).pathname
const repo = join(app, '../..')
const read = (f: string): string => readFileSync(join(app, f), 'utf8')
const code = (f: string): string => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const events = Object.keys(HAPTIC_EVENTS) as HapticEvent[]
const firing = (level: number): HapticEvent[] => events.filter((e) => hapticFor(e, level) !== null)

test('Stufen: Aus, Wenig, Normal (Standard), Viel', () => {
  assert.deepEqual([HAPTICS_LEVEL_MIN, HAPTICS_LEVEL_DEFAULT, HAPTICS_LEVEL_MAX], [0, 2, 3])
  assert.deepEqual([0, 1, 2, 3].map(hapticsLevelLabel), ['Aus', 'Wenig', 'Normal', 'Viel'])
  assert.equal(hapticsLevelLabel(undefined), 'Normal', 'ohne Wert steht der Standard da')
})

test('ungültige oder fehlende Werte werden zum Standard, gültige bleiben', () => {
  for (const ok of [0, 1, 2, 3]) assert.equal(normalizeHapticsLevel(ok), ok)
  for (const bad of [undefined, null, '', '2', 4, -1, 1.5, Number.NaN, Infinity, true, {}]) assert.equal(normalizeHapticsLevel(bad), 2, String(bad))
})

test('Tabelle Stufe → Stellen: Aus nie, jede höhere Stufe enthält die niedrigeren', () => {
  assert.deepEqual(firing(0), [], 'Aus: nie')
  // Wenig: nur das Ergebnis einer Aktion.
  assert.deepEqual(firing(1), ['sendOk', 'sendFailed', 'bridgeConnected'])
  // Normal: dazu löschende Bestätigung, Zustandsschalter, Greifen und Ablegen.
  assert.deepEqual(firing(2), ['sendOk', 'sendFailed', 'bridgeConnected', 'confirmDelete', 'statusToggle', 'dragGrab', 'dragDrop'])
  // Viel: dazu Tab-Wechsel, Schalter der Einstellungen, Fenster auf und zu.
  assert.deepEqual(firing(3), [...firing(2), 'tabSwitch', 'settingSwitch', 'windowOpen', 'windowClose'])
  for (const level of [1, 2, 3]) for (const e of firing(level - 1)) assert.ok(firing(level).includes(e), `${e} bleibt ab Stufe ${level}`)
  // Ein ungültig gespeicherter Wert verhält sich wie der Standard.
  assert.deepEqual(firing(99), firing(2))
})

test('Art der Rückmeldung: Ergebnisse als Meldung des Systems, Bedienung als kurzer Impuls', () => {
  assert.equal(hapticFor('sendOk', 1), 'success')
  assert.equal(hapticFor('sendFailed', 1), 'error')
  assert.equal(hapticFor('bridgeConnected', 1), 'success')
  assert.equal(hapticFor('confirmDelete', 2), 'warning')
  assert.equal(hapticFor('statusToggle', 2), 'light')
  assert.equal(hapticFor('dragGrab', 2), 'medium')
  assert.equal(hapticFor('dragDrop', 2), 'light')
  for (const e of ['tabSwitch', 'settingSwitch', 'windowOpen', 'windowClose'] as const) assert.equal(hapticFor(e, 3), 'light', e)
  assert.equal(hapticFor('gibtEsNicht', 3), null)
  assert.equal(hapticFor('toString', 3), null, 'nur eigene Einträge der Tabelle')
  for (const e of events) assert.ok(HAPTIC_EVENTS[e].where.length > 10, `${e}: in Worten beschrieben`)
})

test('Vorschau beim Verstellen: einmal kurz, außer bei „Aus“', () => {
  assert.equal(previewKind(0), null)
  for (const level of [1, 2, 3]) assert.equal(previewKind(level), 'light')
})

const target = (hits: Record<string, string | null>): HapticTarget => ({
  closest: (sel) => (sel in hits ? { getAttribute: () => hits[sel] } : null),
})
test('Tipp → Ereignis: Kennzeichen am Bedienelement, sonst Rückfrage oder Tab-Leiste', () => {
  assert.equal(HAPTIC_ATTR, 'data-haptic')
  assert.equal(eventForClick(target({ '[data-haptic]': 'statusToggle' })), 'statusToggle')
  assert.equal(eventForClick(target({ '[data-haptic]': 'confirmDelete' })), 'confirmDelete')
  assert.equal(eventForClick(target({ '.modal-open .modal-action .btn-error': null })), 'confirmDelete')
  assert.equal(eventForClick(target({ 'nav.dock button:not(.dock-active)': null })), 'tabSwitch')
  assert.equal(eventForClick(target({})), null, 'gewöhnlicher Tipp: keine Rückmeldung')
  assert.equal(eventForClick(target({ '[data-haptic]': 'unbekannt' })), null)
  assert.equal(eventForClick(null), null)
  assert.deepEqual(HAPTIC_CLICK_TARGETS.map((t) => t.event), ['confirmDelete', 'tabSwitch'])
})

test('nie beim Schreiben und nie beim Scrollen: nur Tipp, Schalter und der Griff zum Verschieben lösen aus', () => {
  const h = code('src/shell/haptics.ts')
  const listened = [...h.matchAll(/document\.addEventListener\(\s*'(\w+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(listened, ['backbutton', 'change', 'click', 'pointercancel', 'pointerdown', 'pointerup'])
  assert.doesNotMatch(h, /'(input|keydown|keyup|beforeinput|scroll|touchmove|pointermove|wheel)'/)
  // „change“ zählt nur für die Schalter der Einstellungen, nicht für Textfelder oder Auswahllisten.
  assert.match(h, /matches\?\.\(HAPTIC_SETTING_SWITCH\)\) haptic\('settingSwitch'\)/)
  assert.equal(HAPTIC_SETTING_SWITCH, '[data-tab-scroll="einstellungen"] input.toggle')
  // Der Griff: Greifen beim Aufsetzen, Ablegen erst nach einer Bewegung.
  assert.equal(HAPTIC_DRAG_HANDLE, '[data-option-handle]')
  assert.ok(HAPTIC_DRAG_SLOP >= 5 && HAPTIC_DRAG_SLOP <= 16)
  assert.match(h, /closest\?\.\(HAPTIC_DRAG_HANDLE\)/)
  assert.match(h, /Math\.hypot\(e\.clientX - g\.x, e\.clientY - g\.y\) > HAPTIC_DRAG_SLOP\) haptic\('dragDrop'\)/)
})

test('Schicht: Stufe aus den Einstellungen, still im Browser und bei Fehlern, nie die Einmal-Vibration', () => {
  const h = code('src/shell/haptics.ts')
  assert.match(h, /return useStorage\(\)\.settings\.hapticsLevel/)
  assert.match(h, /const kind = hapticFor\(event, level\(\)\)\s*if \(kind\) play\(kind, event\)/, 'ohne passende Stufe kein Aufruf')
  // Browser: kein Aufruf des Plugins (dessen Web-Fassung würde navigator.vibrate nutzen).
  const play = h.slice(h.indexOf('function play'), h.indexOf('function level'))
  assert.match(play, /if \(!Capacitor\.isNativePlatform\(\)\) \{\s*document\.dispatchEvent\(new CustomEvent\('resq-haptic'[^\n]*\n\s*return\s*\}/)
  assert.ok(play.indexOf('isNativePlatform') < play.indexOf('Haptics.'), 'Prüfung vor jedem Aufruf des Plugins')
  assert.match(play, /void done\.catch\(\(\) => \{/)
  assert.match(play, /\} catch \{/)
  assert.doesNotMatch(h, /Haptics\.vibrate|navigator\.vibrate|selectionStart|selectionChanged/)
  assert.match(h, /Haptics\.impact\(\{ style: ImpactStyle\.Light \}\)/)
  assert.match(h, /Haptics\.impact\(\{ style: ImpactStyle\.Medium \}\)/)
  assert.match(h, /Haptics\.notification\(/)
  assert.doesNotMatch(h, /ImpactStyle\.Heavy/)
  assert.match(code('src/main.ts'), /installAppHaptics\(\)/)
  // Fenster auf und zu: höchstens eine Rückmeldung je Tipp.
  assert.match(h, /watchWindows\(event \? haptic\(event\) : false\)/)
  assert.match(h, /if \(!alreadyPlayed\) haptic\(opened \? 'windowOpen' : 'windowClose'\)/)
  assert.match(h, /if \(!hapticFor\('windowOpen', level\(\)\)\) return/, 'unter „Viel“ wird die Seite gar nicht erst gefragt')
})

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((n: string) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : files(p, ext)
    return ext.test(n) && !/\.test\.ts$/.test(n) ? [p] : []
  })
}

test('nur die benannten Stellen: Aufrufe im Code und Kennzeichen in der Oberfläche', () => {
  // Aufrufe aus dem Code: Senden (gelungen, fehlgeschlagen), „Verbunden“ im Bridge-Fenster.
  const calls: string[] = []
  for (const f of files(join(app, 'src'), /\.(vue|ts)$/)) {
    const rel = f.slice(app.length)
    if (rel === 'src/shell/haptics.ts') continue
    for (const m of readFileSync(f, 'utf8').matchAll(/\bhaptic\('(\w+)'\)/g)) calls.push(`${rel}:${m[1]}`)
  }
  assert.deepEqual(calls.sort(), ['src/components/BridgeConnectDialog.vue:bridgeConnected', 'src/composables/usePicoApi.ts:sendFailed', 'src/composables/usePicoApi.ts:sendOk'])
  const api = code('src/composables/usePicoApi.ts')
  assert.match(api, /try \{\s*await client\.typeText\(\{ text, os, delayMs \}\)\s*haptic\('sendOk'\)\s*\} catch \(err\) \{\s*haptic\('sendFailed'\)\s*throw err\s*\}/, 'der Fehler geht unverändert weiter')

  // Kennzeichen: Zustandsschalter (App und gemeinsames Paket) und die roten Knöpfe der Rückfragen ohne Fenster.
  const marks: string[] = []
  for (const f of [...files(join(app, 'src'), /\.vue$/), ...files(join(repo, 'packages/protocol-core-ui'), /\.vue$/)]) {
    const rel = f.startsWith(join(app, 'src')) ? f.slice(app.length) : f.slice(f.indexOf('packages/'))
    for (const m of readFileSync(f, 'utf8').matchAll(/\sdata-haptic="(\w+)"/g)) marks.push(`${rel}:${m[1]}`)
  }
  assert.deepEqual(marks.sort(), [
    'packages/protocol-core-ui/components/functions/FunctionFillToggle.vue:statusToggle',
    'src/components/TriStateToggle.vue:statusToggle',
    'src/components/rebuild/ContainerFillToggle.vue:statusToggle',
    'src/components/settings/BackupSection.vue:confirmDelete',
    'src/components/settings/BackupSection.vue:confirmDelete',
    'src/components/settings/PrivacyDataSection.vue:confirmDelete',
    'src/components/settings/PznLibraryPage.vue:confirmDelete',
  ])
  // Was ohne Kennzeichen erkannt wird, steht so in der Oberfläche.
  const ui = (f: string): string => readFileSync(join(repo, 'packages/protocol-core-ui/components', f), 'utf8')
  assert.match(ui('ConfirmDialog.vue'), /<div class="modal-action">[\s\S]*?class="btn btn-error min-h-12"/)
  assert.match(ui('OptionsDialog.vue'), /:data-option-handle="row\.key"\s*@pointerdown\.prevent="startDrag\(\$event, row\.key\)"/)
  assert.match(read('src/App.vue'), /<nav class="dock[^"]*">\s*<button type="button" :class="\{ 'dock-active text-primary': activeTab === 'einsatz' \}"/)
})

test('gemeinsame Bauteile und Kernlogik bleiben frei von der Haptik-Schicht (Online-Editor unberührt)', () => {
  // Der Online-Editor hat ein eigenes öffentliches Repo und fehlt im öffentlichen App-Repo: dort nur die Pakete prüfen.
  const withEditor = existsSync(join(repo, 'apps/protocol-editor/src'))
  for (const dir of ['packages/protocol-core-ui', 'packages/shared', ...(withEditor ? ['apps/protocol-editor/src'] : [])]) {
    for (const f of files(join(repo, dir), /\.(vue|ts|mts)$/)) {
      assert.doesNotMatch(readFileSync(f, 'utf8'), /@capacitor\/haptics|shell\/haptics/, f.slice(repo.length))
    }
  }
  if (withEditor) {
    const editor = JSON.parse(readFileSync(join(repo, 'apps/protocol-editor/package.json'), 'utf8'))
    assert.equal({ ...editor.dependencies, ...editor.devDependencies }['@capacitor/haptics'], undefined)
  }
})

test('Einstellungen: Regler „Vibration“ wie die Tippgeschwindigkeit, speichert beim Ändern, Vorschau', () => {
  const t = read('src/components/settings/AppSettingsSection.vue')
  const block = t.slice(t.indexOf('<legend class="fieldset-legend">Vibration</legend>'))
  const speed = t.slice(t.indexOf('<legend class="fieldset-legend">Tippgeschwindigkeit</legend>'), t.indexOf('<legend class="fieldset-legend">Vibration</legend>'))
  // Gleiche Bauart: Name links, aktuelle Stufe rechts, Regler, Beschriftung der Enden.
  for (const part of [speed, block]) {
    assert.match(part, /<span class="text-xs text-base-content\/75"[^>]*>\{\{ \w+\(settings\.\w+\) \}\}<\/span>/)
    assert.match(part, /type="range"[\s\S]*?class="range range-sm w-full"/)
    assert.match(part, /<div class="mt-1 flex justify-between text-xs text-base-content\/75">\s*<span>[^<]+<\/span>\s*<span>[^<]+<\/span>\s*<\/div>/)
  }
  assert.match(block, /\{\{ hapticsLevelLabel\(settings\.hapticsLevel\) \}\}/)
  assert.match(block, /v-model\.number="hapticsLevel"\s*type="range"\s*:min="HAPTICS_LEVEL_MIN"\s*:max="HAPTICS_LEVEL_MAX"\s*step="1"/)
  assert.match(block, /aria-label="Vibration als Rückmeldung — weiter rechts an mehr Stellen"/)
  assert.match(block, /:aria-valuetext="hapticsLevelLabel\(settings\.hapticsLevel\)"/)
  assert.match(block, /@change="onHapticsLevel"/)
  assert.match(block, /<span>Aus<\/span>\s*<span>Viel<\/span>/)
  assert.match(code('src/components/settings/AppSettingsSection.vue'), /function onHapticsLevel\(\): void \{\s*void saveSettings\(\)\s*previewHaptics\(settings\.hapticsLevel\)\s*\}/)
})

test('Plugin exakt gepinnt und in beiden nativen Projekten eingebunden', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.dependencies['@capacitor/haptics'], '8.0.2')
  const lock = JSON.parse(read('package-lock.json'))
  assert.equal(lock.packages['node_modules/@capacitor/haptics'].version, '8.0.2')
  assert.equal(lock.packages['node_modules/@capacitor/haptics'].license, 'MIT')
  assert.match(read('android/capacitor.settings.gradle'), /include ':capacitor-haptics'\s*project\(':capacitor-haptics'\)\.projectDir = new File\('\.\.\/node_modules\/@capacitor\/haptics\/android'\)/)
  assert.match(read('android/app/capacitor.build.gradle'), /implementation project\(':capacitor-haptics'\)/)
  // iOS: Das Podfile wird von Hand gepflegt (die CLI fasst es am Mac nicht an).
  const podfile = read('ios/App/Podfile')
  assert.match(podfile, /pod 'CapacitorHaptics', :path => '\.\.\/\.\.\/node_modules\/@capacitor\/haptics'/)
  const podLock = read('ios/App/Podfile.lock')
  assert.match(podLock, /- CapacitorHaptics \(8\.0\.2\):\s*- Capacitor\n/)
  assert.match(podLock, /- "CapacitorHaptics \(from `\.\.\/\.\.\/node_modules\/@capacitor\/haptics`\)"/)
  assert.match(podLock, /CapacitorHaptics:\s*:path: "\.\.\/\.\.\/node_modules\/@capacitor\/haptics"/)
  assert.match(podLock, /\n {2}CapacitorHaptics: [0-9a-f]{40}\n/)
  // Die Prüfsumme im Lock ist SHA-1 des Podfiles: stimmt sie nicht, schreibt pod install das Lock beim Build um.
  assert.match(podLock, new RegExp(`PODFILE CHECKSUM: ${createHash('sha1').update(podfile).digest('hex')}`))
})

test('Android-Berechtigung VIBRATE kommt aus dem Plugin und ist dokumentiert; Lizenz vermerkt', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  assert.doesNotMatch(manifest, /android\.permission\.VIBRATE/, 'nicht doppelt im Manifest der App')
  assert.match(readFileSync(join(repo, 'docs/android.md'), 'utf8'), /\*\*Vibration\*\* \(`android\.permission\.VIBRATE`, ohne Rückfrage\)/)
  assert.match(readFileSync(join(repo, 'THIRD_PARTY_NOTICES.md'), 'utf8'), /\| @capacitor\/haptics \| 8\.0\.x \| MIT \| Copyright 2020-present Ionic \|/)
})
