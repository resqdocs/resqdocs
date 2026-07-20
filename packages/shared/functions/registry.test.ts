// Laeuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FUNCTION_REGISTRY, formatMedikament, formatArzt, medikamentRowHasData, arztRowHasData, staerkeOhneDuplikat } from './registry.ts'
import type { FieldFill, MedikamenteRow, ArztRow } from '../model.ts'

const def = FUNCTION_REGISTRY.medikamentenplan
const fill = (rows: MedikamenteRow[]): FieldFill => ({ state: 'function', rows })
const R: MedikamenteRow[] = [
  { name: 'ASS', dosierung: '1-0-0' },
  { name: 'Ramipril', dosierung: '1-0-1', kommentar: 'nüchtern' },
]

test('formatMedikament (#262): "Name Staerke, Schema (Hinweis)" - Komma setzt das Schema IMMER ab', () => {
  assert.equal(formatMedikament({ name: 'ASS', dosierung: '1-0-0' }), 'ASS, 1-0-0')
  assert.equal(formatMedikament({ name: 'Ibuprofen', staerke: '400 mg', dosierung: '1-0-1', kommentar: 'nüchtern' }), 'Ibuprofen 400 mg, 1-0-1 (nüchtern)')
  assert.equal(formatMedikament({ name: 'Metoprolol', staerke: '47,5 mg', dosierung: '1-0-1-0' }), 'Metoprolol 47,5 mg, 1-0-1-0')
  assert.equal(formatMedikament({ name: 'X' }), 'X')
  assert.equal(formatMedikament({ name: 'Y', kommentar: 'k' }), 'Y (k)')
  assert.equal(formatMedikament({ name: 'Ibuflam', staerke: '600 mg' }), 'Ibuflam 600 mg')
  assert.equal(formatMedikament({ name: '', staerke: '400 mg' }), '400 mg')
  assert.equal(formatMedikament({ name: '', staerke: '400 mg', dosierung: '1-0-0' }), '400 mg, 1-0-0')
  assert.equal(formatMedikament({ name: 'X', staerke: '400 mg', kommentar: 'k' }), 'X 400 mg (k)')
  assert.equal(formatMedikament({ name: '', staerke: '  ' }), '')
})

test('staerkeOhneDuplikat (#262): unterdrueckt Doppel-Dokumentation', () => {
  assert.equal(staerkeOhneDuplikat('Ibuflam 400 mg', '400 mg'), undefined)
  assert.equal(staerkeOhneDuplikat('Ibuflam', '400 mg'), '400 mg')
  assert.equal(staerkeOhneDuplikat('Ibuflam', undefined), undefined)
  assert.equal(staerkeOhneDuplikat('Ibuflam', '  '), undefined)
})

test('formatMedikament/formatArzt: namenlos ohne fuehrende Trenner (#260, UI-Summary)', () => {
  assert.equal(formatMedikament({ name: '', dosierung: '1-0-1' }), '1-0-1')
  assert.equal(formatMedikament({ name: '', kommentar: 'k' }), '(k)')
  assert.equal(formatArzt({ name: '', ort: 'Kiel' }), 'Kiel')
  assert.equal(formatArzt({ name: '', rolle: 'Hausarzt' }), '(Hausarzt)')
  assert.equal(formatArzt({ name: '', telefon: '0431', arztnummer: '9' }), 'Tel. 0431, Arztnr. 9')
})

test('renderBody ohne Config -> untereinander (\\n-join, Regression)', () => {
  assert.equal(def.renderBody(fill(R)), 'ASS, 1-0-0\nRamipril, 1-0-1 (nüchtern)')
})

test('renderBody block + Praefix/Suffix je Zeile', () => {
  assert.equal(
    def.renderBody(fill(R), { rowLayout: 'block', rowPrefix: '- ', rowSuffix: ' ;' }),
    '- ASS, 1-0-0 ;\n- Ramipril, 1-0-1 (nüchtern) ;',
  )
})

test('renderBody inline + freier Trenner; ohne Trenner -> Mittelpunkt (#262)', () => {
  assert.equal(def.renderBody(fill(R), { rowLayout: 'inline', rowSeparator: ' | ' }), 'ASS, 1-0-0 | Ramipril, 1-0-1 (nüchtern)')
  // Inline-DEFAULT = Mittelpunkt (#262): das Komma ist die Grenze IN der Zeile - als Zeilen-Trenner ambig.
  assert.equal(def.renderBody(fill(R), { rowLayout: 'inline' }), 'ASS, 1-0-0 · Ramipril, 1-0-1 (nüchtern)')
})

