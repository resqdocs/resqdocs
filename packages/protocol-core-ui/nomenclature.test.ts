// node --test --experimental-strip-types
// Einheitliche Begriffe: Altbegriffe aus der Liste in terms.ts duerfen in sichtbaren Texten nicht zurueckkommen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
// Der Online-Editor liegt nicht in jedem Checkout, deshalb nur pruefen, was da ist.
const DIRS = ['apps/pico-pwa/src', 'apps/protocol-editor/src', 'packages/protocol-core-ui/components'].filter((d) => existsSync(join(ROOT, d)))
// Altcode ohne Oberflaeche und das abgeschaltete PZN-Woerterbuch.
const SKIP = /\.test\.|useCreatorSession|creatorSession|PznSection|PznNoticeBanner|useMedicationLookup/

const OLD_TERMS = [
  'Ausgabetext', 'Text-Ausgabe', 'in der Ausgabe', 'Geräte-ID', 'Bridge / Gerät', 'Bridge/Gerät', 'Gerät / Pico', 'Pico-Bridge',
  'BMP-Code', 'Medikamentenplan', 'Normalbefund', 'Mustertext', 'Als Baustein', 'Backup-', 'Live-Bibliothek', 'An Gerät senden',
  'In Zielgerät tippen', 'Diese Tour', 'Identifier (id)', 'KI-Hilfe', 'Standardtext', 'Protokoll-Vorlage', 'Protokoll-Editor', 'Ziel-OS',
  // Protokolltext statt Protokoll, gespeicherte Abschnitte statt Bausteine, eine Schreibweise, Umlaute im Text.
  'im Protokoll<', 'Protokoll wird', 'ungültiges Protokoll', 'Bausteine, Textbausteine', 'unter Bausteine gespeichert', 'Einsatz-Entwurf',
  'Geraet', 'liess sich', 'Link + QR', 'Abschließen', 'Einsatz abschließen',
]
// Die Seite „Neu“ der Einfuehrung nennt die alten Namen bewusst.
const ALLOWED_IN = { 'TabGuide.vue': ['Medikamentenplan'] } as Record<string, string[]>

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : files(path)
    return /\.(vue|ts)$/.test(name) && !SKIP.test(name) ? [path] : []
  })
}
const withoutComments = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '')

test('keine Altbegriffe in sichtbaren Texten', () => {
  const hits: string[] = []
  for (const dir of DIRS) {
    for (const file of files(join(ROOT, dir))) {
      const text = withoutComments(readFileSync(file, 'utf8'))
      const allowed = ALLOWED_IN[file.split('/').pop()!] ?? []
      for (const term of OLD_TERMS) if (text.includes(term) && !allowed.includes(term)) hits.push(`${file.replace(ROOT, '')}: ${term}`)
    }
  }
  assert.deepEqual(hits, [])
})

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

test('die löschende Aktion im Einsatz nennt das Löschen', () => {
  const einsatz = read('apps/pico-pwa/src/components/rebuild/EinsatzView.vue')
  assert.match(einsatz, /data-einsatz-loeschen @click="showConfirm = true">Einsatz löschen</)
  assert.match(einsatz, /<h3 class="text-base font-semibold">Einsatz löschen\?<\/h3>/)
  // Dezent wie bisher: Textknopf, kein Hauptknopf.
  assert.match(einsatz, /class="btn btn-ghost btn-sm text-error" data-einsatz-loeschen/)
})

test('Vorlagen ohne Titel heißen überall gleich, nie nach ihrer Kennung', () => {
  const files = [
    'apps/pico-pwa/src/components/rebuild/LibraryBar.vue',
    'apps/pico-pwa/src/components/rebuild/EinsatzView.vue',
    'apps/pico-pwa/src/components/rebuild/TemplateIO.vue',
    'apps/protocol-editor/src/App.vue',
    'apps/protocol-editor/src/components/ShareDialog.vue',
  ].filter((f) => existsSync(join(ROOT, f)))
  for (const f of files) {
    const s = read(f)
    assert.doesNotMatch(s, /\|\| (p|active\.value\?)\.id\b/, `${f} zeigt die Kennung als Namen`)
    assert.match(s, /templateLabel\(/, f)
  }
  assert.doesNotMatch(read('apps/pico-pwa/src/components/rebuild/EinsatzView.vue'), /\|\| 'Vorlage'/)
})
