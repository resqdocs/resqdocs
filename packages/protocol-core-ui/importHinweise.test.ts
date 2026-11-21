// Wächter: Texte rund um Import und Sicherung beschreiben, was die App wirklich zeigt.
// Der Import einer Vorlage läuft über „Aus Datei importieren…“ unter der Liste der Vorlagen; einen Weg
// „⋮ → Daten → Importieren“ gibt es nicht. App, KI-Seite und KI-Doku müssen denselben Weg nennen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (f: string): string => readFileSync(new URL(f, import.meta.url), 'utf8')
const ALTER_WEG = /Daten["'“‘’]*\s*→\s*["'„‚‘]*Importieren/

test('App, KI-Seite und KI-Doku nennen den echten Importweg', () => {
  const quellen = {
    app: '../../apps/pico-pwa/src/components/rebuild/AiToolNotice.vue',
    kiSeite: '../../apps/ai-page/src/App.vue',
    docDe: '../../ai-docs/doc.template.de.md',
    docEn: '../../ai-docs/doc.template.en.md',
    genDe: '../../ai-docs/generated/doc.de.md',
    genEn: '../../ai-docs/generated/doc.en.md',
  }
  for (const [name, f] of Object.entries(quellen)) {
    const t = read(f)
    assert.doesNotMatch(t, ALTER_WEG, `${name} nennt noch den alten Weg „Daten → Importieren“`)
    assert.match(t, /Aus Datei importieren…/, `${name} nennt „Aus Datei importieren…“ nicht`)
  }
  // Die Beschriftung, auf die sich alle beziehen, gibt es in der App.
  assert.match(read('../../apps/pico-pwa/src/components/rebuild/LibraryBar.vue'), /Aus Datei importieren…/)
})

test('Auswahl beim Import: ein Eintrag steht in der Einzahl', () => {
  const t = read('components/ImportPickList.vue')
  assert.match(t, /vorlage: \{ eins: 'Vorlage'/)
  assert.match(t, /abschnitt: \{ eins: 'gespeicherter Abschnitt'/)
  assert.match(t, /textbaustein: \{ eins: 'Textbaustein'/)
  assert.match(t, /items\.length === 1 \? `1 \$\{w\.eins\} enthalten\.`/)
})

test('Sicherung teilen: der Text nennt alles, was die Datei enthält', () => {
  const t = read('../../apps/pico-pwa/src/components/settings/ShareConfirmBox.vue').replace(/\s+/g, ' ')
  assert.match(t, /nur Vorlagen, gespeicherte Abschnitte, Textbausteine und die PZN-Datenbank — keine Patientendaten/)
  // Gegenprobe: die Sicherung enthält tatsächlich diese vier Teile.
  assert.match(read('../../apps/pico-pwa/src/backup/backupService.ts'), /const \[protocols, blocks, snippets, pzn\]/)
})