test('renderBody: namelose Zeilen gefiltert (beide Layouts); leer -> ""', () => {
  const r: MedikamenteRow[] = [{ name: '' }, { name: 'ASS' }, { name: '  ' }]
  assert.equal(def.renderBody(fill(r)), 'ASS')
  assert.equal(def.renderBody(fill(r), { rowLayout: 'inline' }), 'ASS')
  assert.equal(def.renderBody(fill([]), { rowLayout: 'block', rowPrefix: '- ' }), '')
})

// --- Funktion „Pack-Years" (#55-Rework) ---
test('packYears (#55): kaufmännisch gerundete GANZE py, „ca." wenn gerundet; unvollständig -> leer', () => {
  const def = FUNCTION_REGISTRY.packYears
  const fill = (rows: unknown[]): FieldFill => ({ state: 'function', rows } as FieldFill)
  assert.equal(def.label, 'Pack-Years')
  // 22,5 -> kaufmännisch 23, gerundet -> „ca."
  assert.equal(def.renderBody(fill([{ cigarettesPerDay: 30, years: 15 }])), 'ca. 23 py (30/Tag, 15 J.)')
  // glatt 10 -> ohne Zeichen
  assert.equal(def.renderBody(fill([{ cigarettesPerDay: 20, years: 10 }])), '10 py (20/Tag, 10 J.)')
  // 15,5 -> 16 (Beispiel des Maintainers)
  assert.equal(def.renderBody(fill([{ cigarettesPerDay: 31, years: 10 }])), 'ca. 16 py (31/Tag, 10 J.)')
  assert.equal(def.hasData(fill([{ cigarettesPerDay: 30, years: 15 }])), true)
  // unvollstaendig -> keine Ausgabe, keine Daten
  assert.equal(def.renderBody(fill([{ cigarettesPerDay: 30 }])), '')
  assert.equal(def.hasData(fill([{ years: 15 }])), false)
  assert.equal(def.renderBody(fill([])), '')
  assert.equal(def.hasData(undefined), false)
  // 0 ist ein gueltiger Wert (Nichtraucher-Doku), glatt -> ohne Zeichen
  assert.equal(def.renderBody(fill([{ cigarettesPerDay: 0, years: 0 }])), '0 py (0/Tag, 0 J.)')
  // sampleFill (Editor-Vorschau): festes Demo-Fill -> renderBody zeigt das gerundete „ca."-Format
  assert.ok(def.sampleFill)
  assert.equal(def.renderBody(def.sampleFill!()), 'ca. 23 py (30/Tag, 15 J.)')
})

test('sampleFill (#55): Listen-Funktionen liefern Muster-Zeilen fuer die Editor-Vorschau', () => {
  const med = FUNCTION_REGISTRY.medikamentenplan
  assert.ok(med.sampleFill)
  const medOut = med.renderBody(med.sampleFill!())
  assert.equal(medOut.split('\n').length, 3) // 3 Muster-Medikamente
  assert.match(medOut, /^Beispiel-Wirkstoff A 500 mg, 1-0-1$/m)
  assert.match(medOut, /\(nüchtern\)/) // Variante mit Hinweis
  assert.match(medOut, /^Beispiel-Tropfen, bei Bedarf$/m) // Variante ohne Staerke

  const arzt = FUNCTION_REGISTRY.aerzte
  assert.ok(arzt.sampleFill)
  const arztOut = arzt.renderBody(arzt.sampleFill!())
  assert.match(arztOut, /\(Hausarzt\)/) // Muster-Arzt
  assert.match(arztOut, /\(Angehöriger\), Tel\. .*Patientenverfügung \+ Vollmacht\/Betreuung vorhanden/) // Muster-Kontaktperson
})

