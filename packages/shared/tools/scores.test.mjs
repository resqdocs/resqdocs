// Läuft mit:  node --test
// Erwartungswerte aus den publizierten Tabellen (RCP NEWS2 2017; LAMS nach
// Llanes 2004; BMI WHO). Fachlich gegenzuprüfen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { packYears, bmi, lams, fast4d, news2, ekgAxisTable, signatureBlock, zops, sgarbossa, SGARBOSSA_NEGATIVE_HINT, egsys, EGSYS_LOW_HINT, EGSYS_THRESHOLD, EGSYS_DEFAULT_TEXT } from './scores.mjs'

test('packYears: Definition (Zig./Tag ÷ 20) × Jahre, Rundung auf 1 Nachkommastelle', () => {
  assert.equal(packYears({ cigarettesPerDay: 20, years: 10 }).value, 10)
  assert.equal(packYears({ cigarettesPerDay: 10, years: 15 }).value, 7.5)
  assert.equal(packYears({ cigarettesPerDay: 7, years: 11 }).value, 3.9) // 3.85 -> 3.9
  assert.ok(packYears({ cigarettesPerDay: 20, years: 10 }).text.includes('10,0 py'))
  assert.throws(() => packYears({ cigarettesPerDay: -1, years: 5 }))
})

test('bmi: kg/m² + WHO-Klassen inkl. Grenzwerte', () => {
  assert.equal(bmi({ weightKg: 80, heightCm: 180 }).value, 24.7)
  assert.equal(bmi({ weightKg: 80, heightCm: 180 }).klass, 'Normalgewicht')
  assert.equal(bmi({ weightKg: 56, heightCm: 175 }).klass, 'Untergewicht') // 18.3
  assert.equal(bmi({ weightKg: 77, heightCm: 175 }).klass, 'Präadipositas') // 25.1
  assert.equal(bmi({ weightKg: 95, heightCm: 175 }).klass, 'Adipositas Grad I') // 31.0
  assert.equal(bmi({ weightKg: 125, heightCm: 175 }).klass, 'Adipositas Grad III') // 40.8
  assert.throws(() => bmi({ weightKg: 80, heightCm: 0 }))
  // Funktion: Zeile ohne „BMI"-Präfix (der Titel kommt vom Knoten), Text wie beim früheren Rechner.
  assert.equal(bmi({ weightKg: 80, heightCm: 180 }).body, '24,7 (Normalgewicht; 80 kg, 180 cm)')
  assert.equal(bmi({ weightKg: 80, heightCm: 180 }).text, 'BMI 24,7 (Normalgewicht; 80 kg, 180 cm)')
})

test('lams: Summe 0-5; >= 4 markiert LVO-Verdacht', () => {
  assert.equal(lams({ face: 0, arm: 0, grip: 0 }).score, 0)
  const mid = lams({ face: 1, arm: 1, grip: 1 })
  assert.equal(mid.score, 3)
  assert.equal(mid.lvoSuspected, false)
  const high = lams({ face: 1, arm: 2, grip: 1 })
  assert.equal(high.score, 4)
  assert.equal(high.lvoSuspected, true)
  assert.ok(high.text.includes('LAMS 4/5'))
  assert.ok(high.text.includes('LVO'))
  assert.throws(() => lams({ face: 2, arm: 0, grip: 0 }))
})

test('lams: body = text ohne „LAMS"-Praefix (Funktion: Label kommt vom Knoten-Titel)', () => {
  assert.equal(lams({ face: 1, arm: 2, grip: 1 }).body, '4/5 (Fazialisparese, Arm fällt sofort, Händedruck schwach) - V. a. proximalen Verschluss (LVO)')
  assert.equal(lams({ face: 0, arm: 0, grip: 0 }).body, '0/5 (Gesicht o. B., Arm o. B., Händedruck normal)')
  const mid = lams({ face: 1, arm: 1, grip: 1 })
  assert.equal(mid.text, `LAMS ${mid.body}`)
  assert.ok(!mid.body.includes('LVO')) // 3 liegt unter der Schwelle
})

