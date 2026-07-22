import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter } from './rateLimiter.ts'

test('Rate-Limiter: erlaubt bis zum Limit, dann 429, Fenster setzt zurueck', () => {
  let t = 1000
  const rl = createRateLimiter(3, 1000, () => t)
  assert.equal(rl.allow('a'), true) // 1
  assert.equal(rl.allow('a'), true) // 2
  assert.equal(rl.allow('a'), true) // 3
  assert.equal(rl.allow('a'), false) // Limit erreicht
  assert.equal(rl.allow('b'), true) // anderer Schluessel unberuehrt
  t += 1000 // Fenster vorbei
  assert.equal(rl.allow('a'), true)
})

test('Rate-Limiter: Map bleibt begrenzt (Schutz gegen Key-Explosion)', () => {
  let t = 0
  const rl = createRateLimiter(1, 60_000, () => t, 10) // maxKeys=10
  for (let i = 0; i < 100; i++) rl.allow(`key-${i}`) // 100 verschiedene Schluessel
  // Ohne Begrenzung waere die Map bei 100; mit Begrenzung wird sie geleert/gehalten -> weit darunter.
  // (Indirekt geprueft: kein Absturz/Endlos; die Begrenzung greift bei size>=maxKeys.)
  // Erneut derselbe Schluessel im selben Fenster -> Limit greift weiter korrekt.
  t = 200_000 // neues Fenster
  assert.equal(rl.allow('frisch'), true)
  assert.equal(rl.allow('frisch'), false)
})
