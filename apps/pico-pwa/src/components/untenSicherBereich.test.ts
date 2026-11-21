// Wächter: Fenster, die von unten kommen (modal-bottom), halten Abstand zur Systemleiste. Sonst liegt z. B. „Schließen“
// am Android-Handy mit drei Navigationstasten unter der Leiste (Testphase 2.1.0, Fenster „Daten“).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('.', import.meta.url).pathname

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return vueFiles(path)
    return name.endsWith('.vue') ? [path] : []
  })
}

test('Jedes modal-bottom-Fenster hat unten Abstand zur Systemleiste (safe-area-inset-bottom)', () => {
  const bad: string[] = []
  let n = 0
  for (const file of vueFiles(root)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/class="modal[^"]*modal-bottom[^"]*"[^>]*>\s*<(?:div|form)[^>]*class="([^"]*modal-box[^"]*)"/g)) {
      n++
      if (!m[1].includes('safe-area-inset-bottom')) bad.push(`${file.slice(root.length)}: ${m[1]}`)
    }
  }
  assert.ok(n >= 3, `zu wenige modal-bottom-Fenster gefunden (${n})`)
  assert.deepEqual(bad, [])
})

test('Neuer Textbaustein wird ins Bild geholt', () => {
  const src = readFileSync(join(root, 'library/SnippetLibrarySection.vue'), 'utf8')
  const start = src.indexOf('async function addAndEdit')
  assert.match(src.slice(start, start + 900), /scrollIntoViewSoon\(editCardEl\.value\)/)
})
