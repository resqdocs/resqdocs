// Wächter: die Rückfrage vor dem Teilen einer Sicherung steht beim auslösenden Knopf und scheitert nie still.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (f: string): string => readFileSync(new URL(`../../apps/pico-pwa/src/components/settings/${f}`, import.meta.url), 'utf8')

test('Sicherung teilen: Rückfrage beim Knopf, im Bild, Fehler im Kasten', () => {
  const sec = read('BackupSection.vue')
  const box = read('ShareConfirmBox.vue')
  assert.match(sec, /<ShareConfirmBox v-if="shareConfirm\?\.kind === 'current'"/)
  assert.match(sec, /v-if="shareConfirm\?\.kind === 'snapshot' && shareConfirm\.name === s\.name"/, 'bei der Sicherung im Verlauf')
  assert.match(box, /scrollIntoView/)
  assert.match(box, /data-share-error/)
  assert.match(sec, /if \(ok\) shareConfirm\.value = null\s*else shareError\.value =/, 'liefert der Export nichts, bleibt der Kasten offen')
  assert.match(sec, /catch \(e\)[\s\S]*shareError\.value = `Teilen hat nicht geklappt/)
})

test('Sicherung teilen: große Dateien werden stückweise geschrieben, nie in einem Bridge-Aufruf', () => {
  const ft = readFileSync(new URL('../../apps/pico-pwa/src/utils/fileTransfer.ts', import.meta.url), 'utf8')
  const body = ft.slice(ft.indexOf('export async function shareBinary('), ft.indexOf('export async function readIncomingFile'))
  assert.match(body, /Filesystem\.appendFile/)
  assert.doesNotMatch(body, /writeFile\(\{ path: filename, data: bytesToBase64\(bytes\)/)
  assert.match(ft, /SHARE_CHUNK_BYTES = 3 \* 256 \* 1024/)
})

test('Einzelne Sicherung exportieren: gespeicherte Datei wird kopiert und geteilt', () => {
  const ub = readFileSync(new URL('../../apps/pico-pwa/src/backup/useBackup.ts', import.meta.url), 'utf8')
  const fs = readFileSync(new URL('../../apps/pico-pwa/src/backup/backupFs.ts', import.meta.url), 'utf8')
  assert.match(fs, /Filesystem\.copy\(\{ from: path\(name\), directory: dir\(\), to: filename, toDirectory: Directory\.Cache \}\)/)
  assert.match(ub, /store\.copySnapshotToCache\(name, filename\)[\s\S]*shareCacheFile\(filename, uri\)/)
})
