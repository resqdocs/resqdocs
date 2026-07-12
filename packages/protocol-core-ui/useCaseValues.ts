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
    /** Fuellzustand direkt setzen (z. B. aus dem TriStateToggle, der den naechsten Zustand liefert).
     *  BEWAHREN: verlaesst man 'custom' mit nicht-leerem Freitext Richtung confirmed/excluded, wird der
     *  getippte Text als ruhendes prevValue mitgefuehrt (Wiederherstellung beim Zurueckschalten auf ✎).
     *  prevValue ist nie in der Ausgabe. */
    set(id: string, fill: FieldFill): void {
      const prev = values.value[id]
      // Gemerkten Freitext bestimmen: beim Verlassen von 'custom' der getippte Wert; zwischen den
      // Nicht-custom-Zustaenden (confirmed<->excluded) der bereits gemerkte prevValue -> er ueberlebt
      // auch ein Weiter-Zykeln, bis der Nutzer wieder auf ✎ schaltet (dann ist er der Live-Wert).
      const carried =
        prev?.state === 'custom'
          ? prev.value.trim() !== ''
            ? prev.value
            : undefined
          : prev?.state === 'confirmed' || prev?.state === 'excluded'
            ? prev.prevValue
            : undefined
      let next = fill
      if (carried && (fill.state === 'confirmed' || fill.state === 'excluded') && !fill.prevValue) {
        next = { ...fill, prevValue: carried }
      }
      values.value = { ...values.value, [id]: next }
    },
    /** Ruhend gemerkter Freitext eines Felds (prevValue), sonst ''. Fuer den „Text gemerkt"-Hinweis
     *  + die Wiederherstellung beim Zurueckschalten auf ✎. */
    getPrevValue(id: string): string {
      const f = values.value[id]
      return (f?.state === 'confirmed' || f?.state === 'excluded') ? (f.prevValue ?? '') : ''
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
    /** Funktions-Daten setzen; ein gesetzter Funktions-Status (custom/excluded) + Freitext bleiben ERHALTEN
     *  (sonst wuerde jeder Zeilen-Edit/Scan sie still auf confirmed zuruecksetzen). */
    setRows(id: string, rows: FunctionRow[]): void {
      const p = values.value[id]
      let fill: FieldFill
      if (p?.state === 'function' && p.status === 'custom') fill = { state: 'function', rows, status: 'custom', text: p.text ?? '' }
      else if (p?.state === 'function' && p.status === 'excluded') fill = { state: 'function', rows, status: 'excluded' }
      else fill = { state: 'function', rows }
      values.value = { ...values.value, [id]: fill }
    },
    /** Funktions-Status lesen (confirmed/custom/excluded); Nicht-Funktions-Fill -> confirmed. */
    getFunctionStatus(id: string): 'confirmed' | 'custom' | 'excluded' {
      const f = values.value[id]
      return f?.state === 'function' ? (f.status ?? 'confirmed') : 'confirmed'
    },
    /** Freitext (nur bei status='custom') lesen; sonst ''. */
    getFunctionText(id: string): string {
      const f = values.value[id]
      return f?.state === 'function' && f.status === 'custom' ? (f.text ?? '') : ''
    },
    /** Ruhend gemerkter Funktions-Freitext (prevText), sonst ''. Analog getPrevValue fuer Funktionen. */
    getFunctionPrevText(id: string): string {
      const f = values.value[id]
      return f?.state === 'function' && (f.status ?? 'confirmed') !== 'custom' ? (f.prevText ?? '') : ''
    },
    /** Funktions-Status setzen, ROWS erhaltend. confirmed = kein status-Feld; custom behaelt den Freitext.
     *  BEWAHREN: verlaesst man status='custom' mit nicht-leerem Freitext, wird er als ruhendes prevText
     *  mitgefuehrt (Wiederherstellung beim Zurueckschalten auf ✎); prevText ist nie in der Ausgabe. */
    setFunctionStatus(id: string, status: 'confirmed' | 'custom' | 'excluded'): void {
      const f = values.value[id]
      const rows = f?.state === 'function' ? f.rows : []
      let fill: FieldFill
      if (status === 'confirmed') fill = { state: 'function', rows }
      else if (status === 'excluded') fill = { state: 'function', rows, status: 'excluded' }
      else fill = { state: 'function', rows, status: 'custom', text: f?.state === 'function' ? (f.text ?? '') : '' }
      // Gemerkten Funktions-Freitext mitfuehren (analog set): aus 'custom' der getippte Text, sonst der
      // bereits gemerkte prevText -> ueberlebt confirmed<->excluded, bis wieder auf ✎ geschaltet wird.
      const carried =
        f?.state === 'function'
          ? (f.status ?? 'confirmed') === 'custom'
            ? (f.text ?? '').trim() !== ''
              ? f.text
              : undefined
            : f.prevText
          : undefined
      if (carried && status !== 'custom' && fill.state === 'function') {
        fill = { ...fill, prevText: carried }
      }
      values.value = { ...values.value, [id]: fill }
    },
    /** Freitext setzen -> status=custom, ROWS erhaltend. */
    setFunctionText(id: string, text: string): void {
      const f = values.value[id]
      const rows = f?.state === 'function' ? f.rows : []
      values.value = { ...values.value, [id]: { state: 'function', rows, status: 'custom', text } }
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
