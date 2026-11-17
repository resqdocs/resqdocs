// Gleichstand App ↔ Online-Editor: jede Angabe in editorParity.ts wird am Code geprüft.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CAPABILITIES } from './editorParity.ts'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (!['node_modules', 'dist', 'functional', '__fixtures__'].includes(name)) out.push(...sources(p))
    } else if (/\.(vue|ts)$/.test(name) && !/\.(test|spec)\.ts$/.test(name)) out.push(p)
  }
  return out
}
const read = (files: string[]): string => files.map((f) => readFileSync(f, 'utf8')).join('\n')
// App: eigene Quellen + gemeinsame Bausteine, die NUR die App nutzt (Baum mit ＋-Menü).
const APP = read([...sources(join(ROOT, 'apps/pico-pwa/src')), join(ROOT, 'packages/protocol-core-ui/components/ContainerTreeNode.vue')])
const ONLINE = read(sources(join(ROOT, 'apps/protocol-editor/src')))

test('jede Fähigkeit hat eine eindeutige id und Anker für beide Seiten', () => {
  const ids = CAPABILITIES.map((c) => c.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(CAPABILITIES.length >= 15)
})

for (const c of CAPABILITIES) {
  test(`${c.label}: App ${c.app ? 'ja' : 'nein'}, Online-Editor ${c.online ? 'ja' : 'nein'} - stimmt mit dem Code überein`, () => {
    assert.equal(c.appAnchor.test(APP), c.app, `App: Liste sagt ${c.app ? 'ja' : 'nein'}, der Code sagt etwas anderes - editorParity.ts anpassen`)
    assert.equal(c.onlineAnchor.test(ONLINE), c.online, `Online-Editor: Liste sagt ${c.online ? 'ja' : 'nein'}, der Code sagt etwas anderes - editorParity.ts anpassen`)
    if (c.app !== c.online) assert.ok(c.reason?.trim(), `Unterschied ohne Begründung: ${c.id}`)
    else assert.equal(c.reason, undefined, `${c.id}: Gleichstand, die Begründung ist überholt - entfernen`)
  })
}
