import { reactive, computed, ref, toRaw, watch } from 'vue'
import { standardprotokoll } from '@/data/protocols'
import { loadPersistedSession, savePersistedSession } from './creatorSessionStore'
import {
  initCreatorSession,
  getSelected,
  selectProtocol,
  duplicateSelectedProtocol,
  renameSelectedProtocol,
  removeSelectedProtocol,
  createNewProtocol,
  validateSelected,
  selectedJson,
  addBlockToSelected,
  updateBlockInSelected,
  duplicateBlockInSelected,
  removeBlockFromSelected,
  moveBlockInSelected,
  addPointToSelected,
  updatePointInSelected,
  duplicatePointInSelected,
  removePointFromSelected,
  movePointInSelected,
  addVariableToSelected,
  updateVariableInSelected,
  removeVariableFromSelected,
  selectedVariableReferences,
  setBlockVisibleIfInSelected,
  setPointVisibleIfInSelected,
  importProtocolIntoSession,
  exportSelectedProtocol,
  exportAllProtocols,
  importBackupIntoSession,
  loadLibraryIntoSession,
  saveSelectedToLibrary,
  insertLibraryBlockIntoSelectedProtocol,
  insertLibrarySnippetIntoSelectedProtocol,
  type CreatorSession,
  type ExportOutcome,
  type LibraryOutcome,
} from './creatorSession'
import { useStorage } from '@/storage/useStorage'
import type { LibraryBlock, LibrarySnippet } from '@/storage/types'
import {
  createSimpleVisibleIf,
  ensureProtocolPointIds,
  type Block,
  type Point,
  type Variable,
  type VariableReference,
} from '@resqdocs/protocol-core/creator/creator.mjs'

/** Eingabe des einfachen visibleIf-Editors (eine Bedingung). */
export interface ConditionInput {
  source: 'var' | 'point'
  id: string
  op: 'eq' | 'filled' | 'truthy' | 'state'
  value?: unknown
}

/**
 * Geteilte, FLÜCHTIGE Creator-Session (Modul-Singleton — eine Session pro
 * App-Laufzeit). Hält neutrale Vorlagen + die aktuelle Editor-Auswahl
 * (Block/Punkt) im Arbeitsspeicher. KEINE Persistenz. Die Datentransformationen
 * bleiben in creatorSession.ts (pure, getestet) bzw. packages/shared/creator —
 * hier nur reaktiver Zustand + Auswahl-Verwaltung. Tab und Editor teilen sich
 * diese eine Instanz.
 */
let shared: ReturnType<typeof create> | null = null

function blockIds(p: { blocks?: Block[] } | null): string[] {
  return (p?.blocks ?? []).map((b) => b.id)
}

