import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { unchangedSince } from './sheetGuard.ts'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, 'components', 'functions')

test('unverändert, bis sich ein Wert ändert', () => {
  const state = { a: null as number | null, pick: { x: null as string | null } }
  const unchanged = unchangedSince(() => [state.a, state.pick])
  assert.equal(unchanged(), true)
  state.pick.x = 'ja'
  assert.equal(unchanged(), false)
  state.pick.x = null
  assert.equal(unchanged(), true)
})

test('ein geleertes Zahlenfeld (NaN) zählt wie leer', () => {
  const state = { a: null as number | null }
  const unchanged = unchangedSince(() => [state.a])
  state.a = Number.NaN
  assert.equal(unchanged(), true)
  state.a = 80
  assert.equal(unchanged(), false)
})

test('jedes Eingabe-Fenster einer Funktion schließt beim Tipp daneben nur unverändert', () => {
  // ListSheet (Medikationsplan, Kontakte) gehört nicht dazu: Dort gilt jede Eingabe sofort, es gibt nichts zu
  // verwerfen. Am Handy hat es keinen Rand zum Danebentippen, im mittigen Dialog schließt der Rand wie „Fertig“.
  const sheets = readdirSync(dir).filter((f) => f.endsWith('Sheet.vue') && f !== 'ListSheet.vue')
  assert.ok(sheets.length >= 8, 'erwartet mindestens acht Fenster')
  for (const f of sheets) {
    const src = readFileSync(join(dir, f), 'utf8')
    const backdrop = src.split('\n').filter((l) => l.includes('class="modal-backdrop"'))
    assert.equal(backdrop.length, 1, `${f}: genau ein abgedunkelter Bereich`)
    assert.match(backdrop[0], /@click="unchanged\(\) && emit\('close'\)"/, `${f}: Tipp daneben ungeschützt`)
    assert.match(src, /const unchanged = unchangedSince\(/, `${f}: Stand beim Öffnen fehlt`)
  }
})
