// creatorSession.ts — pure, Vue-freie Logik einer FLÜCHTIGEN Creator-Session.
//
// Hält neutrale Protokoll-Vorlagen nur im Arbeitsspeicher. KEINE Persistenz
// (kein LocalStorage/SessionStorage/IndexedDB/Preferences/SQLite/Cache/Cloud) —
// die Storage-Technik ist ein späterer Entscheidungspunkt (#13, docs/protocol-creator-mvp.md).
//
// Verarbeitet ausschließlich NEUTRALE Vorlagen — keine Einsatz-/Patientendaten,
// kein caseState. Nutzt die bestehende Creator-Domainlogik (packages/shared/creator),
// dupliziert nichts davon.
//
// Relative Import-Pfade zu creator.mjs, damit das Modul mit
// `node --test --experimental-strip-types` ohne Alias-Auflösung läuft.
import {
  createProtocol,
  duplicateProtocol,
  renameProtocol,
  assertValidProtocolDraft,
  addBlock,
  updateBlock,
  duplicateBlock,
  removeBlock,
  moveBlock,
  addPoint,
  updatePoint,
  duplicatePoint,
  removePoint,
  movePoint,
  insertBlock,
  ensureProtocolPointIds,
  addVariable,
  updateVariable,
  removeVariable,
  findVariableReferences,
  parseImport,
  exportProtocol,
  slugify,
  type Protocol,
  type Block,
  type Point,
  type Variable,
  type Predicate,
  type VariableReference,
  type ValidationResult,
} from '@resqdocs/protocol-core/creator/creator.mjs'
import type { LibraryRepository, LibraryBlock, LibrarySnippet } from '../storage/types'

export interface CreatorSession {
  protocols: Protocol[]
  selectedProtocolId: string | null
}

export function initCreatorSession(seedProtocols: Protocol[]): CreatorSession {
  // ensureProtocolPointIds (#66): Seeds koennen Punkte ohne id enthalten.
  const protocols = seedProtocols.map((p) => ensureProtocolPointIds(p))
  return { protocols, selectedProtocolId: protocols[0]?.id ?? null }
}

export function getSelected(session: CreatorSession): Protocol | null {
  return session.protocols.find((p) => p.id === session.selectedProtocolId) ?? null
}

export function selectProtocol(session: CreatorSession, id: string): CreatorSession {
  const exists = session.protocols.some((p) => p.id === id)
  return { protocols: session.protocols, selectedProtocolId: exists ? id : session.selectedProtocolId }
}

export function duplicateSelectedProtocol(session: CreatorSession): CreatorSession {
  const sel = getSelected(session)
  if (!sel) return session
  const dup = duplicateProtocol(sel)
  return { protocols: [...session.protocols, dup], selectedProtocolId: dup.id ?? null }
}

export function renameSelectedProtocol(session: CreatorSession, title: string): CreatorSession {
  const sel = getSelected(session)
  if (!sel) return session
  const renamed = renameProtocol(sel, title)
  return {
    protocols: session.protocols.map((p) => (p.id === sel.id ? renamed : p)),
    selectedProtocolId: session.selectedProtocolId,
  }
}

export function removeSelectedProtocol(session: CreatorSession): CreatorSession {
  const sel = getSelected(session)
  if (!sel) return session
  const protocols = session.protocols.filter((p) => p.id !== sel.id)
  return { protocols, selectedProtocolId: protocols[0]?.id ?? null }
}

export function createNewProtocol(session: CreatorSession, input?: Partial<Protocol>): CreatorSession {
  const created = createProtocol(input ?? { title: 'Neues Protokoll' })
  return { protocols: [...session.protocols, created], selectedProtocolId: created.id ?? null }
}

export function validateSelected(session: CreatorSession): ValidationResult | null {
  const sel = getSelected(session)
  return sel ? assertValidProtocolDraft(sel) : null
}

/** Read-only JSON des ausgewählten Protokolls (formatierter String, keine Speicherung). */
export function selectedJson(session: CreatorSession): string {
  const sel = getSelected(session)
  return sel ? JSON.stringify(sel, null, 2) : ''
}

// --- Bearbeiten des ausgewählten Protokolls (Blöcke/Punkte) -------------------
//
// Dünne, pure Wrapper, die die bestehenden Creator-Domainfunktionen auf das
// AUSGEWÄHLTE Protokoll anwenden und es in der Session ersetzen. Keine eigene
// CRUD-/Domainlogik (keine Duplizierung). Wirft Transform-Fehler weiter.

