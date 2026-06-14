// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createFakeKeyValueAdapter } from './keyValueAdapter.ts'
import { createSettingsRepository, SETTINGS_KEY } from './settingsRepository.ts'
import { createMemoryLibraryRepository } from './memoryLibraryRepository.ts'
import { DEFAULT_SETTINGS } from './types.ts'

// --- Settings (gegen Fake-Adapter) ---

test('Default-Settings laden, wenn nichts gespeichert ist', async () => {
  const repo = createSettingsRepository(createFakeKeyValueAdapter())
  assert.deepEqual(await repo.loadSettings(), DEFAULT_SETTINGS)
})

test('Settings speichern und laden (Round-Trip)', async () => {
  const adapter = createFakeKeyValueAdapter()
  const repo = createSettingsRepository(adapter)
  await repo.saveSettings({ defaultOs: 'ios', theme: 'dark', lastSelectedProtocolId: 'p1', defaultProtocolId: 'p2', privacyNoticeAccepted: true, picoBaseUrl: 'http://10.0.0.5', themeFamily: 'resqdocs' as const, dismissedHints: ['tristate'], headingPattern: '## {titel} ', headingFill: '-', headingWidth: 40, pznAutoCheck: true })
  assert.deepEqual(await repo.loadSettings(), { defaultOs: 'ios', theme: 'dark', lastSelectedProtocolId: 'p1', defaultProtocolId: 'p2', privacyNoticeAccepted: true, picoBaseUrl: 'http://10.0.0.5', themeFamily: 'resqdocs' as const, dismissedHints: ['tristate'], headingPattern: '## {titel} ', headingFill: '-', headingWidth: 40, pznAutoCheck: true })
})

test('Settings zurücksetzen', async () => {
  const adapter = createFakeKeyValueAdapter()
  const repo = createSettingsRepository(adapter)
  await repo.saveSettings({ ...DEFAULT_SETTINGS, defaultOs: 'mac_de' })
  await repo.resetSettings()
  assert.deepEqual(await repo.loadSettings(), DEFAULT_SETTINGS)
  assert.equal(adapter.dump()[SETTINGS_KEY], undefined)
})

test('Settings-Repository speichert NUR die bekannten Felder (kein Protokoll/Fremddaten)', async () => {
  const adapter = createFakeKeyValueAdapter()
  const repo = createSettingsRepository(adapter)
  // Fremddaten (z. B. versehentlich ein Protokoll/Patientenfeld) werden verworfen.
  await repo.saveSettings({
    defaultOs: 'win_de', theme: 'system', lastSelectedProtocolId: null, privacyNoticeAccepted: false,
    // @ts-expect-error absichtlich unerlaubte Felder
    protocols: [{ id: 'x' }], patientName: 'Mustermann',
  })
  const stored = JSON.parse(adapter.dump()[SETTINGS_KEY])
  assert.deepEqual(Object.keys(stored).sort(), ['defaultOs', 'defaultProtocolId', 'dismissedHints', 'headingFill', 'headingPattern', 'headingWidth', 'lastSelectedProtocolId', 'picoBaseUrl', 'privacyNoticeAccepted', 'pznAutoCheck', 'theme', 'themeFamily'])
  assert.ok(!('protocols' in stored) && !('patientName' in stored))
})

test('picoBaseUrl: nur http(s) erlaubt, sonst Default', async () => {
  const adapter = createFakeKeyValueAdapter()
  const repo = createSettingsRepository(adapter)
  await repo.saveSettings({ ...DEFAULT_SETTINGS, picoBaseUrl: 'javascript:alert(1)' })
  assert.equal((await repo.loadSettings()).picoBaseUrl, DEFAULT_SETTINGS.picoBaseUrl)
  await repo.saveSettings({ ...DEFAULT_SETTINGS, picoBaseUrl: 'http://10.0.0.9' })
  assert.equal((await repo.loadSettings()).picoBaseUrl, 'http://10.0.0.9')
})

test('defekter Settings-JSON ⇒ Defaults', async () => {
  const adapter = createFakeKeyValueAdapter({ [SETTINGS_KEY]: '{ kaputt' })
  const repo = createSettingsRepository(adapter)
  assert.deepEqual(await repo.loadSettings(), DEFAULT_SETTINGS)
})

// --- Library (In-Memory-Fake) ---

const proto = (id: string, title = id) => ({ schemaVersion: '0.1.0', id, title, blocks: [], variables: [] })

test('Library-Fake: Protokolle laden (Kopien, keine Mutation)', async () => {
  const repo = createMemoryLibraryRepository([proto('a'), proto('b')])
  const list = await repo.loadProtocols()
  assert.deepEqual(list.map((p) => p.id), ['a', 'b'])
  list[0].title = 'verändert'
  assert.equal((await repo.loadProtocols())[0].title, 'a')
})

test('Library-Fake: Protokoll speichern (anlegen + aktualisieren)', async () => {
  const repo = createMemoryLibraryRepository()
  await repo.saveProtocol(proto('a', 'A'))
  await repo.saveProtocol(proto('a', 'A2'))
  await repo.saveProtocol(proto('b', 'B'))
  const list = await repo.loadProtocols()
  assert.equal(list.length, 2)
  assert.equal(list.find((p) => p.id === 'a').title, 'A2')
})

test('Library-Fake: Protokoll löschen', async () => {
  const repo = createMemoryLibraryRepository([proto('a'), proto('b')])
  await repo.deleteProtocol('a')
  assert.deepEqual((await repo.loadProtocols()).map((p) => p.id), ['b'])
})

