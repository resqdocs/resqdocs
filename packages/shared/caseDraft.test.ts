// Laeuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampTtlHours, touchDraft, isDraftExpired, parseDraft, nextDraftDebounceWait } from './caseDraft.ts'
import { createReworkCaseDraftRepository, REWORK_CASE_DRAFT_KEY } from './caseDraftRepository.ts'
import type { KeyValueAdapter } from './adapters.ts'

const T0 = 1_000_000
const HOUR = 60 * 60 * 1000

function fakeAdapter(): KeyValueAdapter & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    async get(k) {
      return store.get(k) ?? null
    },
    async set(k, v) {
      store.set(k, v)
    },
    async remove(k) {
      store.delete(k)
    },
  }
}

test('nextDraftDebounceWait: 600ms nach Ruhe, aber ~2s-Deckel bei durchgehender Eingabe', () => {
  // Erste Aenderung des Bursts (pendingSince == now): voller Debounce.
  assert.equal(nextDraftDebounceWait(1000, 1000), 600)
  // Aenderung 500ms spaeter, Deckel noch weit weg -> weiter voller Debounce.
  assert.equal(nextDraftDebounceWait(1000, 1500), 600)
  // Nahe am Deckel (1900ms seit Burst-Start): nur noch bis zum Deckel warten.
  assert.equal(nextDraftDebounceWait(0, 1900), 100)
  // Deckel erreicht -> sofort (0) schreiben, statt den Timer weiter aufzuschieben.
  assert.equal(nextDraftDebounceWait(0, 2000), 0)
  assert.equal(nextDraftDebounceWait(0, 5000), 0) // ueberschritten -> nie negativ
  // Konfigurierbar: eigener Debounce/Deckel.
  assert.equal(nextDraftDebounceWait(0, 250, 300, 1000), 300)
  assert.equal(nextDraftDebounceWait(0, 900, 300, 1000), 100)
})

test('clampTtlHours: Bereich 1-5, Default 3', () => {
  assert.equal(clampTtlHours(3), 3)
  assert.equal(clampTtlHours(0), 1)
  assert.equal(clampTtlHours(9), 5)
  assert.equal(clampTtlHours('x'), 3)
})

test('touchDraft: expiresAt = now + ttl; createdAt vom Vorgaenger erhalten (sliding-idle)', () => {
  const d1 = touchDraft(null, { a: { state: 'custom', value: 'x' } }, 'p1', 3, T0)
  assert.equal(d1.expiresAt, T0 + 3 * HOUR)
  assert.equal(d1.createdAt, T0)
  const d2 = touchDraft(d1, { a: { state: 'custom', value: 'y' } }, 'p1', 3, T0 + HOUR)
  assert.equal(d2.createdAt, T0) // bleibt
  assert.equal(d2.expiresAt, T0 + HOUR + 3 * HOUR) // verlaengert
})

test('isDraftExpired: now >= expiresAt', () => {
  const d = touchDraft(null, { a: { state: 'confirmed' } }, 'p', 1, T0)
  assert.equal(isDraftExpired(d, T0 + HOUR - 1), false)
  assert.equal(isDraftExpired(d, T0 + HOUR), true)
})

test('parseDraft: roundtrip gueltig; nur bekannte Zustaende; ungueltig -> null', () => {
  const d = touchDraft(null, { a: { state: 'custom', value: 'x' } }, 'p', 3, T0)
  assert.deepEqual(parseDraft(JSON.parse(JSON.stringify(d))), d)
  const raw = { protocolId: 'p', createdAt: T0, lastTouchedAt: T0, expiresAt: T0 + HOUR, ttlHours: 3, values: { a: { state: 'confirmed' }, b: { state: 'custom', value: 'v' }, x: { state: 'boese' }, y: { state: 'custom' } } }
  assert.deepEqual(Object.keys(parseDraft(raw)!.values).sort(), ['a', 'b'])
  assert.equal(parseDraft({ foo: 1 }), null)
  assert.equal(parseDraft(null), null)
})

