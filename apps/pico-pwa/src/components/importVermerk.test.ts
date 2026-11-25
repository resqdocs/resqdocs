// Vorlage mit Funktionen, die diese App-Version nicht kennt: Der Import-Dialog sagt es, statt die Vorlage still
// zu beschneiden. Jeder Export der App schreibt dafür den Vermerk; die Sicherung auf dem Gerät braucht ihn nicht.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string): string => readFileSync(join(SRC, p), 'utf8')

test('Import-Dialog zeigt den Hinweis über der Auswahl, Übernehmen bleibt möglich', () => {
  const vue = read('components/ImportChoiceDialog.vue')
  assert.match(vue, /importNotice\(\{ appVersion: appVersion\.value, needs: p\.needs, roots: \[\.\.\.p\.trees, \.\.\.p\.blocks\], knownKinds: FUNCTION_KINDS \}\)/)
  assert.match(vue, /<p v-if="versionNotice" class="text-sm text-warning" data-import-version-notice>\{\{ versionNotice \}\}<\/p>/)
  const knopf = vue.slice(vue.indexOf('data-import-take') - 200, vue.indexOf('data-import-take'))
  assert.match(knopf, /:disabled="!taken\.total \|\| busy"/, 'der Hinweis sperrt den Knopf nicht')
})

test('jeder Weg, der eine Vorlage anbietet, reicht den Vermerk der Datei weiter', () => {
  const routing = read('composables/useImportRouting.ts')
  assert.match(routing, /offerCollection\(r, [^\n]*needs: r\.needs \}\)/)
  assert.match(routing, /offerProtocols\(\[r\.tree\], \{ \.\.\.hooks, needs: r\.needs \}\)/)
  assert.match(read('components/rebuild/TemplateIO.vue'), /hint: linkHint\(mine\), needs: 'needs' in r \? r\.needs : undefined \}/)
})

test('jeder Export der App schreibt den Vermerk (Datei, Link, QR)', () => {
  const exp = read('composables/useTemplateExport.ts')
  for (const call of exp.match(/export(?:Template|Templates|Collection)\([^)]*\)/g) ?? []) assert.match(call, /FEATURE_VERSIONS\)$/, call)
  assert.equal((exp.match(/FEATURE_VERSIONS\)/g) ?? []).length, 3)
  assert.match(read('components/rebuild/TemplateIO.vue'), /exportCollection\(\{[^\n]*\}, FEATURE_VERSIONS\)/)
  assert.match(read('featureVersions.ts'), /from '@feature-versions'/)
})
