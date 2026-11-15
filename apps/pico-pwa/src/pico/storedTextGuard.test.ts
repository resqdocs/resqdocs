// Tests fuer die Pruefung des Knopf-Textes: gleiche Liste und gleiche Urteile wie die Firmware.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GUARD_NEEDLES, checkStoredText, normalizeStoredText, guardMessage } from './storedTextGuard.ts'

const FW = new URL('../../../../firmware/', import.meta.url)
const header = readFileSync(new URL('bridge/bridge_s2/StoredGuard.h', FW), 'utf8')
const vectors = readFileSync(new URL('test/storedguard/vectors.tsv', FW), 'utf8')

const unescape = (s: string): string =>
  s.replace(/\\(.)/g, (_, c: string) => ({ n: '\n', t: '\t', e: '\x1b', b: '\b', r: '\r' })[c] ?? c)

test('Musterliste ist dieselbe wie in der Firmware (StoredGuard.h)', () => {
  const fw = [...header.matchAll(/^\s*\{"((?:[^"\\]|\\.)*)",\s*(true|false),\s*(true|false)\},\s*$/gm)].map(
    (m) => [m[1].replace(/\\(.)/g, '$1'), m[2] === 'true', m[3] === 'true'],
  )
  assert.ok(fw.length > 50, 'Liste aus dem Header gelesen')
  assert.deepEqual(GUARD_NEEDLES.map((n) => [...n]), fw)
})

test('gemeinsame Beispiele: gleiches Urteil wie die Firmware', () => {
  const lines = vectors.split('\n').filter((l) => l && !l.startsWith('#'))
  assert.ok(lines.length >= 30)
  for (const line of lines) {
    const tab = line.indexOf('\t')
    const want = line.slice(0, tab)
    const res = checkStoredText(unescape(line.slice(tab + 1)))
    assert.equal(res.ok ? 'ok' : res.reason, want, line.slice(tab + 1))
  }
})

test('jedes Muster greift für sich allein', () => {
  for (const [needle] of GUARD_NEEDLES) {
    const res = checkStoredText(needle)
    assert.equal(res.ok, false, needle)
    assert.equal(!res.ok && res.reason, 'command', needle)
  }
})

test('Zeilenenden werden vereinheitlicht, danach ist der Text erlaubt', () => {
  assert.equal(normalizeStoredText('a\r\nb\rc\nd'), 'a\nb\nc\nd')
  assert.deepEqual(checkStoredText(normalizeStoredText('Zeile 1\r\nZeile 2')), { ok: true })
  assert.deepEqual(checkStoredText('Zeile 1\r\nZeile 2'), { ok: false, reason: 'control' })
})

test('Meldung nennt das Muster, nie den übrigen Text', () => {
  const res = checkStoredText('Anamnese geheim\nPowerShell -c x')
  assert.equal(guardMessage(res).includes('powershell'), true)
  assert.equal(guardMessage(res).includes('geheim'), false)
  assert.equal(guardMessage({ ok: true }), '')
})