test('sanitizeValues (via parseDraft): function-Variante - Allowlist {name,staerke,dosierung,kommentar,pzn}; leere Zeilen raus, namenlose MIT Daten bleiben', () => {
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      mp: {
        state: 'function',
        rows: [
          { name: 'ASS', staerke: '100 mg', dosierung: '1-0-0', pzn: '123', aussteller: 'Dr. X' },
          { name: '', dosierung: 'x' }, // namenlos, aber Daten -> bleibt (Nutzerarbeit)
          { name: '   ', kommentar: ' ' }, // komplett leer (nur Whitespace) -> raus
          { foo: 'bar' }, // kein name-String -> raus
        ],
      },
    },
  }
  const d = parseDraft(raw)!
  // 'aussteller' verworfen; staerke ueberlebt den Roundtrip; nur wirklich leere Zeilen entfallen
  assert.deepEqual(d.values.mp, {
    state: 'function',
    rows: [
      { name: 'ASS', staerke: '100 mg', dosierung: '1-0-0', pzn: '123' },
      { name: '', dosierung: 'x' },
    ],
  })
})

test('sanitizeValues (via parseDraft): function-Variante Aerzte - {name,rolle,ort,telefon,arztnummer}, invalide Rolle raus', () => {
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      ae: {
        state: 'function',
        rows: [
          { name: 'Dr. A', rolle: 'Hausarzt', ort: 'Kiel', telefon: '0431', arztnummer: '123', extra: 'x' },
          { name: 'Dr. B', rolle: 'Quatsch' },
          { name: '' },
        ],
      },
    },
  }
  const d = parseDraft(raw)!
  // Arzt-Felder behalten, 'extra' + invalide Rolle verworfen, namelose Zeile raus
  assert.deepEqual(d.values.ae, {
    state: 'function',
    rows: [{ name: 'Dr. A', rolle: 'Hausarzt', ort: 'Kiel', telefon: '0431', arztnummer: '123' }, { name: 'Dr. B' }],
  })
})

test('Repository: save -> load gueltig', async () => {
  const a = fakeAdapter()
  const repo = createReworkCaseDraftRepository(a, () => T0 + HOUR)
  await repo.save(touchDraft(null, { x: { state: 'custom', value: 'v' } }, 'p1', 3, T0))
  const { draft, expired } = await repo.load()
  assert.equal(expired, false)
  assert.equal(draft?.protocolId, 'p1')
  assert.deepEqual(draft?.values, { x: { state: 'custom', value: 'v' } })
})

test('Repository: abgelaufen -> geloescht, keine Daten zurueck', async () => {
  const a = fakeAdapter()
  const repo = createReworkCaseDraftRepository(a, () => T0 + 10 * HOUR)
  await repo.save(touchDraft(null, { x: { state: 'confirmed' } }, 'p', 1, T0))
  const { draft, expired } = await repo.load()
  assert.equal(draft, null)
  assert.equal(expired, true)
  assert.equal(a.store.has(REWORK_CASE_DRAFT_KEY), false)
})

test('Repository: unlesbar -> aufgeraeumt; remove loescht', async () => {
  const a = fakeAdapter()
  a.store.set(REWORK_CASE_DRAFT_KEY, '{kaputt')
  const repo = createReworkCaseDraftRepository(a, () => T0)
  assert.equal((await repo.load()).draft, null)
  assert.equal(a.store.has(REWORK_CASE_DRAFT_KEY), false)
  await repo.save(touchDraft(null, { x: { state: 'confirmed' } }, 'p', 3, T0))
  await repo.remove()
  assert.equal(a.store.has(REWORK_CASE_DRAFT_KEY), false)
})

test('sanitizeValues (via parseDraft): Score-Zeile - Pack-Years {cigarettesPerDay, years} überlebt, Fremdfeld raus', () => {
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      py: { state: 'function', rows: [{ cigarettesPerDay: 30, years: 15, geheim: 'x' }] },
      leer: { state: 'function', rows: [{ cigarettesPerDay: NaN }, {}] },
    },
  }
  const d = parseDraft(raw)!
  assert.deepEqual(d.values.py, { state: 'function', rows: [{ cigarettesPerDay: 30, years: 15 }] })
  // NaN + leeres Objekt = keine Nutzerarbeit -> beide Zeilen raus
  assert.deepEqual(d.values.leer, { state: 'function', rows: [] })
})

test('sanitizeValues (via parseDraft): LAMS-Zeile überlebt (auch 0 Punkte); Werte außerhalb des Bereichs raus', () => {
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      voll: { state: 'function', rows: [{ lamsFace: 1, lamsArm: 2, lamsGrip: 0, geheim: 'x' }] },
      null0: { state: 'function', rows: [{ lamsFace: 0, lamsArm: 0, lamsGrip: 0 }] },
      falsch: { state: 'function', rows: [{ lamsFace: 2, lamsArm: 3, lamsGrip: '1' }] },
    },
  }
  const d = parseDraft(raw)!
  assert.deepEqual(d.values.voll, { state: 'function', rows: [{ lamsFace: 1, lamsArm: 2, lamsGrip: 0 }] })
  // 0 Punkte je Befund = erhobener Normalbefund, darf NICHT als leere Zeile entfallen
  assert.deepEqual(d.values.null0, { state: 'function', rows: [{ lamsFace: 0, lamsArm: 0, lamsGrip: 0 }] })
  // Gesicht 2, Arm 3, Haendedruck als String -> kein gueltiger Wert -> Zeile leer -> raus
  assert.deepEqual(d.values.falsch, { state: 'function', rows: [] })
})

