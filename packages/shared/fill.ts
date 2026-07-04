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
  if (fill.state === 'custom') return fill.value
  // confirmed: Standardwert. Bei einem Select MUSS er eine (nicht-leere) Option sein, sonst die oberste.
  const opts = field.options?.filter((o) => o !== '')
  if (opts && opts.length) return field.default != null && opts.includes(field.default) ? field.default : opts[0]
  return field.default ?? ''
}