test('news2 (#55): „NEWS2 Score (Risiko …) - Kernwerte"; unvollständig -> leer; scale2 schaltet Skala 2', () => {
  const def = FUNCTION_REGISTRY.news2
  const fill = (rows: unknown[]): FieldFill => ({ state: 'function', rows } as FieldFill)
  assert.equal(def.label, 'NEWS2')
  assert.equal(def.singleLine, true)
  // vollstaendig: AF 22(+2) SpO2 92 Skala1(+2) RR 108(+1) HF 95(+1) Temp 37,0(0) A(0) = 6 -> mittel
  const complete = { rr: 22, spo2: 92, systolic: 108, pulse: 95, temp: 37.0, consciousness: 'A' }
  const out = def.renderBody(fill([complete]))
  // Score + ausgeschriebene Risikostufe (im Protokoll deutlich lesbar); keine Vitalwerte, kein „NEWS2"-Praefix (Titel liefert es)
  assert.equal(out, '6 — mittleres Risiko')
  assert.doesNotMatch(out, /AF |SpO2 |mmHg|ACVPU/)
  assert.equal(def.hasData(fill([complete])), true)
  // unvollstaendig (ACVPU fehlt bzw. eine Zahl fehlt) -> keine Ausgabe/Daten, KEIN Wurf (news2 wuerde werfen)
  assert.equal(def.renderBody(fill([{ rr: 22, spo2: 92, systolic: 108, pulse: 95, temp: 37 }])), '')
  assert.equal(def.hasData(fill([{ rr: 22, spo2: 92, systolic: 108, pulse: 95, consciousness: 'A' }])), false)
  assert.equal(def.renderBody(fill([])), '')
  assert.equal(def.hasData(undefined), false)
  // scale2 (aerztl. Ziel 88-92 %, z. B. COPD) bleibt als Zusatz vermerkt (Interpretationskontext)
  assert.match(def.renderBody(fill([{ ...complete, scale2: true, onOxygen: true }])), /^\d+ — \w+ Risiko \(SpO2-Skala 2\)$/)
  // sampleFill (Editor-Vorschau) -> vollstaendig, rendert einen Score
  assert.ok(def.sampleFill)
  assert.match(def.renderBody(def.sampleFill!()), /^\d+ — \w+ Risiko/)
  // accent (Einsatz-Ampel, rein visuell): niedrig->success, mittel->warning, hoch->error; unvollstaendig->undefined
  assert.equal(def.accent!(fill([complete])), 'warning')
  assert.equal(def.accent!(fill([{ rr: 16, spo2: 98, systolic: 130, pulse: 72, temp: 36.8, consciousness: 'A' }])), 'success')
  assert.equal(def.accent!(fill([{ rr: 25, spo2: 90, systolic: 88, pulse: 135, temp: 34, consciousness: 'U' }])), 'error')
  assert.equal(def.accent!(fill([{ rr: 22 }])), undefined)
})

// --- Funktion „Ärzte" ---
const aerzteDef = FUNCTION_REGISTRY.aerzte
const fillA = (rows: ArztRow[]): FieldFill => ({ state: 'function', rows })

test('formatArzt: Name [(Rolle)][, Ort, Tel. ..., Arztnr. ...]', () => {
  assert.equal(formatArzt({ name: 'Dr. Müller' }), 'Dr. Müller')
  assert.equal(formatArzt({ name: 'Dr. Müller', rolle: 'Hausarzt' }), 'Dr. Müller (Hausarzt)')
  assert.equal(formatArzt({ name: 'X', ort: 'Berlin' }), 'X, Berlin')
  assert.equal(
    formatArzt({ name: 'Dr. Müller', rolle: 'Facharzt', ort: 'Kiel', telefon: '0431', arztnummer: '123456789' }),
    'Dr. Müller (Facharzt), Kiel, Tel. 0431, Arztnr. 123456789',
  )
})

test('formatArzt Kontaktperson (Angehörige/Betreuer): Name (Rolle)[, Tel.][, Flags vorhanden]; kein Ort/Arztnr.', () => {
  assert.equal(formatArzt({ name: 'Max Muster', rolle: 'Angehöriger' }), 'Max Muster (Angehöriger)')
  assert.equal(
    formatArzt({ name: 'Max Muster', rolle: 'Angehöriger', telefon: '0170 1234567', patientenverfuegung: true, vollmacht: true }),
    'Max Muster (Angehöriger), Tel. 0170 1234567, Patientenverfügung + Vollmacht/Betreuung vorhanden',
  )
  // nur ein Flag
  assert.equal(formatArzt({ name: 'Erika M.', rolle: 'Betreuer', patientenverfuegung: true }), 'Erika M. (Betreuer), Patientenverfügung vorhanden')
  assert.equal(formatArzt({ name: 'Erika M.', rolle: 'Betreuer', vollmacht: true }), 'Erika M. (Betreuer), Vollmacht/Betreuung vorhanden')
  // Kontakt ignoriert Arzt-Felder (Ort/Arztnummer) in der AUSGABE, selbst wenn gesetzt
  assert.equal(formatArzt({ name: 'Max', rolle: 'Angehöriger', ort: 'Kiel', arztnummer: '999' }), 'Max (Angehöriger)')
  // namenlos-robust (keine führenden Trenner)
  assert.equal(formatArzt({ name: '', rolle: 'Angehöriger', telefon: '0170' }), '(Angehöriger), Tel. 0170')
})