function replaceSelected(session: CreatorSession, transform: (p: Protocol) => Protocol): CreatorSession {
  const sel = getSelected(session)
  if (!sel) return session
  const next = transform(sel)
  return {
    protocols: session.protocols.map((p) => (p.id === sel.id ? next : p)),
    selectedProtocolId: session.selectedProtocolId,
  }
}

export function addBlockToSelected(session: CreatorSession, input?: Partial<Block>): CreatorSession {
  return replaceSelected(session, (p) => addBlock(p, input))
}
export function updateBlockInSelected(session: CreatorSession, blockId: string, patch: Partial<Block>): CreatorSession {
  return replaceSelected(session, (p) => updateBlock(p, blockId, patch))
}
export function duplicateBlockInSelected(session: CreatorSession, blockId: string): CreatorSession {
  return replaceSelected(session, (p) => duplicateBlock(p, blockId))
}
export function removeBlockFromSelected(session: CreatorSession, blockId: string): CreatorSession {
  return replaceSelected(session, (p) => removeBlock(p, blockId))
}
export function moveBlockInSelected(session: CreatorSession, blockId: string, direction: 'up' | 'down'): CreatorSession {
  return replaceSelected(session, (p) => moveBlock(p, blockId, direction))
}
export function addPointToSelected(session: CreatorSession, blockId: string, input: Partial<Point> & { type?: string }): CreatorSession {
  return replaceSelected(session, (p) => addPoint(p, blockId, input))
}
export function updatePointInSelected(session: CreatorSession, pointId: string, patch: Partial<Point>): CreatorSession {
  return replaceSelected(session, (p) => updatePoint(p, pointId, patch))
}
export function duplicatePointInSelected(session: CreatorSession, pointId: string): CreatorSession {
  return replaceSelected(session, (p) => duplicatePoint(p, pointId))
}
export function removePointFromSelected(session: CreatorSession, pointId: string): CreatorSession {
  return replaceSelected(session, (p) => removePoint(p, pointId))
}
export function movePointInSelected(session: CreatorSession, pointId: string, direction: 'up' | 'down'): CreatorSession {
  return replaceSelected(session, (p) => movePoint(p, pointId, direction))
}

// --- Variablen ---------------------------------------------------------------

export function addVariableToSelected(session: CreatorSession, input: Partial<Variable> & { type?: string }): CreatorSession {
  return replaceSelected(session, (p) => addVariable(p, input))
}
export function updateVariableInSelected(session: CreatorSession, variableId: string, patch: Partial<Variable>): CreatorSession {
  return replaceSelected(session, (p) => updateVariable(p, variableId, patch))
}
export function removeVariableFromSelected(session: CreatorSession, variableId: string): CreatorSession {
  return replaceSelected(session, (p) => removeVariable(p, variableId))
}
/** Referenzen (visibleIf/Platzhalter) einer Variable im ausgewählten Protokoll. */
export function selectedVariableReferences(session: CreatorSession, variableId: string): VariableReference[] {
  const sel = getSelected(session)
  return sel ? findVariableReferences(sel, variableId) : []
}

// --- Sichtbarkeit (visibleIf) an Block/Punkt ---------------------------------
// `predicate == null` entfernt die Bedingung. Bedingung wird vom Aufrufer
// (createSimpleVisibleIf) gebaut — hier keine Prädikat-Logik.

export function setBlockVisibleIfInSelected(session: CreatorSession, blockId: string, predicate: Predicate | null | undefined): CreatorSession {
  return updateBlockInSelected(session, blockId, { visibleIf: predicate ?? undefined })
}
export function setPointVisibleIfInSelected(session: CreatorSession, pointId: string, predicate: Predicate | null | undefined): CreatorSession {
  return updatePointInSelected(session, pointId, { visibleIf: predicate ?? undefined })
}

// --- Import / Export (rein; Datei-/Clipboard-Logik liegt im Browser-Helper) ---

export interface ImportOutcome {
  ok: boolean
  session: CreatorSession
  errors: string[]
  warnings: string[]
}

/**
 * Importiert ein Protokoll aus JSON-Text in die FLÜCHTIGE Session. Validiert via
 * parseImport (Schema). Bei Erfolg: aufnehmen + auswählen. Bei Fehler: Session
 * unverändert. Keine Persistenz, keine Browser-APIs.
 */
export function importProtocolIntoSession(session: CreatorSession, jsonText: string): ImportOutcome {
  const result = parseImport(jsonText)
  if (!result.ok) {
    return { ok: false, session, errors: result.errors, warnings: result.warnings }
  }
  // id-Kollision in der Session vermeiden: importiertes Protokoll ggf. neu-id-en.
  const taken = new Set(session.protocols.map((p) => p.id))
  const imported = ensureProtocolPointIds(result.protocol) // #66: fehlende Punkt-IDs nachruesten
  if (imported.id == null || taken.has(imported.id)) {
    let n = 2
    const base = imported.id ?? 'import'
    let candidate = base
    while (taken.has(candidate)) candidate = `${base}-${n++}`
    imported.id = candidate
  }
  return {
    ok: true,
    session: { protocols: [...session.protocols, imported], selectedProtocolId: imported.id ?? null },
    errors: [],
    warnings: result.warnings,
  }
}