test('sanitizeValues (via parseDraft): FAST4D-Zeile überlebt mit Seite und Zeit; Fremdwerte und Freitext-Zeit raus', () => {
  const voll = {
    fastFace: 'pos', fastArm: 'pos', fastSpeech: 'neg', fastDiplopia: 'pos', fastField: 'neg', fastVertigo: 'neg', fastAtaxia: 'na',
    fastFaceSide: 're', fastArmSide: 'li', fastTimeMode: 'onset', fastTime: '14:30',
  }
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      voll: { state: 'function', rows: [{ ...voll, geheim: 'x' }] },
      falsch: { state: 'function', rows: [{ fastFace: 'ja', fastFaceSide: 'rechts', fastTimeMode: 'gestern', fastTime: 'gegen halb drei' }] },
      zeit: { state: 'function', rows: [{ fastSpeech: 'neg', fastTime: '24:00' }] },
    },
  }
  const d = parseDraft(raw)!
  assert.deepEqual(d.values.voll, { state: 'function', rows: [voll] })
  // kein einziger gueltiger Wert -> Zeile leer -> raus (insbesondere kein Freitext ueber fastTime)
  assert.deepEqual(d.values.falsch, { state: 'function', rows: [] })
  // ungueltige Uhrzeit entfaellt, der gueltige Befund bleibt
  assert.deepEqual(d.values.zeit, { state: 'function', rows: [{ fastSpeech: 'neg' }] })
})

test('sanitizeValues (via parseDraft): ZOPS-Zeile überlebt; fremde Werte und Freitext raus', () => {
  const voll = { zopsTime: 'no', zopsPlace: 'ok', zopsPerson: 'ok', zopsSituation: 'na' }
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      voll: { state: 'function', rows: [{ ...voll, zopsNotiz: 'weiß das Jahr nicht' }] },
      falsch: { state: 'function', rows: [{ zopsTime: 'neg', zopsPlace: 'orientiert', zopsPerson: 1, zopsSituation: true }] },
      teil: { state: 'function', rows: [{ zopsTime: 'ok', zopsPlace: 'vielleicht' }] },
    },
  }
  const d = parseDraft(raw)!
  assert.deepEqual(d.values.voll, { state: 'function', rows: [voll] })
  // kein einziger gültiger Wert -> Zeile leer -> raus
  assert.deepEqual(d.values.falsch, { state: 'function', rows: [] })
  // der ungültige Wert entfällt, der gültige bleibt
  assert.deepEqual(d.values.teil, { state: 'function', rows: [{ zopsTime: 'ok' }] })
})

test('sanitizeValues (via parseDraft): Sgarbossa-Zeile überlebt; fremde Werte raus', () => {
  const voll = { sgbConcordantElevation: 'pos', sgbConcordantDepression: 'neg', sgbDiscordantElevation: 'na' }
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      voll: { state: 'function', rows: [{ ...voll, sgbNotiz: 'V2 unsicher' }] },
      falsch: { state: 'function', rows: [{ sgbConcordantElevation: 'ja', sgbConcordantDepression: 3, sgbDiscordantElevation: 'ok' }] },
    },
  }
  const d = parseDraft(raw)!
  assert.deepEqual(d.values.voll, { state: 'function', rows: [voll] })
  assert.deepEqual(d.values.falsch, { state: 'function', rows: [] })
})

test('sanitizeValues (via parseDraft): EGSYS-Zeile überlebt, auch mit lauter „Nein"; fremde Werte raus', () => {
  const no = { egsysPalpitations: 'no', egsysHeartDisease: 'no', egsysEffort: 'no', egsysSupine: 'no', egsysTriggers: 'no', egsysProdromes: 'no' }
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      // Lauter „Nein" ist erhobene Arbeit und darf nicht als leere Zeile verschwinden.
      nein: { state: 'function', rows: [no] },
      voll: { state: 'function', rows: [{ ...no, egsysPalpitations: 'yes', egsysNotiz: 'seit Wochen' }] },
      falsch: { state: 'function', rows: [{ egsysPalpitations: true, egsysHeartDisease: 'ja', egsysEffort: 1 }] },
    },
  }
  const d = parseDraft(raw)!
  assert.deepEqual(d.values.nein, { state: 'function', rows: [no] })
  assert.deepEqual(d.values.voll, { state: 'function', rows: [{ ...no, egsysPalpitations: 'yes' }] })
  assert.deepEqual(d.values.falsch, { state: 'function', rows: [] })
})

