// node --test --experimental-strip-types
// PZN-Import von einer Adresse: Adresspruefung, Download-Fehler, Groessengrenze.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkImportUrl,
  downloadImportBytes,
  httpStatusMessage,
  MAX_IMPORT_BYTES,
  PznUrlImportError,
  type ImportHttpGet,
} from './pznUrlImport.ts'

test('checkImportUrl: nur https, getrimmt', () => {
  assert.deepEqual(checkImportUrl('  https://example.com/meine-pzn.json.gz '), { ok: true, url: 'https://example.com/meine-pzn.json.gz' })
  assert.equal(checkImportUrl('http://example.com/a.json').ok, false)
  assert.equal(checkImportUrl('ftp://example.com/a.json').ok, false)
  assert.equal(checkImportUrl('file:///sdcard/a.json').ok, false)
  assert.equal(checkImportUrl('').ok, false)
  assert.equal(checkImportUrl('example.com/a.json').ok, false)
})

test('checkImportUrl: Zugangsdaten in der Adresse werden abgelehnt', () => {
  assert.equal(checkImportUrl('https://user:geheim@example.com/a.json').ok, false)
  assert.equal(checkImportUrl('https://user@example.com/a.json').ok, false)
})

test('checkImportUrl: der Teil hinter # geht nie an den Server', () => {
  assert.deepEqual(checkImportUrl('https://example.com/a.json#schluessel'), { ok: true, url: 'https://example.com/a.json' })
  assert.deepEqual(checkImportUrl('https://example.com/a.json?dl=1#x'), { ok: true, url: 'https://example.com/a.json?dl=1' })
})

const bytesOf = (s: string): ImportHttpGet => async () => new TextEncoder().encode(s)

test('downloadImportBytes: liefert die Bytes', async () => {
  assert.equal(new TextDecoder().decode(await downloadImportBytes('https://x', bytesOf('{"entries":{}}'))), '{"entries":{}}')
})

test('downloadImportBytes: eigene Fehlertexte bleiben, sonstige Fehler werden verstaendlich', async () => {
  const status = (s: number): ImportHttpGet => async () => {
    throw new PznUrlImportError(httpStatusMessage(s))
  }
  await assert.rejects(downloadImportBytes('https://x', status(404)), (e: unknown) => e instanceof PznUrlImportError && /404/.test(e.message))
  await assert.rejects(downloadImportBytes('https://x', status(403)), (e: unknown) => e instanceof PznUrlImportError && /Kein Zugriff/.test(e.message))
  const nativeReject: ImportHttpGet = async () => {
    throw new Error('Error downloading file: https://x')
  }
  await assert.rejects(downloadImportBytes('https://x', nativeReject), (e: unknown) => e instanceof PznUrlImportError && /Download fehlgeschlagen/.test(e.message) && !/https/.test(e.message))
})

test('downloadImportBytes: leere und zu grosse Dateien werden abgelehnt', async () => {
  await assert.rejects(downloadImportBytes('https://x', bytesOf('')), (e: unknown) => e instanceof PznUrlImportError && /leer/.test(e.message))
  const huge: ImportHttpGet = async () => new Uint8Array(MAX_IMPORT_BYTES + 1)
  await assert.rejects(downloadImportBytes('https://x', huge), (e: unknown) => e instanceof PznUrlImportError && /zu groß/.test(e.message))
})
