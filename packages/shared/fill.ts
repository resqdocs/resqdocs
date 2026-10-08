// Tri-State-Fuellzustand eines Felds (Einsatz) - reine Logik, node-getestet.
// Trennung Definition (Field.default) vs Werte (FieldFill): der Default wird ZUR RENDER-ZEIT
// aufgeloest (fillValue), NIE in den Werte-Store materialisiert -> fehlender Key == DEFAULT_FILL.
// (quellenbelegt: SurveyJS defaultValue in der Definition, JSONForms data/scope getrennt;
//  siehe docs/rework/field-impl.md)

import type { Field, FieldFill } from './model.ts'

export const DEFAULT_FILL: FieldFill = Object.freeze({ state: 'confirmed' })

/** „Nicht erhoben" als Ausgangszustand (UNO Reverse, siehe defaultFill). */
export const EXCLUDED_FILL: FieldFill = Object.freeze({ state: 'excluded' })

/**
 * Der Ausgangszustand EINES Knotens - was ein fehlender Eintrag im Werte-Store bedeutet.
 *
 * Normalfall: „bestaetigt" (der Standardwert der Vorlage steht in der Ausgabe).
 * Mit `defaultExcluded` (UNO Reverse) dreht sich das um: der Knoten startet auf „nicht erhoben" und
 * erscheint erst in der Ausgabe, wenn der Anwender ihn bewusst einschaltet. Gedacht fuer Felder und
 * Abschnitte, die man nur in bestimmten Lagen braucht - etwa einen neurologischen Befund.
 *
 * Wie der normale Default wird auch dieser NIE in den Werte-Store materialisiert: fehlender Key
 * bedeutet weiterhin „Ausgangszustand", er wird nur knotenabhaengig aufgeloest.
 */
export function defaultFill(node?: { defaultExcluded?: boolean } | null): FieldFill {
  return node?.defaultExcluded ? EXCLUDED_FILL : DEFAULT_FILL
}

/** Steht dieser Knoten in seinem Ausgangszustand? Grundlage der Abweichungszaehlung: nicht „ist es
 *  bestaetigt", sondern „weicht es von dem ab, was die Vorlage vorgibt". */
export function isDefaultFill(node: { defaultExcluded?: boolean } | null | undefined, fill: FieldFill | undefined): boolean {
  return (fill ?? defaultFill(node)).state === defaultFill(node).state
}

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
export function fillValue(field: Field, fill?: FieldFill): string | null {
  // Fehlender Eintrag = Ausgangszustand, und der ist knotenabhaengig (UNO Reverse). Die Aufloesung
  // sitzt bewusst HIER: so bekommt jeder Aufrufer sie automatisch richtig, ohne sie zu kennen.
  const f = fill ?? defaultFill(field)
  if (f.state === 'excluded' || f.state === 'function') return null // 'function' gehoert nicht ans Feld
  if (f.state === 'custom') return f.value // bei Multi ist value bereits der verkettete Fliesstext
  // confirmed bei „startet ohne Auswahl": nichts gewaehlt -> nichts auszugeben (null, damit auch ein
  // eingeschalteter Feldtitel keine leere Zeile erzeugt; isFilled bleibt false -> Pflichtfeld „noch offen").
  if (startsEmpty(field)) return null
  return defaultOptionValue(field) // confirmed: Standardwert
}

/** Mehrfachauswahl mit `defaultEmpty`: keine Option vorausgewaehlt. Nur mit multiple + echten Optionen wirksam -
 *  sonst bleibt alles beim Bestand (Standard-Option). */
export function startsEmpty(field: Field): boolean {
  return !!field.multiple && !!field.defaultEmpty && !!field.options?.some((o) => o !== '')
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
export function multiSelected(field: Field, fill?: FieldFill): string[] {
  const f = fill ?? defaultFill(field)
  if (f.state === 'excluded' || f.state === 'function') return []
  if (f.state === 'custom') return orderByOptions(field, f.values ?? (f.value ? [f.value] : []))
  if (startsEmpty(field)) return [] // „startet ohne Auswahl": ✓ heisst hier keine Vorauswahl
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
  // „startet ohne Auswahl": die leere Auswahl IST der Ausgangszustand (✓), nicht „nicht erhoben".
  if (v.length === 0) return startsEmpty(field) ? { state: 'confirmed' } : { state: 'excluded' }
  const d = defaultOptionValue(field)
  if (!startsEmpty(field) && v.length === 1 && v[0] === d) return { state: 'confirmed' }
  return { state: 'custom', value: joinFieldValues(v), values: v }
}

/** „Erfuellt" (fuer die Pflichtfeld-Vollstaendigkeit): der Feldwert loest sich zu nicht-leerem Text auf.
 *  confirmed-mit-Standardwert zaehlt als erfuellt (der Wert IST erhoben); leeres confirmed/custom sowie
 *  excluded = nicht erfuellt. Deckt sich mit dem, was der Renderer ausgibt (fillValue). */
export function isFilled(field: Field, fill?: FieldFill): boolean {
  const v = fillValue(field, fill)
  return v != null && v.trim() !== ''
}
