// Tests fuer den Versionsverlauf: Zerlegen der Release-Notes und die Dateien selbst (release-notes/de).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { parseReleaseNote, buildHistory, baseVersion, splitLead } from './releaseNotes.ts'

const DIR = new URL('../../../../release-notes/de/', import.meta.url)
const files = readdirSync(DIR).filter((f) => f.endsWith('.md'))
const read = (f: string): string => readFileSync(new URL(f, DIR), 'utf8')

test('zerlegt Version, Zusammenfassung und die drei Abschnitte', () => {
  const n = parseReleaseNote(`# ResQDocs 1.2.3

Ein Satz zur Version.

## Added
- **Neu:** erster Punkt
- zweiter Punkt

## Changed
- geändert

## Fixed
- behoben
`)
  assert.ok(n)
  assert.equal(n.version, '1.2.3')
  assert.equal(n.summary, 'Ein Satz zur Version.')
  assert.deepEqual(n.sections.map((s) => [s.kind, s.label, s.items.length]), [['neu', 'Neu', 2], ['verbessert', 'Verbessert', 1], ['behoben', 'Behoben', 1]])
  assert.equal(n.sections[0].items[0], 'Neu: erster Punkt', 'Fett-Markierung wird zu schlichtem Text')
})

test('unbekannte Abschnitte und leere Listen fallen weg, ohne Version gibt es nichts', () => {
  const n = parseReleaseNote('# ResQDocs 2.0.0\n\n## Intern\n- nicht zeigen\n\n## Added\n\n## Fixed\n- ein Punkt\n')
  assert.deepEqual(n?.sections.map((s) => s.kind), ['behoben'])
  assert.equal(parseReleaseNote('# Notizen ohne Nummer\n- x'), null)
})

test('Reihenfolge: neueste Version zuerst, 1.10.0 vor 1.9.0 (nicht alphabetisch)', () => {
  const h = buildHistory(['# ResQDocs 1.9.0\n## Added\n- a', '# ResQDocs 1.10.0\n## Added\n- b', '# ResQDocs 1.2.1\n## Fixed\n- c'])
  assert.deepEqual(h.map((n) => n.version), ['1.10.0', '1.9.0', '1.2.1'])
})

test('Anzeige „1.10.0 (22)" → 1.10.0', () => {
  assert.equal(baseVersion('1.10.0 (22)'), '1.10.0')
  assert.equal(baseVersion('1.10.0'), '1.10.0')
  assert.equal(baseVersion(''), '')
})

test('jede Datei unter release-notes/de ist gueltig: Dateiname = Version, mindestens ein Punkt', () => {
  assert.ok(files.length >= 12, 'Verlauf vorhanden')
  for (const f of files) {
    const n = parseReleaseNote(read(f))
    assert.ok(n, `${f}: Kopf „# ResQDocs x.y.z" fehlt`)
    assert.equal(`${n.version}.md`, f, `${f}: Version im Kopf passt nicht zum Dateinamen`)
    assert.ok(n.sections.length > 0, `${f}: kein Abschnitt Added/Changed/Fixed mit Punkten`)
    assert.ok(n.summary.length > 0, `${f}: Zusammenfassung fehlt`)
  }
})

test('fuer die aktuelle App-Version gibt es Release-Notes (sonst fehlt sie im Versionsverlauf)', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
  assert.ok(files.includes(`${pkg.version}.md`), `release-notes/de/${pkg.version}.md fehlt - vor dem Release-Commit anlegen`)
})

test('die Texte nennen im Versionsverlauf keine anderen Plattformen als Vergleich und keine internen Verweise', () => {
  for (const f of files) {
    const t = read(f)
    assert.doesNotMatch(t, /#\d{2,4}\b/, `${f}: Ticketnummer`)
    assert.doesNotMatch(t, /scripts\/public-sync|TestFlight|Maintainer/i, `${f}: interner Verweis`)
  }
})

test('splitLead: kurzes Stichwort vor dem Doppelpunkt wird abgetrennt, der Text bleibt wörtlich', () => {
  assert.deepEqual(splitLead('Fortschritt beim Tippen: Nach dem Senden zeigt die App den Stand.'), { lead: 'Fortschritt beim Tippen:', text: 'Nach dem Senden zeigt die App den Stand.' })
  assert.deepEqual(splitLead('Die Listen zeigen zuerst die neuesten Einträge.'), { lead: '', text: 'Die Listen zeigen zuerst die neuesten Einträge.' })
  const long = 'Ein sehr langer Satzanfang, der erst weit hinten einen Doppelpunkt hat: und dann weitergeht.'
  assert.deepEqual(splitLead(long), { lead: '', text: long })
  const two = 'Erster Satz. Zweiter: Rest'
  assert.deepEqual(splitLead(two), { lead: '', text: two })
  for (const f of files) {
    for (const s of parseReleaseNote(read(f))!.sections) {
      for (const item of s.items) {
        const p = splitLead(item)
        assert.equal(p.lead ? `${p.lead} ${p.text}` : p.text, item, `${f}: Text unverändert`)
      }
    }
  }
})
