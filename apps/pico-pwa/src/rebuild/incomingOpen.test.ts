// Run: node --test --experimental-strip-types src/rebuild/incomingOpen.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyIncomingUrl, appSchemeTarget, createIncomingGate } from './incomingOpen.ts'

const ID = 'AbCdEfGh1234'
const KEY = 'k'.repeat(43)
const LINK = `https://transfer.resqdocs.app/#${ID}.${KEY}`

test('Transfer-Link (Universal Link / App Link) wird erkannt und normalisiert', () => {
  assert.deepEqual(classifyIncomingUrl(LINK), { kind: 'transfer', link: LINK })
  assert.deepEqual(classifyIncomingUrl(`  ${LINK}\n`), { kind: 'transfer', link: LINK })
})

test('Eigenes Schema der Empfaenger-Seite fuehrt auf denselben Link', () => {
  assert.deepEqual(classifyIncomingUrl(`resqdocs://receive#${ID}.${KEY}`), { kind: 'transfer', link: LINK })
})

test('Abweichende Dienst-URL (Dev-Override) wird beachtet', () => {
  const dev = `https://transfer.example.test/#${ID}.${KEY}`
  assert.deepEqual(classifyIncomingUrl(dev, 'https://transfer.example.test/'), { kind: 'transfer', link: dev })
  assert.equal(classifyIncomingUrl(LINK, 'https://transfer.example.test'), null)
})

test('Kein Treffer: fremder Host, Unterpfad, fehlendes oder kaputtes Fragment, http, fremdes Schema', () => {
  assert.equal(classifyIncomingUrl(`https://evil.example/#${ID}.${KEY}`), null)
  assert.equal(classifyIncomingUrl(`https://transfer.resqdocs.app.evil.example/#${ID}.${KEY}`), null)
  assert.equal(classifyIncomingUrl(`https://transfer.resqdocs.app/v1/blob/${ID}#${ID}.${KEY}`), null)
  assert.equal(classifyIncomingUrl('https://transfer.resqdocs.app/'), null)
  assert.equal(classifyIncomingUrl('https://transfer.resqdocs.app/#'), null)
  assert.equal(classifyIncomingUrl('https://transfer.resqdocs.app/#kein-punkt'), null)
  assert.equal(classifyIncomingUrl(`http://transfer.resqdocs.app/#${ID}.${KEY}`), null)
  assert.equal(classifyIncomingUrl(`resqdocs://anderes#${ID}.${KEY}`), null)
  assert.equal(classifyIncomingUrl('resqdocs://receive'), null)
  assert.equal(classifyIncomingUrl('javascript:alert(1)'), null)
  assert.equal(classifyIncomingUrl(''), null)
  assert.equal(classifyIncomingUrl('kein link'), null)
})

test('Datei: nur file:-URLs auf .json, Name dekodiert', () => {
  const url = 'file:///private/var/mobile/Containers/Data/Application/X/Documents/Inbox/protokoll-Standard%20protokoll.json'
  assert.deepEqual(classifyIncomingUrl(url), { kind: 'file', url, name: 'protokoll-Standard protokoll.json' })
  assert.equal(classifyIncomingUrl('file:///x/Inbox/vorlage.JSON')?.kind, 'file')
  assert.equal(classifyIncomingUrl('file:///x/Inbox/bild.png'), null)
  assert.equal(classifyIncomingUrl('file:///x/Inbox/'), null)
  assert.equal(classifyIncomingUrl('content://media/external/file/12'), null)
})

test('Gate: dieselbe URL kurz hintereinander nur einmal, spaeter wieder', () => {
  let t = 0
  const gate = createIncomingGate(1500, () => t)
  assert.equal(gate.accept(LINK), true)
  t = 200
  assert.equal(gate.accept(LINK), false)
  t = 400
  assert.equal(gate.accept(`${LINK}x`), true)
  t = 5000
  assert.equal(gate.accept(`${LINK}x`), true)
})

test('eigenes Schema: Ziel auch dort erkannt, wo der WebView fremde Schemata nicht in Host und Pfad zerlegt', () => {
  // Spec-konformer Parser (Node, WebView ab 130)
  assert.equal(appSchemeTarget({ hostname: 'receive', pathname: '' }), 'receive')
  // Aeltere Chromium-WebViews: hostname leer, Ziel im Pfad
  assert.equal(appSchemeTarget({ hostname: '', pathname: '//receive' }), 'receive')
  assert.equal(appSchemeTarget({ hostname: '', pathname: '//receive/' }), 'receive')
  assert.equal(appSchemeTarget({ hostname: '', pathname: '//anderes' }), 'anderes')
  assert.equal(appSchemeTarget({ hostname: '', pathname: '' }), '')
})
