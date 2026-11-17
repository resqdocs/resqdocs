// Rückgängig/Wiederholen als reine Datenstruktur. Die Vorlagen sind immutabel, ein Schritt ist deshalb
// nur ein Verweis auf den Stand davor. Tipp-Folgen an derselben Stelle zählen als EIN Schritt.

export interface HistoryOptions {
  /** Höchstzahl gemerkter Schritte. */
  limit?: number
  /** Änderungen mit demselben Kennzeichen innerhalb dieser Zeit verschmelzen zu einem Schritt. */
  coalesceMs?: number
}

export interface History<S> {
  /** Stand VOR einer Änderung merken. `tag` kennzeichnet Tipp-Folgen (z. B. Titel eines Elements); null = immer eigener Schritt. */
  record(before: S, tag: string | null, now: number): void
  /** Einen Schritt zurück. `current` wandert in die Wiederholen-Liste. null = nichts zu tun. */
  undo(current: S): S | null
  redo(current: S): S | null
  canUndo(): boolean
  canRedo(): boolean
  clear(): void
}

export function createHistory<S>(options: HistoryOptions = {}): History<S> {
  const limit = options.limit ?? 200
  const coalesceMs = options.coalesceMs ?? 1200
  let past: S[] = []
  let future: S[] = []
  let lastTag: string | null = null
  let lastAt = 0
  return {
    record(before, tag, now) {
      const merge = tag !== null && tag === lastTag && now - lastAt <= coalesceMs && past.length > 0
      lastTag = tag
      lastAt = now
      future = []
      if (merge) return // der Stand vor der Tipp-Folge ist schon gemerkt
      past.push(before)
      if (past.length > limit) past = past.slice(past.length - limit)
    },
    undo(current) {
      const prev = past.pop()
      if (prev === undefined) return null
      future.push(current)
      lastTag = null
      return prev
    },
    redo(current) {
      const next = future.pop()
      if (next === undefined) return null
      past.push(current)
      lastTag = null
      return next
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    clear() {
      past = []
      future = []
      lastTag = null
    },
  }
}
