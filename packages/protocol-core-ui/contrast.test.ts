// Wächter Kontrast: kein blasser Text unter der Nebentext-Stufe, Rahmen und daisyUI-Kleintext zentral angehoben.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOTS = [join(HERE, 'components'), join(HERE, '../../apps/pico-pwa/src')]
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(vue|ts)$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
}

test('Nebentext: keine Stufe unter 75 % (Platzhalter mindestens 70 %)', () => {
  const pale: string[] = []
  for (const f of ROOTS.flatMap(files)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/((?:[a-z-]+:)*)text-base-content\/(\d+)/g)) {
      const min = m[1].includes('placeholder:') ? 70 : 75
      if (Number(m[2]) < min) pale.push(`${f.split('/').slice(-2).join('/')}: ${m[0]}`)
    }
  }
  assert.deepEqual(pale, [], 'blasser Text unter 4,5:1 – text-base-content/75 verwenden')
})

test('Rahmen der Bedienelemente und daisyUI-Kleintext zentral angehoben', () => {
  const css = readFileSync(join(HERE, '../../apps/pico-pwa/src/style.css'), 'utf8')
  assert.match(css, /--rd-control-border: #7d88a6;/)
  assert.match(css, /--rd-control-border: #6b7ba6;/)
  assert.match(css, /\.checkbox:not\(:checked\)[\s\S]*--input-color: var\(--rd-control-border\);/)
  assert.match(css, /\.input:not\(:focus\)/, 'Fokus behält die daisyUI-Farbe')
  assert.match(css, /\.label,\s*\.fieldset \.label \{ color: color-mix\(in oklab, var\(--color-base-content\) 75%/)
  assert.match(css, /::placeholder \{ color: color-mix\(in oklab, var\(--color-base-content\) 70%/)
})

test('„nicht erhoben“ wird nicht ausgegraut', () => {
  const sec = readFileSync(join(HERE, '../../apps/pico-pwa/src/components/rebuild/EinsatzSection.vue'), 'utf8')
  const field = readFileSync(join(HERE, '../../apps/pico-pwa/src/components/rebuild/EinsatzField.vue'), 'utf8')
  assert.doesNotMatch(sec, /v-if="excluded" class="[^"]*opacity-/)
  assert.doesNotMatch(field, /excluded \? 'opacity-/)
  const toggle = readFileSync(join(HERE, '../../apps/pico-pwa/src/components/rebuild/ContainerFillToggle.vue'), 'utf8')
  assert.match(toggle, /border-\[var\(--rd-control-border\)\]/, 'Abschnitts-Schalter mit kräftigem Rahmen')
})

test('Rückmeldung beim Antippen für eigene Bedienelemente', () => {
  const css = readFileSync(join(HERE, '../../apps/pico-pwa/src/style.css'), 'utf8')
  assert.match(css, /-webkit-tap-highlight-color: transparent/, 'Ausgangslage: Tipp-Hervorhebung des Systems ist aus')
  assert.match(css, /button:not\(\.btn\):not\(:disabled\):active,\s*\[role="button"\]:active,\s*summary:active,/)
  assert.match(css, /box-shadow: inset 0 0 0 100vmax color-mix\(in oklab, var\(--color-base-content\) 12%, transparent\)/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})

test('NEWS2: Statuszeile nennt einen unmöglichen SpO₂-Wert, Schalter stehen zusammen', () => {
  const sheet = readFileSync(join(HERE, 'components/functions/News2Sheet.vue'), 'utf8')
  assert.match(sheet, /v-if="spo2TooHigh"[^>]*>SpO₂ \{\{ spo2 \}\} % ist nicht möglich \(0–100 %\)\. Bitte den Wert prüfen\./)
  assert.match(sheet, /class="modal-box max-h-\[90vh\] space-y-3/)
  assert.match(sheet, /<div>\s*<label class="flex min-h-11 cursor-pointer items-center gap-2 py-1">/)
})
