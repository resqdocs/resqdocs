// Einsatz-WERTE (getrennt von der Definition). Record<id, FieldFill> als Singleton, von der
// Einsatz-Ausfuellung geschrieben und von der Text-Vorschau gelesen. Der Default lebt in der
// Definition (Field.default) und wird erst im Renderer aufgeloest - hier stehen nur Abweichungen.
// (quellenbelegt: SurveyJS survey.data keyed by name, JSONForms data getrennt von der UI.)

import { ref } from 'vue'
import type { FieldFill, FunctionRow } from '@resqdocs/protocol-core/model'
import { DEFAULT_FILL, cycleFill } from '@resqdocs/protocol-core/fill'

const values = ref<Record<string, FieldFill>>({})

export function useCaseValues() {
  return {
    values,
    get(id: string): FieldFill {
      return values.value[id] ?? DEFAULT_FILL
    },
    /** Tri-State weiterschalten: confirmed -> custom(default) -> excluded -> confirmed. */
    cycle(id: string, def: string): void {
      values.value = { ...values.value, [id]: cycleFill(values.value[id] ?? DEFAULT_FILL, def) }
    },
    /** Fuellzustand direkt setzen (z. B. aus dem TriStateToggle, der den naechsten Zustand liefert). */
    set(id: string, fill: FieldFill): void {
      values.value = { ...values.value, [id]: fill }
    },
    /** Eigenen Wert setzen (Re-Edit innerhalb von custom - behaelt den Tipptext). */
    setCustom(id: string, value: string): void {
      values.value = { ...values.value, [id]: { state: 'custom', value } }
    },
    /** 2-stufig (Container): bestaetigt <-> nicht erhoben. */
    toggleExcluded(id: string): void {
      const next: FieldFill = values.value[id]?.state === 'excluded' ? DEFAULT_FILL : { state: 'excluded' }
      values.value = { ...values.value, [id]: next }
    },
    /** id umbenannt -> Wert mit-migrieren (alter Key -> neuer Key), sonst verwaist er. */
    rename(oldId: string, newId: string): void {
      if (oldId === newId) return
      const v = values.value[oldId]
      if (v === undefined) return
      const next = { ...values.value, [newId]: v }
      delete next[oldId]
      values.value = next
    },
    reset(): void {
      values.value = {}
    },
    /** Alle Werte ersetzen (z. B. Wiederherstellen eines temporaeren Einsatzentwurfs). */
    setAll(next: Record<string, FieldFill>): void {
      values.value = { ...next }
    },
    /** Funktions-Daten lesen (Medikamenten- oder Aerzte-Zeilen); kein Funktions-Wert -> leere Liste.
     *  Aufrufer kastelliert je functionKind (z. B. `as MedikamenteRow[]` / `as ArztRow[]`). */
    getRows(id: string): FunctionRow[] {
      const f = values.value[id]
      return f?.state === 'function' ? f.rows : []
    },
    /** Funktions-Daten setzen (eigener Zustand neben dem Tri-State, im selben Werte-Record). */
    setRows(id: string, rows: FunctionRow[]): void {
      values.value = { ...values.value, [id]: { state: 'function', rows } }
    },
    /** Werte mehrerer ids entfernen (Knoten/Teilbaum aus der Vorlage geloescht -> verwaiste Werte raus). */
    drop(ids: string[]): void {
      if (!ids.length) return
      const next = { ...values.value }
      for (const id of ids) delete next[id]
      values.value = next
    },
  }
}
