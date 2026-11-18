import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keyboardCovers, visibleBox } from './visibleViewport.ts'

test('ohne Tastatur: der sichtbare Bereich ist das ganze Layout', () => {
  assert.deepEqual(visibleBox({ height: 852, offsetTop: 0 }, 852), { top: 0, height: 852 })
  assert.equal(keyboardCovers({ height: 852, offsetTop: 0 }, 852), false)
})

test('iOS mit Tastatur: das Layout bleibt hoch, sichtbar ist nur der Teil darüber', () => {
  assert.deepEqual(visibleBox({ height: 516, offsetTop: 0 }, 852), { top: 0, height: 516 })
  assert.equal(keyboardCovers({ height: 516, offsetTop: 0 }, 852), true)
})

test('iOS schiebt den sichtbaren Bereich beim Tippen nach unten: der Abstand wird mitgeführt', () => {
  assert.deepEqual(visibleBox({ height: 516.4, offsetTop: 87.6 }, 852), { top: 88, height: 516 })
})

test('Android verkleinert die ganze Ansicht: beide Höhen gleich, nichts wird verdeckt', () => {
  assert.deepEqual(visibleBox({ height: 480, offsetTop: 0 }, 480), { top: 0, height: 480 })
  assert.equal(keyboardCovers({ height: 480, offsetTop: 0 }, 480), false)
})

test('kleine Höhenänderungen (Adressleiste) gelten nicht als Tastatur', () => {
  assert.equal(keyboardCovers({ height: 780, offsetTop: 0 }, 852), false)
})

test('ohne visualViewport oder mit unsinnigen Werten: volle Layout-Höhe, nie negativ', () => {
  assert.deepEqual(visibleBox(null, 700), { top: 0, height: 700 })
  assert.deepEqual(visibleBox(undefined, 700.4), { top: 0, height: 700 })
  assert.deepEqual(visibleBox({ height: 0, offsetTop: 0 }, 700), { top: 0, height: 700 })
  assert.deepEqual(visibleBox({ height: 500, offsetTop: -3 }, 700), { top: 0, height: 500 })
  assert.equal(keyboardCovers(null, 700), false)
})
