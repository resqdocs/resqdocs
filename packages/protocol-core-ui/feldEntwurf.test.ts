// Wächter: Ein Textfeld, das erst beim Verlassen übernimmt (@change), braucht einen Entwurf (@input). Sonst setzt
// jedes Neuzeichnen der Komponente, etwa wenn die Tastatur auf- oder zugeht, das Feld auf den gespeicherten Stand
// zurück: Vue schreibt `:value` neu, sobald es vom Inhalt im Feld abweicht.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const here = new URL('.', import.meta.url).pathname
// Geteilte Oberfläche (App und Online-Editor); hier messen Fenster den sichtbaren Bereich und zeichnen dabei neu.
const roots = [join(here, 'components')]
const NOT_TEXT = /type="(checkbox|radio|range|file|color|date|time|datetime-local|month|week)"/

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return vueFiles(path)
    return name.endsWith('.vue') ? [path] : []
  })
}

test('Textfelder mit :value und @change haben auch @input (Entwurf)', () => {
  const bad: string[] = []
  for (const file of roots.flatMap(vueFiles)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/<(textarea|input)\b[^>]*>/gs)) {
      const tag = m[0]
      if (NOT_TEXT.test(tag)) continue
      if (/:value=/.test(tag) && /@change=/.test(tag) && !/@input=/.test(tag)) bad.push(`${file}: ${tag.slice(0, 80)}`)
    }
  }
  assert.deepEqual(bad, [])
})

test('Lückentext: Antworten-Feld zeigt den Entwurf, solange getippt wird', () => {
  const src = readFileSync(join(here, 'components/cloze/ClozeEditorDialog.vue'), 'utf8')
  const tag = src.match(/<textarea[^>]*data-cloze-editor-options[^>]*>/s)?.[0] ?? ''
  assert.match(tag, /:value="optionsDraft \?\? optionsText"/)
  assert.match(tag, /@input="optionsDraft = /)
  assert.match(tag, /@blur="optionsDraft = null"/)
})
