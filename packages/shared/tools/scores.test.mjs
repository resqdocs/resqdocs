// Läuft mit:  node --test
// Erwartungswerte aus den publizierten Tabellen (RCP NEWS2 2017; LAMS nach
// Llanes 2004; BMI WHO). Vom Maintainer fachlich gegenzuprüfen (#55).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { packYears, bmi, lams, news2, ekgAxisTable, signatureBlock } from './scores.mjs'

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

test('news2: Risiko-Einstufung (0-4 niedrig, Einzel-3, 5-6 mittel, >=7 hoch)', () => {
  const base = { rr: 16, spo2: 98, scale2: false, onOxygen: false, systolic: 120, pulse: 70, temp: 36.8, consciousness: 'A' }
  assert.equal(news2({ ...base, pulse: 100 }).risk, 'niedrig') // 1 Punkt
  assert.match(news2({ ...base, systolic: 90 }).risk, /Einzelwert 3/) // 3 Punkte, ein Parameter
  assert.equal(news2({ ...base, rr: 22, spo2: 93, pulse: 100 }).risk, 'mittel') // 2+2+1 = 5
  const hoch = news2({ ...base, rr: 25, systolic: 88, consciousness: 'U' }) // 3+3+3
  assert.equal(hoch.score, 9)
  assert.equal(hoch.risk, 'hoch')
  assert.ok(hoch.text.includes('NEWS2 9'))
})

test('ekgAxisTable: Lagetyp aus I/II/III + R-Vergleich (#85, Tabelle vom Maintainer zu bestätigen)', () => {
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

test('signatureBlock (#97): Rollen-Zeile + Abstand + Unterschriftslinie', () => {
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
