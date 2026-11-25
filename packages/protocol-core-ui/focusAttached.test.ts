import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { focusWhenAttached } from './focusAttached.ts'

const here = dirname(fileURLToPath(import.meta.url))

test('hängt das Feld schon im Dokument, sofort fokussieren', () => {
  let n = 0
  focusWhenAttached({ isConnected: true, focus: () => { n++ } })
  assert.equal(n, 1)
})

test('hängt das Feld noch nicht, nach dem Einhängen fokussieren', async () => {
  let n = 0
  const el = { isConnected: false, focus: () => { n++ } }
  focusWhenAttached(el)
  assert.equal(n, 0)
  el.isConnected = true
  await Promise.resolve()
  assert.equal(n, 1)
})

test('wird das Feld nie eingehängt, passiert nichts', async () => {
  let n = 0
  focusWhenAttached({ isConnected: false, focus: () => { n++ } })
  await Promise.resolve()
  assert.equal(n, 0)
})

test('die Funktions-Refs der geteilten Bauteile fokussieren über focusWhenAttached', () => {
  for (const f of ['MedplanFunction.vue', 'AerzteFunction.vue']) {
    const src = readFileSync(join(here, 'components', 'functions', f), 'utf8')
    const body = src.slice(src.indexOf('function setEditName'), src.indexOf('function setEditName') + 200)
    assert.match(body, /focusWhenAttached\(el as HTMLInputElement\)/, f)
    assert.doesNotMatch(body, /\)\.focus\(\)/, f)
  }
})
