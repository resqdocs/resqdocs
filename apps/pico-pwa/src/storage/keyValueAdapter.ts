// keyValueAdapter.ts — In-Memory-Fake des KeyValueAdapter (für Tests + aktuelle
// flüchtige Nutzung). NICHT persistent, keine Browser-/Native-APIs.
import type { KeyValueAdapter } from './types'

export interface FakeKeyValueAdapter extends KeyValueAdapter {
  /** Nur für Tests: aktueller Inhalt. */
  dump(): Record<string, string>
}

export function createFakeKeyValueAdapter(initial: Record<string, string> = {}): FakeKeyValueAdapter {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    async get(key) {
      return store.has(key) ? (store.get(key) as string) : null
    },
    async set(key, value) {
      store.set(key, value)
    },
    async remove(key) {
      store.delete(key)
    },
    dump() {
      return Object.fromEntries(store)
    },
  }
}
