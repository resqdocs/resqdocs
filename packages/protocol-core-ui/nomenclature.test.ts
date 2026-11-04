// node --test --experimental-strip-types
// Einheitliche Begriffe: Altbegriffe aus der Liste in terms.ts duerfen in sichtbaren Texten nicht zurueckkommen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const DIRS = ['apps/pico-pwa/src', 'packages/protocol-core-ui/components']
// Altcode ohne Oberflaeche und das abgeschaltete PZN-Woerterbuch.
const SKIP = /\.test\.|useCreatorSession|creatorSession|PznSection|PznNoticeBanner|useMedicationLookup/

const OLD_TERMS = [
  'Ausgabetext', 'Text-Ausgabe', 'in der Ausgabe', 'Geräte-ID', 'Bridge / Gerät', 'Bridge/Gerät', 'Gerät / Pico', 'Pico-Bridge',
  'BMP-Code', 'Medikamentenplan', 'Normalbefund', 'Mustertext', 'Als Baustein', 'Backup-', 'Live-Bibliothek', 'An Gerät senden',
  'In Zielgerät tippen', 'Diese Tour', 'Identifier (id)', 'KI-Hilfe', 'Standardtext', 'Protokoll-Vorlage', 'Protokoll-Editor', 'Ziel-OS',
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