test('sanitizeValues (via parseDraft): BMI-Zeile überlebt als Zahlen; Text und Fremdfelder raus', () => {
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      voll: { state: 'function', rows: [{ bmiWeight: 80, bmiHeight: 180, bmiNotiz: 'geschätzt' }] },
      text: { state: 'function', rows: [{ bmiWeight: '80', bmiHeight: 'groß' }] },
    },
  }
  const d = parseDraft(raw)!
  assert.deepEqual(d.values.voll, { state: 'function', rows: [{ bmiWeight: 80, bmiHeight: 180 }] })
  assert.deepEqual(d.values.text, { state: 'function', rows: [] })
})

test('sanitizeValues (via parseDraft): Funktions-Status custom+Freitext und excluded ueberleben den Roundtrip', () => {
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      frei: { state: 'function', rows: [{ name: 'ASS' }], status: 'custom', text: 'siehe Akte' },
      raus: { state: 'function', rows: [{ name: 'ASS' }], status: 'excluded' },
      leer: { state: 'function', rows: [{ name: 'ASS' }] },
      freiOhneText: { state: 'function', rows: [], status: 'custom' },
    },
  }
  const d = parseDraft(raw)!
  // custom: Status + Freitext bleiben, Zeilen erhalten (Allowlist)
  assert.deepEqual(d.values.frei, { state: 'function', rows: [{ name: 'ASS' }], status: 'custom', text: 'siehe Akte' })
  // excluded: Status bleibt (kein text-Feld)
  assert.deepEqual(d.values.raus, { state: 'function', rows: [{ name: 'ASS' }], status: 'excluded' })
  // kein Status = confirmed (rueckwaerts-kompatibel, kein status/text im Output)
  assert.deepEqual(d.values.leer, { state: 'function', rows: [{ name: 'ASS' }] })
  // custom ohne text -> auf '' normalisiert (typeof-Guard)
  assert.deepEqual(d.values.freiOhneText, { state: 'function', rows: [], status: 'custom', text: '' })
})

test('parseDraft: ruhend gemerkter Freitext (prevValue/prevText) ueberlebt den Entwurf (BEWAHREN)', () => {
  const raw = {
    version: 1,
    protocolId: null,
    createdAt: 0,
    lastTouchedAt: 0,
    expiresAt: 10_000,
    ttlHours: 3,
    values: {
      exMerkt: { state: 'excluded', prevValue: 'Anamnese-Text' },
      okMerkt: { state: 'confirmed', prevValue: 'Verlauf' },
      leerMerkt: { state: 'confirmed', prevValue: '' }, // leer -> nicht uebernehmen
      fnMerkt: { state: 'function', rows: [{ name: 'ASS' }], status: 'excluded', prevText: 'frei gemerkt' },
    },
  }
  const d = parseDraft(raw)!
  assert.deepEqual(d.values.exMerkt, { state: 'excluded', prevValue: 'Anamnese-Text' })
  assert.deepEqual(d.values.okMerkt, { state: 'confirmed', prevValue: 'Verlauf' })
  assert.deepEqual(d.values.leerMerkt, { state: 'confirmed' }) // leerer Puffer wird verworfen
  assert.deepEqual(d.values.fnMerkt, { state: 'function', rows: [{ name: 'ASS' }], status: 'excluded', prevText: 'frei gemerkt' })
})

test('sanitize: custom.values (Multi-Select) bleibt beim Speichern erhalten', () => {
  const d = touchDraft(null, { m: { state: 'custom', value: 'Giemen und Brummen', values: ['Giemen', 'Brummen'] } }, 'p', 3, T0)
  assert.deepEqual(d.values.m, { state: 'custom', value: 'Giemen und Brummen', values: ['Giemen', 'Brummen'] })
})

test('sanitize: prevValues (Multi „−" gemerkte Auswahl) bleibt erhalten', () => {
  const d = touchDraft(null, { m: { state: 'excluded', prevValues: ['Giemen', 'Brummen'] } }, 'p', 3, T0)
  assert.deepEqual(d.values.m, { state: 'excluded', prevValues: ['Giemen', 'Brummen'] })
})