const F4D_NEG = { face: 'neg', arm: 'neg', speech: 'neg', diplopia: 'neg', field: 'neg', vertigo: 'neg', ataxia: 'neg' }

test('fast4d: positiv ab EINEM auffälligen Zeichen, kein Punktescore', () => {
  const neg = fast4d(F4D_NEG)
  assert.equal(neg.positive, false)
  assert.equal(neg.count, 0)
  assert.equal(neg.body, 'negativ.')
  assert.equal(neg.text, 'FAST4D negativ.')
  const one = fast4d({ ...F4D_NEG, vertigo: 'pos' })
  assert.equal(one.positive, true)
  assert.equal(one.count, 1)
  assert.equal(one.body, 'positiv (1/7): Dreh-/Schwankschwindel.')
})

test('fast4d: Befunde mit Seite, „nicht prüfbar" getrennt, Zeit angehängt', () => {
  const r = fast4d({ face: 'pos', faceSide: 're', arm: 'pos', armSide: 're', speech: 'neg', diplopia: 'pos', field: 'neg', vertigo: 'neg', ataxia: 'na', timeMode: 'onset', time: '14:30' })
  assert.equal(r.body, 'positiv (3/7): Fazialisparese rechts, Armabsinken rechts, Doppelbilder; nicht prüfbar: Dysmetrie/Ataxie. Symptombeginn 14:30.')
  assert.deepEqual(r.notTestable, ['Dysmetrie/Ataxie'])
  assert.equal(fast4d({ ...F4D_NEG, arm: 'pos', armSide: 'li' }).body, 'positiv (1/7): Armabsinken links.')
  assert.equal(fast4d({ ...F4D_NEG, ataxia: 'na' }).body, 'negativ (nicht prüfbar: Dysmetrie/Ataxie).')
})

test('fast4d: Seite nur bei auffälligem Face/Arm; alles „nicht prüfbar" ist weder positiv noch negativ', () => {
  // Seite an einem unauffälligen Befund erscheint nicht.
  assert.equal(fast4d({ ...F4D_NEG, faceSide: 're', armSide: 'li' }).body, 'negativ.')
  const na = fast4d({ face: 'na', arm: 'na', speech: 'na', diplopia: 'na', field: 'na', vertigo: 'na', ataxia: 'na' })
  assert.equal(na.untestable, true)
  assert.equal(na.positive, false)
  assert.equal(na.body, 'nicht prüfbar.')
})

test('fast4d: Zeit wird dokumentiert, nicht gewertet; ungültige Uhrzeit entfällt', () => {
  assert.equal(fast4d({ ...F4D_NEG, timeMode: 'lsw', time: '06:05' }).body, 'negativ. Zuletzt gesund gesehen 06:05.')
  assert.equal(fast4d({ ...F4D_NEG, timeMode: 'unknown' }).body, 'negativ. Symptombeginn unklar.')
  assert.equal(fast4d({ ...F4D_NEG, timeMode: 'unknown' }).count, 0)
  assert.equal(fast4d({ ...F4D_NEG, timeMode: 'onset' }).body, 'negativ.') // Modus ohne Uhrzeit
  assert.equal(fast4d({ ...F4D_NEG, timeMode: 'onset', time: '25:99' }).body, 'negativ.')
  assert.equal(fast4d({ ...F4D_NEG, time: '14:30' }).body, 'negativ.') // Uhrzeit ohne Modus
})

test('fast4d: unvollständige/ungültige Eingabe wirft', () => {
  assert.throws(() => fast4d({ ...F4D_NEG, ataxia: undefined }))
  assert.throws(() => fast4d({ ...F4D_NEG, face: 'ja' }))
})

const ZOPS_OK = { time: 'ok', place: 'ok', person: 'ok', situation: 'ok' }

