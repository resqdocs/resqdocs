// Die eine Quelle fuer FAST4D (fast4dDefs.mjs) muss mit allen Nutzern zusammenpassen: Rechenkern, Registry,
// Entwurf und Eingabeblatt. Faellt hier etwas auseinander, fiele ein Zeichen still aus Text oder Entwurf.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  FAST4D_BEFUNDE, FAST4D_SEITEN, FAST4D_ZEITARTEN, FAST4D_UHRZEIT, FAST4D_ZEICHEN, FAST4D_ZEIT_KEYS,
  fast4dComplete, fast4dInput, fast4dEnumFields,
} from './fast4dDefs.mjs'
import { fast4d } from './scores.mjs'

const ALLE_POS = Object.fromEntries(FAST4D_ZEICHEN.map((z) => [z.rowKey, 'pos']))

test('sieben Zeichen, eindeutige Schluessel, Seite nur bei Face und Arm', () => {
  assert.equal(FAST4D_ZEICHEN.length, 7)
  assert.equal(new Set(FAST4D_ZEICHEN.map((z) => z.id)).size, 7)
  assert.equal(new Set(FAST4D_ZEICHEN.map((z) => z.rowKey)).size, 7)
  assert.deepEqual(FAST4D_ZEICHEN.filter((z) => z.sideKey).map((z) => z.id), ['face', 'arm'])
  for (const z of FAST4D_ZEICHEN) assert.match(z.rowKey, /^fast[A-Z]/, 'Praefix wie in FAST4DRow')
  assert.ok(Object.isFrozen(FAST4D_ZEICHEN) && FAST4D_ZEICHEN.every(Object.isFrozen))
})

test('Uhrzeit: nur HH:MM von 00:00 bis 23:59', () => {
  for (const ok of ['00:00', '09:05', '14:30', '23:59']) assert.ok(FAST4D_UHRZEIT.test(ok), ok)
  for (const nein of ['24:00', '9:05', '14:3', '14:60', '14:30 Uhr', ' 14:30', '']) assert.ok(!FAST4D_UHRZEIT.test(nein), nein)
})

test('vollstaendig erst mit allen sieben Befunden; Seite und Zeit freiwillig', () => {
  assert.equal(fast4dComplete(undefined), false)
  assert.equal(fast4dComplete(ALLE_POS), true)
  for (const z of FAST4D_ZEICHEN) {
    const ohne = { ...ALLE_POS }
    delete ohne[z.rowKey]
    assert.equal(fast4dComplete(ohne), false, `ohne ${z.rowKey}`)
    assert.equal(fast4dComplete({ ...ALLE_POS, [z.rowKey]: 'ja' }), false, `${z.rowKey} mit fremdem Wert`)
  }
})

test('Zuordnung Zeile -> Rechenkern: jedes Zeichen, Seite und Zeit kommen an', () => {
  const row = { ...ALLE_POS, fastFaceSide: 're', fastArmSide: 'li', fastTimeMode: 'onset', fastTime: '14:30' }
  const r = fast4d(fast4dInput(row))
  assert.equal(r.count, 7)
  assert.deepEqual(r.findings, FAST4D_ZEICHEN.map((z) => z.text + (z.id === 'face' ? ' rechts' : z.id === 'arm' ? ' links' : '')))
  assert.equal(r.timeText, 'Symptombeginn 14:30.')
})

test('Protokolltext unveraendert gegenueber dem Stand vor der Buendelung', () => {
  const row = { fastFace: 'pos', fastArm: 'pos', fastSpeech: 'neg', fastDiplopia: 'pos', fastField: 'neg', fastVertigo: 'neg', fastAtaxia: 'na', fastFaceSide: 're', fastArmSide: 're', fastTimeMode: 'onset', fastTime: '14:30' }
  assert.equal(
    fast4d(fast4dInput(row)).body,
    'positiv (3/7): Fazialisparese rechts, Armabsinken rechts, Doppelbilder; nicht prüfbar: Dysmetrie/Ataxie. Symptombeginn 14:30.',
  )
})

test('Allowlist des Entwurfs: genau die Felder der Zeile ausser der Uhrzeit', () => {
  const felder = fast4dEnumFields()
  const erwartet = [...FAST4D_ZEICHEN.map((z) => z.rowKey), ...FAST4D_ZEICHEN.filter((z) => z.sideKey).map((z) => z.sideKey), FAST4D_ZEIT_KEYS.mode]
  assert.deepEqual(Object.keys(felder).sort(), erwartet.sort())
  for (const z of FAST4D_ZEICHEN) assert.equal(felder[z.rowKey], FAST4D_BEFUNDE)
  assert.equal(felder.fastFaceSide, FAST4D_SEITEN)
  assert.equal(felder.fastTimeMode, FAST4D_ZEITARTEN)
})

test('jede Stelle nutzt die eine Quelle und fuehrt keine eigene Liste mehr', () => {
  const lies = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
  const quellen = {
    'scores.mjs': lies('./scores.mjs'),
    'registry.ts': lies('../functions/registry.ts'),
    'caseDraft.ts': lies('../caseDraft.ts'),
    'Fast4dSheet.vue': lies('../../protocol-core-ui/components/functions/Fast4dSheet.vue'),
  }
  for (const [name, src] of Object.entries(quellen)) {
    assert.ok(/fast4dDefs\.mjs/.test(src), `${name} importiert fast4dDefs.mjs`)
    assert.ok(!/\[01\]\\d\|2\[0-3\]/.test(src), `${name}: keine eigene Uhrzeit-Pruefung`)
  }
  // Beispielwerte (sampleFill) duerfen die Schluessel nennen; verboten sind eigene Listen und Zuordnungen.
  const nicht = (name, re, was) => assert.ok(!re.test(quellen[name]), `${name}: ${was}`)
  nicht('registry.ts', /FAST4D_BEFUND_KEYS|face: r\.fastFace/, 'keine eigene Schluesselliste oder Zuordnung')
  nicht('caseDraft.ts', /fastFace: |fastTimeMode: /, 'keine eigene Allowlist fuer FAST4D')
  nicht('scores.mjs', /\['face', 'Fazialisparese'\]/, 'keine eigene Zeichenliste')
  nicht('Fast4dSheet.vue', /fastFace: picked|face: r\.fastFace/, 'keine eigene Zuordnung')
  // Das Blatt fuehrt nur Anzeige-Texte je Zeichen; deren ids muessen genau die Quelle abdecken.
  const ids = [...quellen['Fast4dSheet.vue'].matchAll(/\{ id: '(\w+)', letter:/g)].map((m) => m[1])
  assert.deepEqual(ids, FAST4D_ZEICHEN.map((z) => z.id))
})
