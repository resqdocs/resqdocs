// Wächter: Beim ersten Start kommt genau EIN Hinweis (Haftung und Nutzung zusammen), danach die Einführung.
// Früher gab es zwei Hinweise mit fast gleichem Inhalt; der zweite lag unsichtbar hinter der Einführung (gleiche
// Ebene) und tauchte erst nach „Los geht's“ auf. Dazu stand ein Dateiname im Text und die nicht zutreffende Aussage,
// Eingaben würden nicht übertragen (sie gehen über die Bridge ans Zielgerät).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')
const gate = read('./DisclaimerGate.vue')
const app = read('../App.vue')
const tpl = (s: string): string => s.slice(s.indexOf('<template>'))
const hinweis = gate.slice(gate.indexOf('<!-- hinweis:start -->'), gate.indexOf('<!-- hinweis:end -->'))

// Textversion -> Prüfsumme des Wortlauts. Ändert sich der Text, schlägt dieser Test fehl: DISCLAIMER_TEXT_VERSION in
// useDisclaimer.ts anheben und hier eine neue Zeile ergänzen. So sieht jeder den geänderten Text einmal.
const WORTLAUT: Record<string, string> = {
  'hinweis-2026-11-23': '4467fa6521aef952',
}

test('ein Dialog beim Start: kein zweiter Hinweis mehr, nichts liegt versteckt hinter der Einführung', () => {
  assert.ok(!existsSync(new URL('./UsageNoticeModal.vue', import.meta.url)), 'der frühere zweite Hinweis ist entfernt')
  assert.ok(!existsSync(new URL('../composables/useUsageNotice.ts', import.meta.url)))
  assert.doesNotMatch(app, /UsageNotice|useUsageNotice/)
  assert.equal(tpl(app).match(/<DisclaimerGate\b/g)?.length, 1)
  // Die Einführung wartet auf genau diesen Hinweis.
  const guide = read('./TabGuide.vue')
  assert.match(guide, /disclaimer\.ready\.value &&\s*!disclaimer\.needsAck\.value/)
  // Der Hinweis auf eine neue App-Version wartet ebenfalls, statt unter dem Hinweis zu liegen.
  assert.match(read('./AppUpdateDialog.vue'), /v-if="notice\.visible\.value && !startNoticeOpen"/)
})

test('Wortlaut und Textversion gehören zusammen (geänderter Text = neue Textversion)', () => {
  const version = read('../composables/useDisclaimer.ts').match(/DISCLAIMER_TEXT_VERSION = '([^']+)'/)![1]
  const summe = createHash('sha256').update(hinweis.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16)
  assert.equal(WORTLAUT[version], summe, `Wortlaut geändert: DISCLAIMER_TEXT_VERSION anheben und '${summe}' hier eintragen`)
})

test('kurze Kernpunkte plus „Vollständiger Hinweis“ zum Aufklappen, offline in der App', () => {
  assert.match(hinweis, /<details\b[^>]*data-disclaimer-full/)
  assert.match(hinweis, /<summary[^>]*>Vollständiger Hinweis<\/summary>/)
  assert.doesNotMatch(hinweis, /href=/, 'der vollständige Hinweis braucht kein Netz')
  // Die Abschnitte der Repo-Fassung stehen auch in der App.
  const md = read('../../../../DISCLAIMER.md')
  for (const h of md.matchAll(/^## (.+)$/gm)) assert.ok(hinweis.includes(`>${h[1].trim()}<`), `Abschnitt „${h[1]}“ fehlt in der App`)
})

test('kein Dateiname in der Oberfläche, keine nicht zutreffende Aussage zur Übertragung', () => {
  for (const f of ['./DisclaimerGate.vue', './TabGuide.vue', './settings/InfoHelpSection.vue', './settings/LegalSection.vue']) {
    assert.doesNotMatch(tpl(read(f)), /\.md\b|DISCLAIMER/, `${f} nennt einen Dateinamen`)
  }
  assert.doesNotMatch(hinweis, /nicht übertragen|verlassen das Gerät nicht/)
  assert.match(hinweis, /über die Bridge/)
  assert.doesNotMatch(read('../../../../DISCLAIMER.md'), /Daten verlassen das Gerät nicht/)
})

test('Bestätigen sperrt, Lesen aus den Einstellungen nicht', () => {
  const t = tpl(gate)
  assert.match(t, /v-if="ready && \(needsAck \|\| reading\)"/)
  assert.match(t, /<button v-if="needsAck"[^>]*@click="acknowledge"/)
  assert.match(t, /@click\.self="!needsAck && close\(\)"/, 'Hintergrund-Tippen schließt nur beim Lesen')
  assert.match(read('./settings/InfoHelpSection.vue'), /@click="disclaimer\.show\(\)"/)
  // Knopfzeile bleibt auch bei aufgeklapptem Text erreichbar.
  assert.match(t, /class="sticky bottom-0[^"]*"/)
})