test('zops: nennt nur die Abweichung, kein Punktwert', () => {
  const ok = zops(ZOPS_OK)
  assert.equal(ok.oriented, true)
  assert.equal(ok.body, 'orientiert.')
  assert.equal(ok.text, 'ZOPS orientiert.')
  const zeit = zops({ ...ZOPS_OK, time: 'no' })
  assert.equal(zeit.oriented, false)
  assert.deepEqual(zeit.notOriented, ['Zeit'])
  assert.equal(zeit.body, 'nicht orientiert zu: Zeit.')
  assert.equal(zops({ ...ZOPS_OK, time: 'no', situation: 'no' }).body, 'nicht orientiert zu: Zeit, Situation.')
  // Reihenfolge immer Zeit, Ort, Person, Situation - unabhängig von der Eingabereihenfolge.
  assert.equal(zops({ situation: 'no', person: 'no', place: 'no', time: 'no' }).body, 'nicht orientiert zu: Zeit, Ort, Person, Situation.')
  assert.ok(!/\d/.test(zeit.body), 'keine Zahl in der Ausgabe')
})

test('zops: nicht prüfbar wird genannt und nie als orientiert unterstellt', () => {
  assert.equal(zops({ ...ZOPS_OK, time: 'no', situation: 'na' }).body, 'nicht orientiert zu: Zeit; nicht prüfbar: Situation.')
  const teil = zops({ ...ZOPS_OK, situation: 'na' })
  assert.equal(teil.oriented, false)
  assert.equal(teil.body, 'orientiert zu: Zeit, Ort, Person; nicht prüfbar: Situation.')
  const nichts = zops({ time: 'na', place: 'na', person: 'na', situation: 'na' })
  assert.equal(nichts.untestable, true)
  assert.equal(nichts.body, 'nicht prüfbar.')
})

test('zops: unvollständige/ungültige Eingabe wirft', () => {
  assert.throws(() => zops({ ...ZOPS_OK, person: undefined }))
  assert.throws(() => zops({ ...ZOPS_OK, time: 'neg' }))
})

const SGB_NEG = { concordantElevation: 'neg', concordantDepression: 'neg', discordantElevation: 'neg' }

test('sgarbossa (mod. nach Smith): positiv ab EINEM Kriterium, ungewichtet, kein Punktwert', () => {
  const neg = sgarbossa(SGB_NEG)
  assert.equal(neg.positive, false)
  assert.equal(neg.negative, true)
  assert.equal(neg.body, 'negativ.')
  assert.equal(neg.text, 'Sgarbossa (mod. nach Smith) negativ.')
  // Jedes der drei Kriterien genügt allein - auch das dritte (im Original reichte es mit 2 Punkten nicht).
  assert.equal(sgarbossa({ ...SGB_NEG, concordantElevation: 'pos' }).body, 'positiv: konkordante ST-Hebung.')
  assert.equal(sgarbossa({ ...SGB_NEG, concordantDepression: 'pos' }).body, 'positiv: konkordante ST-Senkung in V1-V3.')
  const drittes = sgarbossa({ ...SGB_NEG, discordantElevation: 'pos' })
  assert.equal(drittes.positive, true)
  assert.equal(drittes.body, 'positiv: diskordante ST-Hebung (ST/S ab 0,25).')
  const alle = sgarbossa({ concordantElevation: 'pos', concordantDepression: 'pos', discordantElevation: 'pos' })
  assert.equal(alle.count, 3)
  assert.equal(alle.body, 'positiv: konkordante ST-Hebung, konkordante ST-Senkung in V1-V3, diskordante ST-Hebung (ST/S ab 0,25).')
  assert.ok(!/Punkt/.test(alle.body), 'kein Punktwert')
})

