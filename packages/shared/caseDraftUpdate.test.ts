// Update-Sicherheit des Einsatzentwurfs (Maintainer 2026-11-17: „mir ist wichtig, dass auch nach einem Update,
// selbst wenn man das Update macht, während jemand ein Protokoll schreibt, das Protokoll immer sicher ist“).
//
// Ein Update beendet die App; der laufende Einsatz liegt als Entwurf in den Preferences und wird von der NEUEN
// Version gelesen. Was deren Allowlist (sanitizeValues/sanitizeRows) nicht kennt, ist danach still weg.
// Genau so gingen bis 1.12.0 Rolle und Häkchen von Kontaktpersonen (Angehöriger/Betreuer) bei jedem Neustart
// verloren.
//
// Regeln für __fixtures__/case-drafts/<version>.json:
//  - Jede Datei ist ein Entwurf, wie ihn die genannte App-Version geschrieben hat. NIE ändern, nur ergänzen:
//    jede künftige Version muss alle alten Entwürfe verlustfrei lesen.
//  - Die neueste Datei deckt jedes Feld jeder Funktionszeile und jeden Zustand ab (Test unten). Kommt ein Feld
//    dazu, schlägt der Test fehl, bis es in der Allowlist UND in einer neuen Fixture-Datei steht.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { parseDraft, touchDraft } from './caseDraft.ts'
import { compareVersions } from './version.ts'

const DIR = new URL('./__fixtures__/case-drafts/', import.meta.url)
const files = readdirSync(DIR)
  .filter((f) => /^\d+\.\d+\.\d+\.json$/.test(f))
  .sort((a, b) => compareVersions(a.replace('.json', ''), b.replace('.json', '')))
const load = (f: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'))

test('es gibt mindestens einen Entwurf einer veröffentlichten Version', () => {
  assert.ok(files.length >= 1)
})

for (const f of files) {
  test(`Entwurf aus ${f.replace('.json', '')} kommt in der aktuellen Version verlustfrei an`, () => {
    const raw = load(f)
    const draft = parseDraft(raw)
    assert.ok(draft, 'Entwurf wurde verworfen - nach dem Update wäre der Einsatz weg')
    assert.deepEqual(draft.values, raw.values, 'Werte gingen beim Lesen verloren')
    assert.equal(draft.protocolId, raw.protocolId, 'Zuordnung zur Vorlage ging verloren')
    assert.equal(draft.expiresAt, raw.expiresAt, 'Ablaufzeit hat sich verändert')
  })

  test(`Entwurf aus ${f.replace('.json', '')} übersteht auch das erste Speichern nach dem Update`, () => {
    const raw = load(f)
    const draft = parseDraft(raw)!
    const next = touchDraft(draft, draft.values, draft.protocolId, 3, Number(raw.lastTouchedAt) + 1000)
    assert.deepEqual(next.values, raw.values)
  })
}

test('neuester Entwurf deckt jedes Feld jeder Funktionszeile ab (neue Felder erzwingen Allowlist + Fixture)', () => {
  const model = readFileSync(new URL('./model.ts', import.meta.url), 'utf8')
  const rowFields = new Set<string>()
  for (const [, body] of model.matchAll(/export interface \w+Row\s*\{([\s\S]*?)\n\}/g)) {
    for (const [, field] of body.matchAll(/^\s*(\w+)\??:/gm)) rowFields.add(field)
  }
  assert.ok(rowFields.size > 20, 'Zeilen-Typen in model.ts nicht gefunden')
  const newest = load(files[files.length - 1]) as { values: Record<string, { rows?: Record<string, unknown>[] }> }
  const covered = new Set<string>()
  for (const fill of Object.values(newest.values)) for (const row of fill.rows ?? []) for (const k of Object.keys(row)) covered.add(k)
  const missing = [...rowFields].filter((f) => !covered.has(f))
  assert.deepEqual(missing, [], `Felder ohne Abdeckung im Update-Test: ${missing.join(', ')}`)
})

test('neuester Entwurf deckt jeden Zustand und jeden Wiederherstellungs-Puffer ab', () => {
  const newest = load(files[files.length - 1]) as { values: Record<string, Record<string, unknown>> }
  const fills = Object.values(newest.values)
  const has = (pred: (x: Record<string, unknown>) => boolean): boolean => fills.some(pred)
  assert.ok(has((x) => x.state === 'confirmed' && 'prevValue' in x))
  assert.ok(has((x) => x.state === 'custom' && Array.isArray(x.values)))
  assert.ok(has((x) => x.state === 'excluded' && Array.isArray(x.prevValues)))
  assert.ok(has((x) => x.state === 'function' && x.status === 'excluded' && 'prevText' in x))
  assert.ok(has((x) => x.state === 'function' && x.status === 'custom' && typeof x.text === 'string'))
  assert.ok(has((x) => x.state === 'function' && x.status === undefined && 'prevText' in x))
  // Kontakt-Rollen: der Anlass dieses Tests.
  const rollen = new Set(fills.flatMap((x) => ((x.rows as Record<string, unknown>[] | undefined) ?? []).map((r) => r.rolle)))
  for (const r of ['Hausarzt', 'Facharzt', 'Angehöriger', 'Betreuer']) assert.ok(rollen.has(r), `Rolle ${r} fehlt`)
})
