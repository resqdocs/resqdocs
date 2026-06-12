// preferencesAdapter.ts — KeyValueAdapter über @capacitor/preferences (DR-0004).
//
// Die EINZIGE Stelle, die das Preferences-Plugin berührt. Die UI/Repositories
// kennen nur das KeyValueAdapter-Interface. (Web-Fallback von Preferences nutzt
// intern Browser-Storage; das ist die gekapselte Abstraktion — KEIN direkter
// localStorage/IndexedDB-Zugriff im App-Code.)
import { Preferences } from '@capacitor/preferences'
import type { KeyValueAdapter } from './types'

export const preferencesAdapter: KeyValueAdapter = {
  async get(key) {
    const { value } = await Preferences.get({ key })
    return value ?? null
  },
  async set(key, value) {
    await Preferences.set({ key, value })
  },
  async remove(key) {
    await Preferences.remove({ key })
  },
}
