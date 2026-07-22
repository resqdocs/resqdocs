import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useTransferShare } from './useTransferShare.ts'

test('useTransferShare: Anfangszustand + reset', () => {
  const s = useTransferShare()
  assert.equal(s.shareLink.value, null)
  assert.equal(s.shareBusy.value, false)
  assert.equal(s.shareError.value, '')
  assert.equal(s.ttl.value, 'burn')
  s.reset()
  assert.equal(s.shareLink.value, null)
})

test('useTransferShare: unerreichbarer Dienst -> shareError gesetzt, kein Link, nicht mehr busy', async () => {
  const s = useTransferShare({ baseUrl: 'http://127.0.0.1:1' }) // Port 1 = nicht erreichbar
  await s.share(JSON.stringify({ schema: 'resqdocs-block', version: 1, tree: { title: 'B' } }))
  assert.ok(s.shareError.value.length > 0)
  assert.equal(s.shareLink.value, null)
  assert.equal(s.shareBusy.value, false)
})
