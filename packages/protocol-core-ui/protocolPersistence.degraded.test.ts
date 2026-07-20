// node --test --experimental-strip-types
// Regressionsschutz für den 3.-Runden-Verify-Befund: fällt der Host (native SQLite) auf ein Memory-Repo
// zurück (Open/Migration fehlgeschlagen) und MELDET das via markPersistenceDegraded, muss protocolPersistence
// ehrlich in den nicht-persistenten Fehlerzustand gehen — NICHT seeden, NICHT den Auto-Save scharfschalten
// und NICHT „gespeichert" vortäuschen (sonst gehen neu erstellte Vorlagen still beim Neustart verloren).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configureRepositories, markPersistenceDegraded } from './repositoryProvider.ts'
import { createMemoryProtocolRepository } from '@resqdocs/protocol-core/protocolRepository'
import { useProtocolPersistence } from './protocolPersistence.ts'

test('Persistenz-Degradation: init geht ehrlich in Fehlerzustand statt „gespeichert" vorzutäuschen', async () => {
  // Host simuliert nativen SQLite-Ausfall: liefert ein leeres Memory-Repo UND meldet Degradation.
  const inner = createMemoryProtocolRepository()
  let wrote = false
  const spy = {
    ...inner,
    async save(p: Parameters<typeof inner.save>[0]) {
      wrote = true
      return inner.save(p)
    },
    async replaceAll(x: Parameters<typeof inner.replaceAll>[0]) {
      wrote = true
      return inner.replaceAll(x)
    },
  }
  configureRepositories({ mode: 'sqlite', protocol: async () => spy })
  markPersistenceDegraded('open failed: database is locked')

  const p = useProtocolPersistence()
  await p.init()

  assert.notEqual(p.libraryError.value, null, 'libraryError muss gesetzt sein')
  assert.equal(p.saveStatus.value, 'error', 'Save-Status muss Fehler zeigen, nicht „gespeichert"')
  assert.equal(p.libraryLoaded.value, true, 'Konsumenten dürfen weiterlaufen (blanko)')
  assert.equal(wrote, false, 'im Degradations-Zustand darf NICHT gegen das Repo geschrieben werden')

  // Auch ein manueller Flush/Retry darf im Degradations-Zustand nichts schreiben.
  await p.flushNow()
  await p.retrySave()
  assert.equal(wrote, false, 'Flush/Retry bleiben im Degradations-Zustand No-ops')
})