function create() {
  const session = reactive<CreatorSession>(initCreatorSession([standardprotokoll]))
  // Mutationen/Transformationen bekommen den ROHEN Zustand (toRaw): die pure
  // Schicht klont via structuredClone, und das wirft auf reactive-Proxies
  // DataCloneError (bug-089/#40). Reads (computed) bleiben auf `session`
  // fuers Reactivity-Tracking.
  const raw = (): CreatorSession => toRaw(session)
  const selectedBlockId = ref<string | null>(null)
  const selectedPointId = ref<string | null>(null)
  const selectedVariableId = ref<string | null>(null)

  const selected = computed(() => getSelected(session))
  /** Schreibgeschuetzte Beispiel-Vorlage (#example): nicht editierbar, nur duplizierbar. */
  const isExample = computed(() => selected.value?.example === true)
  const validation = computed(() => validateSelected(session))
  const json = computed(() => selectedJson(session))

  const currentBlock = computed<Block | null>(
    () => selected.value?.blocks?.find((b) => b.id === selectedBlockId.value) ?? null,
  )
  const currentPoint = computed<Point | null>(
    () => (currentBlock.value?.points ?? []).find((p) => p.id === selectedPointId.value) ?? null,
  )
  const currentVariable = computed<Variable | null>(
    () => (selected.value?.variables ?? []).find((v) => v.id === selectedVariableId.value) ?? null,
  )

  function apply(next: CreatorSession): void {
    session.protocols = next.protocols
    session.selectedProtocolId = next.selectedProtocolId
  }

  /** Auswahl an die erste sinnvolle Stelle des aktuellen Protokolls setzen. */
  function resetSelection(): void {
    selectedBlockId.value = selected.value?.blocks?.[0]?.id ?? null
    selectedPointId.value = null
    selectedVariableId.value = null
  }

  // --- Protokoll ---
  function selectProtocolAndReset(id: string): void {
    apply(selectProtocol(raw(), id))
    resetSelection()
  }

  // --- Blöcke ---
  function selectBlock(id: string): void {
    selectedBlockId.value = id
    selectedPointId.value = null
  }
  function addBlock(): void {
    const before = blockIds(selected.value)
    apply(addBlockToSelected(raw(), { title: 'Neuer Block' }))
    const after = blockIds(selected.value)
    const created = after.find((id) => !before.includes(id))
    if (created) selectBlock(created)
  }
  function updateCurrentBlock(patch: Partial<Block>): void {
    if (selectedBlockId.value) apply(updateBlockInSelected(raw(), selectedBlockId.value, patch))
  }
  function duplicateBlock(id: string): void {
    const before = blockIds(selected.value)
    apply(duplicateBlockInSelected(raw(), id))
    const created = blockIds(selected.value).find((b) => !before.includes(b))
    if (created) selectBlock(created)
  }
  function removeBlock(id: string): void {
    apply(removeBlockFromSelected(raw(), id))
    if (selectedBlockId.value === id) resetSelection()
  }
  function moveBlockBy(id: string, direction: 'up' | 'down'): void {
    apply(moveBlockInSelected(raw(), id, direction))
  }

  // --- Punkte (im aktuellen Block) ---
  function selectPoint(id: string): void {
    selectedPointId.value = id
  }
  function pointIds(): string[] {
    return (currentBlock.value?.points ?? []).map((p) => p.id as string)
  }
  function addPoint(type: string): void {
    // Nie stumm scheitern (#38): ohne Blockauswahl ersten Block waehlen,
    // ohne Bloecke direkt einen anlegen (addBlock selektiert ihn).
    if (!selectedBlockId.value) {
      const first = selected.value?.blocks?.[0]?.id
      if (first) selectBlock(first)
      else addBlock()
    }
    if (!selectedBlockId.value) return
    const before = pointIds()
    apply(addPointToSelected(raw(), selectedBlockId.value, defaultPointInput(type)))
    const created = pointIds().find((id) => !before.includes(id))
    if (created) selectPoint(created)
  }
  function updateCurrentPoint(patch: Partial<Point>): void {
    if (selectedPointId.value) apply(updatePointInSelected(raw(), selectedPointId.value, patch))
  }
  function duplicatePoint(id: string): void {
    const before = pointIds()
    apply(duplicatePointInSelected(raw(), id))
    const created = pointIds().find((p) => !before.includes(p))
    if (created) selectPoint(created)
  }
  function removePoint(id: string): void {
    apply(removePointFromSelected(raw(), id))
    if (selectedPointId.value === id) selectedPointId.value = null
  }
  function movePointBy(id: string, direction: 'up' | 'down'): void {
    apply(movePointInSelected(raw(), id, direction))
  }

  // --- Variablen (Protokoll-Ebene) ---
  function variableIds(): string[] {
    return (selected.value?.variables ?? []).map((v) => v.id)
  }
  function selectVariable(id: string): void {
    selectedVariableId.value = id
  }
  function addVariable(type: string): void {
    const before = variableIds()
    apply(addVariableToSelected(raw(), defaultVariableInput(type)))
    const created = variableIds().find((id) => !before.includes(id))
    if (created) selectVariable(created)
  }
  function updateCurrentVariable(patch: Partial<Variable>): void {
    if (selectedVariableId.value) apply(updateVariableInSelected(raw(), selectedVariableId.value, patch))
  }
  function removeVariable(id: string): void {
    apply(removeVariableFromSelected(raw(), id))
    if (selectedVariableId.value === id) selectedVariableId.value = null
  }
  function variableReferences(id: string): VariableReference[] {
    return selectedVariableReferences(raw(), id)
  }

  // --- Sichtbarkeit (einfacher visibleIf-Editor) ---
  // input == null entfernt die Bedingung. Prädikat-Bau über createSimpleVisibleIf (Domain).
  function setCurrentBlockCondition(input: ConditionInput | null): void {
    if (!selectedBlockId.value) return
    const pred = input ? createSimpleVisibleIf(input) : null
    apply(setBlockVisibleIfInSelected(raw(), selectedBlockId.value, pred))
  }
  function setCurrentPointCondition(input: ConditionInput | null): void {
    if (!selectedPointId.value) return
    const pred = input ? createSimpleVisibleIf(input) : null
    apply(setPointVisibleIfInSelected(raw(), selectedPointId.value, pred))
  }

  // --- Import / Export (Session-Ebene; Datei/Clipboard bleibt im UI-Helfer) ---
  function importJson(jsonText: string): { ok: boolean; errors: string[]; warnings: string[] } {
    const out = importProtocolIntoSession(raw(), jsonText)
    if (out.ok) {
      apply(out.session)
      resetSelection()
    }
    return { ok: out.ok, errors: out.errors, warnings: out.warnings }
  }
  function exportSelected(): ExportOutcome {
    return exportSelectedProtocol(raw())
  }

  // --- Voll-Backup (#108 Teil 2): alle eigenen Protokolle exportieren/importieren ---
  function exportBackup(): ExportOutcome {
    return exportAllProtocols(raw())
  }
  function importBackup(
    jsonText: string,
  ): { ok: boolean; imported: number; errors: string[]; warnings: string[] } {
    const out = importBackupIntoSession(raw(), jsonText)
    if (out.ok) {
      apply(out.session)
      resetSelection()
    }
    return { ok: out.ok, imported: out.imported, errors: out.errors, warnings: out.warnings }
  }

  // --- Library (#13-F2): bewusstes Laden/Speichern, KEIN Auto-Save ---
  const storage = useStorage()
  async function loadFromLibrary(): Promise<void> {
    apply(await loadLibraryIntoSession(raw(), storage.getLibraryRepository()))
    resetSelection()
  }
  async function saveToLibrary(): Promise<LibraryOutcome> {
    return saveSelectedToLibrary(raw(), storage.getLibraryRepository())
  }

  // Aus Library einfügen (Copy-on-insert; bewusste Aktion, kein Live-Link).
  function insertLibraryBlock(libraryBlock: LibraryBlock): { ok: boolean; errors: string[] } {
    const r = insertLibraryBlockIntoSelectedProtocol(raw(), libraryBlock)
    if (r.ok) {
      apply(r.session)
      const last = selected.value?.blocks?.at(-1)
      if (last) selectBlock(last.id) // neuen Block aktiv setzen
    }
    return { ok: r.ok, errors: r.errors }
  }
  function insertLibrarySnippet(snippet: LibrarySnippet, targetBlockId?: string): { ok: boolean; errors: string[] } {
    const target = targetBlockId ?? selectedBlockId.value ?? ''
    const r = insertLibrarySnippetIntoSelectedProtocol(raw(), snippet, target)
    if (r.ok) apply(r.session)
    return { ok: r.ok, errors: r.errors }
  }

  // --- Auto-Persistenz (#108): Editor-Stand laden + laufend sichern --------------
  let restoring = true
  async function restore(): Promise<void> {
    try {
      const persisted = await loadPersistedSession()
      if (persisted && Array.isArray(persisted.protocols) && persisted.protocols.length) {
        const example = ensureProtocolPointIds(standardprotokoll)
        const others = persisted.protocols
          .filter((p) => p.id !== example.id)
          .map((p) => ensureProtocolPointIds(p))
        const protocols = [example, ...others]
        const sel: string | null = protocols.some((p) => p.id === persisted.selectedProtocolId)
          ? (persisted.selectedProtocolId ?? example.id ?? null)
          : (example.id ?? null)
        apply({ protocols, selectedProtocolId: sel })
        resetSelection()
      }
    } finally {
      restoring = false
    }
  }
  void restore()

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => session.protocols,
    () => {
      if (restoring) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => { void savePersistedSession(raw()) }, 800)
    },
    { deep: true },
  )

  resetSelection()

  return {
    session,
    selected,
    isExample,
    validation,
    json,
    selectedBlockId,
    selectedPointId,
    selectedVariableId,
    currentBlock,
    currentPoint,
    currentVariable,

    // Protokoll-Ebene
    select: selectProtocolAndReset,
    duplicate: () => { apply(duplicateSelectedProtocol(raw())); resetSelection() },
    rename: (title: string) => { if (isExample.value) return; apply(renameSelectedProtocol(raw(), title)) },
    remove: () => { if (isExample.value) return; apply(removeSelectedProtocol(raw())); resetSelection() },
    createNew: () => { apply(createNewProtocol(raw())); resetSelection() },

    // Block-Ebene
    selectBlock,
    addBlock,
    updateCurrentBlock,
    duplicateBlock,
    removeBlock,
    moveBlock: moveBlockBy,

    // Punkt-Ebene
    selectPoint,
    addPoint,
    updateCurrentPoint,
    duplicatePoint,
    removePoint,
    movePoint: movePointBy,

    // Variablen-Ebene
    selectVariable,
    addVariable,
    updateCurrentVariable,
    removeVariable,
    variableReferences,

    // Sichtbarkeit (visibleIf)
    setCurrentBlockCondition,
    setCurrentPointCondition,

    // Import / Export
    importJson,
    exportSelected,
    exportBackup,
    importBackup,

    // Library (#13-F2)
    libraryMode: storage.libraryMode,
    loadFromLibrary,
    saveToLibrary,

    // Aus Library einfügen (#13-F4)
    insertLibraryBlock,
    insertLibrarySnippet,
  }
}

/** Sinnvolle Defaults je Punkt-Typ beim Anlegen. */
function defaultPointInput(type: string): Partial<Point> & { type: string } {
  switch (type) {
    case 'finding':
      return { type, label: 'Neuer Befund', normal: '' }
    case 'findingGroup':
      return { type, key: '', label: 'Neue Gruppe', findings: [{ label: '', normal: '' }] }
    case 'list':
      return { type, label: 'Neue Liste', entries: [] }
    case 'text':
      return { type, content: '' }
    default:
      return { type: 'field', label: 'Neues Feld' }
  }
}

/** Sinnvolle Defaults je Variablen-Typ beim Anlegen. */
function defaultVariableInput(type: string): Partial<Variable> & { type: string } {
  switch (type) {
    case 'select':
      return { type, label: 'Neue Variable', options: [] }
    case 'boolean':
      return { type, label: 'Neue Variable', default: false }
    case 'number':
      return { type, label: 'Neue Variable' }
    default:
      return { type: 'text', label: 'Neue Variable' }
  }
}

export function useCreatorSession() {
  if (!shared) shared = create()
  return shared
}
