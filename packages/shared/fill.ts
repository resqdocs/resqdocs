// Tri-State-Fuellzustand eines Felds (Einsatz) - reine Logik, node-getestet.
// Trennung Definition (Field.default) vs Werte (FieldFill): der Default wird ZUR RENDER-ZEIT
// aufgeloest (fillValue), NIE in den Werte-Store materialisiert -> fehlender Key == DEFAULT_FILL.
// (quellenbelegt: SurveyJS defaultValue in der Definition, JSONForms data/scope getrennt;
//  siehe docs/rework/field-impl.md)

import type { Field, FieldFill } from './model.ts'

export const DEFAULT_FILL: FieldFill = Object.freeze({ state: 'confirmed' })

/** Tri-State-Zyklus: confirmed -> custom(value=default) -> excluded -> confirmed.
 *  Verlustbehaftet by design: Verlassen von 'custom' verwirft den eingetippten Wert
 *  (ein Re-Edit INNERHALB von custom behaelt ihn - das macht der Store via setCustom). */
export function cycleFill(fill: FieldFill, def: string): FieldFill {
  switch (fill.state) {
    case 'confirmed':
      return { state: 'custom', value: def }
    case 'custom':
      return { state: 'excluded' }
    default:
      return DEFAULT_FILL
  }
}

/** Reiner Textwert eines Felds gemaess Fuellzustand (OHNE Titel).
 *  null = excluded (entfaellt in der Ausgabe). */
export function fillValue(field: Field, fill: FieldFill = DEFAULT_FILL): string | null {
  if (fill.state === 'excluded' || fill.state === 'function') return null // 'function' gehoert nicht ans Feld
  if (fill.state === 'custom') return fill.value // bei Multi ist value bereits der verkettete Fliesstext
  return defaultOptionValue(field) // confirmed: Standardwert
}

/** „confirmed"-Ausgabewert eines Felds: der Standardwert. Bei einem Select MUSS er eine (nicht-leere)
 *  Option sein, sonst die oberste. Zentral, damit Single- und Multi-Logik denselben Default nutzen. */
export function defaultOptionValue(field: Field): string {
  const opts = field.options?.filter((o) => o !== '')
  if (opts && opts.length) return field.default != null && opts.includes(field.default) ? field.default : opts[0]
  return field.default ?? ''
}

// --- Multi-Select (optional, Feld.multiple) -------------------------------------------------------
// Rein logisch + node-getestet. Der Ausgabe-Renderer bleibt unveraendert (er liest custom.value, das bei
// Multi bereits der verkettete Fliesstext ist). values ist die DISKRETE Auswahl fuer die Checkbox-Anzeige.

/** Deutsche Aufzaehlung: "" | "a" | "a und b" | "a, b und c". Leere Elemente entfallen. */
export function joinFieldValues(values: readonly string[]): string {
  const v = values.filter((s) => s.trim() !== '')
  if (v.length <= 1) return v[0] ?? ''
  return v.slice(0, -1).join(', ') + ' und ' + v[v.length - 1]
}

/** Auswahl in options-Reihenfolge bringen; Werte ausserhalb der options (Freitext) ans Ende, in Eingabe-
 *  reihenfolge. Sorgt fuer stabile, vorhersehbare Ausgabe unabhaengig von der Tipp-/Tap-Reihenfolge. */
function orderByOptions(field: Field, sel: readonly string[]): string[] {
  // Optionen deduplizieren (wie der Single-Select-Pfad: kein Doppel-checked/Doppel-Ausgabe bei versehentlich
  // gleichen Options-Strings) und Freitext-Werte ausserhalb der options einmalig ans Ende.
  const opts = [...new Set((field.options ?? []).filter((o) => o !== ''))]
  const set = new Set(sel)
  const extra = [...new Set(sel.filter((s) => !opts.includes(s)))]
  return [...opts.filter((o) => set.has(o)), ...extra]
}

/** Eine Option in einer Multi-Auswahl umschalten — mit Exklusiv-Logik: eine exklusive Option ("Keine/
 *  Normal") verdraengt alles andere; jede andere Auswahl verdraengt die exklusiven. Ausgabe options-geordnet. */
export function toggleMultiOption(current: readonly string[], option: string, field: Field): string[] {
  const exclusive = new Set(field.exclusiveOptions ?? [])
  let next: string[]
  if (current.includes(option)) next = current.filter((o) => o !== option)
  else if (exclusive.has(option)) next = [option]
  else next = [...current.filter((o) => !exclusive.has(o)), option]
  return orderByOptions(field, next)
}

/** Aktuell gewaehlte Optionen aus dem Fuellzustand (fuer die Checkbox-/Chip-Anzeige eines Multi-Felds).
 *  Defensiv: custom OHNE values (alte/Single-Daten) -> [value]; confirmed -> die Standard-Option. */
export function multiSelected(field: Field, fill: FieldFill = DEFAULT_FILL): string[] {
  if (fill.state === 'excluded' || fill.state === 'function') return []
  if (fill.state === 'custom') return orderByOptions(field, fill.values ?? (fill.value ? [fill.value] : []))
  const d = defaultOptionValue(field)
  return d ? [d] : []
}

/** Fuellzustand aus einer Multi-Auswahl ableiten — der „Status steckt in der Auswahl": leer = excluded,
 *  exakt die Standard-Menge = confirmed (Default nie materialisiert), sonst custom (value = Fliesstext,
 *  values = diskrete Auswahl). Deckt sich mit der Single-Logik, nur auf eine Menge statt einen Wert. */
export function multiFill(field: Field, selection: readonly string[]): FieldFill {
  let sel = selection.filter((s) => s.trim() !== '')
  // Exklusiv-Regel FINAL erzwingen (nicht nur in toggleMultiOption): ist eine „Keine/Normal"-Option dabei,
  // verdraengt sie alle anderen — auch wenn sie ueber Freitext (allowCustom) mit exaktem Options-Namen kam.
  const chosenExcl = sel.filter((s) => (field.exclusiveOptions ?? []).includes(s))
  if (chosenExcl.length) sel = [chosenExcl[chosenExcl.length - 1]]
  const v = orderByOptions(field, sel)
  if (v.length === 0) return { state: 'excluded' }
  const d = defaultOptionValue(field)
  if (v.length === 1 && v[0] === d) return { state: 'confirmed' }
  return { state: 'custom', value: joinFieldValues(v), values: v }
}

/** „Erfuellt" (fuer die Pflichtfeld-Vollstaendigkeit): der Feldwert loest sich zu nicht-leerem Text auf.
 *  confirmed-mit-Standardwert zaehlt als erfuellt (der Wert IST erhoben); leeres confirmed/custom sowie
 *  excluded = nicht erfuellt. Deckt sich mit dem, was der Renderer ausgibt (fillValue). */
export function isFilled(field: Field, fill: FieldFill = DEFAULT_FILL): boolean {
  const v = fillValue(field, fill)
  return v != null && v.trim() !== ''
}