test('sgarbossa: nicht beurteilbar wird genannt; der Hinweis steht nie im Text', () => {
  assert.equal(sgarbossa({ ...SGB_NEG, discordantElevation: 'na' }).body, 'negativ (nicht beurteilbar: diskordante ST-Hebung (ST/S ab 0,25)).')
  assert.equal(sgarbossa({ concordantElevation: 'pos', concordantDepression: 'na', discordantElevation: 'neg' }).body, 'positiv: konkordante ST-Hebung; nicht beurteilbar: konkordante ST-Senkung in V1-V3.')
  const nichts = sgarbossa({ concordantElevation: 'na', concordantDepression: 'na', discordantElevation: 'na' })
  assert.equal(nichts.untestable, true)
  assert.equal(nichts.negative, false) // nichts beurteilbar ist kein „negativ"
  assert.equal(nichts.body, 'nicht beurteilbar.')
  // Wortlaut des Pflicht-Hinweises (Maintainer) - und er gelangt nicht in die Ausgabe.
  assert.equal(SGARBOSSA_NEGATIVE_HINT, 'Negative Sgarbossa-Kriterien schließen einen akuten Koronarverschluss nicht aus.')
  for (const r of [sgarbossa(SGB_NEG), nichts, sgarbossa({ ...SGB_NEG, discordantElevation: 'na' })]) {
    assert.ok(!r.body.includes('Koronarverschluss') && !r.text.includes('Koronarverschluss'))
  }
})

test('sgarbossa: Zeilenende frei wählbar, Standard Punkt, leer heißt nichts', () => {
  assert.equal(sgarbossa(SGB_NEG).body, 'negativ.')
  assert.equal(sgarbossa(SGB_NEG, ';').body, 'negativ;')
  assert.equal(sgarbossa(SGB_NEG, '').text, 'Sgarbossa (mod. nach Smith) negativ')
  assert.equal(sgarbossa({ ...SGB_NEG, discordantElevation: 'na' }, '').body, 'negativ (nicht beurteilbar: diskordante ST-Hebung (ST/S ab 0,25))')
})

test('sgarbossa: unvollständige/ungültige Eingabe wirft', () => {
  assert.throws(() => sgarbossa({ ...SGB_NEG, discordantElevation: undefined }))
  assert.throws(() => sgarbossa({ ...SGB_NEG, concordantElevation: 'ja' }))
})

const EGSYS_NO = { palpitations: 'no', heartDisease: 'no', effort: 'no', supine: 'no', triggers: 'no', prodromes: 'no' }

test('egsys: Punktwerte je Punkt nach der Quelle (+4, +3, +3, +2, -1, -1)', () => {
  assert.equal(egsys(EGSYS_NO).score, 0)
  assert.equal(egsys({ ...EGSYS_NO, palpitations: 'yes' }).score, 4)
  assert.equal(egsys({ ...EGSYS_NO, heartDisease: 'yes' }).score, 3)
  assert.equal(egsys({ ...EGSYS_NO, effort: 'yes' }).score, 3)
  assert.equal(egsys({ ...EGSYS_NO, supine: 'yes' }).score, 2)
  assert.equal(egsys({ ...EGSYS_NO, triggers: 'yes' }).score, -1)
  assert.equal(egsys({ ...EGSYS_NO, prodromes: 'yes' }).score, -1)
  // Grenzen des Wertebereichs
  assert.equal(egsys({ ...EGSYS_NO, triggers: 'yes', prodromes: 'yes' }).score, -2)
  assert.equal(egsys({ palpitations: 'yes', heartDisease: 'yes', effort: 'yes', supine: 'yes', triggers: 'no', prodromes: 'no' }).score, 12)
  assert.equal(egsys({ palpitations: 'yes', heartDisease: 'yes', effort: 'yes', supine: 'yes', triggers: 'yes', prodromes: 'yes' }).score, 10)
})

