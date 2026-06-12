// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('creatorSessionStore: kapselt Persistenz, nutzt KeyValue-Adapter, kein Logging', () => {
  const src = readFileSync(new URL('./creatorSessionStore.ts', import.meta.url), 'utf8')
  // Persistenz ueber den KeyValue-Adapter (kein direkter Browser-Storage)
  assert.ok(src.includes('preferencesAdapter'))
  assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\./.test(src))
  // genau ein Key
  assert.ok(src.includes("CREATOR_SESSION_KEY = 'creator.session'"))
})
