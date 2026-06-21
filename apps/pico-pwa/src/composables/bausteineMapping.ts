import { createUniqueId } from '@resqdocs/protocol-core/creator/creator.mjs'
import type { Block } from '@resqdocs/protocol-core/creator/creator.mjs'
import type { LibraryBlock } from '@/storage/types'

/**
 * Reine Abbildung GEFÜLLTER Protokoll-Block → LibraryBlock-Baustein (Variante B,
 * #13-F4-Authoring). Ohne Vue/Storage, damit in node:test prüfbar.
 *
 * - **Tiefe Kopie** via JSON: proxy-sicher (currentBlock ist ein Vue-reactive-
 *   Proxy, auf dem structuredClone DataCloneError wirft — bug-089). Blöcke sind
 *   reine JSON-Daten (keine Funktionen/Dates), daher verlustfrei. Quelle bleibt
 *   unberührt → spätere Editor-Änderungen wirken nicht auf den Baustein zurück.
 * - **IDs werden übernommen** (Block-/Punkt-/findingGroup-Kind-ids). Beim späteren
 *   Einfügen remappt insertBlock ohnehin kollisionsfrei — hier kein Remap nötig.
 */
function deepCloneBlock(block: Block): Block {
  return JSON.parse(JSON.stringify(block)) as Block
}

export function buildLibraryBlock(
  block: Block,
  existingIds: Iterable<string>,
  now: string = new Date().toISOString(),
): LibraryBlock {
  const copy = deepCloneBlock(block)
  return {
    id: createUniqueId('baustein', new Set(existingIds)),
    title: copy.title,
    block: copy,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Variante A: einen bestehenden Baustein mit dem im Editor bearbeiteten Block
 * aktualisieren. Behält id + createdAt, ersetzt block (tiefe Kopie) + title,
 * setzt updatedAt. Reine Abbildung (testbar, kein Vue/Storage).
 */
export function applyBlockEdit(
  existing: LibraryBlock,
  block: Block,
  now: string = new Date().toISOString(),
): LibraryBlock {
  const copy = deepCloneBlock(block)
  return { ...existing, title: copy.title, block: copy, updatedAt: now }
}
