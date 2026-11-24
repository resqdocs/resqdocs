// Wächter für die App-Hülle: Kopfzeile, Inhalt und Tab-Leiste stehen fest, das Dokument scrollt nie, jeder Tab
// scrollt in seinem eigenen Bereich. Vorher scrollte die App als ganzes Dokument; iOS schob dann beim Fokus in ein
// Feld die ganze Seite samt Kopfzeile hoch, und alle Tabs teilten sich eine Scrollposition.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const src = new URL('..', import.meta.url).pathname
const read = (f: string): string => readFileSync(join(src, f), 'utf8')
const app = read('App.vue')
const template = app.slice(app.indexOf('<template>'))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(vue|ts)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })
}

test('Dokument scrollt nie und federt nicht: html und body ohne Scroll', () => {
  const css = read('style.css')
  assert.match(css, /html,\s*body \{\s*overflow: hidden;\s*overscroll-behavior: none;\s*\}/)
})

test('Hülle füllt den Bildschirm: Kopfzeile, Inhalt, Tab-Leiste untereinander in voller Höhe', () => {
  assert.match(template, /<div class="flex h-dvh flex-col overflow-hidden[^"]*" data-app-shell>/)
  const header = template.match(/<header class="navbar([^"]*)"/)?.[1] ?? ''
  assert.doesNotMatch(header, /\bsticky\b|\bfixed\b/, 'die Kopfzeile ist Teil der Hülle, nicht an einen Seiten-Scroll gehängt')
  assert.match(header, /\bshrink-0\b/)
  assert.match(header, /env\(safe-area-inset-top\)/, 'Kopfzeile weicht der Statusleiste aus')
  assert.match(template, /<main class="relative min-h-0 w-full flex-1">/)
  const dock = template.match(/<nav class="dock([^"]*)"/)?.[1] ?? ''
  assert.match(dock, /\bstatic\b/, 'Tab-Leiste steht in der Hülle statt daisyUI-fixed am Fensterrand')
  assert.match(dock, /\bshrink-0\b/)
  // Höhe und unterer Innenabstand der Tab-Leiste (inkl. safe-area-inset-bottom) kommen von daisyUI .dock.
  assert.doesNotMatch(dock, /(^|\s)(h-|pb-|py-|p-)/, 'Höhe und Sicherheitsabstand der Leiste nicht überschreiben')
})

test('je Tab ein eigener Scrollbereich, der beim Ausblenden seine Position behält', () => {
  const areas = [...template.matchAll(/<div v-show="activeTab === '(\w+)'" class="([^"]*)" data-tab-scroll="(\w+)">/g)]
  assert.deepEqual(areas.map((m) => m[1]).sort(), ['bausteine', 'einsatz', 'einstellungen', 'protokolle'])
  for (const [, tab, cls, name] of areas) {
    assert.equal(name, tab)
    assert.match(cls, /\babsolute inset-0\b/, tab)
    assert.match(cls, /\boverflow-y-auto\b/, tab)
    assert.match(cls, /\boverscroll-y-contain\b/, `${tab}: am Rand läuft das Wischen nicht auf die Hülle über`)
    // Abstand oben am Inhalt: sonst hält ein klebender Umschalter (sticky top-0) Abstand zur Kopfzeile.
    assert.doesNotMatch(cls, /(^|\s)(md:)?(p|pt|py)-\d/, `${tab}: kein Innenabstand oben am Scrollbereich`)
  }
  // Keine gemerkten Fenster-Positionen mehr: jeder Bereich behält seine eigene.
  assert.doesNotMatch(app, /scrollPositions/)
})

