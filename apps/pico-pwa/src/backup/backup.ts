// backup.ts — headless Kern des lokalen Backups (Slice 1). REIN: keine Vue-, FS-, Capacitor- oder UI-Imports
// -> node-testbar. Baut EIN versioniertes Envelope aus dem aktuellen Bestand und stellt es STRIKT ADDITIV
// wieder her (nichts wird überschrieben/gelöscht). Scope = NUR Vorlagen-Material, NIE Patientendaten:
//   rework_protocols (Vorlagen) · rework_blocks (Bausteine) · library_snippets (Mustertexte) · pzn_entries (PZN).
// Der Einsatzentwurf/caseState liegt physisch getrennt (Preferences 'rework.case.draft') und ist hier strukturell
// unerreichbar — dieses Modul kennt nur die vier obigen Datentypen.
//
// WICHTIG (aus der API-Kartierung): KEIN Repository-Save ist von sich aus additiv (alle INSERT OR REPLACE nach id).
// Additivität entsteht AUSSCHLIESSLICH hier durch kollisionsfreie id-Vergabe VOR dem Save. replaceAll() (löscht
// entfernte Zeilen) wird bewusst NIE benutzt.
import type { Container } from '@resqdocs/protocol-core/model'
import { exportTemplate } from '@resqdocs/protocol-core/templateIO'
import { exportBlock } from '@resqdocs/protocol-core/blockIO'
import { exportSnippet, type SnippetPayload } from '@resqdocs/protocol-core/snippetIO'
import { detectAndParse } from '@resqdocs/protocol-core/importRouter'
import { importProtocol } from '@resqdocs/protocol-core/library'
import { createUniqueId } from '@resqdocs/protocol-core/creator/creator.mjs'
import { exportLibrary, parseImport, importMerge, type PznLibrary } from '../medications/pznLibrary.ts'

export const BACKUP_SCHEMA = 'resqdocs-backup'
export const BACKUP_VERSION = 1

/** Serialisiertes Backup — ein Objekt, das genau die vier Vorlagen-Datensätze enthält. */
export interface BackupEnvelope {
  schema: typeof BACKUP_SCHEMA
  version: number
  createdAt: string
  app: { version: string; build?: string }
  counts: { protocols: number; blocks: number; snippets: number; pzn: number }
  sections: {
    /** je exportTemplate()-Envelope (schema 'resqdocs-protocol') */
    protocols: string[]
    /** je exportBlock()-Envelope (schema 'resqdocs-block') */
    blocks: string[]
    /** je exportSnippet()-Envelope (schema 'resqdocs-snippet') */
    snippets: string[]
  }
  /** exportLibrary()-Form { version:2, entries } oder null (keine PZN). */
  pzn: ReturnType<typeof exportLibrary> | null
}

export interface BackupInput {
  protocols: Container[]
  blocks: Container[]
  snippets: SnippetPayload[]
  pzn: PznLibrary | null
  app: { version: string; build?: string }
  createdAt: string
}

/** Baut das Envelope aus dem aktuellen Bestand — reine Funktion (createdAt/app injiziert, damit testbar). */
export function buildBackup(input: BackupInput): BackupEnvelope {
  const protocols = input.protocols.map((p) => exportTemplate(p))
  const blocks = input.blocks.map((b) => exportBlock(b))
  // Leere Platzhalter-Snippets (frisch angelegt, text==='') NICHT sichern: parseSnippet lehnt leeren Text
  // beim Restore ab -> was exportiert wird, muss auch importierbar sein (sonst Roundtrip-Verlust + falscher Zähler).
  const snippets = input.snippets.filter((s) => s.text.trim() !== '').map((s) => exportSnippet(s))
  const pzn = input.pzn ? exportLibrary(input.pzn) : null
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    createdAt: input.createdAt,
    app: input.app,
    counts: {
      protocols: protocols.length,
      blocks: blocks.length,
      snippets: snippets.length,
      pzn: pzn ? Object.keys(pzn.entries).length : 0,
    },
    sections: { protocols, blocks, snippets },
    pzn,
  }
}

export type ParseBackupResult = { ok: true; envelope: BackupEnvelope } | { ok: false; error: string }

