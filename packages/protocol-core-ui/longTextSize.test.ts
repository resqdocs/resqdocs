import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LONG_TEXT_SIZES, LONG_TEXT_SIZE_DEFAULT, LONG_TEXT_SIZE_LABEL, LONG_TEXT_SIZE_PX, parseLongTextSize } from './longTextSize.ts'

test('drei Stufen, „normal“ ist der Standard und bleibt bei 16 px', () => {
  assert.deepEqual([...LONG_TEXT_SIZES], ['sm', 'md', 'lg'])
  assert.equal(LONG_TEXT_SIZE_DEFAULT, 'md')
  assert.equal(LONG_TEXT_SIZE_PX.md, 16)
})

test('die Stufen werden größer, die kleinste bleibt gut lesbar (mindestens 14 px)', () => {
  assert.ok(LONG_TEXT_SIZE_PX.sm < LONG_TEXT_SIZE_PX.md && LONG_TEXT_SIZE_PX.md < LONG_TEXT_SIZE_PX.lg)
  assert.ok(LONG_TEXT_SIZE_PX.sm >= 14)
})

test('jede Stufe hat einen Namen', () => {
  for (const s of LONG_TEXT_SIZES) assert.ok(LONG_TEXT_SIZE_LABEL[s].length > 0)
})

test('gespeicherte Werte: bekannte bleiben, alles andere wird zum Standard', () => {
  assert.equal(parseLongTextSize('sm'), 'sm')
  assert.equal(parseLongTextSize('lg'), 'lg')
  for (const bad of [null, undefined, '', 'xl', 16, {}, 'MD']) assert.equal(parseLongTextSize(bad), 'md')
})
