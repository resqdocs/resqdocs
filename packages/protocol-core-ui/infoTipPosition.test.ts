// node --test --experimental-strip-types
// Position der ⓘ-Erklaerung: bleibt im sichtbaren Bereich.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { infoTipPosition } from './infoTipPosition.ts'

const vp = { left: 0, top: 0, width: 390, height: 800 }
const size = { width: 320, height: 200 }
const at = (x: number, y: number) => ({ left: x, top: y, right: x + 44, bottom: y + 44 })

test('mittig unter dem Symbol, wenn Platz ist', () => {
  assert.deepEqual(infoTipPosition(at(170, 100), size, vp), { left: 32, top: 148 })
})

test('am linken und rechten Rand bleibt sie im Bild', () => {
  assert.equal(infoTipPosition(at(0, 100), size, vp).left, 12)
  assert.equal(infoTipPosition(at(346, 100), size, vp).left, 58)
})

test('unten am Bildschirm klappt sie nach oben', () => {
  assert.equal(infoTipPosition(at(170, 740), size, vp).top, 740 - 4 - 200)
})

test('passt sie nirgends ganz, bleibt der Anfang sichtbar', () => {
  const tall = { width: 320, height: 790 }
  assert.equal(infoTipPosition(at(170, 400), tall, vp).top, 12)
})

test('schmaler als die Erklaerung: beginnt am linken Rand', () => {
  assert.equal(infoTipPosition(at(100, 100), size, { ...vp, width: 300 }).left, 12)
})
