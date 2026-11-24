// node --test --experimental-strip-types
// ⓘ-Texte: Tab-Verweise werden erkannt, und jeder Text nennt die Tabs nur ueber solche Verweise.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('Trenner zwischen Einträgen: Erklärung und Einstellung nennen das Semikolon als Standard', () => {
  assert.match(INFO.rowSeparator.text, /Standard ist das Semikolon/)
  assert.doesNotMatch(INFO.rowSeparator.text + INFO.rowLayout.examples.map((e) => e.output).join(), /·|Mittelpunkt/)
  const props = readFileSync(new URL('components/ContainerProperties.vue', import.meta.url), 'utf8')
  // Der Standard kommt aus der Konstante des Renderers, nicht aus einem zweiten, von Hand gepflegten Text.
  assert.match(props, /leer = Standard-Trenner „\{\{ FUNCTION_ROW_INLINE_SEPARATOR \}\}“ \(Semikolon\)/)
  // Steht noch der frühere Standard im Feld, sagt die Einstellung, was im Protokolltext daraus wird.
  assert.match(props, /v-if="node\.config\?\.rowSeparator === LEGACY_ROW_INLINE_SEPARATOR"[^>]*data-legacy-separator/)
  assert.doesNotMatch(/placeholder="([^"]*)" @input="setConfig\(\{ rowSeparator/.exec(props)![1], /·/)
})