test('egsys: ab 3 Punkten „kardiale Synkope wahrscheinlich“, darunter nicht; Befunde stehen im Text', () => {
  assert.equal(EGSYS_THRESHOLD, 3)
  const hoch = egsys({ ...EGSYS_NO, palpitations: 'yes', heartDisease: 'yes' })
  assert.equal(hoch.cardiacSuspected, true)
  assert.equal(hoch.body, '7 Punkte (Palpitationen vor Synkope, Herzerkrankung/EKG auffällig) - kardiale Synkope wahrscheinlich.')
  assert.equal(hoch.text, 'EGSYS 7 Punkte (Palpitationen vor Synkope, Herzerkrankung/EKG auffällig) - kardiale Synkope wahrscheinlich.')
  // genau an der Schwelle
  assert.equal(egsys({ ...EGSYS_NO, effort: 'yes' }).body, '3 Punkte (Synkope bei Belastung) - kardiale Synkope wahrscheinlich.')
  // 4 - 1 = 3: die Abzüge zählen mit
  assert.equal(egsys({ ...EGSYS_NO, palpitations: 'yes', triggers: 'yes' }).cardiacSuspected, true)
  // 3 - 1 = 2: knapp darunter
  const knapp = egsys({ ...EGSYS_NO, heartDisease: 'yes', prodromes: 'yes' })
  assert.equal(knapp.cardiacSuspected, false)
  assert.equal(knapp.body, '2 Punkte (Herzerkrankung/EKG auffällig, vegetative Prodromi).')
  assert.equal(egsys({ ...EGSYS_NO, supine: 'yes', prodromes: 'yes' }).body, '1 Punkt (Synkope im Liegen, vegetative Prodromi).')
  assert.equal(egsys(EGSYS_NO).body, '0 Punkte.')
  assert.equal(egsys({ ...EGSYS_NO, triggers: 'yes' }).body, '-1 Punkt (Auslöser vorhanden).')
  assert.equal(egsys({ ...EGSYS_NO, triggers: 'yes', prodromes: 'yes' }).body, '-2 Punkte (Auslöser vorhanden, vegetative Prodromi).')
})

test('egsys: eigener Text ab 3 Punkten, Standard wenn leer', () => {
  const hoch = { ...EGSYS_NO, palpitations: 'yes' }
  assert.equal(EGSYS_DEFAULT_TEXT, '- kardiale Synkope wahrscheinlich')
  assert.equal(egsys(hoch, '- Kardiologie verständigen').body, '4 Punkte (Palpitationen vor Synkope) - Kardiologie verständigen.')
  assert.equal(egsys(hoch, 'V. a. kardiale Synkope').body, '4 Punkte (Palpitationen vor Synkope) V. a. kardiale Synkope.')
  for (const leer of [undefined, '', '   ']) assert.equal(egsys(hoch, leer).body, '4 Punkte (Palpitationen vor Synkope) - kardiale Synkope wahrscheinlich.')
  // Unter der Schwelle steht der Text nie.
  assert.equal(egsys({ ...EGSYS_NO, supine: 'yes' }, '- Kardiologie verständigen').body, '2 Punkte (Synkope im Liegen).')
})

test('egsys: Zeilenende frei wählbar, Standard Punkt, leer heißt nichts, keine Automatik', () => {
  const hoch = { ...EGSYS_NO, palpitations: 'yes' }
  const tief = { ...EGSYS_NO, supine: 'yes' }
  assert.equal(egsys(hoch).body, '4 Punkte (Palpitationen vor Synkope) - kardiale Synkope wahrscheinlich.')
  assert.equal(egsys(hoch, undefined, ';').body, '4 Punkte (Palpitationen vor Synkope) - kardiale Synkope wahrscheinlich;')
  assert.equal(egsys(hoch, undefined, '').body, '4 Punkte (Palpitationen vor Synkope) - kardiale Synkope wahrscheinlich')
  assert.equal(egsys(hoch, '- abklären!', '').body, '4 Punkte (Palpitationen vor Synkope) - abklären!')
  // Genau das, was die Vorlage vorgibt: kein Weglassen bei eigenem Satzzeichen.
  assert.equal(egsys(hoch, '- abklären!').body, '4 Punkte (Palpitationen vor Synkope) - abklären!.')
  // Gilt für die ganze Zeile, auch unter 3 Punkten.
  assert.equal(egsys(tief, undefined, ' -').body, '2 Punkte (Synkope im Liegen) -')
  assert.equal(egsys(tief, undefined, '').body, '2 Punkte (Synkope im Liegen)')
  assert.equal(egsys(EGSYS_NO, undefined, '').text, 'EGSYS 0 Punkte')
})