test('Library-Fake: reset', async () => {
  const repo = createMemoryLibraryRepository([proto('a')])
  await repo.resetLibrary()
  assert.deepEqual(await repo.loadProtocols(), [])
})

// --- #13-F3: Bausteine + Snippets im Memory-Fake ---

const libBlock = (id: string, title = id) => ({
  id, title, block: { id: `blk-${id}`, title, points: [] }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})
const libSnippet = (id: string, title = id, text = 'Neutraler Text') => ({
  id, title, text, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})

test('Library-Fake: Bausteine speichern/laden/löschen', async () => {
  const repo = createMemoryLibraryRepository()
  await repo.saveBlock(libBlock('a', 'Mitfahrtverweigerung'))
  await repo.saveBlock(libBlock('b'))
  assert.deepEqual((await repo.loadBlocks()).map((b) => b.id).sort(), ['a', 'b'])
  await repo.deleteBlock('a')
  assert.deepEqual((await repo.loadBlocks()).map((b) => b.id), ['b'])
})

test('Library-Fake: ungültiger Baustein wird abgelehnt', async () => {
  const repo = createMemoryLibraryRepository()
  await assert.rejects(() => repo.saveBlock({ id: 'x', title: '', block: { id: 'b', title: '', points: [] }, createdAt: '', updatedAt: '' }), /ungültig/)
  assert.deepEqual(await repo.loadBlocks(), [])
})

test('Library-Fake: Snippets speichern/bearbeiten/löschen', async () => {
  const repo = createMemoryLibraryRepository()
  await repo.saveSnippet(libSnippet('s1', 'Hinweis', 'Text A'))
  await repo.saveSnippet(libSnippet('s1', 'Hinweis', 'Text B')) // update
  assert.equal((await repo.loadSnippets()).find((s) => s.id === 's1').text, 'Text B')
  await repo.deleteSnippet('s1')
  assert.deepEqual(await repo.loadSnippets(), [])
})

test('Library-Fake: resetLibrary löscht Protokolle, Blöcke UND Snippets', async () => {
  const repo = createMemoryLibraryRepository([proto('p')], { blocks: [libBlock('b')], snippets: [libSnippet('s')] })
  await repo.resetLibrary()
  assert.deepEqual(await repo.loadProtocols(), [])
  assert.deepEqual(await repo.loadBlocks(), [])
  assert.deepEqual(await repo.loadSnippets(), [])
})

// --- #14-A: Reset-Trennung (Library vs. Settings) ---

test('Library-Reset lässt Settings unberührt; Settings-Reset lässt Library unberührt', async () => {
  const adapter = createFakeKeyValueAdapter()
  const settingsRepo = createSettingsRepository(adapter)
  await settingsRepo.saveSettings({ defaultOs: 'ios', theme: 'dark', lastSelectedProtocolId: null, privacyNoticeAccepted: true })

  // Library-Reset → Settings bleiben
  const lib = createMemoryLibraryRepository([proto('p')], { blocks: [libBlock('b')], snippets: [libSnippet('s')] })
  await lib.resetLibrary()
  assert.deepEqual(await lib.loadProtocols(), [])
  assert.equal((await settingsRepo.loadSettings()).defaultOs, 'ios', 'Settings unberührt nach Library-Reset')

  // Settings-Reset → Library bleibt
  const lib2 = createMemoryLibraryRepository([proto('p')])
  await settingsRepo.resetSettings()
  assert.deepEqual(await settingsRepo.loadSettings(), DEFAULT_SETTINGS, 'nur Settings zurückgesetzt')
  assert.equal((await lib2.loadProtocols()).length, 1, 'Library unberührt nach Settings-Reset')
})

test('Einstellungen-UI nutzt keinen direkten Storage/Browser-Storage (Quelltext-Check)', () => {
  const dir = new URL('../components/settings/', import.meta.url)
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.vue'))) {
    const src = readFileSync(new URL(file, dir), 'utf8')
    assert.ok(
      !/@capacitor\/preferences|@capacitor-community\/sqlite|localStorage\.|sessionStorage\.|indexedDB\.|\.setItem\(/.test(src),
      `${file} darf keinen direkten Storage nutzen (nur über useStorage)`,
    )
  }
})

// --- Datenschutz / Kapselung ---

test('kein caseState im gespeicherten Settings-Wert', async () => {
  const adapter = createFakeKeyValueAdapter()
  await createSettingsRepository(adapter).saveSettings(DEFAULT_SETTINGS)
  const raw = adapter.dump()[SETTINGS_KEY] ?? ''
  assert.ok(!/values|activeBlocks|variableValues|caseState/.test(raw))
})

// Match echte NUTZUNG (dotted/call), nicht Erwähnungen in Kommentaren.
const RAW_STORAGE = /localStorage\.|sessionStorage\.|indexedDB\.|caches\.|window\.localStorage|window\.indexedDB/

test('Storage-Code nutzt KEIN localStorage/sessionStorage/IndexedDB direkt (außer Preferences-Adapter)', () => {
  const dir = new URL('./', import.meta.url)
  const files = readdirSync(dir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'preferencesAdapter.ts',
  )
  for (const file of files) {
    const src = readFileSync(new URL(file, dir), 'utf8')
    assert.ok(!RAW_STORAGE.test(src), `${file} darf keinen direkten Browser-Storage nutzen`)
  }
})

test('preferencesAdapter nutzt @capacitor/preferences (nicht rohen Browser-Storage)', () => {
  const src = readFileSync(new URL('./preferencesAdapter.ts', import.meta.url), 'utf8')
  assert.ok(/@capacitor\/preferences/.test(src))
  assert.ok(!RAW_STORAGE.test(src))
})
