// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { useMedplanScan } from './useMedplanScan.ts'

const SEITE_1 =
  '<MP v="025" U="AA" a="1" z="2" l="de-DE"><P g="Erika" f="Musterfrau" b="19400324"/>' +
  '<S><M p="230272" m="1" du="1" r="Blutdruck"/><M p="558736" m="20" v="20" du="p" r="Diabetes"/></S></MP>'
const SEITE_2 =
  '<MP v="025" U="AA" a="2" z="2" l="de-DE"><P g="Erika" f="Musterfrau" b="19400324"/>' +
  '<S><M p="9900751" v="1" du="1" r="Blutfette"/></S></MP>'
const EINSEITIG = '<MP v="025" U="BB" l="de-DE"><S><M p="2455874" m="1" du="1"/></S></MP>'

test('ingest() übernimmt Medikationszeilen in den Entwurf', () => {
  const s = useMedplanScan()
  assert.equal(s.ingest(SEITE_1), true)
  assert.equal(s.rows.value.length, 2)
  assert.ok(s.rows.value[0].includes('PZN 230272'))
  assert.equal(s.error.value, null)
  assert.equal(s.aussteller.value, null, 'reset verwirft auch den Aussteller')
  assert.equal(s.ausstellerRolle.value, '')
})

test('mehrseitig: missingPages führt durch den Scan, Vollständigkeit erkannt', () => {
  const s = useMedplanScan()
  s.ingest(SEITE_1)
  assert.deepEqual(s.missingPages.value, [2])
  s.ingest(SEITE_2)
  assert.deepEqual(s.missingPages.value, [])
  assert.equal(s.rows.value.length, 3)
})

test('doppelte Seite wird abgelehnt (keine Duplikat-Zeilen)', () => {
  const s = useMedplanScan()
  s.ingest(SEITE_1)
  assert.equal(s.ingest(SEITE_1), false)
  assert.equal(s.rows.value.length, 2)
  assert.match(s.error.value ?? '', /bereits gescannt/)
})

test('Nicht-BMP-Inhalt: Fehlermeldung OHNE den Roh-Inhalt', () => {
  const geheim = 'https://example.org/?name=GeheimerPatient'
  const s = useMedplanScan()
  assert.equal(s.ingest(geheim), false)
  assert.equal(s.rows.value.length, 0)
  assert.ok(s.error.value)
  assert.ok(!s.error.value.includes('GeheimerPatient'), 'Roh-Inhalt darf nie in der Meldung stehen')
})

test('einseitiger Plan ist sofort vollständig', () => {
  const s = useMedplanScan()
  assert.equal(s.ingest(EINSEITIG), true)
  assert.equal(s.rows.value.length, 1)
  assert.deepEqual(s.missingPages.value, [])
})

test('Entwurf bearbeiten/entfernen; draftText: eine Zeile je Medikament, Leeres gefiltert', () => {
  const s = useMedplanScan()
  s.ingest(SEITE_1)
  s.updateRow(0, 'Ramipril 5 mg: 1-0-0-0')
  s.removeRow(1)
  s.ingest(SEITE_2)
  s.updateRow(1, '   ')
  assert.equal(s.draftText.value, 'Ramipril 5 mg: 1-0-0-0')
  // Mehrere Medikamente -> je eigene Zeile (Lesbarkeit im Protokoll, #144)
  const m = useMedplanScan()
  m.ingest(SEITE_1)
  assert.equal(m.rows.value.length, 2)
  assert.ok(m.draftText.value.includes('\n'), 'Zeilen statt "; "-Verkettung')
  assert.ok(!m.draftText.value.includes('; '), 'kein Semikolon-Join mehr')
})

// --- Aussteller (#144): Opt-in-Dokumentation Hausarzt/Facharzt ---

const MIT_ARZT =
  '<MP v="025" U="CC" l="de-DE"><P g="E" f="M"/>' +
  '<A lanr="987654321" n="Praxis Dr. Demo" s="Weg 1" z="12345" c="Musterstadt" p="0123-456" e="x@y.z"/>' +
  '<S><M p="230272" m="1" du="1"/></S></MP>'

test('Aussteller wird erkannt, aber NUR bei gewaehlter Rolle uebernommen (Default: nicht)', () => {
  const s = useMedplanScan()
  s.ingest(MIT_ARZT)
  assert.equal(s.aussteller.value?.name, 'Praxis Dr. Demo')
  assert.equal(s.ausstellerRolle.value, '', 'Default = nicht dokumentieren')
  assert.ok(!s.draftText.value.includes('Demo'), 'ohne Auswahl kein Arzt im Text')
  s.ausstellerRolle.value = 'Hausarzt'
  assert.ok(
    s.draftText.value.startsWith('Hausarzt: Praxis Dr. Demo, Musterstadt, LANR 987654321, Tel. 0123-456\n'),
    s.draftText.value,
  )
  // Nicht gelesene A-Attribute duerfen nirgends auftauchen
  assert.ok(!JSON.stringify(s.aussteller.value).includes('Weg 1'))
  assert.ok(!JSON.stringify(s.aussteller.value).includes('x@y.z'))
})

test('reset() verwirft alles (Datenschutz)', () => {
  const s = useMedplanScan()
  s.ingest(SEITE_1)
  s.reset()
  assert.equal(s.rows.value.length, 0)
  assert.equal(s.totalPages.value, 0)
  assert.deepEqual(s.missingPages.value, [])
  assert.equal(s.error.value, null)
})

test('Quelltext-Garantie: Medplan-Schicht loggt nicht und nutzt keinen Browser-Storage', () => {
  const src = readFileSync(new URL('./useMedplanScan.ts', import.meta.url), 'utf8')
  assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\./.test(src))
})

test('NETZWERK-POLICY: keine Google-/Telemetrie-Dependencies (package.json)', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  for (const dep of all) {
    assert.ok(!/mlkit|firebase|analytics|google/i.test(dep), `verbotene Dependency: ${dep}`)
  }
})

test('draftRows (#146): strukturierte Zeilen, Aussteller bei Rolle als erste Zeile', () => {
  const s = useMedplanScan()
  s.ingest(MIT_ARZT)
  assert.equal(s.draftRows.value.length, 1)
  assert.equal(s.draftRows.value[0].dosierung, '1-0-0-0 Stück')
  assert.ok(s.draftRows.value[0].name.includes('PZN 230272'))
  s.ausstellerRolle.value = 'Facharzt'
  assert.equal(s.draftRows.value.length, 2)
  assert.ok(s.draftRows.value[0].name.startsWith('Facharzt: Praxis Dr. Demo'))
})

test('draftRows: removeRow haelt Text- und Strukturpfad synchron; reset leert beide', () => {
  const s = useMedplanScan()
  s.ingest(SEITE_1) // 2 Medikamente
  assert.equal(s.draftRows.value.length, 2)
  s.removeRow(0)
  assert.equal(s.rows.value.length, 1)
  assert.equal(s.draftRows.value.length, 1)
  s.reset()
  assert.equal(s.draftRows.value.length, 0)
})
