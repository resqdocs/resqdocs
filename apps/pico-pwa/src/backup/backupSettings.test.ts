// Laeuft mit: node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampMaxAge, rotationFor, DEFAULT_BACKUP_SETTINGS, MAX_AGE_MIN, MAX_AGE_MAX, MAX_AGE_DEFAULT } from './backupSettings.ts'

test('Altersgrenze ist standardmäßig aus', () => {
  assert.equal(DEFAULT_BACKUP_SETTINGS.maxAgeEnabled, false)
  assert.equal(rotationFor(DEFAULT_BACKUP_SETTINGS).maxAgeDays, null)
})

test('eingeschaltet: frei gewählte Frist geht an die Rotation (z. B. 60 Tage)', () => {
  const s = { ...DEFAULT_BACKUP_SETTINGS, maxAgeEnabled: true, maxAgeDays: 60 }
  assert.equal(rotationFor(s).maxAgeDays, 60)
})

test('ausgeschaltet: gespeicherte Frist bleibt erhalten, wirkt aber nicht', () => {
  const s = { ...DEFAULT_BACKUP_SETTINGS, maxAgeEnabled: false, maxAgeDays: 60 }
  assert.equal(rotationFor(s).maxAgeDays, null)
  assert.equal(s.maxAgeDays, 60)
})

test('clampMaxAge: Rahmen, Rundung und Unbrauchbares', () => {
  assert.equal(clampMaxAge(60), 60)
  assert.equal(clampMaxAge('90'), 90)
  assert.equal(clampMaxAge(1), MAX_AGE_MIN)
  assert.equal(clampMaxAge(0), MAX_AGE_MIN)
  assert.equal(clampMaxAge(-5), MAX_AGE_MIN)
  assert.equal(clampMaxAge(5000), MAX_AGE_MAX)
  assert.equal(clampMaxAge(45.6), 46)
  assert.equal(clampMaxAge(''), MAX_AGE_DEFAULT)
  assert.equal(clampMaxAge('  '), MAX_AGE_DEFAULT)
  assert.equal(clampMaxAge('abc'), MAX_AGE_DEFAULT)
  assert.equal(clampMaxAge(Number.NaN), MAX_AGE_DEFAULT)
})
