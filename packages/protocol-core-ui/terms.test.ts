// node --test --experimental-strip-types
// ⓘ-Texte: Tab-Verweise werden erkannt, und jeder Text nennt die Tabs nur ueber solche Verweise.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INFO, infoSegments, type InfoText } from './terms.ts'

test('Text und Tab-Verweise werden getrennt', () => {
  assert.deepEqual(infoSegments('Steht im {einsatz} schon im Feld.'), [{ text: 'Steht im ' }, { tab: 'einsatz' }, { text: ' schon im Feld.' }])
  assert.deepEqual(infoSegments('{bausteine}'), [{ tab: 'bausteine' }])
  assert.deepEqual(infoSegments('ohne Verweis'), [{ text: 'ohne Verweis' }])
})

test('unbekannte Platzhalter bleiben Text', () => {
  assert.deepEqual(infoSegments('{unbekannt}'), [{ text: '{unbekannt}' }])
})

test('kein ⓘ-Text sagt „im Einsatz“ ohne Verweis auf den Tab', () => {
  const texts = Object.values(INFO as Record<string, InfoText>).flatMap((i) => [i.text ?? '', ...(i.items ?? []).map((x) => x.text)])
  for (const t of texts) assert.doesNotMatch(t, /\b[Ii]m Einsatz\b|„Bausteine“/, t)
})
