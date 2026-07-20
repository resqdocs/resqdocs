// backupService.ts — Orchestrierung eines Backup-Laufs (Slice 2), OHNE Vue/Capacitor: Datenquelle und
// Speicher sind als PORTS injiziert -> die ganze Ablauflogik (Degradations-Guard, Dedup, Rotation, Prune,
// Index) ist node-testbar. useBackup.ts (Vue/Capacitor) verdrahtet die realen Ports.
import type { Container } from '@resqdocs/protocol-core/model'
import type { SnippetPayload } from '@resqdocs/protocol-core/snippetIO'
import type { PznLibrary } from '../medications/pznLibrary.ts'
import { buildBackup, type BackupEnvelope } from './backup.ts'
import { planBackup, snapshotName, DEFAULT_ROTATION, type SnapshotMeta, type SnapshotOrigin, type RotationConfig } from './backupRotation.ts'

/** Liefert den aktuellen Bestand + Meta. Bei degradierter DB liefern die Repos still [] -> degradedReason
 *  MUSS das anzeigen, sonst friert das Backup eine kaputte/leere Bibliothek ein. */
export interface BackupDataSource {
  degradedReason(): string | null
  loadProtocols(): Promise<Container[]>
  loadBlocks(): Promise<Container[]>
  loadSnippets(): Promise<SnippetPayload[]>
  loadPzn(): Promise<PznLibrary | null>
  appInfo(): { version: string; build?: string }
}

/** Persistenz der Snapshots + des Index (Rotation entscheidet über den Index). */
export interface BackupStore {
  listIndex(): Promise<SnapshotMeta[]>
  writeSnapshot(name: string, envelopeJson: string, onProgress?: (done: number, total: number) => void): Promise<void>
  deleteSnapshot(name: string): Promise<void>
  putIndex(metas: SnapshotMeta[]): Promise<void>
}

export type BackupResult =
  | { written: true; name: string; counts: BackupEnvelope['counts']; pruned: string[] }
  | { written: false; reason: 'degraded' | 'unchanged' | 'empty' | 'error' }

export interface RunBackupOptions {
  /** „jetzt" in Epoch ms (injiziert -> testbar + deterministischer Dateiname). */
  now: number
  /** Content-Hash-Funktion (Standard SHA-256); injizierbar für Tests. */
  hash?: (text: string) => Promise<string>
  /** Herkunft des Snapshots (Verlauf-Badge + Pinning). Standard 'auto'. */
  origin?: SnapshotOrigin
  /** Aufbewahrungs-Config (aus dem Nutzer-Setting); Standard DEFAULT_ROTATION. */
  cfg?: RotationConfig
  /** Dedup überspringen (Sicherheits-Snapshot vor Restore MUSS existieren). */
  force?: boolean
  /** Fortschritt beim Schreiben/Packen (base64), für die UI bei großer PZN-Bibliothek. */
  onProgress?: (done: number, total: number) => void
}

/** SHA-256-Hex über einen String (WebCrypto; nativ im secure context + node verfügbar). */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Hash NUR über den INHALT (sections + pzn), NICHT über createdAt/app (die pro Lauf variieren) -> Dedup
// erkennt „nichts geändert" korrekt.
const contentString = (env: BackupEnvelope): string => `${JSON.stringify(env.sections)}|${JSON.stringify(env.pzn)}`

export async function runBackup(
  src: BackupDataSource,
  store: BackupStore,
  opts: RunBackupOptions,
): Promise<BackupResult> {
  // Degradations-Guard: defekte/unlesbare DB -> Repos liefern still [] -> NIEMALS eine (evtl. leere)
  // Momentaufnahme schreiben (würde eine später erholbare Bibliothek als leer einfrieren).
  if (src.degradedReason() != null) return { written: false, reason: 'degraded' }

  const [protocols, blocks, snippets, pzn] = await Promise.all([
    src.loadProtocols(),
    src.loadBlocks(),
    src.loadSnippets(),
    src.loadPzn(),
  ])
  const env = buildBackup({
    protocols,
    blocks,
    snippets,
    pzn,
    app: src.appInfo(),
    createdAt: new Date(opts.now).toISOString(),
  })
  const total = env.counts.protocols + env.counts.blocks + env.counts.snippets + env.counts.pzn

  const existing = await store.listIndex()
  // Ganz leer UND noch nie ein Backup -> kein leeres Erst-Backup anlegen. (Wird später etwas leer, sichern
  // wir das bewusst — der Anti-Regressions-Guard in planBackup behält die guten alten Kopien.)
  if (total === 0 && existing.length === 0) return { written: false, reason: 'empty' }

  const hashFn = opts.hash ?? sha256Hex
  const hash = await hashFn(contentString(env))
  const name = snapshotName(opts.now)
  const origin: SnapshotOrigin = opts.origin ?? 'auto'
  const cfg = opts.cfg ?? DEFAULT_ROTATION
  const plan = planBackup(existing, { name, createdAt: opts.now, hash, total, origin, counts: env.counts }, cfg, opts.force ?? false)
  if (!plan.write) return { written: false, reason: 'unchanged' }

  // Schreiben ZUERST, dann ausgemusterte löschen -> nie ist ein guter Stand weg, bevor der neue da ist.
  await store.writeSnapshot(name, JSON.stringify(env), opts.onProgress)
  for (const n of plan.prune) await store.deleteSnapshot(n)
  const candidate: SnapshotMeta = { name, createdAt: opts.now, hash, total, origin, counts: env.counts }
  const newIndex = [candidate, ...existing].filter((m) => plan.keep.includes(m.name))
  await store.putIndex(newIndex)
  return { written: true, name, counts: env.counts, pruned: plan.prune }
}
