// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { useMedplanScan } from './useMedplanScan.ts'
import { createMedicationLookup } from '../medications/useMedicationLookup.ts'
import type { HttpAdapter, HttpResponse } from '../pico/picoTypes.ts'
import type { KeyValueAdapter } from '../storage/types.ts'

// Lokale Fakes (#164-Regression): KV mit vorgeladenem Woerterbuch, HTTP ungenutzt.
function fakeKv(): KeyValueAdapter & { dump: Record<string, string> } {
  const dump: Record<string, string> = {}
  return { dump, async get(k) { return dump[k] ?? null }, async set(k, v) { dump[k] = v }, async remove(k) { delete dump[k] } }
}
function fakeHttp(map: Record<string, HttpResponse>): HttpAdapter {
  return { async get(url) { return map[url] ?? { status: 404, data: null } }, async post() { throw new Error('kein POST') } }
}
const MANIFEST_URL = 'https://example.test/pzn/manifest.json'

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

test('#184: structuredRows trägt die Roh-PZN; Name-Overwrite behält die PZN', () => {
  const s = useMedplanScan()
  s.ingest(EINSEITIG) // ein Medikament, nur PZN (2455874)
  assert.equal(s.structuredRows.value.length, 1)
  assert.equal(s.structuredRows.value[0].pzn, '2455874')
  assert.match(s.structuredRows.value[0].name, /^PZN 2455874/) // PZN im Namensfeld
  s.updateRowName(0, 'ASS 100') // Nutzer überschreibt den Namen
  assert.equal(s.structuredRows.value[0].name, 'ASS 100')
  assert.equal(s.structuredRows.value[0].pzn, '2455874', 'PZN bleibt „im Hintergrund"')
  // draftRows (fürs Protokoll) trägt die PZN ebenfalls weiter.
  assert.equal(s.draftRows.value[0].pzn, '2455874')
})

