// Wächter für Bedienung am Handy und im schmalen Editor (im Testbuild nachgespielt, WebKit 393 px).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

const read = (f: string): string => readFileSync(new URL(f, import.meta.url), 'utf8')

test('Vorlagen-Tab: Umschalter mit ↶/↷ passt in 360 px und läuft über die volle Breite', () => {
  const t = read('../../apps/pico-pwa/src/components/rebuild/EditorView.vue')
  const zeile = t.match(/<div class="sticky top-\[calc\(env\(safe-area-inset-top,0px\)\+4rem\)\][^"]*"/)?.[0] ?? ''
  assert.match(zeile, /-mx-4/, 'Zeile nutzt die volle Breite')
  assert.match(zeile, /px-1/)
  // mit ! : auf Touch-Geräten setzt style.css für .btn-sm 1rem Innenabstand und 14 px (ohne Layer, schlägt Utilities)
  assert.equal((t.match(/join-item px-2! text-\[13px\]!/g) ?? []).length, 3, 'drei schmale Segmente')
  // ↶/↷ behalten die Trefferfläche von 44 px
  assert.equal((t.match(/btn btn-ghost btn-sm min-h-11 min-w-11 px-1\.5"[^>]*data-(undo|redo)/g) ?? []).length, 2)
})

test('Fenster „Option“: nur eine neue Option öffnet die Tastatur', () => {
  const t = read('components/OptionsDialog.vue')
  assert.match(t, /focusSoon\(row \? '\[data-options-entry-cancel\]' : '\[data-option-entry-text\]'/)
  assert.doesNotMatch(t, /view\.value = 'entry'\n\s*focusSoon\('\[data-option-entry-text\]'\)/)
})

test('Fenster „Daten“: schließt nach übernommenem Import statt leer offen zu bleiben', () => {
  assert.match(read('../../apps/pico-pwa/src/components/rebuild/TemplateIO.vue'), /mode\.value = 'closed'\n\s*emit\('imported'\)/)
  assert.match(read('../../apps/pico-pwa/src/components/rebuild/LibraryBar.vue'), /<TemplateIO ref="dataIo" @imported="dataOpen = false" \/>/)
})

test('Knopfzeile eines Fensters deckt den Streifen darunter ab (kein Inhalt unter „Schließen“)', () => {
  const css = read('keyboard.css')
  assert.match(css, /\.modal-box \.modal-action,\s*\.kb-actions \{[^}]*box-shadow: 0 1\.5rem 0 2px var\(--color-base-100\), 0 calc\(1\.5rem \+ env\(safe-area-inset-bottom, 0px\)\) 0 2px var\(--color-base-100\);/, 'auch der Sicherheitsabstand unter der Knopfzeile ist abgedeckt')
  assert.match(css, /:root\[data-keyboard-open\] \.kb-actions \{[^}]*box-shadow: 0 -1px 0 var\(--color-base-300\), 0 1rem 0 2px var\(--color-base-100\);/)
})

test('Online-Editor: Kopf des Protokolltexts bricht um, Speicherstatus hat feste Breite', () => {
  const css = read('../../apps/protocol-editor/src/style.css')
  assert.match(css, /\.out-head \{[^}]*flex-wrap: wrap;/)
  assert.match(css, /\.out-head h2 \{[^}]*min-width: 0;/)
  assert.match(read('../../apps/protocol-editor/src/App.vue'), /class="min-w-\[6\.5rem\] whitespace-nowrap text-xs"[^>]*data-save-status/)
})

test('Fenster mit stehender Knopfzeile: unterer Innenabstand höchstens 1,5 rem + Sicherheitsabstand (sonst läuft Inhalt darunter durch)', () => {
  const vueFiles = (dir: string): string[] =>
    readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? vueFiles(`${dir}${e.name}/`) : e.name.endsWith('.vue') ? [`${dir}${e.name}`] : [],
    )
  const erlaubt = new Set(['pb-[calc(1rem+env(safe-area-inset-bottom))]', 'pb-[calc(1.5rem+env(safe-area-inset-bottom))]', 'pb-[env(safe-area-inset-bottom)]', 'pb-[max(1.5rem,env(safe-area-inset-bottom))]', 'pb-0', 'pb-2', 'pb-3', 'pb-4', 'pb-6'])
  const dateien = [...vueFiles('components/'), ...vueFiles('../../apps/pico-pwa/src/components/')]
  let geprueft = 0
  for (const f of dateien) {
    const t = read(f)
    if (!/modal-action|kb-actions/.test(t)) continue
    for (const cls of t.matchAll(/class="([^"]*\b(?:modal-box|overlay-surface)\b[^"]*)"/g)) {
      for (const pb of cls[1].split(/\s+/).filter((c) => /^pb-/.test(c))) {
        geprueft++
        assert.ok(erlaubt.has(pb), `${f}: ${pb} ist größer als die Abdeckung der Knopfzeile (keyboard.css)`)
      }
    }
  }
  assert.ok(geprueft >= 10, 'Fenster gefunden')
})
