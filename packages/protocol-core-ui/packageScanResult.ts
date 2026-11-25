// packageScanResult.ts — was aus gescannten Packungen in den Medikationsplan kommt (rein, node-testbar).
//
// Jede PZN steht höchstens einmal in der Liste: Eine Packung, deren PZN schon dort steht oder im selben Durchgang
// schon dran war, wird nicht noch einmal aufgenommen. Die Kamera im Mehrfach-Modus prüft das bereits beim Scannen
// (Meldung im Bild); hier steht dieselbe Regel noch einmal für alles, was ankommt (auch den Einzel-Scan).

/** PZN auf acht Stellen (führende Nullen): Der Plan-Code liefert sie sieben-, die Packung achtstellig. */
export function pznKey(pzn: string | null | undefined): string | null {
  const digits = (pzn ?? '').replace(/\D/g, '')
  return digits.length >= 4 && digits.length <= 8 ? digits.padStart(8, '0') : null
}

export interface PackageScanPlan {
  /** PZN (wie gelesen), die neu in die Liste kommen, in Scan-Reihenfolge. */
  add: string[]
  /** Packungen, deren PZN schon in der Liste stand oder im selben Durchgang doppelt kam. */
  duplicates: number
  /** Packungen ohne erkennbare PZN. */
  unreadable: number
}

/** Gelesene PZN (null = keine erkannt) gegen die vorhandene Liste abgleichen. */
export function planPackageScan(scanned: readonly (string | null)[], existing: readonly (string | null | undefined)[]): PackageScanPlan {
  const seen = new Set(existing.map(pznKey).filter((k): k is string => k !== null))
  const plan: PackageScanPlan = { add: [], duplicates: 0, unreadable: 0 }
  for (const pzn of scanned) {
    const key = pznKey(pzn)
    if (!pzn || !key) plan.unreadable++
    else if (seen.has(key)) plan.duplicates++
    else {
      seen.add(key)
      plan.add.push(pzn)
    }
  }
  return plan
}

export interface PackageScanMessage {
  kind: 'ok' | 'warn'
  text: string
}

/** Rückmeldung unter der Liste. `null`, wenn es nichts zu sagen gibt (eine Packung, sauber übernommen). */
export function packageScanMessage(plan: PackageScanPlan): PackageScanMessage | null {
  const n = plan.add.length
  const total = n + plan.duplicates + plan.unreadable
  if (total === 0) return null
  if (total === 1) {
    if (plan.duplicates) return { kind: 'warn', text: 'Dieses Medikament steht schon in der Liste.' }
    if (plan.unreadable) return { kind: 'warn', text: 'Keine PZN auf der Packung erkannt — näher heranführen oder manuell eintippen.' }
    return null
  }
  const parts: string[] = [n === 0 ? 'Keine neue Packung übernommen.' : n === 1 ? '1 Packung übernommen.' : `${n} Packungen übernommen.`]
  if (plan.duplicates) parts.push(plan.duplicates === 1 ? '1 stand schon in der Liste.' : `${plan.duplicates} standen schon in der Liste.`)
  if (plan.unreadable) parts.push(plan.unreadable === 1 ? 'Bei 1 war keine PZN erkennbar.' : `Bei ${plan.unreadable} war keine PZN erkennbar.`)
  return { kind: plan.duplicates || plan.unreadable ? 'warn' : 'ok', text: parts.join(' ') }
}

/**
 * Hat das Medikament einen eigenen Namen? Nach einem Scan steht dort zunächst nur ein Platzhalter („PZN 01234567“,
 * ggf. mit Zusatz). In die eigene PZN-Bibliothek gehört ein Eintrag erst, wenn der Platzhalter durch einen Namen
 * ersetzt ist; die PZN selbst bleibt im Hintergrund an der Zeile erhalten.
 */
export function hasOwnName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim()
  return n !== '' && !/PZN\s*\d/i.test(n)
}

/** Was die eigene PZN-Bibliothek zu einer PZN zeigt: der Name (Wirkstoff, sonst Bezeichnung) und die Stärke. */
export interface LibraryEntryView {
  name: string
  staerke: string
}

/**
 * Was eine Zeile mit PZN für die eigene Bibliothek anbietet:
 *  - 'add': Die Bibliothek kennt die PZN noch nicht, und statt des Platzhalters steht ein Name da.
 *  - 'update': Die Bibliothek kennt sie, und die Person hat Name oder Stärke selbst geändert (`edited`). Weicht nur
 *    der Plan vom Eintrag ab, ohne dass jemand getippt hat, wird nichts angeboten: Die Liste bleibt ruhig.
 *  - null: nichts anzubieten. `entry === undefined` heißt „noch nicht nachgeschlagen“.
 */
export function libraryOffer(input: { entry: LibraryEntryView | null | undefined; name: string | null | undefined; staerke?: string | null; edited: boolean }): 'add' | 'update' | null {
  if (input.entry === undefined || !hasOwnName(input.name)) return null
  if (input.entry === null) return 'add'
  if (!input.edited) return null
  const name = (input.name ?? '').trim()
  const staerke = (input.staerke ?? '').trim()
  return name !== input.entry.name.trim() || (staerke !== '' && staerke !== input.entry.staerke.trim()) ? 'update' : null
}

/** Kennung des Stands, der zuletzt gespeichert wurde (für den Haken): ändert sich Name oder Stärke, erlischt er. */
export function librarySignature(name: string | null | undefined, staerke?: string | null): string {
  return `${(name ?? '').trim()}\u0000${(staerke ?? '').trim()}`
}
