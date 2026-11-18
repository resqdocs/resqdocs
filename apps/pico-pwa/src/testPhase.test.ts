import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseTestPhase } from './testPhase.ts'

const URL_OK = 'https://resqdocs.app/testphase/lueckentext-abcdef1234/'
const ok = { VITE_TEST_PHASE_ID: 'lueckentext', VITE_TEST_PHASE_TITLE: 'Lückentext', VITE_TEST_PHASE_URL: URL_OK }

test('parseTestPhase: vollständige Kennung ergibt eine Testphase', () => {
  assert.deepEqual(parseTestPhase(ok), { id: 'lueckentext', title: 'Lückentext', url: URL_OK })
})

test('parseTestPhase: ohne oder mit unvollständiger Kennung ist es ein normaler Build', () => {
  assert.equal(parseTestPhase(undefined), null)
  assert.equal(parseTestPhase({}), null)
  assert.equal(parseTestPhase({ ...ok, VITE_TEST_PHASE_ID: '' }), null)
  assert.equal(parseTestPhase({ ...ok, VITE_TEST_PHASE_TITLE: ' ' }), null)
  assert.equal(parseTestPhase({ ...ok, VITE_TEST_PHASE_ID: 'Lücken Text' }), null)
})

test('parseTestPhase: die Anleitung muss auf der eigenen Webseite unter /testphase/ liegen', () => {
  for (const url of ['https://evil.example/testphase/lueckentext-abcdef1234/', 'http://resqdocs.app/testphase/lueckentext-abcdef1234/',
    'https://resqdocs.app/anleitung/', 'https://resqdocs.app/testphase/kurz/', 'https://resqdocs.app.evil.example/testphase/lueckentext-abcdef1234/']) {
    assert.equal(parseTestPhase({ ...ok, VITE_TEST_PHASE_URL: url }), null, url)
  }
})

test('Mit Testphase: Einführung aus, Testhinweis beim Start, Streifen oben', () => {
  const guide = readFileSync(new URL('./components/TabGuide.vue', import.meta.url), 'utf8')
  assert.match(guide, /!TEST_PHASE &&/)
  const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')
  assert.match(app, /<TestPhaseScreen \/>/)
  assert.match(app, /data-test-phase-strip/)
  const screen = readFileSync(new URL('./components/TestPhaseScreen.vue', import.meta.url), 'utf8')
  assert.match(screen, /Testanleitung öffnen/)
  assert.match(screen, /Lösche die App nicht/, 'Hinweis gegen Datenverlust')
  assert.match(screen, /!disclaimer\.needsAck\.value/, 'erst nach dem Haftungshinweis')
  assert.match(screen, /!usage\.visible\.value/, 'erst nach dem Nutzungshinweis')
  assert.match(screen, /!usage\.visible\.value/, 'erst nach dem Nutzungshinweis')
})