test('aerzte.renderBody: block (Default) + inline; namelose gefiltert; leer -> ""', () => {
  const A: ArztRow[] = [
    { name: 'Dr. A', rolle: 'Hausarzt' },
    { name: 'Dr. B', ort: 'Kiel' },
  ]
  assert.equal(aerzteDef.renderBody(fillA(A)), 'Dr. A (Hausarzt)\nDr. B, Kiel')
  assert.equal(aerzteDef.renderBody(fillA(A), { rowLayout: 'inline', rowSeparator: ' · ' }), 'Dr. A (Hausarzt) · Dr. B, Kiel')
  assert.equal(aerzteDef.renderBody(fillA([{ name: '' }, { name: 'Dr. C' }])), 'Dr. C')
  assert.equal(aerzteDef.renderBody(fillA([])), '')
})

test('aerzte.hasData: nur bei mindestens einem benannten Arzt', () => {
  assert.equal(aerzteDef.hasData(fillA([{ name: 'Dr. A' }])), true)
  assert.equal(aerzteDef.hasData(fillA([{ name: '  ' }])), false)
  assert.equal(aerzteDef.hasData(undefined), false)
})

test('medikamentRowHasData/arztRowHasData (#260): jede Eingabe zaehlt, Whitespace nicht', () => {
  assert.equal(medikamentRowHasData({ name: '' }), false)
  assert.equal(medikamentRowHasData({ name: '  ', dosierung: ' ' }), false)
  assert.equal(medikamentRowHasData({ name: 'ASS' }), true)
  assert.equal(medikamentRowHasData({ name: '', dosierung: '1-0-1' }), true)
  assert.equal(medikamentRowHasData({ name: '', kommentar: 'nüchtern' }), true)
  assert.equal(medikamentRowHasData({ name: '', pzn: '12345678' }), true)
  assert.equal(medikamentRowHasData({ name: '', staerke: '400 mg' }), true)
  assert.equal(medikamentRowHasData({ name: '', staerke: '  ' }), false)
  assert.equal(arztRowHasData({ name: '' }), false)
  assert.equal(arztRowHasData({ name: '', rolle: 'Hausarzt' }), true)
  assert.equal(arztRowHasData({ name: '', ort: ' ' }), false)
  assert.equal(arztRowHasData({ name: '', telefon: '0431' }), true)
  assert.equal(arztRowHasData({ name: '', arztnummer: '123456789' }), true)
  // Kontakt-Flags zaehlen ebenfalls als Nutzereingabe (sonst wuerde eine reine Haken-Zeile stumm verworfen)
  assert.equal(arztRowHasData({ name: '', rolle: 'Angehöriger', patientenverfuegung: true }), true)
  assert.equal(arztRowHasData({ name: '', vollmacht: true }), true)
})

test('singleLine-Vertrag (#55): jede einzeilige Score-Funktion rendert NIE einen Zeilenumbruch', () => {
  const fills: (FieldFill | undefined)[] = [
    undefined,
    { state: 'function', rows: [] } as FieldFill,
    { state: 'function', rows: [{}] } as FieldFill,
    { state: 'function', rows: [{ cigarettesPerDay: 30, years: 15 }] } as FieldFill,
    { state: 'function', rows: [{ cigarettesPerDay: 40 }] } as FieldFill,
  ]
  for (const [kind, def] of Object.entries(FUNCTION_REGISTRY)) {
    if (!def.singleLine) continue
    for (const f of fills) {
      assert.ok(!def.renderBody(f).includes('\n'), `${kind}.renderBody darf keinen \\n enthalten (inline-Vertrag)`)
    }
  }
})
