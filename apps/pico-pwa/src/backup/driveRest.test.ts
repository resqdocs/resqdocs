// node --test --experimental-strip-types
// Reine Drive-REST-Request-Builder (appDataFolder). Kein Netz — nur die erzeugten Requests prüfen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildListRequest, buildGetRequest, buildDeleteRequest, buildUploadRequest } from './driveRest.ts'

test('List: appDataFolder, GET, Bearer', () => {
  const r = buildListRequest('TOK')
  assert.equal(r.method, 'GET')
  assert.match(r.url, /spaces=appDataFolder/)
  assert.match(r.url, /fields=files/)
  assert.equal(r.headers.Authorization, 'Bearer TOK')
})

test('Get: alt=media', () => {
  const r = buildGetRequest('TOK', 'FILE123')
  assert.equal(r.method, 'GET')
  assert.match(r.url, /\/FILE123\?alt=media$/)
})

test('Delete: DELETE + id', () => {
  const r = buildDeleteRequest('TOK', 'FILE123')
  assert.equal(r.method, 'DELETE')
  assert.match(r.url, /\/FILE123$/)
})

test('Upload: multipart in appDataFolder mit base64-gzip-Media', () => {
  const r = buildUploadRequest('TOK', 'rqd-aaa-1-2-abc.json.gz', 'QkFTRTY0', 'BND')
  assert.equal(r.method, 'POST')
  assert.match(r.url, /uploadType=multipart/)
  assert.equal(r.headers['Content-Type'], 'multipart/related; boundary=BND')
  assert.match(r.body ?? '', /"parents":\["appDataFolder"\]/)
  assert.match(r.body ?? '', /"name":"rqd-aaa-1-2-abc\.json\.gz"/)
  assert.match(r.body ?? '', /Content-Transfer-Encoding: base64/)
  assert.match(r.body ?? '', /QkFTRTY0/)
  assert.match(r.body ?? '', /--BND--$/)
})
