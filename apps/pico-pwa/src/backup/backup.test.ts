// node --test --experimental-strip-types --experimental-sqlite
// Slice 1 des lokalen Backups: Envelope bauen/parsen + STRIKT ADDITIVER Restore (nichts überschrieben,
// caseState nie enthalten). Headless gegen Memory-Repos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBackup, parseBackup, restoreBackup, BACKUP_SCHEMA, type RestoreTargets } from './backup.ts'
import { createContainer, createField, addChild } from '@resqdocs/protocol-core/creator'
import { createMemoryProtocolRepository } from '@resqdocs/protocol-core/protocolRepository'
import { createMemoryBlockRepository } from '@resqdocs/protocol-core/blockRepository'
import { emptyLibrary, type PznLibrary } from '../medications/pznLibrary.ts'
import type { Container } from '@resqdocs/protocol-core/model'

const proto = (id: string, title: string): Container => {
  let root = createContainer(id)
  root = addChild(root, id, createField(`${id}-f`)) as Container
  return { ...root, title }
}

const pznLib = (labels: Record<string, string>): PznLibrary => ({
  version: 2,
  entries: Object.fromEntries(
    Object.entries(labels).map(([pzn, label]) => [pzn, { wirkstoff: '', staerke: '', label, category: '', note: '' }]),
  ),
})

type Snip = { id: string; title: string; text: string }

function memTargets(seed?: { protocols?: Container[]; snippets?: Snip[]; pzn?: PznLibrary }) {
  const protoRepo = createMemoryProtocolRepository(seed?.protocols ?? [])
  const blockRepo = createMemoryBlockRepository([])
  let snippets: Snip[] = [...(seed?.snippets ?? [])]
  let pzn: PznLibrary = seed?.pzn ?? emptyLibrary()
  const targets: RestoreTargets = {
    loadProtocols: () => protoRepo.loadAll(),
    saveProtocol: (t) => protoRepo.save(t),
    loadBlocks: () => blockRepo.loadAll(),
    saveBlock: (t) => blockRepo.save(t),
    existingSnippetIds: async () => snippets.map((s) => s.id),
    saveSnippet: async (s) => {
      const i = snippets.findIndex((x) => x.id === s.id)
      if (i >= 0) snippets[i] = s
      else snippets.push(s)
    },
    loadPzn: async () => pzn,
    savePzn: async (l) => {
      pzn = l
    },
    resetProtocols: () => protoRepo.reset(),
    resetBlocks: () => blockRepo.reset(),
    resetSnippets: async () => {
      snippets = []
    },
    resetPzn: async () => {
      pzn = emptyLibrary()
    },
  }
  return { targets, protoRepo, blockRepo, snippets: () => snippets, pzn: () => pzn }
}

const APP = { version: '1.2.2', build: '13' }
// deterministischer id-Generator für reproduzierbare Tests
const detUuid = () => {
  let n = 0
  return () => `u${n++}`
}

test('buildBackup: Envelope-Grundform + Zähler', () => {
  const env = buildBackup({
    protocols: [proto('p1', 'A'), proto('p2', 'B')],
    blocks: [proto('b1', 'Block')],
    snippets: [{ title: 'T', text: 'x' }],
    pzn: pznLib({ '12345678': 'ASS' }),
    app: APP,
    createdAt: '2026-01-01T00:00:00.000Z',
  })
  assert.equal(env.schema, BACKUP_SCHEMA)
  assert.deepEqual(env.counts, { protocols: 2, blocks: 1, snippets: 1, pzn: 1 })
  assert.equal(env.sections.protocols.length, 2)
  assert.ok(env.pzn?.entries['12345678'])
})

test('keine Patientendaten/caseState im Envelope', () => {
  const env = buildBackup({ protocols: [proto('p1', 'A')], blocks: [], snippets: [], pzn: null, app: APP, createdAt: 't' })
  const json = JSON.stringify(env)
  assert.equal(json.includes('caseState'), false)
  assert.equal(json.includes('case.draft'), false)
  assert.deepEqual(Object.keys(env).sort(), ['app', 'counts', 'createdAt', 'pzn', 'schema', 'sections', 'version'])
})

test('leeres Snippet (Platzhalter) wird NICHT ins Envelope aufgenommen', () => {
  const env = buildBackup({
    protocols: [],
    blocks: [],
    snippets: [{ title: 'Leer', text: '   ' }, { title: 'Voll', text: 'x' }],
    pzn: null,
    app: APP,
    createdAt: 't',
  })
  assert.equal(env.counts.snippets, 1, 'nur das gefüllte Snippet zählt')
  assert.equal(env.sections.snippets.length, 1)
})

test('tief-korrupter Baum bricht den Restore NICHT ab (übersprungen, Rest läuft)', async () => {
  const env = buildBackup({
    protocols: [proto('p1', 'A')],
    blocks: [],
    snippets: [],
    pzn: pznLib({ '12345678': 'ASS' }),
    app: APP,
    createdAt: 't',
  })
  // shallow-valider, aber tief-invalider Protokoll-Envelope (children:[null]) -> importProtocol wirft
  env.sections.protocols.unshift(
    JSON.stringify({ schema: 'resqdocs-protocol', version: 1, tree: { type: 'container', id: 'bad', children: [null] } }),
  )
  const m = memTargets()
  const c = await restoreBackup(env, m.targets, { uuid: detUuid() })
  assert.equal(c.protocols, 1, 'die gültige Vorlage wird geschrieben')
  assert.ok(c.skipped >= 1, 'der korrupte Baum wird übersprungen')
  assert.equal((await m.protoRepo.loadAll()).length, 1)
  assert.equal(Object.keys(m.pzn().entries).length, 1, 'PZN nach dem defekten Eintrag wird trotzdem angewandt')
})

