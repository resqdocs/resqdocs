// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
  addPointToSelected,
  updatePointInSelected,
  duplicatePointInSelected,
  removePointFromSelected,
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
} from './creatorSession.ts'
import { createMemoryLibraryRepository } from '../storage/memoryLibraryRepository.ts'
import { createSimpleVisibleIf, isSimpleVisibleIf, assertValidProtocolDraft } from '../../../../packages/shared/creator/creator.mjs'

const seed = JSON.parse(
  readFileSync(new URL('../../../../protocols/standardprotokoll.json', import.meta.url)),
)

test('Session initialisiert aus Seed (Auswahl = erstes Protokoll)', () => {
  const s = initCreatorSession([seed])
  assert.equal(s.protocols.length, 1)
  assert.equal(s.selectedProtocolId, seed.id)
  assert.equal(getSelected(s).id, seed.id)
})

test('init klont das Seed (kanonisches Objekt bleibt unberührt)', () => {
  const snap = JSON.stringify(seed)
  const s = initCreatorSession([seed])
  s.protocols[0].title = 'verändert'
  assert.equal(JSON.stringify(seed), snap)
})

test('Protokoll auswählen', () => {
  let s = initCreatorSession([seed])
  s = duplicateSelectedProtocol(s)
  const otherId = s.protocols[1].id
  const sel = selectProtocol(s, otherId)
  assert.equal(sel.selectedProtocolId, otherId)
  // unbekannte id ändert die Auswahl nicht
  assert.equal(selectProtocol(s, 'gibtsnicht').selectedProtocolId, s.selectedProtocolId)
})

test('Protokoll duplizieren: neue id, ausgewählt, Original unverändert', () => {
  const s = initCreatorSession([seed])
  const snap = JSON.stringify(s)
  const d = duplicateSelectedProtocol(s)
  assert.equal(d.protocols.length, 2)
  assert.notEqual(d.protocols[1].id, seed.id)
  assert.equal(d.selectedProtocolId, d.protocols[1].id)
  assert.equal(JSON.stringify(s), snap, 'Eingabe-Session unverändert')
})

test('Protokoll umbenennen: Titel ändert sich, id stabil', () => {
  const s = initCreatorSession([seed])
  const r = renameSelectedProtocol(s, 'Mein Protokoll')
  assert.equal(getSelected(r).title, 'Mein Protokoll')
  assert.equal(getSelected(r).id, seed.id)
})

test('Protokoll löschen: Auswahl fällt auf nächstes bzw. null', () => {
  let s = initCreatorSession([seed])
  s = duplicateSelectedProtocol(s) // 2 Protokolle, Auswahl = Kopie
  const removed = removeSelectedProtocol(s)
  assert.equal(removed.protocols.length, 1)
  assert.equal(removed.selectedProtocolId, removed.protocols[0].id)
  const empty = removeSelectedProtocol(removed)
  assert.equal(empty.protocols.length, 0)
  assert.equal(empty.selectedProtocolId, null)
  assert.equal(getSelected(empty), null)
})

test('neues Protokoll anlegen', () => {
  const s = createNewProtocol(initCreatorSession([seed]))
  assert.equal(s.protocols.length, 2)
  assert.equal(getSelected(s).title, 'Neues Protokoll')
})

test('Validierungsstatus wird berechnet (Seed ist gültig)', () => {
  const v = validateSelected(initCreatorSession([seed]))
  assert.equal(v.valid, true)
  assert.deepEqual(v.errors, [])
})

test('selectedJson ist ein read-only String, der zurück-parst', () => {
  const json = selectedJson(initCreatorSession([seed]))
  assert.equal(typeof json, 'string')
  assert.equal(JSON.parse(json).id, seed.id)
  assert.equal(selectedJson({ protocols: [], selectedProtocolId: null }), '')
})

