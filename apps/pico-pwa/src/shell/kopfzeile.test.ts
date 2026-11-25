// Wächter für die Kopfzeile: Marke und ein einziger Knopf (Einführung und Anleitung, Buch im getönten Kreis).
// Die Verbindungs-Anzeige der Bridge und der Knopf-Text stehen dort nicht mehr: verbunden wird im Einsatz, der Text
// für den Knopf an der Bridge liegt unter Einstellungen > Bridge.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (f: string): string => readFileSync(new URL(f, import.meta.url), 'utf8')
const app = read('../App.vue')
const header = app.slice(app.indexOf('<header'), app.indexOf('</header>'))

// Die Kopfzeile hat zwei Zustände: Marke (Startseite eines Tabs) oder Titelzeile einer Unterseite (‹ und Name).
const page = header.slice(header.indexOf('<div v-if="pageHeader"'), header.indexOf('<div v-else class="flex-1 px-3 py-2">'))
const rest = header.replace(page, '')

test('Kopfzeile auf der Startseite eines Tabs: nur die Marke und ein Knopf', () => {
  assert.ok(page.length > 0, 'Titelzeile gefunden')
  assert.equal((rest.match(/<button\b/g) ?? []).length, 1, 'genau ein Knopf')
  assert.match(rest, /brand\.svg/)
  assert.match(rest, /h-\[45px\]/, 'die Marke bleibt das Größte der Kopfzeile')
})

test('Kopfzeile auf einer Unterseite: ‹ ohne Wort, daneben der Name der Seite, gleiche Höhe wie die Marke', () => {
  assert.equal((page.match(/<button\b/g) ?? []).length, 1)
  assert.match(page, /data-header-back @click="pageHeader\.close\(\)"/)
  assert.match(page, /:aria-label="pageHeader\.backLabel"/, 'der Name des Knopfs steht nur für den Screenreader da')
  assert.match(page, /<span aria-hidden="true" class="text-xl leading-none">‹<\/span>/)
  assert.doesNotMatch(page.replace(/<!--[\s\S]*?-->/g, ''), />\s*Zurück/, 'kein sichtbares Wort „Zurück“')
  assert.match(page, /<h1 class="min-w-0 flex-1 truncate[^"]*" data-header-title>\{\{ pageHeader\.title \}\}<\/h1>/, 'langer Name wird gekürzt')
  assert.match(page, /min-h-\[61px\]/, '45 px Marke + 16 px Abstand: kein Sprung beim Wechsel')
  assert.match(page, /min-h-11 min-w-11/, '44-px-Tippfläche')
})

test('der Knopf öffnet Einführung und Anleitung: Buch im getönten Kreis, ohne Text, 44-px-Tippfläche', () => {
  const button = rest.slice(rest.indexOf('<button'), rest.indexOf('</button>'))
  assert.match(button, /data-header-guide/)
  assert.match(button, /aria-label="Einführung und Anleitung"/)
  assert.match(button, /@click="reshowGuide"/)
  assert.match(button, /min-h-11 min-w-11/)
  assert.match(button, /size-8 place-items-center rounded-full bg-primary\/15 text-primary/)
  assert.match(button, /M12 6\.042A8\.967/, 'Buch-Symbol')
  assert.equal(button.replace(/<[^>]+>/g, '').trim(), '', 'kein sichtbarer Text')
})

test('keine Verbindungs-Anzeige und kein Knopf-Text in der Kopfzeile', () => {
  const markup = rest.replace(/<!--[\s\S]*?-->/g, '') // Kommentare zählen nicht
  assert.doesNotMatch(markup, /Bridge|bg-error|bg-success|loading-spinner/)
  assert.doesNotMatch(app, /bridgeIndicator|requestButtonText/)
  // Der Text für den Knopf an der Bridge bleibt in den Einstellungen erreichbar.
  assert.match(read('../components/settings/BridgeButtonTextSection.vue'), /requestButtonText\(\)/)
})

test('die Einführung nennt das Symbol, das es gibt', () => {
  const guide = read('../components/TabGuide.vue')
  assert.match(guide, /über das Buch-Symbol oben rechts/)
  assert.doesNotMatch(guide, /\?-Symbol/)
})
