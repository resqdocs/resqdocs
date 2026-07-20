// node --test --experimental-strip-types
// Schließt die Audit-Lücke (3.-Runden-Kritiker): der Fake-SqlClient legt fehlende Tabellen still an und kann
// den benannten 1.2.1-Auslöser („no such table" nach fehlgeschlagener Migration) NICHT nachstellen. Auf dem
// echten Gerät wirft `SELECT ... FROM rework_protocols` bei fehlender Tabelle, loadAll propagiert -> init MUSS
// in den ehrlichen Fehlerzustand gehen: libraryError setzen, NICHT seeden, NICHT schreiben, keinen Watch schärfen.
// Eigene Datei = eigener Prozess/Modulzustand (protocolPersistence hat einen modulweiten `started`-Latch).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configureRepositories } from './repositoryProvider.ts'
import type { ProtocolRepository } from '@resqdocs/protocol-core/protocolRepository'
import { useProtocolPersistence } from './protocolPersistence.ts'

test('loadAll wirft (fehlende Tabelle): init → libraryError, kein Seed, kein Schreiben', async () => {
  let wrote = false
  // Repo, dessen loadAll wie natives SQLite bei fehlender Tabelle wirft. count() würde ebenfalls werfen,
  // wird aber nach dem loadAll-Wurf gar nicht mehr erreicht.
  const throwing: ProtocolRepository = {
    async loadAll() {
      throw new Error('no such table: rework_protocols')
    },
    async save() {
      wrote = true
    },
    async remove() {},
    async reset() {
      wrote = true
    },
    async replaceAll() {
      wrote = true
    },
    async count() {
      throw new Error('no such table: rework_protocols')
    },
  }
  configureRepositories({ mode: 'sqlite', protocol: async () => throwing })

  const p = useProtocolPersistence()
  await p.init()

  assert.notEqual(p.libraryError.value, null, 'libraryError muss gesetzt sein')
  assert.equal(p.saveStatus.value, 'error', 'Save-Status muss Fehler zeigen, nicht „gespeichert"')
  assert.equal(p.libraryLoaded.value, true, 'Konsumenten dürfen weiterlaufen')
  assert.equal(wrote, false, 'weder Seed noch Auto-Save dürfen gegen die defekte DB schreiben')

  // Auch Flush/Retry bleiben No-ops (Watch wurde nie geschärft, Schreibpfade sind blockiert).
  await p.flushNow()
  await p.retrySave()
  assert.equal(wrote, false, 'Flush/Retry schreiben im Fehlerzustand nicht')
})
