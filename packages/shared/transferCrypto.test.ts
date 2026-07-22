// node --test des E2E-Krypto-Wrappers. Reine WebCrypto-Logik (crypto.subtle in Node vorhanden).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  encryptTransfer,
  decryptTransfer,
  toBase64Url,
  fromBase64Url,
  parseTransferFragment,
  hasTransferMagic,
  TRANSFER_MAGIC,
} from './transferCrypto.ts'

test('Round-Trip: entschluesselt exakt den Klartext (inkl. Unicode)', async () => {
  const plain = JSON.stringify({ schema: 'resqdocs-protocol', version: 1, tree: { title: 'Ärztlich — µg, ≈, €' } })
  const { blob, keyB64url } = await encryptTransfer(plain)
  assert.equal(await decryptTransfer(blob, keyB64url), plain)
})

test('Blob = MAGIC(4) || IV(12) || CT; jeder Aufruf erzeugt anderes Blob + anderen Key', async () => {
  const a = await encryptTransfer('x')
  const b = await encryptTransfer('x')
  assert.ok(hasTransferMagic(a.blob), 'beginnt mit RQD1')
  assert.deepEqual(a.blob.subarray(0, 4), TRANSFER_MAGIC)
  assert.ok(a.blob.length > 16, 'MAGIC + IV + Chiffrat')
  assert.notDeepEqual(a.blob, b.blob, 'frische IV -> anderes Blob')
  assert.notEqual(a.keyB64url, b.keyB64url, 'frischer Key')
})

test('decrypt weist Blob ohne RQD1-Kennung ab', async () => {
  const { blob, keyB64url } = await encryptTransfer('x')
  const noMagic = blob.slice()
  noMagic[0] ^= 0xff // Kennung zerstoeren
  assert.equal(hasTransferMagic(noMagic), false)
  await assert.rejects(() => decryptTransfer(noMagic, keyB64url), /Kein ResQDocs-Transfer/)
})

test('manipuliertes Chiffrat -> GCM-Tag scheitert (wirft)', async () => {
  const { blob, keyB64url } = await encryptTransfer('geheim')
  const tampered = blob.slice()
  tampered[tampered.length - 1] ^= 0xff // letztes Tag-Byte kippen
  await assert.rejects(() => decryptTransfer(tampered, keyB64url))
})

test('falscher Schluessel -> wirft (kein Klartext-Leck)', async () => {
  const { blob } = await encryptTransfer('geheim')
  const wrong = (await encryptTransfer('anderes')).keyB64url
  await assert.rejects(() => decryptTransfer(blob, wrong))
})

test('zu kurzes Blob -> wirft sauber', async () => {
  await assert.rejects(() => decryptTransfer(new Uint8Array(8), 'AAAA'), /zu kurz/)
})

test('base64url Round-Trip fuer alle Padding-Faelle', () => {
  for (let len = 0; len < 20; len++) {
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) bytes[i] = (i * 37 + 11) & 0xff
    const s = toBase64Url(bytes)
    assert.ok(!/[+/=]/.test(s), 'url-sicher, kein +/=')
    assert.deepEqual(fromBase64Url(s), bytes, `len ${len}`)
  }
})

test('parseTransferFragment: id + key am ersten Punkt trennen', () => {
  assert.deepEqual(parseTransferFragment('#aB3xQ7kM9p.KEY-value_123'), { id: 'aB3xQ7kM9p', keyB64url: 'KEY-value_123' })
  assert.deepEqual(parseTransferFragment('id.key'), { id: 'id', keyB64url: 'key' })
  assert.equal(parseTransferFragment('nokey'), null)
  assert.equal(parseTransferFragment('.key'), null)
  assert.equal(parseTransferFragment('id.'), null)
  // id-Zeichensatz HIER erzwungen (nicht nur im Aufrufer): Pfad-/Query-Zeichen -> null (kein URL-Unfug)
  assert.equal(parseTransferFragment('../v1/admin.key'), null)
  assert.equal(parseTransferFragment('a/b.key'), null)
  assert.equal(parseTransferFragment('a b.key'), null)
})