test('egsys: der Hinweis steht nie im Text; unvollständige Eingabe wirft', () => {
  assert.equal(EGSYS_LOW_HINT, 'Ein EGSYS unter 3 Punkten schließt eine kardiale Synkope nicht aus.')
  for (const r of [egsys(EGSYS_NO), egsys({ ...EGSYS_NO, supine: 'yes' })]) assert.ok(!r.body.includes('schließt') && !r.text.includes('schließt'))
  assert.throws(() => egsys({ ...EGSYS_NO, supine: undefined }))
  assert.throws(() => egsys({ ...EGSYS_NO, effort: true }))
  assert.throws(() => egsys({ ...EGSYS_NO, effort: 'ja' }))
})

test('fast4d/lams: Ausgabe nur mit Zeichen, die die Brücke auf dem NIDA-Layout tippen kann', () => {
  const texte = [
    lams({ face: 1, arm: 2, grip: 2 }).body,
    fast4d({ face: 'pos', faceSide: 'li', arm: 'pos', armSide: 're', speech: 'pos', diplopia: 'pos', field: 'pos', vertigo: 'pos', ataxia: 'pos', timeMode: 'onset', time: '09:15' }).body,
    fast4d({ face: 'na', arm: 'na', speech: 'na', diplopia: 'na', field: 'na', vertigo: 'na', ataxia: 'na', timeMode: 'unknown' }).body,
    sgarbossa(SGB_NEG).body,
    sgarbossa({ concordantElevation: 'pos', concordantDepression: 'pos', discordantElevation: 'pos' }).body,
    sgarbossa({ concordantElevation: 'neg', concordantDepression: 'na', discordantElevation: 'na' }).body,
    sgarbossa({ concordantElevation: 'na', concordantDepression: 'na', discordantElevation: 'na' }).body,
    egsys(EGSYS_NO).body,
    egsys({ palpitations: 'yes', heartDisease: 'yes', effort: 'yes', supine: 'yes', triggers: 'yes', prodromes: 'yes' }).body,
    egsys({ ...EGSYS_NO, triggers: 'yes', prodromes: 'yes' }).body,
    zops(ZOPS_OK).body,
    zops({ time: 'no', place: 'no', person: 'ok', situation: 'na' }).body,
    zops({ time: 'ok', place: 'ok', person: 'na', situation: 'na' }).body,
    zops({ time: 'na', place: 'na', person: 'na', situation: 'na' }).body,
  ]
  for (const t of texte) assert.match(t, /^[A-Za-z0-9ÄÖÜäöüß .,:;()\/-]+$/)
})

test('news2: unauffälliger Patient = 0 (Risiko niedrig)', () => {
  const r = news2({ rr: 16, spo2: 98, scale2: false, onOxygen: false, systolic: 120, pulse: 70, temp: 36.8, consciousness: 'A' })
  assert.equal(r.score, 0)
  assert.equal(r.risk, 'niedrig')
})

