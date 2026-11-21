// Wächter: Der QR-Code beim Teilen ist IMMER der lange Link (Maintainer 2026-11-21), nie der Kurzlink.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const here = new URL('.', import.meta.url).pathname
const roots = [join(here, '../../apps/pico-pwa/src/components'), join(here, '../../apps/protocol-editor/src')]

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return vueFiles(path)
    return name.endsWith('.vue') ? [path] : []
  })
}

test('QR-Codes beim Teilen zeigen den langen Link, nie den Kurzlink', () => {
  const qr: string[] = []
  for (const file of roots.flatMap(vueFiles)) {
    const src = readFileSync(file, 'utf8')
    if (!src.includes('useShortLink')) continue
    for (const m of src.matchAll(/<QrCode\b[^>]*:value="([^"]+)"/g)) qr.push(`${file.split('/').slice(-2).join('/')}: ${m[1]}`)
  }
  assert.ok(qr.length >= 6, `erwartet 6 Teilen-Stellen, gefunden ${qr.length}`)
  for (const q of qr) assert.match(q, /: (shareLink|link)\.link$/, q)
})
