// defaultYield.ts — Einstellung „Standardwert weicht" eines Mehrfachauswahl-Feldes.
//
// Kein neues Vorlagen-Feld: die Einstellung ist die bestehende Regel `exclusiveOptions`, angewandt auf die
// Standard-Option. Eine exklusive Option steht nie zusammen mit anderen: waehlt man im Einsatz etwas
// anderes, verschwindet sie; waehlt man sie, verschwinden die anderen (packages/shared/fill.ts).
// Dadurch bleiben Vorlagen fuer aeltere App-Versionen unveraendert lesbar.

/** true, wenn der Standardwert weicht, sobald eine andere Option gewaehlt wird. */
export function defaultYields(exclusiveOptions: readonly string[] | undefined, defaultOption: string | undefined): boolean {
  return !!defaultOption && (exclusiveOptions ?? []).includes(defaultOption)
}

/** Einstellung ein-/ausschalten. Gibt die neue Liste zurueck (undefined = leer, Feld nicht schreiben). */
export function withDefaultYield(exclusiveOptions: readonly string[] | undefined, defaultOption: string | undefined, on: boolean): string[] | undefined {
  const cur = exclusiveOptions ?? []
  if (!defaultOption) return cur.length ? [...cur] : undefined
  const next = on ? [...new Set([...cur, defaultOption])] : cur.filter((o) => o !== defaultOption)
  return next.length ? next : undefined
}

/** Der Standardwert wechselt auf eine andere Option: war die Einstellung an, wandert sie mit. */
export function moveDefaultYield(exclusiveOptions: readonly string[] | undefined, oldDefault: string | undefined, newDefault: string): string[] | undefined {
  const cur = exclusiveOptions ?? []
  if (!defaultYields(cur, oldDefault) || oldDefault === newDefault) return cur.length ? [...cur] : undefined
  return withDefaultYield(cur.filter((o) => o !== oldDefault), newDefault, true)
}