test('news2: RCP-Tabellen-Stichproben je Parameter', () => {
  const base = { rr: 16, spo2: 98, scale2: false, onOxygen: false, systolic: 120, pulse: 70, temp: 36.8, consciousness: 'A' }
  // Atemfrequenz: 8->3, 11->1, 20->0, 24->2, 25->3
  assert.equal(news2({ ...base, rr: 8 }).items.atemfrequenz, 3)
  assert.equal(news2({ ...base, rr: 11 }).items.atemfrequenz, 1)
  assert.equal(news2({ ...base, rr: 24 }).items.atemfrequenz, 2)
  assert.equal(news2({ ...base, rr: 25 }).items.atemfrequenz, 3)
  // SpO2 Skala 1: 91->3, 93->2, 95->1, 96->0
  assert.equal(news2({ ...base, spo2: 91 }).items.spo2, 3)
  assert.equal(news2({ ...base, spo2: 93 }).items.spo2, 2)
  assert.equal(news2({ ...base, spo2: 95 }).items.spo2, 1)
  assert.equal(news2({ ...base, spo2: 96 }).items.spo2, 0)
  // RR systolisch: 90->3, 100->2, 110->1, 219->0, 220->3
  assert.equal(news2({ ...base, systolic: 90 }).items.rrSystolisch, 3)
  assert.equal(news2({ ...base, systolic: 100 }).items.rrSystolisch, 2)
  assert.equal(news2({ ...base, systolic: 219 }).items.rrSystolisch, 0)
  assert.equal(news2({ ...base, systolic: 220 }).items.rrSystolisch, 3)
  // Herzfrequenz: 40->3, 50->1, 90->0, 110->1, 130->2, 131->3
  assert.equal(news2({ ...base, pulse: 40 }).items.herzfrequenz, 3)
  assert.equal(news2({ ...base, pulse: 50 }).items.herzfrequenz, 1)
  assert.equal(news2({ ...base, pulse: 110 }).items.herzfrequenz, 1)
  assert.equal(news2({ ...base, pulse: 131 }).items.herzfrequenz, 3)
  // Temperatur: 35.0->3, 36.0->1, 38.0->0, 39.0->1, 39.1->2
  assert.equal(news2({ ...base, temp: 35.0 }).items.temperatur, 3)
  assert.equal(news2({ ...base, temp: 36.0 }).items.temperatur, 1)
  assert.equal(news2({ ...base, temp: 39.0 }).items.temperatur, 1)
  assert.equal(news2({ ...base, temp: 39.1 }).items.temperatur, 2)
  // Bewusstsein: jedes Nicht-A = 3; O2-Gabe = 2
  assert.equal(news2({ ...base, consciousness: 'V' }).items.bewusstsein, 3)
  assert.equal(news2({ ...base, onOxygen: true }).items.sauerstoffgabe, 2)
})

test('news2: SpO2-Skala 2 (Hyperkapnie) inkl. O2-Sonderfälle', () => {
  const base = { rr: 16, scale2: true, systolic: 120, pulse: 70, temp: 36.8, consciousness: 'A' }
  assert.equal(news2({ ...base, spo2: 83, onOxygen: false }).items.spo2, 3)
  assert.equal(news2({ ...base, spo2: 85, onOxygen: false }).items.spo2, 2)
  assert.equal(news2({ ...base, spo2: 87, onOxygen: false }).items.spo2, 1)
  assert.equal(news2({ ...base, spo2: 90, onOxygen: false }).items.spo2, 0) // Zielbereich 88-92
  assert.equal(news2({ ...base, spo2: 94, onOxygen: true }).items.spo2, 1)
  assert.equal(news2({ ...base, spo2: 96, onOxygen: true }).items.spo2, 2)
  assert.equal(news2({ ...base, spo2: 97, onOxygen: true }).items.spo2, 3)
  assert.equal(news2({ ...base, spo2: 97, onOxygen: false }).items.spo2, 0) // Raumluft >= 93 -> 0
})

