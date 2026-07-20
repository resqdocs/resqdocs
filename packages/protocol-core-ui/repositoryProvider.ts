// repositoryProvider.ts — host-injizierte Repo-Factories fuer die Rework-Bibliotheken.
// Der Host verdrahtet die konkreten Repositories EINMAL beim Boot via configureRepositories():
//   - Mobile-App  -> Capacitor/SQLite (siehe configureNativeRepositories.ts)
//   - Online-Editor -> IndexedDB
//   - Tests/Web-Dev -> Memory (Default, ohne Verdrahtung)
// Dadurch bleiben die Composables (protocolPersistence, useBlockLibrary) plattform-neutral (kein
// Capacitor-Import) und wandern unveraendert ins geteilte UI-Paket @resqdocs/protocol-core-ui.
import { createMemoryProtocolRepository, type ProtocolRepository } from '@resqdocs/protocol-core/protocolRepository'
import { createMemoryBlockRepository, type BlockRepository } from '@resqdocs/protocol-core/blockRepository'

export type LibraryMode = 'memory' | 'sqlite' | 'indexeddb'

let protocolFactory: (() => Promise<ProtocolRepository>) | null = null
let blockFactory: (() => Promise<BlockRepository>) | null = null
let mode: LibraryMode = 'memory'
let degradedReason: string | null = null

/** Host-Verdrahtung der konkreten Repositories. Idempotent; nur gesetzte Felder ueberschreiben. */
export function configureRepositories(opts: {
  protocol?: () => Promise<ProtocolRepository>
  block?: () => Promise<BlockRepository>
  mode?: LibraryMode
}): void {
  if (opts.protocol) protocolFactory = opts.protocol
  if (opts.block) blockFactory = opts.block
  if (opts.mode) mode = opts.mode
}

/** Anzeige-Label der aktiven Bibliothek (Save-Status-Badge). */
export function getLibraryMode(): LibraryMode {
  return mode
}

/** Vom Host gesetzt, wenn die EIGENTLICH persistente Bibliothek (z. B. native SQLite) nicht geoeffnet werden
 *  konnte — Open/Migration fehlgeschlagen — und der Host auf ein nicht-persistentes Memory-Repo zurueckfiel.
 *  Unterscheidet die native DEGRADATION vom regulaeren Web-Dev-Memory-Modus: die Persistenz-Schicht darf dann
 *  NICHT „gespeichert" vortaeuschen, sonst gehen neu erstellte Vorlagen still beim Neustart verloren
 *  (Vorfall 1.2.1, Ausloeser „fehlgeschlagene Migration"). */
export function markPersistenceDegraded(reason: string): void {
  degradedReason = reason
}

/** Grund der Persistenz-Degradation (null = gesund). */
export function getPersistenceDegradedReason(): string | null {
  return degradedReason
}

/** Protokoll-Repository aufloesen; ohne Host-Verdrahtung: nicht-persistente Memory-Variante (Web-Dev/Tests). */
export function resolveProtocolRepository(): Promise<ProtocolRepository> {
  return (protocolFactory ?? (async () => createMemoryProtocolRepository()))()
}

/** Baustein-Repository aufloesen; ohne Host-Verdrahtung: Memory-Variante. */
export function resolveBlockRepository(): Promise<BlockRepository> {
  return (blockFactory ?? (async () => createMemoryBlockRepository()))()
}
