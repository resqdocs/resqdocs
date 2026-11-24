// Wächter: Bildschirmtastatur über @capacitor/keyboard. Die WebView scrollt nie, die Tastatur verkleinert das Layout
// (iOS über das Plugin, Android über Capacitor selbst), auf iOS ohne die Leiste ↑ ↓ ✓.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isSingleLine, isTextField, tapClosesKeyboard, TAP_SLOP } from './keyboardRules.ts'

const app = new URL('../..', import.meta.url).pathname
const read = (f: string): string => readFileSync(join(app, f), 'utf8')
const code = (f: string): string => read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

test('Konfiguration: WebView scrollt nicht, Tastatur verkleinert die WebView, kein resizeOnFullScreen', () => {
  const cfg = code('capacitor.config.ts')
  // Daneben steht nur noch die abgeschaltete Link-Vorschau (webReste.test.ts).
  assert.match(cfg, /ios: \{\s*scrollEnabled: false,\s*allowsLinkPreview: false,?\s*\}/)
  assert.match(cfg, /Keyboard: \{\s*resize: 'native',?\s*\}/)
  // Android: Capacitor (SystemBars) verkleinert selbst und warnt vor resizeOnFullScreen daneben.
  assert.doesNotMatch(cfg, /resizeOnFullScreen/)
})

test('Plugin exakt gepinnt und in beiden nativen Projekten eingebunden', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.dependencies['@capacitor/keyboard'], '8.0.6')
  assert.match(read('android/capacitor.settings.gradle'), /include ':capacitor-keyboard'/)
  assert.match(read('android/app/capacitor.build.gradle'), /implementation project\(':capacitor-keyboard'\)/)
  // iOS: Das Podfile wird von Hand gepflegt (die CLI fasst es am Mac nicht an).
  const podfile = read('ios/App/Podfile')
  assert.match(podfile, /pod 'CapacitorKeyboard', :path => '\.\.\/\.\.\/node_modules\/@capacitor\/keyboard'/)
  const lock = read('ios/App/Podfile.lock')
  assert.match(lock, /- CapacitorKeyboard \(8\.0\.6\):/)
  // Die Prüfsumme im Lock ist SHA-1 des Podfiles: stimmt sie nicht, schreibt pod install das Lock beim Build um.
  const sum = createHash('sha1').update(podfile).digest('hex')
  assert.match(lock, new RegExp(`PODFILE CHECKSUM: ${sum}`))
})

test('Zubehörleiste ↑ ↓ ✓ bleibt aus: die App blendet sie nirgends ein', () => {
  assert.doesNotMatch(code('src/shell/keyboard.ts'), /setAccessoryBarVisible/)
  assert.match(code('src/main.ts'), /installAppKeyboard\(\)/)
})

test('Ohne ✓ (nur iOS): Enter schließt einzeilige Felder, Tipp daneben schließt, Feld nach dem Verkleinern im Bild', () => {
  const k = code('src/shell/keyboard.ts')
  assert.match(k, /const ios = Capacitor\.getPlatform\(\) === 'ios'/)
  assert.match(k, /if \(ios\) installIosHelpers\(\)/, 'nur iOS: Android hat eigene Knöpfe')
  assert.match(k, /el\.enterKeyHint = 'done'/)
  assert.match(k, /e\.key !== 'Enter' \|\| e\.defaultPrevented \|\| e\.isComposing/)
  assert.match(k, /document\.activeElement === el\) el\.blur\(\)/)
  assert.match(k, /Math\.hypot\(e\.clientX - d\.x, e\.clientY - d\.y\) > TAP_SLOP/)
  assert.match(k, /el\.scrollIntoView\(\{ block: 'nearest' \}\)/)
})

test('Fenster mit Tastatur: der Tab darunter bleibt stehen, nach „Fertig“ steht die Ansicht wie vorher', () => {
  const k = code('src/shell/keyboard.ts')
  assert.match(k, /if \(held \|\| !isTextField\(el\) \|\| !el\.closest\(MODAL\)\) return/)
  assert.match(k, /held = \[\.\.\.document\.querySelectorAll<HTMLElement>\('\[data-tab-scroll\]'\)\]/)
  assert.match(k, /window\.addEventListener\('resize', \(\) => \{\s*if \(!held\) return\s*restoreTabs\(\)/)
  assert.match(k, /if \(was && !open\) releaseTabsSoon\(\)/)
  assert.match(k, /installTabHold\(\)\s*if \(!Capacitor\.isNativePlatform\(\)\)/, 'auf beiden Plattformen und im Browser')
  // Fokus beim Öffnen der Vollbild-Fenster scrollt die Seite darunter nicht.
  const pcui = '../../packages/protocol-core-ui/components/'
  assert.match(code(`${pcui}LongTextDialog.vue`), /area\.value\?\.focus\(\{ preventScroll: true \}\)/)
  assert.match(code(`${pcui}cloze/ClozeEditorDialog.vue`), /area\.value\?\.focus\(\{ preventScroll: true \}\)/)
})

test('App: keine eigene Rechnung mit dem sichtbaren Bereich mehr, die Tastatur verkleinert das Layout', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n: string) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? files(p) : /\.(vue|ts)$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : []
    })
  const bad = files(join(app, 'src')).filter((f) => /window\.visualViewport|--kb-inset|--vv-(h|top)/.test(code(f.slice(app.length))))
  assert.deepEqual(bad, [])
})

const el = (tagName: string, extra: Record<string, unknown> = {}): Element =>
  ({ tagName, type: 'text', isContentEditable: false, contains: () => false, closest: () => null, ...extra }) as unknown as Element

test('Regeln: welche Felder eine Tastatur haben und wann ein Tipp sie schließt', () => {
  assert.equal(isTextField(el('INPUT')), true)
  assert.equal(isTextField(el('INPUT', { type: 'checkbox' })), false)
  assert.equal(isTextField(el('TEXTAREA')), true)
  assert.equal(isTextField(el('DIV', { isContentEditable: true })), true)
  assert.equal(isTextField(el('BUTTON')), false)
  assert.equal(isSingleLine(el('INPUT', { type: 'search' })), true)
  assert.equal(isSingleLine(el('TEXTAREA')), false, 'Textbereiche: Enter ist ein Zeilenumbruch')
  const field = el('INPUT')
  assert.equal(tapClosesKeyboard(el('DIV'), field), true, 'leere Fläche schließt')
  assert.equal(tapClosesKeyboard(el('SPAN', { closest: () => ({}) }), field), false, 'Knopf, Feld, Label: nichts')
  assert.equal(tapClosesKeyboard(el('DIV'), el('BUTTON')), false, 'ohne offenes Textfeld nichts zu tun')
  assert.equal(tapClosesKeyboard(el('DIV'), el('TEXTAREA', { contains: () => true })), false, 'Tipp ins Feld selbst')
  assert.ok(TAP_SLOP >= 5 && TAP_SLOP <= 16)
})