test('#262: setRowStaerke setzt die Wirkstärke; Name-Overwrite/Passthrough lässt sie stehen', () => {
  const s = useMedplanScan()
  s.ingest(EINSEITIG)
  assert.equal(s.structuredRows.value[0].staerke, undefined)
  s.setRowStaerke(0, '100 mg')
  assert.equal(s.structuredRows.value[0].staerke, '100 mg')
  s.updateRowName(0, 'ASS') // Name ändern darf die Stärke nicht verlieren
  assert.equal(s.structuredRows.value[0].staerke, '100 mg')
  assert.equal(s.structuredRows.value[0].name, 'ASS')
  // draftRows (fürs Protokoll) tragen die Stärke weiter
  assert.equal(s.draftRows.value[0].staerke, '100 mg')
  s.reset()
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
  '<A lanr="987654321" n="Praxis Dr. Demo" s="Weg 1" z="96047" c="Bamberg" p="0951-123" e="x@y.z"/>' +
  '<S><M p="230272" m="1" du="1"/></S></MP>'

test('Aussteller wird erkannt, aber NUR bei gewaehlter Rolle uebernommen (Default: nicht)', () => {
  const s = useMedplanScan()
  s.ingest(MIT_ARZT)
  assert.equal(s.aussteller.value?.name, 'Praxis Dr. Demo')
  assert.equal(s.ausstellerRolle.value, '', 'Default = nicht dokumentieren')
  assert.ok(!s.draftText.value.includes('Demo'), 'ohne Auswahl kein Arzt im Text')
  s.ausstellerRolle.value = 'Hausarzt'
  assert.ok(
    s.draftText.value.startsWith('Hausarzt: Praxis Dr. Demo, Bamberg, LANR 987654321, Tel. 0951-123\n'),
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

// --- #164: End-to-End-Regression - realer 14-Medikamente-Plan, anonymisiert
// (kein P/A/C/O-Element, U auf Nullen) -> Parsen + PZN-Normalisierung (#162) +
// Aufloesung gegen ein synthetisches Test-Woerterbuch + Render-Ausgabe. ---
const UKF_164 =
  '<MP v="026" U="00000000000000000000000000000000" l="de-DE"><S>' +
  '<M p="18827585" m="1" v="1" /><M p="2953075" m="1/2" du="1" />' +
  '<M p="2227825" m="1" /><M p="3028737" t="Mo, Mi , Fr abends" i="jeweils 1 Tablette" />' +
  '<M p="12482636" m="1" v="1" du="1" /><M p="11851965" m="1" du="1" />' +
  '<M p="524306" v="1" /><M p="1841954" m="1" />' +
  '<M p="14155841" m="1" v="1" du="1" /><M p="5510970" m="1" />' +
  '<M p="6551971" m="1/2" d="1/2" /><M p="9474975" m="1" v="1" />' +
  '<M p="1038950" m="1" v="1" /><M p="6444040" m="1" d="1" v="1" h="1" dud="bei Bed." />' +
  '</S></MP>'

const PADDED = [
  '18827585', '02953075', '02227825', '03028737', '12482636', '11851965', '00524306',
  '01841954', '14155841', '05510970', '06551971', '09474975', '01038950', '06444040',
]
// Synthetische Namen - getestet wird Normalisierung + Aufloesung, nicht der Inhalt.
const TEST_DICT: Record<string, string> = Object.fromEntries(
  PADDED.map((p, i) => [p, `Test-Medikament ${String(i + 1).padStart(2, '0')}`]),
)

async function lookupWith(dict: Record<string, string>) {
  const kv = fakeKv()
  kv.dump['medications.dictionary'] = JSON.stringify({
    version: 1, count: Object.keys(dict).length, updated: '2026-06-13', fetchedAt: '2026-06-13', entries: dict,
  })
  const l = createMedicationLookup(fakeHttp({}), kv, MANIFEST_URL, true)
  await l.ensureLoaded()
  return l
}

test('#164 E2E: 14 Medikamente, alle PZN normalisiert + aufgeloest, keine Verluste', async () => {
  const lookup = await lookupWith(TEST_DICT)
  const s = useMedplanScan((pzn) => lookup.resolve(pzn))
  assert.equal(s.ingest(UKF_164), true)
  assert.equal(s.draftRows.value.length, 14, 'alle 14 strukturierten Zeilen erhalten')
  assert.equal(s.draftRows.value.length, 14, 'keine Zeile weggefiltert')
  for (const row of s.draftRows.value) {
    assert.match(row.name ?? '', /^Test-Medikament \d\d \(PZN /, `aufgeloest: ${row.name}`)
  }
  // Sub-8-stellige PZN korrekt normalisiert aufgeloest (Kernfall #162/#164).
  assert.match(s.draftRows.value[1].name, /^Test-Medikament 02 \(PZN 2953075,/)
  assert.match(s.draftRows.value[6].name, /^Test-Medikament 07 \(PZN 524306,/)
  // Eintrag mit t/i bleibt erhalten + aufgeloest.
  const ti = s.draftRows.value[3]
  assert.match(ti.name, /^Test-Medikament 04 /)
  assert.equal(ti.dosierung, 'Mo, Mi , Fr abends')
  assert.equal(ti.kommentar, 'jeweils 1 Tablette')
})

test('#164 E2E: unbekannte PZN erzeugt keinen falschen Treffer', async () => {
  const lookup = await lookupWith({ '99999999': 'Darf-nicht-treffen' })
  const s = useMedplanScan((pzn) => lookup.resolve(pzn))
  s.ingest(UKF_164)
  assert.equal(s.draftRows.value.length, 14, 'auch ohne Treffer bleiben alle 14 erhalten')
  for (const row of s.draftRows.value) {
    assert.doesNotMatch(row.name, /Darf-nicht-treffen/)
    assert.match(row.name, /^PZN \d+/, `Fallback statt Falschtreffer: ${row.name}`)
  }
  assert.equal(lookup.resolve('12345678'), null, 'unbekannte 8-stellige PZN -> null')
  assert.equal(lookup.resolve(''), null)
})

test('#164 E2E: Render-Ausgabe ohne fuehrende Striche, ohne leere Zeilen', async () => {
  const { render } = await import('@resqdocs/protocol-core/renderer/render.mjs')
  const lookup = await lookupWith(TEST_DICT)
  const s = useMedplanScan((pzn) => lookup.resolve(pzn))
  s.ingest(UKF_164)
  const protocol = {
    schemaVersion: '0.1.0', id: 'p', title: 'T', variables: [],
    blocks: [{ id: 'b', title: 'B', points: [{ id: 'meds', type: 'medikamente' }] }],
  }
  const out: string = render(protocol, { values: { meds: s.draftRows.value } })
  const medLines = out.split('\n').filter((l: string) => l.includes('Test-Medikament'))
  assert.equal(medLines.length, 14, '14 Medikamentenzeilen im Output')
  for (const line of medLines) {
    assert.ok(line.trim().length > 0, 'keine leere Zeile')
    assert.ok(!line.startsWith('-'), `keine fuehrenden Striche: "${line}"`)
    assert.match(line, /^Test-Medikament \d\d .*: /, `Format "Name …: Dosierung": ${line}`)
  }
  assert.ok(!/\n\n/.test(out), 'keine doppelten Leerzeilen im Output')
})
