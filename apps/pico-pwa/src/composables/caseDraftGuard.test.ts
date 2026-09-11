import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entscheideUeberEntwurf, type EntwurfsLage } from './caseDraftGuard.ts'

const lage = (over: Partial<EntwurfsLage> = {}): EntwurfsLage => ({
  libraryError: null,
  vorhandeneProtokollIds: ['n1', 'n2'],
  entwurfProtokollId: 'n1',
  ...over,
})

test('DER GEMELDETE FALL: bei gestoerter Bibliothek wird der Entwurf NICHT verworfen', () => {
  // Genau die Lage vom Geraet: die Datenbank liess sich nicht oeffnen, die Vorlagenliste enthaelt
  // nur die Blanko-Saat. Vorher galt der Entwurf damit als verwaist und wurde geloescht - ein
  // laufender Einsatz war weg, obwohl auf der Platte alles unversehrt lag.
  const gestoert = lage({
    libraryError: 'Die Vorlagen-Bibliothek konnte nicht geoeffnet werden.',
    vorhandeneProtokollIds: ['protokoll'], // nur die Saat
    entwurfProtokollId: 'n1',
  })
  assert.equal(entscheideUeberEntwurf(gestoert), 'unangetastet-lassen')
})

test('die Sperre greift unabhaengig davon, wie die Vorlagenliste aussieht', () => {
  // Auch wenn die Liste zufaellig passen WUERDE, wird bei gestoerter Bibliothek nicht aufgeloest -
  // die Liste ist in diesem Zustand schlicht nicht aussagekraeftig.
  for (const ids of [[], ['protokoll'], ['n1', 'n2']]) {
    assert.equal(
      entscheideUeberEntwurf(lage({ libraryError: 'defekt', vorhandeneProtokollIds: ids })),
      'unangetastet-lassen',
      'Liste ' + JSON.stringify(ids),
    )
  }
})

test('im gesunden Zustand bleibt das Aufraeumen erhalten', () => {
  // Das Loeschen ist gewollt: verwaiste Patientendaten einer wirklich geloeschten Vorlage.
  assert.equal(entscheideUeberEntwurf(lage({ entwurfProtokollId: 'weg' })), 'verwerfen')
  assert.equal(entscheideUeberEntwurf(lage({ entwurfProtokollId: undefined })), 'verwerfen')
})

test('ein Entwurf zu einer vorhandenen Vorlage wird fortgesetzt', () => {
  assert.equal(entscheideUeberEntwurf(lage({ entwurfProtokollId: 'n2' })), 'fortsetzen')
})

test('nur der GESUNDE Zustand darf ueberhaupt verwerfen', () => {
  // Diese Aussage ist der Kern der Invariante: kein Eingabepaar mit libraryError darf jemals
  // 'verwerfen' ergeben. Erschoepfend ueber den kleinen Eingaberaum geprueft.
  const fehler = [null, 'defekt']
  const listen: string[][] = [[], ['protokoll'], ['n1'], ['n1', 'n2']]
  const entwuerfe: (string | undefined)[] = [undefined, 'n1', 'weg']
  for (const libraryError of fehler) {
    for (const vorhandeneProtokollIds of listen) {
      for (const entwurfProtokollId of entwuerfe) {
        const e = entscheideUeberEntwurf({ libraryError, vorhandeneProtokollIds, entwurfProtokollId })
        if (libraryError !== null) {
          assert.equal(e, 'unangetastet-lassen', JSON.stringify({ libraryError, vorhandeneProtokollIds, entwurfProtokollId }))
        } else {
          assert.notEqual(e, 'unangetastet-lassen', 'ohne Fehler wird immer entschieden')
        }
      }
    }
  }
})

// --- Kein stiller Fehlschlag beim Schreiben --------------------------------------------------------

test('der Einsatz-Entwurf wird nirgends ohne Fehlerbehandlung geschrieben', async () => {
  // Quelltextpruefung statt Verhalten - unschoen, aber sie sichert genau die Regression, die diesen
  // Fehler so teuer gemacht hat: `void caseDraft.save(...)` verschluckte jeden Fehlschlag, und der
  // Nutzer dokumentierte weiter, ohne dass etwas gesichert wurde und ohne dass es zu sehen war.
  const { readFile } = await import('node:fs/promises')
  const quelle = await readFile(`${import.meta.dirname}/../components/rebuild/EinsatzView.vue`, 'utf8')

  const ungesichert = quelle
    .split('\n')
    .map((zeile, i) => ({ zeile: zeile.trim(), nr: i + 1 }))
    .filter((z) => /^void\s+caseDraft\.save\(/.test(z.zeile))
  assert.deepEqual(ungesichert, [], 'Entwurf nur ueber saveDraftGuarded schreiben')

  assert.match(quelle, /function saveDraftGuarded/, 'die gesicherte Schreibfunktion muss es geben')
  assert.match(quelle, /draftSaveError\.value = true/, 'ein Fehlschlag muss einen sichtbaren Zustand setzen')
})

test('die Speicher-Warnung haengt im Einsatz-Tab, nicht nur in den Einstellungen', async () => {
  // Der rote Bibliotheks-Status stand bisher nur in einem zugeklappten Bereich der Einstellungen.
  // Wer dokumentiert, sieht ihn dort nie.
  const { readFile } = await import('node:fs/promises')
  const quelle = await readFile(`${import.meta.dirname}/../components/rebuild/EinsatzView.vue`, 'utf8')

  assert.match(quelle, /libraryError \|\| draftSaveError/, 'beide Fehlerquellen fuehren zur Warnung')
  assert.match(quelle, /role="alert"/, 'als Alarm ausgezeichnet, nicht als beilaeufiger Hinweis')
  assert.match(quelle, /NICHT gespeichert/, 'die Warnung muss klar sagen, was los ist')
})
