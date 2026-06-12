// Laeuft mit:  node --test
// Fixtures sind eigene Konstrukte, Struktur verifiziert gegen das oeffentliche
// KBV-Testpaket (github.com/tionu/BA-Model, bmp_V2.5.xsd + bmp-000x.xml).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  parseMedplanMedications,
  medicationToText,
  medplanToText,
  dosierungToText,
  DOSIEREINHEIT,
  DARREICHUNGSFORM,
  ausstellerToText,
} from './medplan.mjs'

// Aufbau wie bmp-0001.xml: Patient/Author vorhanden, Medikamente NUR per PZN.
const UKF_NUR_PZN =
  '<?xml version="1.0" encoding="ISO-8859-1"?><!DOCTYPE MP>' +
  '<MP v="025" U="02BD2867FB024401A590D59D94E1FFAE" l="de-DE">' +
  '<P g="Erika" f="Musterfrau" b="19400324" egk="X123456789"/>' +
  '<A lanr="123456789" n="Praxis Dr. Beispiel" s="Teststr. 1" z="10555" c="Berlin" p="030-1234567" e="dr@example.org" t="2026-01-01T12:00:00"/>' +
  '<O w="74" c="1.2"/>' +
  '<S><M p="230272" m="1" du="1" r="Herz/Blutdruck"/>' +
  '<M p="558736" m="20" v="20" du="p" i="Wechseln der Injektionsstellen" r="Diabetes"/></S>' +
  '<S t="zu besonderen Zeiten anzuwendende Medikamente">' +
  '<M p="2239828" t="alle drei Tage 1" du="1" i="auf wechselnde Stellen aufkleben" r="Schmerzen"/></S>' +
  '<S c="418"><M p="2455874" m="1" du="1" r="Stimmung"/></S></MP>'

// Medikament mit Klartext-Name, Wirkstoff-Kindern, Darreichungsform-Code.
const UKF_MIT_NAME =
  '<MP v="025" U="AA" l="de-DE"><P g="Max" f="Tester" b="19500101"/>' +
  '<S><M p="2223945" a="Ibuflam 600" f="FTA" m="1" v="1" du="1" r="Schmerzen">' +
  '<W w="Ibuprofen" s="600 mg"/></M>' +
  '<M a="Novaminsulfon &amp; Co" fd="Brausetbl." t="bei Bedarf" dud="St&#252;ck"/></S></MP>'

// Mehrseitig wie bmp-0005a/b: a="2" z="2".
const UKF_SEITE_2 = '<MP v="025" U="BB" a="2" z="2" l="de-DE"><P g="R" f="T"/><S><M p="9900751" v="1" du="1"/></S></MP>'

test('parst Nur-PZN-Plan: alle 4 Zeilen, PZN + Dosierung + Grund/Hinweis', () => {
  const r = parseMedplanMedications(UKF_NUR_PZN)
  assert.equal(r.medications.length, 4)
  const m0 = r.medications[0]
  assert.equal(m0.pzn, '230272')
  assert.equal(m0.name, undefined) // Realfall: kein Klartext-Name im Code
  assert.equal(m0.dosierung.morgens, '1')
  assert.equal(m0.dosiereinheit, 'Stück') // du="1" aufgeloest
  assert.equal(m0.grund, 'Herz/Blutdruck')
  assert.equal(r.medications[1].dosiereinheit, 'IE') // du="p"
  assert.equal(r.medications[1].hinweis, 'Wechseln der Injektionsstellen')
})

test('DATENMINIMIERUNG: P/O-Inhalte und nicht-gelesene A-Attribute tauchen NIRGENDS auf', () => {
  const r = parseMedplanMedications(UKF_NUR_PZN)
  const json = JSON.stringify(r)
  // Patient (P) + Observation (O) komplett verboten; vom Aussteller (A) duerfen
  // Strasse/PLZ/E-Mail/Zeitstempel NICHT auftauchen (#144: nur n/c/Nummer/p).
  for (const verboten of ['Erika', 'Musterfrau', '19400324', 'X123456789', 'Teststr', '10555', 'dr@example.org', '2026-01-01', '"74"', '1.2']) {
    assert.ok(!json.includes(verboten), `Verbotenes Datum im Ergebnis: ${verboten}`)
  }
})

test('Aussteller (#144): nur Name/Ort/Nummer/Telefon werden gelesen', () => {
  const r = parseMedplanMedications(UKF_NUR_PZN)
  assert.deepEqual(r.aussteller, {
    name: 'Praxis Dr. Beispiel',
    ort: 'Berlin',
    nummer: { typ: 'LANR', wert: '123456789' },
    telefon: '030-1234567',
  })
  // Plan ohne A-Element -> aussteller undefined
  assert.equal(parseMedplanMedications(UKF_MIT_NAME).aussteller, undefined)
})

