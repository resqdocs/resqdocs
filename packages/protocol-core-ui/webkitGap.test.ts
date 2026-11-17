// Wächter: Im Eigenschaften-Panel rechnet WebKit/WKWebView (iOS, auch Android-WebView) vertikale
// flex-/grid-gap-Abstände beim ERSTEN Layout doppelt; die Felder rücken erst beim Antippen zusammen.
// Workaround: vertikale Stapel mit space-y-* (margin) statt flex-col + gap-*. Mit a2350bf („Eigenschaften in
// aufklappbare Bereiche“) kam das Muster im Bereich „Allgemein“ unbemerkt zurück - dieser Test verhindert das.
// Entfernen erst, wenn der WebKit-Fehler nachweislich behoben ist (Retest am Gerät).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FILES = ['components/ContainerProperties.vue']

test('Eigenschaften-Panel: keine vertikalen flex-col+gap-Stapel (WebKit-Abstandsfehler)', () => {
  for (const f of FILES) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    const hits = [...src.matchAll(/class="([^"]*)"/g)]
      .map((m) => m[1])
      .filter((c) => /(^|\s)flex-col(\s|$)/.test(c) && /(^|\s)gap-(\d|\[)/.test(c))
    assert.deepEqual(hits, [], `${f}: space-y-* statt flex-col + gap-* verwenden`)
  }
})