/** Validiert + parst ein Backup-JSON (Grundform + Version). */
export function parseBackup(json: string): ParseBackupResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'Kein gültiges JSON.' }
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Backup ist kein Objekt.' }
  const p = parsed as Partial<BackupEnvelope>
  if (p.schema !== BACKUP_SCHEMA) return { ok: false, error: 'Keine ResQDocs-Sicherung.' }
  if (typeof p.version !== 'number' || p.version > BACKUP_VERSION) {
    return { ok: false, error: `Sicherungs-Version ${String(p.version)} wird nicht unterstützt.` }
  }
  const s = p.sections
  if (!s || !Array.isArray(s.protocols) || !Array.isArray(s.blocks) || !Array.isArray(s.snippets)) {
    return { ok: false, error: 'Sicherung unvollständig (Abschnitte fehlen).' }
  }
  return { ok: true, envelope: parsed as BackupEnvelope }
}

/** Host-injizierte Ziele für den additiven Restore (App verdrahtet echte Repos, Tests Memory-Varianten). */
export interface RestoreTargets {
  loadProtocols(): Promise<Container[]>
  saveProtocol(tree: Container): Promise<void>
  loadBlocks(): Promise<Container[]>
  saveBlock(tree: Container): Promise<void>
  existingSnippetIds(): Promise<string[]>
  saveSnippet(s: { id: string; title: string; text: string }): Promise<void>
  loadPzn(): Promise<PznLibrary>
  savePzn(lib: PznLibrary): Promise<void>
  /** Schlanker PZN-Restore: schreibt NUR das Eingehende additiv (SQL INSERT OR IGNORE = lokal gewinnt), mit
   *  Fortschritt — kein Voll-Read + JS-Merge + Superset-Write. Fehlt die Methode, fällt restoreBackup auf
   *  load/save zurück (Tests/Nicht-SQL-Ziele). */
  putPzn?(lib: PznLibrary, onProgress?: (done: number, total: number) => void): Promise<void>
  /** Roh-Zeilenzahl der PZN — für die Netto-neu-Zählung (counts.pzn) ohne Voll-Read. */
  countPzn?(): Promise<number>
  /** Nur für den Ersetzen-Modus: den jeweiligen Datensatz VOR dem Einspielen leeren. Fehlt die Methode,
   *  wird dieser Typ im Ersetzen-Modus nicht geleert (bleibt additiv). */
  resetProtocols?(): Promise<void>
  resetBlocks?(): Promise<void>
  resetSnippets?(): Promise<void>
  resetPzn?(): Promise<void>
}

export interface RestoreCounts {
  protocols: number
  blocks: number
  snippets: number
  pzn: number
  /** übersprungene, weil defekt/unerkannt — der Restore bricht deswegen NICHT ab. */
  skipped: number
}

export interface RestoreOptions {
  /** id-Generator (Test-Injektion); Standard crypto.randomUUID. */
  uuid?: () => string
  /** ' (Import)' an Vorlagen-Titel hängen (Standard false: sauberer Restore-nach-Wipe behält Titel). */
  retitleProtocols?: boolean
  /** 'merge' (Standard) = strikt additiv, überschreibt/löscht nie. 'replace' = die 4 Datensätze VOR dem
   *  Einspielen leeren („exakt wie damals"). WICHTIG: 'replace' ist destruktiv gegenüber der Live-Bibliothek
   *  -> der Aufrufer MUSS vorher einen Sicherheits-Snapshot anlegen (useBackup erzwingt das). Der Verlauf
   *  bleibt in BEIDEN Modi unangetastet. */
  mode?: 'merge' | 'replace'
  /** Fortschritt beim (potentiell großen) PZN-Schreiben; für die UI-Progress-Bar. */
  onProgress?: (done: number, total: number) => void
}

const cryptoUuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`

/** Stellt das Envelope STRIKT ADDITIV wieder her: kollisionsfreie ids, nichts wird überschrieben/gelöscht. */
export async function restoreBackup(
  envelope: BackupEnvelope,
  targets: RestoreTargets,
  options: RestoreOptions = {},
): Promise<RestoreCounts> {
  const uuid = options.uuid ?? cryptoUuid
  const retitle = options.retitleProtocols ?? false
  const counts: RestoreCounts = { protocols: 0, blocks: 0, snippets: 0, pzn: 0, skipped: 0 }

  // Ersetzen-Modus: die 4 Datensätze VOR dem Einspielen leeren -> nach dem additiven Schreiben entsteht
  // exakt der Snapshot-Stand (leere DB -> importProtocol behält Original-ids/Titel). Destruktiv gegenüber
  // der Live-Bibliothek; der Aufrufer legt vorher einen Sicherheits-Snapshot an (springen ohne Verlust).
  if ((options.mode ?? 'merge') === 'replace') {
    await targets.resetProtocols?.()
    await targets.resetBlocks?.()
    await targets.resetSnippets?.()
    await targets.resetPzn?.()
  }

  // Vorlagen: importProtocol (library.ts) re-idt nur bei Kollision -> in leere DB bleiben ids erhalten,
  // in bevölkerte DB entstehen frische ids (Duplikat als neu, NIE Überschreiben). Über den Akkumulator falten,
  // damit die id-Eindeutigkeit auch baumübergreifend gilt.
  // JEDER Sektionseintrag ist einzeln gekapselt: ein defekter Eintrag (auch tief-invalide Bäume, die die
  // Shallow-Validierung von detectAndParse passieren und erst in importProtocol/save werfen) darf NUR sich
  // selbst überspringen (counts.skipped++), NIE den ganzen Restore abbrechen.
  let acc = await targets.loadProtocols()
  const nextId = () => `p-${uuid()}`
  for (const raw of envelope.sections.protocols) {
    const d = detectAndParse(raw)
    if (!d.ok || d.kind !== 'protocol') {
      counts.skipped++
      continue
    }
    try {
      const res = importProtocol(acc, d.tree, nextId, retitle)
      acc = res.protocols
      await targets.saveProtocol(res.added)
      counts.protocols++
    } catch {
      counts.skipped++
    }
  }

  // Bausteine: Original-Wurzel-id BEHALTEN (round-trip-stabil -> der wiederhergestellte Stand reproduziert den
  // Content-Hash der Quelle) und NUR bei echter Kollision re-iden (wie importProtocol). Im Ersetzen-Modus ist die
  // Tabelle vorher leer -> ids bleiben; im additiven Modus schützt die Re-id bestehende rework_blocks-Zeilen.
  const blockIds = new Set((await targets.loadBlocks()).map((b) => b.id))
  for (const raw of envelope.sections.blocks) {
    const d = detectAndParse(raw)
    if (!d.ok || d.kind !== 'block') {
      counts.skipped++
      continue
    }
    try {
      const id = blockIds.has(d.tree.id) ? `blk-${uuid()}` : d.tree.id
      blockIds.add(id)
      await targets.saveBlock({ ...d.tree, id })
      counts.blocks++
    } catch {
      counts.skipped++
    }
  }

  // Mustertexte (library_snippets): deterministisch kollisionsfreie id gegen die WACHSENDE bestehende id-Menge
  // (createUniqueId), sonst würde INSERT OR REPLACE ein gleich-id-iges Snippet überschreiben.
  const snippetIds = new Set(await targets.existingSnippetIds())
  for (const raw of envelope.sections.snippets) {
    const d = detectAndParse(raw)
    if (!d.ok || d.kind !== 'snippet') {
      counts.skipped++
      continue
    }
    try {
      const id = createUniqueId('snippet', snippetIds)
      snippetIds.add(id)
      await targets.saveSnippet({ id, title: d.snippet.title, text: d.snippet.text })
      counts.snippets++
    } catch {
      counts.skipped++
    }
  }

  // PZN: importMerge im Modus 'skip' = strikt additiv (lokale Einträge gewinnen IMMER, nur fehlende ergänzen).
  // Zähler-Semantik bewusst anders als oben: PZN ist eine MENGE -> counts.pzn = NETTO neu hinzugekommene
  // (bereits lokal vorhandene PZN zählen nicht), während protocols/blocks/snippets die GESCHRIEBENEN zählen.
  if (envelope.pzn) {
    try {
      const incoming = parseImport(envelope.pzn)
      if (incoming) {
        if (targets.putPzn && targets.countPzn) {
          // Schlanker Pfad (wie der bewährte eigenständige PZN-Import): SQL macht den additiven Merge
          // (INSERT OR IGNORE, lokal gewinnt = identisch zu importMerge 'skip'), nur das Eingehende wird
          // geschrieben — kein Voll-Read, kein JS-Merge, kein Superset-Write; mit Fortschritt.
          const before = await targets.countPzn()
          await targets.putPzn(incoming, options.onProgress)
          counts.pzn = (await targets.countPzn()) - before
        } else {
          // Fallback (Tests / Ziele ohne SQL-Repo): additiver JS-Merge wie bisher.
          const current = await targets.loadPzn()
          const before = Object.keys(current.entries).length
          const merged = importMerge(current, incoming, 'skip')
          await targets.savePzn(merged)
          counts.pzn = Object.keys(merged.entries).length - before
        }
      }
    } catch {
      counts.skipped++
    }
  }

  return counts
}