test('Tab-Wechsel blendet weich ein: nur Deckkraft, etwa 150 ms, nicht bei „Bewegung reduzieren“', () => {
  const css = read('style.css')
  // Nur Deckkraft, kein Schieben; kein Endzustand, der hängen bleibt.
  assert.match(css, /@keyframes rd-tab-in \{\s*from \{ opacity: 0; \}\s*\}/)
  const rule = css.match(/@media \(prefers-reduced-motion: no-preference\) \{\s*\[data-tab-scroll\] \{\s*animation: ([^;]+);\s*\}\s*\}/)
  assert.ok(rule, 'Animation nur ohne „Bewegung reduzieren“')
  const ms = Number(rule[1].match(/rd-tab-in (\d+)ms/)?.[1])
  assert.ok(ms >= 120 && ms <= 180, `Dauer ${ms} ms`)
  assert.doesNotMatch(rule[1], /forwards|both|infinite/)
  assert.doesNotMatch(css.replace(rule[0], ''), /\[data-tab-scroll\][^{]*\{[^}]*(animation|transition|transform)/, 'sonst keine Bewegung am Tab-Bereich')
  // Der Wechsel selbst bleibt sofort: v-show am Bereich, keine <Transition>, die den alten Tab stehen ließe.
  assert.doesNotMatch(template, /<Transition|<transition/)
  // Derselbe Tab noch einmal: kein neues Einblenden, nur nach oben (der Bereich wird nicht aus- und eingeblendet).
  assert.match(app, /if \(activeTab\.value === tab\) \{\s*scrollTabToTop\(tab\)\s*return\s*\}\s*activeTab\.value = tab/)
})

test('kein Fenster-Scroll mehr in der App: alles läuft über den Bereich des Tabs', () => {
  const bad: string[] = []
  for (const file of sourceFiles(src)) {
    const text = readFileSync(file, 'utf8')
    if (/window\.(scrollTo|scrollBy|scroll)\(|window\.(scrollY|pageYOffset)|document\.(scrollingElement|documentElement\.scrollTop|body\.scrollTop)/.test(text)) {
      bad.push(file.slice(src.length))
    }
  }
  assert.deepEqual(bad, [])
  assert.match(read('shell/tabScroll.ts'), /\[\$\{TAB_SCROLL_ATTR\}="\$\{tab\}"\]/)
  // Erneutes Antippen des aktiven Tabs bringt dessen Bereich nach oben.
  assert.match(app, /if \(activeTab\.value === tab\) \{\s*scrollTabToTop\(tab\)/)
})

test('klebende Umschalter hängen am Tab-Bereich, ohne feste Annahme über die Höhe der Kopfzeile', () => {
  for (const f of ['components/rebuild/EinsatzView.vue', 'components/rebuild/EditorView.vue']) {
    const t = read(f)
    assert.match(t, /<div class="sticky top-0 z-\[5\]/, f)
  }
  for (const file of sourceFiles(src)) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /safe-area-inset-top,0px\)\+4rem/, file.slice(src.length))
  }
})

test('Tipp-Anzeige steht in der Hülle über der Tab-Leiste und verdeckt keinen Inhalt', () => {
  const t = read('components/TypingProgressBar.vue')
  const root = t.slice(t.indexOf('<template>')).match(/v-if="typing\.visible\.value && s"\s*class="([^"]*)"/)?.[1] ?? ''
  assert.doesNotMatch(root, /\bfixed\b/)
  assert.match(root, /\bshrink-0\b/)
  assert.ok(template.indexOf('<TypingProgressBar />') < template.indexOf('<nav class="dock'), 'über der Tab-Leiste')
  assert.ok(template.indexOf('</main>') < template.indexOf('<TypingProgressBar />'), 'unter dem Inhalt')
  assert.doesNotMatch(template, /pb-64|pb-24/, 'kein Platzhalter mehr für überlagernde Leisten')
})

test('Bridge-Seite: nachgeladener Stand reserviert seinen Platz, Zielgerät-Auswahl nicht abgeschnitten', () => {
  const t = read('components/settings/BridgeButtonTextSection.vue')
  const slot = t.match(/<div class="([^"]*)" data-button-text-status>([\s\S]*?)<\/div>/)
  assert.ok(slot, 'fester Platz für den Stand')
  assert.match(slot[1], /min-h-\[3\.75rem\]/)
  assert.doesNotMatch(slot[2].match(/<p[^>]*role="status"[^>]*>/)?.[0] ?? 'fehlt', /v-if/, 'Statuszeile immer da, nicht per v-if')
  const d = read('components/settings/DeviceSection.vue')
  const sel = d.match(/<select v-model="os" class="([^"]*)"/)?.[1] ?? ''
  assert.match(sel, /(^|\s)w-full(\s|$)/, 'am Handy volle Breite')
  assert.doesNotMatch(sel, /(^|\s)w-32(\s|$)/)
})

test('Einstellungen: Unterseite öffnet oben, „‹ Einstellungen“ kehrt an die alte Stelle zurück', () => {
  const t = read('components/settings/SettingsTab.vue')
  assert.match(t, /if \(before === 'overview'\) overviewTop = scroller\.scrollTop/)
  assert.match(t, /const top = p === 'overview' \? overviewTop : 0/)
  assert.match(t, /tabScroller\('einstellungen'\)/)
})
