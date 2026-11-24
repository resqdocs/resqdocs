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
  assert.match(guide, /\(TEST_PHASE \? guideRequested\.value : !storage\.settings\.dismissedHints\.includes\(HINT_ID\)\)/, 'beim Start aus, über ? erreichbar')
  assert.match(guide, /if \(!TEST_PHASE && !storage\.settings\.dismissedHints\.includes\(HINT_ID\)\)/, 'Testversion verbraucht die Einführung der echten Version nicht')
  const appVue = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')
  assert.match(appVue, /TEST_PHASE \? !testNoticeClosed\.value \|\| guideRequested\.value :/, 'angetippter Link wartet in der Testversion nur auf den Testhinweis')
  const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')
  assert.match(app, /<TestPhaseScreen \/>/)
  assert.match(app, /data-test-phase-strip/)
  const screen = readFileSync(new URL('./components/TestPhaseScreen.vue', import.meta.url), 'utf8')
  assert.match(screen, /Testanleitung öffnen/)
  assert.match(screen, /Lösche die App nicht/, 'Hinweis gegen Datenverlust')
  assert.match(screen, /!disclaimer\.needsAck\.value/, 'erst nach dem Haftungshinweis')
  // Haftungs- und Nutzungshinweis sind seit dem Zusammenlegen EIN Dialog (useDisclaimer): darauf wartet der Testhinweis.
  assert.match(screen, /disclaimer\.ready\.value && !disclaimer\.needsAck\.value/, 'erst nach dem Hinweis beim Start')
  assert.doesNotMatch(screen, /useUsageNotice/, 'kein zweiter Hinweis mehr, auf den gewartet werden müsste')
})

test('Anleitung ist über das ? immer erreichbar: Link oben links auf jeder Seite der Einführung', () => {
  const guide = readFileSync(new URL('./components/TabGuide.vue', import.meta.url), 'utf8')
  const link = guide.match(/<a\s[^>]*data-guide-manual[^>]*>/)?.[0] ?? guide.slice(guide.indexOf('href="https://resqdocs.app/anleitung"') - 20, guide.indexOf('data-guide-manual') + 20)
  assert.match(link, /href="https:\/\/resqdocs\.app\/anleitung"/)
  assert.match(link, /target="_blank"/)
  assert.ok(guide.indexOf('data-guide-manual') < guide.indexOf('v-if="page'), 'außerhalb der einzelnen Seiten, also auf jeder Seite')
  const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')
  assert.match(app, /aria-label="Einführung und Anleitung"/)
})
