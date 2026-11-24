// Laeuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FUNCTION_REGISTRY, FUNCTION_ROW_INLINE_SEPARATOR, LEGACY_ROW_INLINE_SEPARATOR, rowSeparatorOf, formatMedikament, formatArzt, medikamentRowHasData, arztRowHasData, staerkeOhneDuplikat } from './registry.ts'
import type { FieldFill, MedikamenteRow, ArztRow } from '../model.ts'

const def = FUNCTION_REGISTRY.medikamentenplan
const fill = (rows: MedikamenteRow[]): FieldFill => ({ state: 'function', rows })
const R: MedikamenteRow[] = [
  { name: 'ASS', dosierung: '1-0-0' },
  { name: 'Ramipril', dosierung: '1-0-1', kommentar: 'nüchtern' },
]

test('formatMedikament: "Name Staerke, Schema (Hinweis)" - Komma setzt das Schema IMMER ab', () => {
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

test('staerkeOhneDuplikat: unterdrueckt Doppel-Dokumentation', () => {
  assert.equal(staerkeOhneDuplikat('Ibuflam 400 mg', '400 mg'), undefined)
  assert.equal(staerkeOhneDuplikat('Ibuflam', '400 mg'), '400 mg')
  assert.equal(staerkeOhneDuplikat('Ibuflam', undefined), undefined)
  assert.equal(staerkeOhneDuplikat('Ibuflam', '  '), undefined)
})

test('formatMedikament/formatArzt: namenlos ohne fuehrende Trenner (UI-Summary)', () => {
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

test('renderBody inline + freier Trenner; ohne Trenner -> Semikolon', () => {
  assert.equal(def.renderBody(fill(R), { rowLayout: 'inline', rowSeparator: ' | ' }), 'ASS, 1-0-0 | Ramipril, 1-0-1 (nüchtern)')
  // Inline-DEFAULT = Semikolon: das Komma ist die Grenze IN der Zeile - als Zeilen-Trenner ambig.
  assert.equal(FUNCTION_ROW_INLINE_SEPARATOR, '; ')
  assert.equal(def.renderBody(fill(R), { rowLayout: 'inline' }), 'ASS, 1-0-0; Ramipril, 1-0-1 (nüchtern)')
  assert.equal(
    def.renderBody(fill([{ name: 'Ramipril 5 mg', dosierung: '1-0-0' }, { name: 'ASS 100 mg', dosierung: '1-0-0' }, { name: 'Metformin 1000 mg', dosierung: '1-0-1' }]), { rowLayout: 'inline' }),
    'Ramipril 5 mg, 1-0-0; ASS 100 mg, 1-0-0; Metformin 1000 mg, 1-0-1',
  )
})

test('früherer Standard-Trenner „ · “ gilt wie nicht gesetzt; andere ausdrückliche Trenner bleiben', () => {
  // Vorlagen aus der Zeit, als der Mittelpunkt Standard war, haben ihn teils ausdrücklich gespeichert. Die Bridge
  // kann ihn nicht tippen; gemeint war „Standard“.
  assert.equal(LEGACY_ROW_INLINE_SEPARATOR, ' · ')
  assert.equal(rowSeparatorOf(undefined), '; ')
  assert.equal(rowSeparatorOf({ rowLayout: 'inline' }), '; ')
  assert.equal(rowSeparatorOf({ rowSeparator: ' · ' }), '; ')
  assert.equal(def.renderBody(fill(R), { rowLayout: 'inline', rowSeparator: ' · ' }), 'ASS, 1-0-0; Ramipril, 1-0-1 (nüchtern)')
  // Nur GENAU der frühere Standard. Alles andere ist eine eigene Entscheidung der Vorlage und bleibt.
  for (const own of ['·', ' ·', '· ', '  ·  ', ' • ', ', ', ' / ', '', ' ']) {
    assert.equal(rowSeparatorOf({ rowSeparator: own }), own, JSON.stringify(own))
  }
  assert.equal(def.renderBody(fill(R), { rowLayout: 'inline', rowSeparator: '·' }), 'ASS, 1-0-0·Ramipril, 1-0-1 (nüchtern)')
  assert.equal(def.renderBody(fill(R), { rowLayout: 'inline', rowSeparator: '' }), 'ASS, 1-0-0Ramipril, 1-0-1 (nüchtern)')
  // untereinander spielt der Trenner keine Rolle
  assert.equal(def.renderBody(fill(R), { rowLayout: 'block', rowSeparator: ' · ' }), 'ASS, 1-0-0\nRamipril, 1-0-1 (nüchtern)')
})

test('renderBody: namelose Zeilen gefiltert (beide Layouts); leer -> ""', () => {
  const r: MedikamenteRow[] = [{ name: '' }, { name: 'ASS' }, { name: '  ' }]
  assert.equal(def.renderBody(fill(r)), 'ASS')
  assert.equal(def.renderBody(fill(r), { rowLayout: 'inline' }), 'ASS')
  assert.equal(def.renderBody(fill([]), { rowLayout: 'block', rowPrefix: '- ' }), '')
})

// --- Funktion „Pack-Years" ---
test('packYears: kaufmännisch gerundete GANZE py, „ca." wenn gerundet; unvollständig -> leer', () => {
  const def = FUNCTION_REGISTRY.packYears
  const fill = (rows: unknown[]): FieldFill => ({ state: 'function', rows } as FieldFill)
  assert.equal(def.label, 'Pack-Years')
  // 22,5 -> kaufmännisch 23, gerundet -> „ca."
  assert.equal(def.renderBody(fill([{ cigarettesPerDay: 30, years: 15 }])), 'ca. 23 py (30/Tag, 15 J.)')
  // glatt 10 -> ohne Zeichen
  assert.equal(def.renderBody(fill([{ cigarettesPerDay: 20, years: 10 }])), '10 py (20/Tag, 10 J.)')
  // 15,5 -> 16 (kaufmännisch aufgerundet)
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

test('sampleFill: Listen-Funktionen liefern Muster-Zeilen fuer die Editor-Vorschau', () => {
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

test('news2: „NEWS2 Score (Risiko …) - Kernwerte"; unvollständig -> leer; scale2 schaltet Skala 2', () => {
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

test('lams: „Score/5 (Befunde)" + LVO-Hinweis ab 4; unvollständig -> leer; Ampel 0/1-3/ab 4', () => {
  const def = FUNCTION_REGISTRY.lams
  const fill = (rows: unknown[]): FieldFill => ({ state: 'function', rows } as FieldFill)
  assert.equal(def.label, 'LAMS')
  assert.equal(def.singleLine, true)
  // kein „LAMS"-Praefix im Body (der Knoten-Titel liefert es)
  assert.equal(def.renderBody(fill([{ lamsFace: 1, lamsArm: 2, lamsGrip: 1 }])), '4/5 (Fazialisparese, Arm fällt sofort, Händedruck schwach) - V. a. proximalen Verschluss (LVO)')
  assert.equal(def.renderBody(fill([{ lamsFace: 1, lamsArm: 1, lamsGrip: 1 }])), '3/5 (Fazialisparese, Arm sinkt ab, Händedruck schwach)')
  assert.equal(def.renderBody(fill([{ lamsFace: 0, lamsArm: 0, lamsGrip: 0 }])), '0/5 (Gesicht o. B., Arm o. B., Händedruck normal)')
  assert.equal(def.hasData(fill([{ lamsFace: 0, lamsArm: 0, lamsGrip: 0 }])), true) // 0 ist ein erhobener Befund
  // unvollstaendig bzw. ausserhalb des Bereichs -> keine Ausgabe/Daten, KEIN Wurf (lams wuerde werfen)
  assert.equal(def.renderBody(fill([{ lamsFace: 1, lamsArm: 2 }])), '')
  assert.equal(def.hasData(fill([{ lamsFace: 1, lamsGrip: 2 }])), false)
  assert.equal(def.renderBody(fill([{ lamsFace: 2, lamsArm: 0, lamsGrip: 0 }])), '')
  assert.equal(def.renderBody(fill([])), '')
  assert.equal(def.hasData(undefined), false)
  // sampleFill (Editor-Vorschau) -> vollstaendig, zeigt den LVO-Hinweis
  assert.match(def.renderBody(def.sampleFill!()), /^4\/5 .*LVO\)$/)
  // accent (Einsatz-Ampel, rein visuell)
  assert.equal(def.accent!(fill([{ lamsFace: 0, lamsArm: 0, lamsGrip: 0 }])), 'success')
  assert.equal(def.accent!(fill([{ lamsFace: 1, lamsArm: 0, lamsGrip: 0 }])), 'warning')
  assert.equal(def.accent!(fill([{ lamsFace: 1, lamsArm: 1, lamsGrip: 1 }])), 'warning')
  assert.equal(def.accent!(fill([{ lamsFace: 0, lamsArm: 2, lamsGrip: 2 }])), 'error')
  assert.equal(def.accent!(fill([{ lamsFace: 1 }])), undefined)
})

test('fast4d: positiv ab einem Befund, Befunde mit Seite, nicht prüfbar, Zeit; unvollständig -> leer; Ampel ohne Rot', () => {
  const def = FUNCTION_REGISTRY.fast4d
  const fill = (rows: object[]): FieldFill => ({ state: 'function', rows }) as FieldFill
  const neg = { fastFace: 'neg', fastArm: 'neg', fastSpeech: 'neg', fastDiplopia: 'neg', fastField: 'neg', fastVertigo: 'neg', fastAtaxia: 'neg' }
  const na = { fastFace: 'na', fastArm: 'na', fastSpeech: 'na', fastDiplopia: 'na', fastField: 'na', fastVertigo: 'na', fastAtaxia: 'na' }
  assert.equal(def.label, 'FAST4D')
  assert.equal(def.singleLine, true)
  // kein „FAST4D"-Praefix im Body (der Knoten-Titel liefert es)
  assert.equal(def.renderBody(fill([neg])), 'negativ.')
  assert.equal(def.renderBody(fill([{ ...neg, fastVertigo: 'pos' }])), 'positiv (1/7): Dreh-/Schwankschwindel.')
  assert.equal(
    def.renderBody(fill([{ ...neg, fastFace: 'pos', fastFaceSide: 're', fastArm: 'pos', fastArmSide: 're', fastDiplopia: 'pos', fastAtaxia: 'na', fastTimeMode: 'onset', fastTime: '14:30' }])),
    'positiv (3/7): Fazialisparese rechts, Armabsinken rechts, Doppelbilder; nicht prüfbar: Dysmetrie/Ataxie. Symptombeginn 14:30.',
  )
  assert.equal(def.renderBody(fill([{ ...neg, fastTimeMode: 'lsw', fastTime: '06:05' }])), 'negativ. Zuletzt gesund gesehen 06:05.')
  assert.equal(def.renderBody(fill([{ ...neg, fastTimeMode: 'unknown' }])), 'negativ. Symptombeginn unklar.')
  assert.equal(def.renderBody(fill([na])), 'nicht prüfbar.')
  // die Zeit zaehlt nicht mit: negativ bleibt negativ, auch mit Zeitangabe
  assert.equal(def.accent!(fill([{ ...neg, fastTimeMode: 'onset', fastTime: '14:30' }])), 'success')
  // unvollstaendig bzw. unbekannter Wert -> keine Ausgabe/Daten, KEIN Wurf (fast4d wuerde werfen)
  const { fastAtaxia: _weg, ...sechs } = neg
  assert.equal(def.renderBody(fill([sechs])), '')
  assert.equal(def.hasData(fill([sechs])), false)
  assert.equal(def.renderBody(fill([{ ...neg, fastFace: 'ja' }])), '')
  assert.equal(def.hasData(undefined), false)
  assert.equal(def.hasData(fill([neg])), true) // durchgehend unauffaellig ist ein erhobener Befund
  // sampleFill (Editor-Vorschau) -> vollstaendig, zeigt Befunde, „nicht prüfbar" und die Zeit
  assert.equal(def.renderBody(def.sampleFill!()), 'positiv (3/7): Fazialisparese rechts, Armabsinken rechts, Doppelbilder; nicht prüfbar: Dysmetrie/Ataxie. Symptombeginn 14:30.')
  // accent (Einsatz-Ampel): negativ gruen, positiv gelb - auch bei 7/7 kein Rot (keine belegte Schwelle)
  assert.equal(def.accent!(fill([neg])), 'success')
  assert.equal(def.accent!(fill([{ ...neg, fastSpeech: 'pos' }])), 'warning')
  const allePos = Object.fromEntries(Object.keys(neg).map((k) => [k, 'pos']))
  assert.equal(def.accent!(fill([allePos])), 'warning')
  assert.equal(def.accent!(fill([na])), undefined)
  // gruen NUR bei sieben unauffaelligen Zeichen: nichts auffaellig, aber etwas nicht pruefbar -> keine Farbe
  assert.equal(def.accent!(fill([{ ...neg, fastAtaxia: 'na' }])), undefined)
  assert.equal(def.accent!(fill([{ ...na, fastFace: 'neg' }])), undefined)
  // auffaellig schlaegt nicht pruefbar: gelb bleibt gelb
  assert.equal(def.accent!(fill([{ ...na, fastFace: 'pos' }])), 'warning')
  assert.equal(def.accent!(fill([sechs])), undefined)
})

test('zops: nur die Abweichung, unvollständig -> leer; Ampel ohne Rot', () => {
  const def = FUNCTION_REGISTRY.zops
  const fill = (rows: object[]): FieldFill => ({ state: 'function', rows }) as FieldFill
  const ok = { zopsTime: 'ok', zopsPlace: 'ok', zopsPerson: 'ok', zopsSituation: 'ok' }
  assert.equal(def.label, 'ZOPS')
  assert.equal(def.singleLine, true)
  // kein „ZOPS"-Praefix im Body (der Knoten-Titel liefert es)
  assert.equal(def.renderBody(fill([ok])), 'orientiert.')
  assert.equal(def.renderBody(fill([{ ...ok, zopsTime: 'no' }])), 'nicht orientiert zu: Zeit.')
  assert.equal(def.renderBody(fill([{ ...ok, zopsTime: 'no', zopsSituation: 'na' }])), 'nicht orientiert zu: Zeit; nicht prüfbar: Situation.')
  // unvollständig oder fremde Werte: keine Ausgabe, keine Daten, keine Farbe
  for (const rows of [[], [{}], [{ zopsTime: 'ok', zopsPlace: 'ok', zopsPerson: 'ok' }], [{ ...ok, zopsPlace: 'neg' }]]) {
    assert.equal(def.renderBody(fill(rows)), '')
    assert.equal(def.hasData(fill(rows)), false)
    assert.equal(def.accent!(fill(rows)), undefined)
  }
  assert.equal(def.hasData(fill([ok])), true)
  assert.equal(def.accent!(fill([ok])), 'success')
  assert.equal(def.accent!(fill([{ ...ok, zopsPerson: 'no' }])), 'warning')
  assert.equal(def.accent!(fill([{ zopsTime: 'no', zopsPlace: 'no', zopsPerson: 'no', zopsSituation: 'no' }])), 'warning') // nie Rot
  assert.equal(def.accent!(fill([{ ...ok, zopsSituation: 'na' }])), undefined) // nicht alles prüfbar: kein Grün
  // Vorschau im Editor zeigt Abweichung und „nicht prüfbar"
  assert.equal(def.renderBody(def.sampleFill!()), 'nicht orientiert zu: Zeit; nicht prüfbar: Situation.')
})

test('sgarbossa: positiv ab einem Kriterium; negativ nie grün, kein Hinweis im Einsatz', () => {
  const def = FUNCTION_REGISTRY.sgarbossa
  const fill = (rows: object[]): FieldFill => ({ state: 'function', rows }) as FieldFill
  const neg = { sgbConcordantElevation: 'neg', sgbConcordantDepression: 'neg', sgbDiscordantElevation: 'neg' }
  assert.equal(def.label, 'Sgarbossa (mod. nach Smith)')
  assert.equal(def.singleLine, true)
  assert.equal(def.renderBody(fill([neg])), 'negativ.')
  assert.equal(def.renderBody(fill([{ ...neg, sgbDiscordantElevation: 'pos' }])), 'positiv: diskordante ST-Hebung (ST/S ab 0,25).')
  // Negativ: keine Farbe (nie Grün); der Hinweis gehört ins Eingabeblatt und steht nie im Text.
  assert.equal(def.accent!(fill([neg])), undefined)
  assert.ok(!def.renderBody(fill([neg])).includes('Koronarverschluss'))
  // Positiv: rot.
  assert.equal(def.accent!(fill([{ ...neg, sgbConcordantElevation: 'pos' }])), 'error')
  // Nichts beurteilbar: keine Farbe.
  const na = { sgbConcordantElevation: 'na', sgbConcordantDepression: 'na', sgbDiscordantElevation: 'na' }
  assert.equal(def.renderBody(fill([na])), 'nicht beurteilbar.')
  assert.equal(def.accent!(fill([na])), undefined)
  // Unvollständig oder fremde Werte: nichts.
  for (const rows of [[], [{}], [{ sgbConcordantElevation: 'neg', sgbConcordantDepression: 'neg' }], [{ ...neg, sgbDiscordantElevation: 'ok' }]]) {
    assert.equal(def.renderBody(fill(rows)), '')
    assert.equal(def.hasData(fill(rows)), false)
    assert.equal(def.accent!(fill(rows)), undefined)
  }
  assert.equal(def.renderBody(def.sampleFill!()), 'positiv: konkordante ST-Hebung; nicht beurteilbar: diskordante ST-Hebung (ST/S ab 0,25).')
  // Keine andere Funktion bringt einen Hinweis mit.
})

test('egsys: ab 3 Punkten rot, darunter ohne Farbe und nie grün', () => {
  const def = FUNCTION_REGISTRY.egsys
  const fill = (rows: object[]): FieldFill => ({ state: 'function', rows }) as FieldFill
  const no = { egsysPalpitations: 'no', egsysHeartDisease: 'no', egsysEffort: 'no', egsysSupine: 'no', egsysTriggers: 'no', egsysProdromes: 'no' }
  assert.equal(def.label, 'EGSYS')
  assert.equal(def.singleLine, true)
  assert.equal(def.renderBody(fill([no])), '0 Punkte.')
  assert.equal(def.accent!(fill([no])), undefined) // nie Grün
  assert.ok(!def.renderBody(fill([no])).includes('schließt'))
  const hoch = { ...no, egsysPalpitations: 'yes' }
  assert.equal(def.renderBody(fill([hoch])), '4 Punkte (Palpitationen vor Synkope) - kardiale Synkope wahrscheinlich.')
  assert.equal(def.accent!(fill([hoch])), 'error')
  // 2 Punkte: unter der Schwelle
  assert.equal(def.accent!(fill([{ ...no, egsysSupine: 'yes' }])), undefined)
  // Unvollständig oder fremde Werte (auch echte Booleans): nichts.
  for (const rows of [[], [{}], [{ ...no, egsysProdromes: undefined }], [{ ...no, egsysEffort: true }], [{ ...no, egsysEffort: 'ja' }]]) {
    assert.equal(def.renderBody(fill(rows)), '')
    assert.equal(def.hasData(fill(rows)), false)
    assert.equal(def.accent!(fill(rows)), undefined)
  }
  assert.equal(def.renderBody(def.sampleFill!()), '7 Punkte (Palpitationen vor Synkope, Herzerkrankung/EKG auffällig) - kardiale Synkope wahrscheinlich.')
  // Eigener Text aus der Vorlage (config.thresholdText); der Editor kennt Standard und Beschriftung.
  assert.equal(def.renderBody(fill([hoch]), { thresholdText: '- Kardiologie verständigen' }), '4 Punkte (Palpitationen vor Synkope) - Kardiologie verständigen.')
  assert.equal(def.renderBody(fill([{ ...no, egsysSupine: 'yes' }]), { thresholdText: '- Kardiologie verständigen' }), '2 Punkte (Synkope im Liegen).')
  assert.deepEqual(def.thresholdText, { standard: '- kardiale Synkope wahrscheinlich', label: 'Text ab 3 Punkten' })
  assert.deepEqual(def.lineEnd, { standard: '.', label: 'Zeilenende' })
  assert.equal(def.renderBody(fill([hoch]), { lineEnd: '' }), '4 Punkte (Palpitationen vor Synkope) - kardiale Synkope wahrscheinlich')
  assert.equal(def.renderBody(fill([hoch]), { thresholdText: '- abklären', lineEnd: ';' }), '4 Punkte (Palpitationen vor Synkope) - abklären;')
  // Jede einzeilige Funktion hat ein frei wählbares Zeilenende, Listen-Funktionen nicht.
  for (const [kind, d] of Object.entries(FUNCTION_REGISTRY)) assert.equal(!!d.lineEnd, !!d.singleLine, kind)
  for (const [kind, d] of Object.entries(FUNCTION_REGISTRY)) if (kind !== 'egsys') assert.equal(d.thresholdText, undefined, kind)
})

test('sgarbossa: Zeilenende frei wählbar wie bei EGSYS', () => {
  const def = FUNCTION_REGISTRY.sgarbossa
  const fill = (rows: object[]): FieldFill => ({ state: 'function', rows }) as FieldFill
  const neg = { sgbConcordantElevation: 'neg', sgbConcordantDepression: 'neg', sgbDiscordantElevation: 'neg' }
  assert.deepEqual(def.lineEnd, { standard: '.', label: 'Zeilenende' })
  assert.equal(def.renderBody(fill([neg])), 'negativ.')
  assert.equal(def.renderBody(fill([neg]), { lineEnd: ';' }), 'negativ;')
  assert.equal(def.renderBody(fill([neg]), { lineEnd: '' }), 'negativ')
  assert.equal(def.renderBody(fill([{ ...neg, sgbConcordantElevation: 'pos' }]), { lineEnd: '' }), 'positiv: konkordante ST-Hebung')
  assert.equal(def.renderBody(fill([{ sgbConcordantElevation: 'na', sgbConcordantDepression: 'na', sgbDiscordantElevation: 'na' }]), { lineEnd: ' -' }), 'nicht beurteilbar -')
})

test('Zeilenende: Standard lässt jede Zeile wie bisher, eigene Angabe ersetzt das Ende', () => {
  const fill = (row: object): FieldFill => ({ state: 'function', rows: [row] }) as FieldFill
  const faelle: [string, object, string, string][] = [
    ['packYears', { cigarettesPerDay: 30, years: 15 }, '', 'ca. 23 py (30/Tag, 15 J.)'],
    ['news2', { rr: 16, spo2: 97, systolic: 125, pulse: 72, temp: 36.8, consciousness: 'A', onOxygen: false, scale2: false }, '', ''],
    ['lams', { lamsFace: 1, lamsArm: 2, lamsGrip: 2 }, '', ''],
    ['fast4d', { fastFace: 'neg', fastArm: 'neg', fastSpeech: 'neg', fastDiplopia: 'neg', fastField: 'neg', fastVertigo: 'neg', fastAtaxia: 'neg', fastTimeMode: 'onset', fastTime: '14:30' }, '.', 'negativ. Symptombeginn 14:30.'],
    ['zops', { zopsTime: 'ok', zopsPlace: 'ok', zopsPerson: 'ok', zopsSituation: 'ok' }, '.', 'orientiert.'],
  ]
  for (const [kind, row, standard, beispiel] of faelle) {
    const def = FUNCTION_REGISTRY[kind as keyof typeof FUNCTION_REGISTRY]
    assert.deepEqual(def.lineEnd, { standard, label: 'Zeilenende' }, kind)
    const ohne = def.renderBody(fill(row))
    if (beispiel) assert.equal(ohne, beispiel, kind)
    // Ohne Angabe und mit dem Standard: unverändert (rückwärts kompatibel).
    assert.equal(def.renderBody(fill(row), {}), ohne, kind)
    assert.equal(def.renderBody(fill(row), { lineEnd: standard }), ohne, kind)
    // Eigenes Ende ersetzt das Standard-Ende genau einmal.
    const basis = standard ? ohne.slice(0, -standard.length) : ohne
    assert.equal(def.renderBody(fill(row), { lineEnd: ';' }), `${basis};`, kind)
    assert.equal(def.renderBody(fill(row), { lineEnd: '' }), basis, kind)
    // Ohne Ergebnis bleibt es leer, auch mit Zeilenende.
    assert.equal(def.renderBody(fill({}), { lineEnd: ';' }), '', kind)
  }
})

test('bmi: kg/m² mit WHO-Klasse, unvollständig oder unsinnig -> leer; keine Farbe; Zeilenende', () => {
  const def = FUNCTION_REGISTRY.bmi
  const fill = (rows: object[]): FieldFill => ({ state: 'function', rows }) as FieldFill
  assert.equal(def.label, 'BMI')
  assert.equal(def.singleLine, true)
  assert.equal(def.renderBody(fill([{ bmiWeight: 80, bmiHeight: 180 }])), '24,7 (Normalgewicht; 80 kg, 180 cm)')
  assert.equal(def.renderBody(fill([{ bmiWeight: 125, bmiHeight: 175 }])), '40,8 (Adipositas Grad III; 125 kg, 175 cm)')
  for (const rows of [[], [{}], [{ bmiWeight: 80 }], [{ bmiWeight: 80, bmiHeight: 0 }], [{ bmiWeight: -1, bmiHeight: 180 }], [{ bmiWeight: Number.NaN, bmiHeight: 180 }]]) {
    assert.equal(def.renderBody(fill(rows)), '')
    assert.equal(def.hasData(fill(rows)), false)
  }
  assert.equal(def.hasData(fill([{ bmiWeight: 80, bmiHeight: 180 }])), true)
  assert.equal(def.accent, undefined)
  assert.equal(def.renderBody(fill([{ bmiWeight: 80, bmiHeight: 180 }]), { lineEnd: '.' }), '24,7 (Normalgewicht; 80 kg, 180 cm).')
  assert.equal(def.renderBody(def.sampleFill!()), '24,7 (Normalgewicht; 80 kg, 180 cm)')
})

test('Hinweise wie „schließt … nicht aus" stehen nur im Eingabeblatt: keine Funktion liefert einen Einsatz-Hinweis', () => {
  for (const [kind, d] of Object.entries(FUNCTION_REGISTRY)) assert.ok(!('note' in d), kind)
})

test('createDefaults: Befund-Scores starten mit Inline-Titel ohne Markdown-Präfix; jede Instanz eigenes heading', () => {
  const a = FUNCTION_REGISTRY.lams.createDefaults!()
  const b = FUNCTION_REGISTRY.lams.createDefaults!()
  assert.equal(a.titleInline, true)
  assert.equal(a.heading?.prefix, '')
  assert.equal(a.heading?.suffix, ' ')
  assert.notEqual(a.heading, b.heading) // keine geteilte Referenz zwischen Knoten
  assert.deepEqual(FUNCTION_REGISTRY.fast4d.createDefaults!(), a)
  assert.deepEqual(FUNCTION_REGISTRY.zops.createDefaults!(), a)
  assert.deepEqual(FUNCTION_REGISTRY.sgarbossa.createDefaults!(), a)
  assert.deepEqual(FUNCTION_REGISTRY.egsys.createDefaults!(), a)
  assert.deepEqual(FUNCTION_REGISTRY.bmi.createDefaults!(), a)
  // Bestandsfunktionen bleiben beim Banner-Titel
  for (const kind of ['medikamentenplan', 'aerzte', 'packYears', 'news2'] as const) assert.equal(FUNCTION_REGISTRY[kind].createDefaults, undefined)
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
  assert.equal(aerzteDef.renderBody(fillA(A), { rowLayout: 'inline' }), 'Dr. A (Hausarzt); Dr. B, Kiel')
  assert.equal(aerzteDef.renderBody(fillA(A), { rowLayout: 'inline', rowSeparator: ' / ' }), 'Dr. A (Hausarzt) / Dr. B, Kiel')
  assert.equal(aerzteDef.renderBody(fillA(A), { rowLayout: 'inline', rowSeparator: ' · ' }), 'Dr. A (Hausarzt); Dr. B, Kiel', 'früherer Standard')
  assert.equal(aerzteDef.renderBody(fillA([{ name: '' }, { name: 'Dr. C' }])), 'Dr. C')
  assert.equal(aerzteDef.renderBody(fillA([])), '')
})

test('aerzte.hasData: nur bei mindestens einem benannten Arzt', () => {
  assert.equal(aerzteDef.hasData(fillA([{ name: 'Dr. A' }])), true)
  assert.equal(aerzteDef.hasData(fillA([{ name: '  ' }])), false)
  assert.equal(aerzteDef.hasData(undefined), false)
})

test('medikamentRowHasData/arztRowHasData: jede Eingabe zaehlt, Whitespace nicht', () => {
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

test('singleLine-Vertrag: jede einzeilige Score-Funktion rendert NIE einen Zeilenumbruch', () => {
  const fills: (FieldFill | undefined)[] = [
    undefined,
    { state: 'function', rows: [] } as FieldFill,
    { state: 'function', rows: [{}] } as FieldFill,
    { state: 'function', rows: [{ cigarettesPerDay: 30, years: 15 }] } as FieldFill,
    { state: 'function', rows: [{ cigarettesPerDay: 40 }] } as FieldFill,
    { state: 'function', rows: [{ lamsFace: 1, lamsArm: 2, lamsGrip: 2 }] } as FieldFill,
    { state: 'function', rows: [{ zopsTime: 'no', zopsPlace: 'no', zopsPerson: 'ok', zopsSituation: 'na' }] } as FieldFill,
    { state: 'function', rows: [{ sgbConcordantElevation: 'pos', sgbConcordantDepression: 'pos', sgbDiscordantElevation: 'na' }] } as FieldFill,
    { state: 'function', rows: [{ egsysPalpitations: 'yes', egsysHeartDisease: 'yes', egsysEffort: 'yes', egsysSupine: 'yes', egsysTriggers: 'yes', egsysProdromes: 'yes' }] } as FieldFill,
    { state: 'function', rows: [{ bmiWeight: 80, bmiHeight: 180 }] } as FieldFill,
  ]
  for (const [kind, def] of Object.entries(FUNCTION_REGISTRY)) {
    if (!def.singleLine) continue
    for (const f of fills) {
      assert.ok(!def.renderBody(f).includes('\n'), `${kind}.renderBody darf keinen \\n enthalten (inline-Vertrag)`)
    }
  }
})

test('Funktionsname „Kontakte/Ärzte": der Kontakt steht vorn (bewusste Entscheidung seit 1.6.0)', () => {
  // Die Funktion fuehrt Ärzte UND Kontaktpersonen (Angehörige/Betreuer). Der Name erscheint im Editor-Menü
  // und als Titel jeder neu eingefügten Funktion (createFunction) - beides liest diese eine Stelle.
  assert.equal(FUNCTION_REGISTRY.aerzte.label, 'Kontakte/Ärzte')
})

// EINE Liste der Funktionsarten für App (＋-Menü) und Online-Editor (Katalog). Jede Art braucht zudem
// einen Eintrag in ai-docs/feature-versions.json, sonst filtert der Online-Editor sie still weg.
test('FUNCTION_KINDS = Registry = feature-versions.json (Gleichstand App/Online-Editor)', async () => {
  const { FUNCTION_KINDS, FUNCTION_REGISTRY: REG } = await import('./registry.ts')
  const { readFileSync } = await import('node:fs')
  const fv = JSON.parse(readFileSync(new URL('../../../ai-docs/feature-versions.json', import.meta.url), 'utf8')) as { functions: { kind: string }[] }
  assert.deepEqual(FUNCTION_KINDS, Object.keys(REG))
  assert.deepEqual([...fv.functions.map((f) => f.kind)].sort(), [...FUNCTION_KINDS].sort())
})
