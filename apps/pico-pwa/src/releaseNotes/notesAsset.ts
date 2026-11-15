// notesAsset.ts — die Release-Notes ins App-Paket nehmen (nur Vite; in Node-Tests NICHT importieren,
// dort liest der Test die Dateien direkt). Kein Netzabruf: der Verlauf ist Teil der App.
import { buildHistory, type ReleaseNote } from './releaseNotes'

const files = import.meta.glob('../../../../release-notes/de/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const RELEASE_HISTORY: ReleaseNote[] = buildHistory(Object.values(files))
