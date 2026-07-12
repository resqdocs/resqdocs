// configureNativeRepositories.ts — App-seitige Verdrahtung der Rework-Repositories auf die native
// Capacitor/SQLite-Schicht (geteilte DB resqdocs-library wie Library/PZN -> eine DB, backup-freundlich).
// Im Web (kein Native) bleibt der Provider-Default (Memory) aktiv. Idempotent. Gehoert bewusst in die
// APP (Capacitor-Kopplung), NICHT in den plattform-neutralen repositoryProvider.
import { Capacitor } from '@capacitor/core'
import { configureRepositories } from '@resqdocs/protocol-core-ui/repositoryProvider'
import { createReworkRepositoryOnClient, createMemoryProtocolRepository } from '@resqdocs/protocol-core/protocolRepository'
import { createBlockRepositoryOnClient, createMemoryBlockRepository } from '@resqdocs/protocol-core/blockRepository'

let configured = false

export function configureNativeRepositories(): void {
  if (configured) return
  configured = true
  if (!Capacitor.isNativePlatform()) return // Web-Dev: Default (Memory) belassen
  const sharedClient = () =>
    import('@/storage/sqlite/capacitorSqlClient').then((m) => m.getSharedCapacitorSqlClient())
  configureRepositories({
    mode: 'sqlite',
    // Fehlt SQLite (defekte/nicht verfuegbare DB): auf Memory zurueckfallen statt zu werfen (Verhalten wie zuvor).
    protocol: async () => {
      try {
        return createReworkRepositoryOnClient(await sharedClient())
      } catch (err) {
        console.error('SQLite-Rework-Bibliothek nicht verfuegbar, nutze In-Memory:', err)
        return createMemoryProtocolRepository()
      }
    },
    block: async () => {
      try {
        return createBlockRepositoryOnClient(await sharedClient())
      } catch (err) {
        console.error('SQLite-Baustein-Bibliothek nicht verfuegbar, nutze In-Memory:', err)
        return createMemoryBlockRepository()
      }
    },
  })
}
