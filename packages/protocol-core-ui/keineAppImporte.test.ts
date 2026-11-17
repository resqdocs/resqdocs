// Das gemeinsame Paket nutzen App UND Online-Editor. Ein App-Import („@/…“) würde im Editor auf dessen eigenen
// src-Ordner zeigen und erst bei dessen Typprüfung oder im Build auffallen. App-Spezifisches kommt über
// provide/inject (injection.ts) herein.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : files(p)
    return /\.(vue|ts|mts)$/.test(n) ? [p] : []
  })
}

test('keine App-Importe („@/…“) im gemeinsamen Paket', () => {
  const treffer = files(ROOT).filter((f) => /from\s+['"]@\//.test(readFileSync(f, 'utf8')))
  assert.deepEqual(treffer.map((f) => f.slice(ROOT.length)), [])
})