test('news2: Risiko-Einstufung rein nach Aggregat-Score (0-4 niedrig, 5-6 mittel, >=7 hoch)', () => {
  const base = { rr: 16, spo2: 98, scale2: false, onOxygen: false, systolic: 120, pulse: 70, temp: 36.8, consciousness: 'A' }
  assert.equal(news2({ ...base, pulse: 100 }).risk, 'niedrig') // 1 Punkt
  // Ein Einzelparameter mit 3 Punkten eskaliert die Einstufung bewusst NICHT mehr:
  // Aggregat 3 -> 'niedrig'; anySingle3 bleibt aber informativ true.
  assert.equal(news2({ ...base, systolic: 90 }).risk, 'niedrig')
  assert.equal(news2({ ...base, systolic: 90 }).anySingle3, true)
  assert.equal(news2({ ...base, rr: 22, spo2: 93 }).risk, 'niedrig') // 2+2 = 4 (Grenze niedrig)
  assert.equal(news2({ ...base, rr: 22, spo2: 93, pulse: 100 }).risk, 'mittel') // 2+2+1 = 5 (Grenze mittel)
  const hoch = news2({ ...base, rr: 25, systolic: 88, consciousness: 'U' }) // 3+3+3
  assert.equal(hoch.score, 9)
  assert.equal(hoch.risk, 'hoch')
  assert.ok(hoch.text.includes('NEWS2 9'))
})

test('ekgAxisTable: Lagetyp aus I/II/III + R-Vergleich (Tabelle fachlich zu bestätigen)', () => {
  assert.equal(ekgAxisTable({ leadI: 'pos', leadII: 'neg', leadIII: 'neg' }).typ, 'überdrehter Linkstyp')
  assert.equal(ekgAxisTable({ leadI: 'pos', leadII: 'pos', leadIII: 'neg' }).typ, 'Linkstyp')
  assert.equal(ekgAxisTable({ leadI: 'pos', leadII: 'pos', leadIII: 'pos', rLarger: 'I' }).typ, 'Indifferenztyp')
  assert.equal(ekgAxisTable({ leadI: 'pos', leadII: 'pos', leadIII: 'pos', rLarger: 'III' }).typ, 'Steiltyp')
  assert.equal(ekgAxisTable({ leadI: 'pos', leadII: 'pos', leadIII: 'pos', rLarger: 'unclear' }).typ, null)
  assert.equal(ekgAxisTable({ leadI: 'pos', leadII: 'pos', leadIII: 'pos' }).typ, null) // R-Vergleich fehlt
  assert.equal(ekgAxisTable({ leadI: 'neg', leadII: 'pos', leadIII: 'pos' }).typ, 'Rechtstyp')
  assert.equal(ekgAxisTable({ leadI: 'neg', leadII: 'neg', leadIII: 'pos' }).typ, 'überdrehter Rechtstyp')
  assert.equal(ekgAxisTable({ leadI: 'neg', leadII: 'neg', leadIII: 'neg' }).typ, 'Sagittaltyp (S-I-S-II-S-III)')
  // nicht moegliche Konstellation -> Hinweis
  assert.equal(ekgAxisTable({ leadI: 'pos', leadII: 'neg', leadIII: 'pos' }).typ, null)
  assert.match(ekgAxisTable({ leadI: 'pos', leadII: 'neg', leadIII: 'pos' }).text, /kontrollieren/)
  assert.throws(() => ekgAxisTable({ leadI: 'x', leadII: 'pos', leadIII: 'pos' }))
})

test('signatureBlock: Rollen-Zeile + Abstand + Unterschriftslinie', () => {
  const out = signatureBlock({ roles: ['Patient', 'Angehöriger/Zeuge'], lineLength: 30, gap: 2 })
  const parts = out.split('\n\n\n')
  assert.equal(parts.length, 2)
  assert.ok(parts[0].startsWith('Patient:'))
  assert.ok(parts[1].startsWith('Angehöriger/Zeuge:'))
  assert.ok(out.includes('_'.repeat(30)))
  assert.ok(!out.includes('_'.repeat(31)))
  // Default: nur Patient
  assert.ok(signatureBlock().startsWith('Patient:'))
  // Grenzen: lineLength wird geklemmt
  assert.ok(signatureBlock({ roles: ['X'], lineLength: 999 }).includes('_'.repeat(80)))
})