export interface ExportOutcome {
  ok: boolean
  json?: string
  filename?: string
  errors: string[]
}

// --- Library-Anbindung (bewusst, kein Auto-Save) — #13-F2 ---
// repo wird injiziert (LibraryRepository aus der gekapselten Storage-Schicht);
// hier KEIN direkter Storage-/SQLite-/Preferences-Zugriff.

export interface LibraryOutcome {
  ok: boolean
  errors: string[]
}

/** Lädt persistente Protokolle aus der Library und mischt sie in die Session (Library gewinnt bei id-Gleichheit). */
export async function loadLibraryIntoSession(session: CreatorSession, repo: LibraryRepository): Promise<CreatorSession> {
  const fromLibrary = await repo.loadProtocols()
  const byId = new Map<string, Protocol>()
  for (const p of session.protocols) if (p.id != null) byId.set(p.id, p)
  for (const p of fromLibrary) if (p.id != null) byId.set(p.id, ensureProtocolPointIds(p)) // #66
  const protocols = [...byId.values()]
  const keepSelection = session.selectedProtocolId != null && protocols.some((p) => p.id === session.selectedProtocolId)
  return { protocols, selectedProtocolId: keepSelection ? session.selectedProtocolId : protocols[0]?.id ?? null }
}

// --- Einfügen aus der Library (Copy-on-insert, #13-F4) ---
// Rein: kein Storage-/Browser-Zugriff. Kopie statt Referenz; neue IDs +
// internes visibleIf-Remap über die Creator-Domain (insertBlock/addPoint).
// Validiert nach Einfügen; bei Ungültigkeit bleibt die Session unverändert.

export interface InsertOutcome {
  ok: boolean
  session: CreatorSession
  errors: string[]
}

/** Fügt einen Library-Baustein als NEUEN Block (Kopie) ins ausgewählte Protokoll ein. */
export function insertLibraryBlockIntoSelectedProtocol(session: CreatorSession, libraryBlock: LibraryBlock): InsertOutcome {
  const sel = getSelected(session)
  if (!sel) return { ok: false, session, errors: ['Kein Protokoll ausgewählt.'] }
  if (!libraryBlock?.block) return { ok: false, session, errors: ['Baustein enthält keinen Block.'] }
  const next = replaceSelected(session, (p) => insertBlock(p, libraryBlock.block))
  const res = assertValidProtocolDraft(getSelected(next) as Protocol)
  return res.valid ? { ok: true, session: next, errors: [] } : { ok: false, session, errors: res.errors }
}

/** Fügt ein Library-Snippet als neuen text-Punkt in einen Zielblock ein (Kopie). */
export function insertLibrarySnippetIntoSelectedProtocol(
  session: CreatorSession,
  snippet: LibrarySnippet,
  targetBlockId: string,
): InsertOutcome {
  const sel = getSelected(session)
  if (!sel) return { ok: false, session, errors: ['Kein Protokoll ausgewählt.'] }
  if (!targetBlockId || !(sel.blocks ?? []).some((b) => b.id === targetBlockId)) {
    return { ok: false, session, errors: ['Kein gültiger Zielblock gewählt.'] }
  }
  const next = replaceSelected(session, (p) =>
    addPoint(p, targetBlockId, { type: 'text', label: snippet.title, content: snippet.text }),
  )
  const res = assertValidProtocolDraft(getSelected(next) as Protocol)
  return res.valid ? { ok: true, session: next, errors: [] } : { ok: false, session, errors: res.errors }
}

/** Speichert das AUSGEWÄHLTE Protokoll bewusst in die Library — validiert vorab, nie caseState. */
export async function saveSelectedToLibrary(session: CreatorSession, repo: LibraryRepository): Promise<LibraryOutcome> {
  const sel = getSelected(session)
  if (!sel) return { ok: false, errors: ['Kein Protokoll ausgewählt.'] }
  const res = assertValidProtocolDraft(sel)
  if (!res.valid) return { ok: false, errors: res.errors }
  try {
    await repo.saveProtocol(sel)
    return { ok: true, errors: [] }
  } catch (err) {
    return { ok: false, errors: [(err as Error).message] }
  }
}