test('keine caseState-Struktur in der Session', () => {
  let s = initCreatorSession([seed])
  s = createNewProtocol(s)
  const json = JSON.stringify(s)
  assert.ok(!/\"values\"|\"activeBlocks\"|\"variableValues\"|caseState/.test(json))
})

test('creatorSession nutzt KEINE Persistenz-API (Quelltext-Check, nur echte Aufrufe)', () => {
  const src = readFileSync(new URL('./creatorSession.ts', import.meta.url), 'utf8')
  // Match konkrete Nutzung (dotted/call), nicht die Erwähnung im Kommentar.
  assert.ok(!/localStorage\.|sessionStorage\.|indexedDB\.|\.setItem\(|Preferences\.|caches\.|fetch\(/.test(src))
})

// --- #13-C: Block-/Punkt-Bearbeitung des ausgewählten Protokolls ---

function fresh() {
  // leeres, gültiges Arbeitsprotokoll als Session
  return { protocols: [{ schemaVersion: '0.1.0', id: 'p', title: 'P', blocks: [], variables: [] }], selectedProtocolId: 'p' }
}

test('Block hinzufügen über Session-Action', () => {
  const s = addBlockToSelected(fresh(), { title: 'Block A' })
  assert.equal(getSelected(s).blocks.length, 1)
  assert.equal(getSelected(s).blocks[0].title, 'Block A')
  assert.equal(getSelected(s).blocks[0].optional, false)
})

test('Blocktitel bearbeiten + optional setzen', () => {
  let s = addBlockToSelected(fresh(), { title: 'B' })
  const id = getSelected(s).blocks[0].id
  s = updateBlockInSelected(s, id, { title: 'Neu' })
  s = updateBlockInSelected(s, id, { optional: true })
  assert.equal(getSelected(s).blocks[0].title, 'Neu')
  assert.equal(getSelected(s).blocks[0].optional, true)
})

test('Block duplizieren erzeugt einen zweiten Block mit neuer id', () => {
  let s = addBlockToSelected(fresh(), { title: 'B' })
  const id = getSelected(s).blocks[0].id
  s = duplicateBlockInSelected(s, id)
  assert.equal(getSelected(s).blocks.length, 2)
  assert.notEqual(getSelected(s).blocks[1].id, id)
})

test('Block löschen', () => {
  let s = addBlockToSelected(fresh(), { title: 'B' })
  const id = getSelected(s).blocks[0].id
  s = removeBlockFromSelected(s, id)
  assert.equal(getSelected(s).blocks.length, 0)
})

test('Punkt hinzufügen für jeden Typ', () => {
  let s = addBlockToSelected(fresh(), { title: 'B' })
  const b = getSelected(s).blocks[0].id
  s = addPointToSelected(s, b, { type: 'field', label: 'F' })
  s = addPointToSelected(s, b, { type: 'finding', label: 'Bef', normal: 'o.B.' })
  s = addPointToSelected(s, b, { type: 'findingGroup', key: 'A', findings: [{ label: 'x', normal: 'frei' }] })
  s = addPointToSelected(s, b, { type: 'list', label: 'L', entries: ['a'] })
  s = addPointToSelected(s, b, { type: 'text', content: 'Hinweis' })
  assert.deepEqual(getSelected(s).blocks[0].points.map((p) => p.type), ['field', 'finding', 'findingGroup', 'list', 'text'])
  assert.equal(validateSelected(s).valid, true)
})

test('Punkt bearbeiten, duplizieren, löschen', () => {
  let s = addBlockToSelected(fresh(), { title: 'B' })
  const b = getSelected(s).blocks[0].id
  s = addPointToSelected(s, b, { type: 'finding', id: 'f', label: 'Bef', normal: 'o.B.' })
  s = updatePointInSelected(s, 'f', { normal: 'auffällig' })
  assert.equal(getSelected(s).blocks[0].points[0].normal, 'auffällig')
  s = duplicatePointInSelected(s, 'f')
  assert.equal(getSelected(s).blocks[0].points.length, 2)
  assert.notEqual(getSelected(s).blocks[0].points[1].id, 'f')
  s = removePointFromSelected(s, 'f')
  assert.equal(getSelected(s).blocks[0].points.length, 1)
})

test('Validierung aktualisiert sich nach Änderung', () => {
  let s = addBlockToSelected(fresh(), { title: 'B' })
  assert.equal(validateSelected(s).valid, true)
  // findingGroup ohne key ist ungültig
  const b = getSelected(s).blocks[0].id
  s = addPointToSelected(s, b, { type: 'findingGroup', key: 'A', findings: [{ label: 'x', normal: 'y' }] })
  s = updatePointInSelected(s, getSelected(s).blocks[0].points[0].id, { key: '' })
  const v = validateSelected(s)
  assert.equal(v.valid, false)
  assert.ok(v.errors.some((e) => /ohne key/.test(e)))
})

test('Block-/Punkt-Aktionen mutieren die Eingabe-Session nicht', () => {
  const s = addBlockToSelected(fresh(), { title: 'B' })
  const snap = JSON.stringify(s)
  const b = getSelected(s).blocks[0].id
  addPointToSelected(s, b, { type: 'text', content: 'x' })
  updateBlockInSelected(s, b, { optional: true })
  duplicateBlockInSelected(s, b)
  removeBlockFromSelected(s, b)
  assert.equal(JSON.stringify(s), snap)
})

// --- #13-D: Variablen ---

test('Variable hinzufügen für alle 4 Typen', () => {
  let s = fresh()
  s = addVariableToSelected(s, { type: 'select', label: 'Geschlecht', options: [{ value: 'w', label: 'weiblich' }], default: 'w', grammar: 'de-gender' })
  s = addVariableToSelected(s, { type: 'boolean', label: 'Raucher', default: false })
  s = addVariableToSelected(s, { type: 'text', label: 'Klinik' })
  s = addVariableToSelected(s, { type: 'number', label: 'Alter', default: 50 })
  assert.deepEqual(getSelected(s).variables.map((v) => v.type), ['select', 'boolean', 'text', 'number'])
  assert.equal(validateSelected(s).valid, true)
})

test('Variable bearbeiten + select-Optionen ändern', () => {
  let s = addVariableToSelected(fresh(), { type: 'select', id: 'g', label: 'G', options: [{ value: 'w', label: 'weiblich' }] })
  s = updateVariableInSelected(s, 'g', { label: 'Geschlecht' })
  s = updateVariableInSelected(s, 'g', { options: [{ value: 'w', label: 'weiblich' }, { value: 'm', label: 'männlich' }] })
  const v = getSelected(s).variables[0]
  assert.equal(v.label, 'Geschlecht')
  assert.equal(v.options.length, 2)
})

test('Variable löschen ohne Referenzen', () => {
  let s = addVariableToSelected(fresh(), { type: 'text', id: 'k', label: 'Klinik' })
  assert.deepEqual(selectedVariableReferences(s, 'k'), [])
  s = removeVariableFromSelected(s, 'k')
  assert.equal(getSelected(s).variables.length, 0)
})

test('Variable mit Referenz: selectedVariableReferences findet sie (UI blockiert)', () => {
  let s = addVariableToSelected(fresh(), { type: 'select', id: 'g', label: 'G', options: [{ value: 'w', label: 'w' }] })
  s = addBlockToSelected(s, { title: 'B' })
  const b = getSelected(s).blocks[0].id
  s = addPointToSelected(s, b, { type: 'text', content: 'Hallo {{var:g}}', visibleIf: { var: 'g', eq: 'w' } })
  const refs = selectedVariableReferences(s, 'g')
  assert.ok(refs.length >= 2)
  assert.ok(refs.some((r) => r.kind === 'placeholder'))
  assert.ok(refs.some((r) => r.kind === 'visibleIf'))
})

// --- #13-D: einfaches visibleIf an Block/Punkt ---

test('einfache visibleIf-Regel für Block setzen und entfernen', () => {
  let s = addBlockToSelected(fresh(), { title: 'B' })
  const b = getSelected(s).blocks[0].id
  s = setBlockVisibleIfInSelected(s, b, createSimpleVisibleIf({ source: 'var', id: 'g', op: 'eq', value: 'w' }))
  assert.deepEqual(getSelected(s).blocks[0].visibleIf, { var: 'g', eq: 'w' })
  s = setBlockVisibleIfInSelected(s, b, null)
  assert.ok(!('visibleIf' in getSelected(s).blocks[0]))
})

test('einfache visibleIf-Regel für Punkt setzen und entfernen', () => {
  let s = addBlockToSelected(fresh(), { title: 'B' })
  const b = getSelected(s).blocks[0].id
  s = addPointToSelected(s, b, { type: 'field', id: 'f', label: 'F' })
  s = setPointVisibleIfInSelected(s, 'f', createSimpleVisibleIf({ source: 'point', id: 'x', op: 'state', value: 'abnormal' }))
  assert.deepEqual(getSelected(s).blocks[0].points[0].visibleIf, { point: 'x', state: 'abnormal' })
  s = setPointVisibleIfInSelected(s, 'f', null)
  assert.ok(!('visibleIf' in getSelected(s).blocks[0].points[0]))
})

test('komplexe visibleIf-Regel wird als nicht-simpel erkannt', () => {
  assert.equal(isSimpleVisibleIf({ all: [{ var: 'g', eq: 'w' }, { var: 'r', truthy: true }] }), false)
  assert.equal(isSimpleVisibleIf({ var: 'g', eq: 'w' }), true)
})

test('select ohne options wird abgelehnt (updateVariable wirft)', () => {
  const s = addVariableToSelected(fresh(), { type: 'select', id: 'g', label: 'G', options: [{ value: 'w', label: 'w' }] })
  assert.throws(() => updateVariableInSelected(s, 'g', { options: undefined }), /options/)
})

test('Validierung aktualisiert sich nach Variablen-/visibleIf-Änderung', () => {
  let s = fresh()
  s = addVariableToSelected(s, { type: 'select', id: 'g', label: 'G', options: [{ value: 'w', label: 'w' }] })
  assert.equal(validateSelected(s).valid, true)
  // Ein strukturell ungültiges visibleIf (z. B. via Import) ⇒ Validierung schlägt an.
  s = addBlockToSelected(s, { title: 'B' })
  const b = getSelected(s).blocks[0].id
  s = addPointToSelected(s, b, { type: 'field', id: 'f', label: 'F' })
  s = setPointVisibleIfInSelected(s, 'f', { bogus: 1 })
  const v = validateSelected(s)
  assert.equal(v.valid, false)
  assert.ok(v.errors.some((e) => /ungültiges visibleIf/.test(e)))
})

// --- #13-E: Import / Export ---

test('gültiges Protokoll importieren wird aufgenommen und ausgewählt', () => {
  const s = fresh()
  const json = JSON.stringify({ schemaVersion: '0.1.0', id: 'imp', title: 'Importiert', blocks: [] })
  const out = importProtocolIntoSession(s, json)
  assert.equal(out.ok, true)
  assert.equal(out.session.protocols.length, 2)
  assert.equal(out.session.selectedProtocolId, 'imp')
  assert.equal(getSelected(out.session).title, 'Importiert')
})

test('Import vergibt bei id-Kollision eine neue id', () => {
  const s = fresh() // enthält Protokoll 'p'
  const json = JSON.stringify({ schemaVersion: '0.1.0', id: 'p', title: 'Kollision', blocks: [] })
  const out = importProtocolIntoSession(s, json)
  assert.equal(out.ok, true)
  assert.notEqual(out.session.protocols[1].id, 'p')
  assert.equal(out.session.protocols.length, 2)
})

test('ungültiges JSON ablehnen, Session unverändert', () => {
  const s = fresh()
  const snap = JSON.stringify(s)
  const out = importProtocolIntoSession(s, '{ kaputt ')
  assert.equal(out.ok, false)
  assert.ok(out.errors[0].includes('Ungültiges JSON'))
  assert.equal(out.session, s)
  assert.equal(JSON.stringify(s), snap)
})

test('strukturell ungültiges Protokoll ablehnen, Session unverändert', () => {
  const s = fresh()
  const out = importProtocolIntoSession(s, JSON.stringify({ schemaVersion: '0.1.0', id: 'x', title: '', blocks: [] }))
  assert.equal(out.ok, false)
  assert.ok(out.errors.length > 0)
  assert.equal(out.session.protocols.length, 1)
})

test('Export des ausgewählten gültigen Protokolls erzeugt JSON + Dateiname', () => {
  let s = fresh()
  s = renameSelectedProtocol(s, 'Mein Protokoll')
  const out = exportSelectedProtocol(s)
  assert.equal(out.ok, true)
  assert.equal(JSON.parse(out.json).title, 'Mein Protokoll')
  assert.match(out.filename, /^resqdocs-protocol-mein-protokoll-0\.1\.0\.json$/)
})

test('Export eines ungültigen Protokolls wird blockiert', () => {
  const s = { protocols: [{ schemaVersion: '0.1.0', id: 'p', title: '', blocks: [] }], selectedProtocolId: 'p' }
  const out = exportSelectedProtocol(s)
  assert.equal(out.ok, false)
  assert.equal(out.json, undefined)
  assert.ok(out.errors.length > 0)
})

test('Import/Export-Helfer nutzen keine Persistenz-API (Quelltext-Check)', () => {
  const src = readFileSync(new URL('./creatorSession.ts', import.meta.url), 'utf8')
  assert.ok(!/localStorage\.|sessionStorage\.|indexedDB\.|\.setItem\(|Preferences\.|caches\.|fetch\(|Blob|navigator\./.test(src))
})

test('importiertes Protokoll enthält keine caseState-Struktur', () => {
  const s = fresh()
  const out = importProtocolIntoSession(s, JSON.stringify({ schemaVersion: '0.1.0', id: 'imp', title: 'I', blocks: [] }))
  assert.ok(!/\"values\"|\"activeBlocks\"|\"variableValues\"|caseState/.test(JSON.stringify(out.session)))
})

// --- #13-F2: Session <-> Library (gegen Memory-Repo) ---

/** zählt saveProtocol-Aufrufe, um „kein Auto-Save" zu prüfen. */
function countingRepo() {
  const inner = createMemoryLibraryRepository()
  let saves = 0
  return {
    saves: () => saves,
    loadProtocols: () => inner.loadProtocols(),
    saveProtocol: (p) => { saves++; return inner.saveProtocol(p) },
    deleteProtocol: (id) => inner.deleteProtocol(id),
    resetLibrary: () => inner.resetLibrary(),
  }
}

test('Creator-Session kann aus Library laden (Merge, Library gewinnt)', async () => {
  const repo = createMemoryLibraryRepository([
    { schemaVersion: '0.1.0', id: 'lib1', title: 'Aus Library', blocks: [], variables: [] },
  ])
  const out = await loadLibraryIntoSession(fresh(), repo)
  assert.ok(out.protocols.some((p) => p.id === 'lib1'))
  assert.ok(out.protocols.some((p) => p.id === 'p')) // Arbeitsprotokoll bleibt
})

test('Creator-Session kann ausgewähltes Protokoll bewusst speichern', async () => {
  const repo = createMemoryLibraryRepository()
  const res = await saveSelectedToLibrary(fresh(), repo)
  assert.equal(res.ok, true)
  assert.deepEqual((await repo.loadProtocols()).map((p) => p.id), ['p'])
})

test('Speichern blockiert ungültiges ausgewähltes Protokoll', async () => {
  const repo = createMemoryLibraryRepository()
  const bad = { protocols: [{ schemaVersion: '0.1.0', id: 'p', title: '', blocks: [] }], selectedProtocolId: 'p' }
  const res = await saveSelectedToLibrary(bad, repo)
  assert.equal(res.ok, false)
  assert.equal((await repo.loadProtocols()).length, 0)
})

test('kein Auto-Save: Editier-Aktionen speichern NICHT in die Library', async () => {
  const repo = countingRepo()
  let s = fresh()
  s = addBlockToSelected(s, { title: 'B' })
  const b = getSelected(s).blocks[0].id
  s = addPointToSelected(s, b, { type: 'text', content: 'x' })
  s = addVariableToSelected(s, { type: 'text', id: 'v', label: 'V' })
  assert.equal(repo.saves(), 0, 'keine Editier-Aktion löst ein Speichern aus')
  await saveSelectedToLibrary(s, repo)
  assert.equal(repo.saves(), 1, 'nur die bewusste Aktion speichert')
})

// --- #13-F4: Library-Bausteine/Snippets in Protokoll einfügen (copy-on-insert) ---

const libBlockF4 = (id, title) => ({
  id, title,
  block: {
    id: `blk-${id}`, title,
    points: [
      { type: 'finding', id: 'src', normal: 'x' },
      { type: 'field', id: 'dep', label: 'D', visibleIf: { point: 'src', state: 'abnormal' } },
    ],
  },
  createdAt: '2026', updatedAt: '2026',
})
const libSnippetF4 = (id, title, text) => ({ id, title, text, createdAt: '2026', updatedAt: '2026' })

test('LibraryBlock wird als neuer Block eingefügt; Kopie, keine Referenz', () => {
  const lib = libBlockF4('L', 'Mitfahrtverweigerung')
  const libSnap = JSON.stringify(lib)
  const out = insertLibraryBlockIntoSelectedProtocol(fresh(), lib)
  assert.equal(out.ok, true)
  assert.equal(getSelected(out.session).blocks.length, 1)
  assert.equal(getSelected(out.session).blocks[0].title, 'Mitfahrtverweigerung')
  // Library/Quelle unverändert
  assert.equal(JSON.stringify(lib), libSnap)
  // spätere Mutation der Library beeinflusst das Protokoll nicht (Kopie)
  lib.block.title = 'verändert'
  assert.equal(getSelected(out.session).blocks[0].title, 'Mitfahrtverweigerung')
})

test('Eingefügter Block: kollisionsfreie IDs + interne visibleIf-Referenz remappt', () => {
  // Zielprotokoll hat bereits einen Punkt 'src' → Kollision erzwingen
  let s = fresh()
  s = addBlockToSelected(s, { id: 'b0', title: 'B0' })
  s = addPointToSelected(s, 'b0', { type: 'finding', id: 'src', normal: 'vorhanden' })
  const out = insertLibraryBlockIntoSelectedProtocol(s, libBlockF4('L', 'E'))
  assert.equal(out.ok, true)
  const inserted = getSelected(out.session).blocks[1]
  const ids = getSelected(out.session).blocks.flatMap((b) => b.points.map((p) => p.id))
  assert.equal(new Set(ids).size, ids.length, 'alle Punkt-ids eindeutig')
  const dep = inserted.points.find((p) => p.type === 'field')
  const newSrc = inserted.points.find((p) => p.type === 'finding')
  assert.equal(dep.visibleIf.point, newSrc.id, 'interne Referenz auf neue id remappt')
  assert.notEqual(dep.visibleIf.point, 'src')
  assert.equal(assertValidProtocolDraft(getSelected(out.session)).valid, true)
})

test('Snippet wird als text-Punkt in Zielblock eingefügt; Snippet unverändert', () => {
  let s = addBlockToSelected(fresh(), { title: 'Ziel' })
  const blockId = getSelected(s).blocks[0].id
  const snip = libSnippetF4('s', 'Hinweis', 'Neutraler Text')
  const snap = JSON.stringify(snip)
  const out = insertLibrarySnippetIntoSelectedProtocol(s, snip, blockId)
  assert.equal(out.ok, true)
  const pts = getSelected(out.session).blocks.find((b) => b.id === blockId).points
  const text = pts.find((p) => p.type === 'text')
  assert.equal(text.content, 'Neutraler Text')
  assert.equal(JSON.stringify(snip), snap, 'Snippet unverändert')
  assert.equal(assertValidProtocolDraft(getSelected(out.session)).valid, true)
})

test('Snippet ohne gültigen Zielblock wird abgelehnt', () => {
  const out = insertLibrarySnippetIntoSelectedProtocol(fresh(), libSnippetF4('s', 'T', 'x'), 'gibtsnicht')
  assert.equal(out.ok, false)
  assert.ok(out.errors[0].includes('Zielblock'))
})

test('Einfügen mutiert die Eingabe-Session nicht', () => {
  let s = addBlockToSelected(fresh(), { title: 'Ziel' })
  const blockId = getSelected(s).blocks[0].id
  const snap = JSON.stringify(s)
  insertLibraryBlockIntoSelectedProtocol(s, libBlockF4('L', 'E'))
  insertLibrarySnippetIntoSelectedProtocol(s, libSnippetF4('s', 'T', 'x'), blockId)
  assert.equal(JSON.stringify(s), snap)
})

test('REGRESSION bug-089: Transformationen vertragen Vue-reactive-Sessions (DataCloneError)', async () => {
  const { reactive } = await import('vue')
  const session = reactive(fresh())
  // vorher: structuredClone(reactive(...)) warf DataCloneError bei jedem +Block/+Punkt
  const out = addBlockToSelected(session, { title: 'Reaktiver Block' })
  assert.ok(getSelected(out).blocks.some((b) => b.title === 'Reaktiver Block'))
  const out2 = addPointToSelected(out, getSelected(out).blocks[0].id, { type: 'field', label: 'F' })
  assert.ok(getSelected(out2).blocks[0].points.length >= 1)
})

test('REGRESSION #66: Seeds ohne Punkt-IDs (findingGroups) bekommen eindeutige IDs', () => {
  const seed = {
    schemaVersion: '0.1.0', id: 'seed', title: 'Seed', lang: 'de', variables: [],
    blocks: [{ id: 'xabcde', title: 'xABCDE', points: [
      { type: 'findingGroup', key: 'A', findings: [{ id: 'a1', normal: 'frei' }] },
      { type: 'findingGroup', key: 'B', findings: [{ id: 'b1', normal: 'vesikulär' }] },
    ] }],
  } as never
  const session = initCreatorSession([seed])
  const pts = getSelected(session)!.blocks[0].points
  assert.ok(pts[0].id && pts[1].id, 'beide Gruppen haben IDs')
  assert.notEqual(pts[0].id, pts[1].id, 'IDs sind eindeutig')
  // Vorher unmoeglich: gezielte Bearbeitung einer Gruppe (z. B. collapsible, #42)
  const out = updatePointInSelected(session, pts[1].id as string, { collapsible: true } as never)
  const updated = getSelected(out)!.blocks[0].points
  assert.equal((updated[1] as { collapsible?: boolean }).collapsible, true)
  assert.equal((updated[0] as { collapsible?: boolean }).collapsible, undefined)
})

// --- Voll-Backup (#108 Teil 2) ------------------------------------------------

test('Voll-Backup: exportiert nur eigene Protokolle (ohne Beispiel-Vorlage)', () => {
  let s = initCreatorSession([seed]) // enthaelt die Beispiel-Vorlage (example: true)
  s = createNewProtocol(s) // ein eigenes Protokoll dazu
  const out = exportAllProtocols(s)
  assert.equal(out.ok, true)
  const backup = JSON.parse(out.json as string)
  assert.equal(backup.kind, 'resqdocs-backup')
  assert.equal(backup.protocols.length, 1) // nur das eigene, nicht das Beispiel
  assert.ok(!backup.protocols.some((p) => p.example))
})

test('Voll-Backup: ohne eigene Protokolle nicht moeglich', () => {
  const out = exportAllProtocols(initCreatorSession([seed])) // nur die Beispiel-Vorlage
  assert.equal(out.ok, false)
})

test('Voll-Backup: Import ist additiv, re-id-t Kollisionen, entfernt example-Flag', () => {
  const s = initCreatorSession([seed])
  const backup = JSON.stringify({
    kind: 'resqdocs-backup',
    protocols: [
      { schemaVersion: '0.1.0', id: 'standard', title: 'Kollidiert', example: true, blocks: [] },
      { schemaVersion: '0.1.0', id: 'mein', title: 'Mein Protokoll', blocks: [] },
    ],
  })
  const r = importBackupIntoSession(s, backup)
  assert.equal(r.ok, true)
  assert.equal(r.imported, 2)
  assert.equal(r.session.protocols.length, 3) // Beispiel bleibt + 2 neue
  const collided = r.session.protocols.find((p) => p.title === 'Kollidiert')
  assert.notEqual(collided.id, 'standard') // neu vergeben (kollidierte mit Beispiel)
  assert.ok(!collided.example) // example-Flag nicht uebernommen
})

test('Voll-Backup: Round-Trip (export -> import in frische Session)', () => {
  const out = exportAllProtocols(createNewProtocol(initCreatorSession([seed])))
  const r = importBackupIntoSession(initCreatorSession([seed]), out.json as string)
  assert.equal(r.ok, true)
  assert.equal(r.imported, 1)
})

test('Voll-Backup: ungueltige Eintraege werden uebersprungen', () => {
  const r = importBackupIntoSession(initCreatorSession([seed]), JSON.stringify({ protocols: [{ nonsense: true }] }))
  assert.equal(r.ok, false)
  assert.equal(r.imported, 0)
  assert.ok(r.errors.length >= 1)
})

test('Voll-Backup: Import mutiert die Eingabe-Session nicht', () => {
  const s = initCreatorSession([seed])
  const before = s.protocols.length
  importBackupIntoSession(s, JSON.stringify({ protocols: [{ schemaVersion: '0.1.0', id: 'x', title: 'X', blocks: [] }] }))
  assert.equal(s.protocols.length, before) // Original unveraendert (neue Session zurueckgegeben)
})