test('parseBackup: round-trip + Ablehnung fremder JSONs', () => {
  const env = buildBackup({ protocols: [proto('p1', 'A')], blocks: [], snippets: [], pzn: null, app: APP, createdAt: 't' })
  assert.equal(parseBackup(JSON.stringify(env)).ok, true)
  assert.equal(parseBackup('{"schema":"nope"}').ok, false)
  assert.equal(parseBackup('kein json').ok, false)
  assert.equal(parseBackup(JSON.stringify({ schema: BACKUP_SCHEMA, version: 999, sections: {} })).ok, false)
})

test('restore in leere DB: alles additiv angelegt', async () => {
  const env = buildBackup({
    protocols: [proto('p1', 'A'), proto('p2', 'B')],
    blocks: [proto('b1', 'Blk')],
    snippets: [{ title: 'S', text: 'text' }],
    pzn: pznLib({ '12345678': 'ASS' }),
    app: APP,
    createdAt: 't',
  })
  const m = memTargets()
  const c = await restoreBackup(env, m.targets, { uuid: detUuid() })
  assert.deepEqual(c, { protocols: 2, blocks: 1, snippets: 1, pzn: 1, skipped: 0 })
  assert.equal((await m.protoRepo.loadAll()).length, 2)
  assert.equal((await m.blockRepo.loadAll()).length, 1)
  assert.equal(m.snippets().length, 1)
  assert.equal(Object.keys(m.pzn().entries).length, 1)
})

test('restore in bevölkerte DB: bestehende bleiben, neue kommen dazu (nichts überschrieben)', async () => {
  const env = buildBackup({ protocols: [proto('p1', 'A')], blocks: [], snippets: [], pzn: null, app: APP, createdAt: 't' })
  const m = memTargets({ protocols: [proto('existing', 'Vorher')] })
  await restoreBackup(env, m.targets, { uuid: detUuid() })
  const all = await m.protoRepo.loadAll()
  assert.equal(all.length, 2)
  assert.ok(all.some((p) => p.id === 'existing' && p.title === 'Vorher'))
})

test('restore mit id-Kollision: re-id -> Duplikat als neu, Original NICHT überschrieben', async () => {
  const env = buildBackup({ protocols: [proto('dup', 'Neu')], blocks: [], snippets: [], pzn: null, app: APP, createdAt: 't' })
  const m = memTargets({ protocols: [proto('dup', 'Original')] })
  await restoreBackup(env, m.targets, { uuid: detUuid() })
  const all = await m.protoRepo.loadAll()
  assert.equal(all.length, 2, 'Duplikat als neu (nicht überschrieben)')
  assert.ok(all.some((p) => p.id === 'dup' && p.title === 'Original'))
})

test('Ersetzen-Modus: leert die Ziele vorher -> exakt der Snapshot-Stand', async () => {
  const env = buildBackup({ protocols: [proto('p1', 'A')], blocks: [], snippets: [], pzn: null, app: APP, createdAt: 't' })
  const m = memTargets({ protocols: [proto('alt', 'Alt')] }) // Live-Bibliothek hat einen anderen Stand
  await restoreBackup(env, m.targets, { uuid: detUuid(), mode: 'replace' })
  const all = await m.protoRepo.loadAll()
  assert.equal(all.length, 1, 'der alte Live-Stand ist ersetzt')
  assert.equal(all[0].id, 'p1')
})

test('defekte Sektionseinträge werden übersprungen, Rest restauriert', async () => {
  const env = buildBackup({ protocols: [proto('p1', 'A')], blocks: [], snippets: [], pzn: null, app: APP, createdAt: 't' })
  env.sections.protocols.push('{kaputt')
  env.sections.protocols.push(JSON.stringify({ schema: 'fremd', version: 1 }))
  const m = memTargets()
  const c = await restoreBackup(env, m.targets, { uuid: detUuid() })
  assert.equal(c.protocols, 1)
  assert.equal(c.skipped, 2)
  assert.equal((await m.protoRepo.loadAll()).length, 1)
})

test('PZN-Restore: Modus skip -> lokale Einträge gewinnen, nur fehlende ergänzt', async () => {
  const env = buildBackup({
    protocols: [],
    blocks: [],
    snippets: [],
    pzn: pznLib({ '11111111': 'IMPORT-A', '22222222': 'B' }),
    app: APP,
    createdAt: 't',
  })
  const m = memTargets({ pzn: pznLib({ '11111111': 'LOKAL-A' }) })
  const c = await restoreBackup(env, m.targets, { uuid: detUuid() })
  const e = m.pzn().entries
  assert.equal(c.pzn, 1, 'nur der fehlende Eintrag zählt als neu')
  assert.equal(Object.keys(e).length, 2)
  const a = e['11111111'] as { label: string }
  assert.equal(a.label, 'LOKAL-A', 'lokaler Eintrag bleibt unangetastet (skip)')
})