test('ausstellerToText (#144): Rolle waehlt der Nutzer, fehlende Teile entfallen', () => {
  const r = parseMedplanMedications(UKF_NUR_PZN)
  assert.equal(
    ausstellerToText(r.aussteller, 'Hausarzt'),
    'Hausarzt: Praxis Dr. Beispiel, Berlin, LANR 123456789, Tel. 030-1234567',
  )
  assert.equal(ausstellerToText({ name: 'Dr. X' }, 'Facharzt'), 'Facharzt: Dr. X')
})

test('Quelltext-Garantie: Parser liest P/C/O nie und loggt nicht', () => {
  const src = readFileSync(new URL('./medplan.mjs', import.meta.url), 'utf8')
  assert.ok(/SKIPPED_ELEMENTS = new Set\(\['P', 'C', 'O'\]\)/.test(src))
  assert.ok(!/console\./.test(src), 'kein Logging im Parser')
})

test('Abschnitte: Zwischenueberschrift (t) und Code (c) werden den Zeilen zugeordnet', () => {
  const r = parseMedplanMedications(UKF_NUR_PZN)
  assert.equal(r.medications[0].abschnitt, undefined)
  assert.equal(r.medications[2].abschnitt, 'zu besonderen Zeiten anzuwendende Medikamente')
  assert.equal(r.medications[3].abschnittCode, '418')
})

test('Klartext-Name, W-Wirkstoffe, Codes und Entities', () => {
  const r = parseMedplanMedications(UKF_MIT_NAME)
  const [m0, m1] = r.medications
  assert.equal(m0.name, 'Ibuflam 600')
  assert.deepEqual(m0.wirkstoffe, [{ wirkstoff: 'Ibuprofen', staerke: '600 mg' }])
  assert.equal(m0.darreichungsform, 'Tabl') // f="FTA" aufgeloest
  assert.equal(m1.name, 'Novaminsulfon & Co') // &amp; dekodiert
  assert.equal(m1.darreichungsform, 'Brausetbl.') // fd-Freitext gewinnt
  assert.equal(m1.dosiereinheit, 'Stück') // dud-Freitext mit &#252;
  assert.equal(m1.dosierung.freitext, 'bei Bedarf')
})

test('Mehrseitige Plaene: page.current/total aus a/z (Default 1/1)', () => {
  assert.deepEqual(parseMedplanMedications(UKF_SEITE_2).page, { current: 2, total: 2 })
  assert.deepEqual(parseMedplanMedications(UKF_NUR_PZN).page, { current: 1, total: 1 })
})

test('wirft bei Nicht-BMP-Eingaben (normale QR-Inhalte, leere Strings)', () => {
  for (const bad of ['https://example.org', '', 'EAN 4006381333931', '<xml>kein MP</xml>']) {
    assert.throws(() => parseMedplanMedications(bad), /Kein BMP-Code/)
  }
})

test('dosierungToText: m-d-v-h-Schema, fehlende Werte als 0, Freitext gewinnt', () => {
  assert.equal(dosierungToText({ morgens: '1', abends: '1' }), '1-0-1-0')
  assert.equal(dosierungToText({ morgens: '20', abends: '20' }), '20-0-20-0')
  assert.equal(dosierungToText({ freitext: 'alle drei Tage 1', morgens: '9' }), 'alle drei Tage 1')
  assert.equal(dosierungToText({}), '')
  assert.equal(dosierungToText(undefined), '')
})

test('medicationToText: Name > Wirkstoff > PZN-Fallback, inkl. Hinweis/Grund', () => {
  const r = parseMedplanMedications(UKF_MIT_NAME)
  assert.equal(medicationToText(r.medications[0]), 'Ibuflam 600 (Ibuprofen 600 mg) (Tabl): 1-0-1-0 Stück - Grund: Schmerzen')
  const nurPzn = parseMedplanMedications(UKF_NUR_PZN).medications[0]
  assert.equal(medicationToText(nurPzn), 'PZN 230272: 1-0-0-0 Stück - Grund: Herz/Blutdruck')
})

test('medplanToText: eine Zeile pro Medikament', () => {
  const text = medplanToText(parseMedplanMedications(UKF_NUR_PZN))
  assert.equal(text.split('\n').length, 4)
  assert.ok(text.includes('PZN 558736'))
  assert.ok(!/Erika|Musterfrau/.test(text))
})

test('Code-Tabellen: Stichproben gegen die KBV-Schluesseltabellen', () => {
  assert.equal(DOSIEREINHEIT['1'], 'Stück')
  assert.equal(DOSIEREINHEIT.s, 'ml')
  assert.equal(DOSIEREINHEIT.v, 'mg')
  assert.equal(DARREICHUNGSFORM.FTA, 'Tabl')
  assert.equal(DARREICHUNGSFORM.RET, 'RetTabl')
})