/** Serialisiert das AUSGEWÄHLTE Protokoll — nur wenn gültig. Inkl. Dateiname-Vorschlag. */
export function exportSelectedProtocol(session: CreatorSession): ExportOutcome {
  const sel = getSelected(session)
  if (!sel) return { ok: false, errors: ['Kein Protokoll ausgewählt.'] }
  try {
    const json = exportProtocol(sel)
    const slug = slugify(sel.title) || sel.id || 'protokoll'
    const filename = `resqdocs-protocol-${slug}-${sel.schemaVersion ?? '0.0.0'}.json`
    return { ok: true, json, filename, errors: [] }
  } catch (err) {
    return { ok: false, errors: [(err as Error).message] }
  }
}

// --- Voll-Backup (#108 Teil 2): alle eigenen Protokolle in EINE Datei ----------
// Sicherungsnetz vor App-Neuinstallation/Gerätewechsel. NUR neutrale Vorlagen,
// kein caseState/keine Patientendaten. Die schreibgeschützte Beispiel-Vorlage
// (example) wird NICHT mitgesichert (beim Start ohnehin frisch geseedet).

const BACKUP_KIND = 'resqdocs-backup'

/** Bündelt alle eigenen (nicht-Beispiel) Protokolle als ein Backup-JSON. */
export function exportAllProtocols(session: CreatorSession): ExportOutcome {
  const own = session.protocols.filter((p) => p.example !== true)
  if (own.length === 0) return { ok: false, errors: ['Keine eigenen Protokolle zum Sichern.'] }
  const invalid = own.filter((p) => !assertValidProtocolDraft(p).valid)
  if (invalid.length) {
    return { ok: false, errors: [`Ungültige Protokolle: ${invalid.map((p) => p.title || p.id).join(', ')}`] }
  }
  const json = JSON.stringify({ schemaVersion: '0.1.0', kind: BACKUP_KIND, protocols: own }, null, 2)
  return { ok: true, json, filename: `resqdocs-backup-${own.length}-protokolle.json`, errors: [] }
}

export interface BackupImportOutcome {
  ok: boolean
  session: CreatorSession
  imported: number
  errors: string[]
  warnings: string[]
}

/**
 * Importiert ein Voll-Backup in die Session. Akzeptiert das Backup-Envelope
 * (`{ protocols: [...] }`), eine reine Protokoll-Liste ODER ein einzelnes
 * Protokoll. Jedes Protokoll wird validiert; ungültige werden übersprungen (mit
 * Fehlermeldung). id-Kollisionen werden neu vergeben, das `example`-Flag wird nie
 * importiert (keine zweite schreibgeschützte Beispiel-Vorlage). Bestehende
 * Protokolle bleiben erhalten (additiv, kein Überschreiben).
 */
export function importBackupIntoSession(session: CreatorSession, jsonText: string): BackupImportOutcome {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return { ok: false, session, imported: 0, errors: ['Datei ist kein gültiges JSON.'], warnings: [] }
  }
  let list: unknown[]
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { protocols?: unknown }).protocols)) {
    list = (parsed as { protocols: unknown[] }).protocols
  } else if (Array.isArray(parsed)) {
    list = parsed
  } else if (parsed && typeof parsed === 'object') {
    list = [parsed]
  } else {
    return { ok: false, session, imported: 0, errors: ['Kein Backup/Protokoll erkennbar.'], warnings: [] }
  }

  const taken = new Set(session.protocols.map((p) => p.id))
  const added: Protocol[] = []
  const errors: string[] = []
  const warnings: string[] = []
  for (const item of list) {
    const check = assertValidProtocolDraft(item as Protocol)
    if (!check.valid) {
      const label = (item as { title?: string; id?: string })?.title ?? (item as { id?: string })?.id ?? '?'
      errors.push(`Übersprungen (ungültig): ${label}${check.errors[0] ? ` — ${check.errors[0]}` : ''}`)
      continue
    }
    const p = ensureProtocolPointIds(item as Protocol)
    if (p.example) delete p.example
    if (p.id == null || taken.has(p.id)) {
      let n = 2
      const base = p.id ?? 'import'
      let candidate = base
      while (taken.has(candidate)) candidate = `${base}-${n++}`
      p.id = candidate
    }
    taken.add(p.id as string)
    warnings.push(...check.warnings)
    added.push(p)
  }

  if (added.length === 0) {
    return {
      ok: false,
      session,
      imported: 0,
      errors: errors.length ? errors : ['Keine importierbaren Protokolle gefunden.'],
      warnings,
    }
  }
  return {
    ok: true,
    session: {
      protocols: [...session.protocols, ...added],
      selectedProtocolId: added[0].id ?? session.selectedProtocolId,
    },
    imported: added.length,
    errors,
    warnings,
  }
}
