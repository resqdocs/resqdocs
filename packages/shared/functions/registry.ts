// registry.ts — reine Funktions-Registry (Vue-frei, node-testbar). Jede Funktion liefert Anzeige-Label,
// Body-Render (Klartext der Daten, OHNE Titel) + hasData. Die Einsatz-Komponente (Vue) liegt getrennt
// (EinsatzFunction.vue), damit der pure Kern (render.ts/deviations.ts) testbar bleibt. Erweiterbar:
// eine neue Funktion = ein neuer FunctionKind + ein Eintrag hier (Kern bleibt unberuehrt).
import type { FunctionKind, FieldFill, MedikamenteRow, ArztRow, FunctionRow, FunctionConfig } from '../model.ts'
import { DEFAULT_SEPARATOR } from '../model.ts'

export interface FunctionDef {
  /** Anzeige-Label (Editor-Knopf, Badge). */
  label: string
  /** Klartext der Funktions-Daten (OHNE Titel/Heading - das macht renderFunction). Leer -> entfaellt.
   *  config steuert Zeilen-Layout (untereinander/hintereinander, Trenner, Praefix/Suffix). */
  renderBody(fill: FieldFill | undefined, config?: FunctionConfig): string
  /** Hat die Funktion erfasste Daten? (Abweichungs-Zaehlung, Ausgabe-Filter.) */
  hasData(fill: FieldFill | undefined): boolean
}

function rowsOf(fill: FieldFill | undefined): FunctionRow[] {
  return fill?.state === 'function' ? fill.rows : []
}

/** Block/Inline-Layout (gemeinsam fuer alle Funktionen): inline = eine Zeile mit Trenner,
 *  block (Default) = je Zeile, optional Praefix/Suffix. */
function layoutRows(texts: string[], config?: FunctionConfig): string {
  if (!texts.length) return ''
  if (config?.rowLayout === 'inline') {
    return texts.join(config.rowSeparator ?? DEFAULT_SEPARATOR)
  }
  const pre = config?.rowPrefix ?? ''
  const suf = config?.rowSuffix ?? ''
  return texts.map((t) => `${pre}${t}${suf}`).join('\n')
}

/** Eine Medikamenten-Zeile als Klartext: Name [Dosierung] [(Kommentar)]. */
export function formatMedikament(r: MedikamenteRow): string {
  let s = r.name.trim()
  const dos = r.dosierung?.trim()
  const kom = r.kommentar?.trim()
  if (dos) s += ` ${dos}`
  if (kom) s += ` (${kom})`
  return s
}

/** Eine Aerzte-Zeile als Klartext: Name [(Rolle)][, Ort, Tel. ..., Arztnr. ...]. */
export function formatArzt(r: ArztRow): string {
  let s = r.name.trim()
  if (r.rolle) s += ` (${r.rolle})`
  const details: string[] = []
  const ort = r.ort?.trim()
  const tel = r.telefon?.trim()
  const nr = r.arztnummer?.trim()
  if (ort) details.push(ort)
  if (tel) details.push(`Tel. ${tel}`)
  if (nr) details.push(`Arztnr. ${nr}`)
  if (details.length) s += `, ${details.join(', ')}`
  return s
}

const medikamentenplan: FunctionDef = {
  label: 'Medikamentenplan',
  renderBody(fill, config) {
    const texts = (rowsOf(fill) as MedikamenteRow[]).filter((r) => r.name?.trim()).map(formatMedikament)
    return layoutRows(texts, config)
  },
  hasData(fill) {
    return rowsOf(fill).some((r) => r.name?.trim())
  },
}

const aerzte: FunctionDef = {
  label: 'Ärzte',
  renderBody(fill, config) {
    const texts = (rowsOf(fill) as ArztRow[]).filter((r) => r.name?.trim()).map(formatArzt)
    return layoutRows(texts, config)
  },
  hasData(fill) {
    return rowsOf(fill).some((r) => r.name?.trim())
  },
}

export const FUNCTION_REGISTRY: Record<FunctionKind, FunctionDef> = {
  medikamentenplan,
  aerzte,
}
