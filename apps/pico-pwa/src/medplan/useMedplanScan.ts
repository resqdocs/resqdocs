// useMedplanScan.ts - Composable fuer den BMP-Scan-Entwurf (#9, #36).
//
// Sammelt die Seiten eines (ggf. mehrseitigen) Medikationsplans, parst sie
// ueber den gekapselten Parser (@resqdocs/protocol-core/medplan) und haelt die Medikations-
// zeilen als EDITIERBAREN ENTWURF - ausschliesslich im RAM.
//
// Die Kamera liefert der ZXing-Overlay (MedplanScanOverlay.vue, reiner
// JS-Scanner - Netzwerk-Policy: nichts telefoniert nach Hause, laeuft auch
// auf Huawei ohne Google-Dienste). Dieses Composable kennt KEINE Kamera -
// es bekommt rohe UKF-Strings ueber ingest() (Scan UND Text-Einfuegen).
//
// Datenschutz (docs/data-flow.md "BMP-Scan"): Roh-Scan und Entwurf werden NIE
// persistiert/geloggt; reset() verwirft alles. Der Parser extrahiert
// nachweislich keine Patientenfelder (P/C/O werden nie gelesen). Der
// AUSSTELLER (A-Element: Name/Ort/Nummer/Telefon, #144) wird angeboten,
// aber NUR uebernommen, wenn der Nutzer aktiv eine Rolle waehlt
// (Hausarzt/Facharzt; Default = nicht dokumentieren).
import { computed, ref } from 'vue'
import type { MedplanAussteller } from '@resqdocs/protocol-core/medplan/medplan.d.mts'
// MedikamenteRow aus dem NEUEN Kern (SSOT); strukturgleich zum alten render.mjs-Typ, den medplan.mjs liefert.
import type { MedikamenteRow } from '@resqdocs/protocol-core/model'

/** Rollen-Auswahl fuer den Aussteller (#144): '' = nicht dokumentieren (Default). */
export type AusstellerRolle = '' | 'Hausarzt' | 'Facharzt'
// Import ueber den Paketnamen @resqdocs/protocol-core (file:-Dependency, in
// node_modules verlinkt) — aufloesbar sowohl unter `node --test
// --experimental-strip-types` (ueber node_modules) als auch unter Vite/TS.
import { parseMedplanMedications, medicationToText, medicationToRow, ausstellerToText } from '@resqdocs/protocol-core/medplan/medplan.mjs'

/**
 * @param resolvePzn optionale PZN→Name-Aufloesung (#11, community-Woerterbuch).
 *                   Treffer werden sichtbar als 'community, ungeprueft' markiert.
 */
export function useMedplanScan(resolvePzn?: (pzn: string) => string | null) {
  const error = ref<string | null>(null)
  /** Editierbare Entwurfszeilen (eine pro Medikament) - nur im RAM. */
  const rows = ref<string[]>([])
  /** Strukturierte Zwillinge der rows (#146, gleiche Reihenfolge/Laenge):
   *  fuer das medikamente-Element. removeRow haelt beide synchron;
   *  Text-Edits (updateRow) betreffen nur den Text-Pfad. */
  const structuredRows = ref<MedikamenteRow[]>([])
  const totalPages = ref(0) // 0 = noch nichts gescannt
  const scannedPages = ref<number[]>([])
  /** Aussteller aus dem Scan (#144) - nur im RAM, Uebernahme ist Opt-in. */
  const aussteller = ref<MedplanAussteller | null>(null)
  const ausstellerRolle = ref<AusstellerRolle>('')

  /** Einen rohen UKF-String (Kamera-Scan ODER manuell eingefuegt) uebernehmen. */
  function ingest(raw: string): boolean {
    error.value = null
    let parsed
    try {
      parsed = parseMedplanMedications(raw)
    } catch {
      // Bewusst OHNE Roh-Inhalt in der Meldung (kann Gesundheitsdaten enthalten).
      error.value = 'Kein Medikationsplan-Code erkannt (BMP-Data-Matrix erwartet).'
      return false
    }
    if (scannedPages.value.includes(parsed.page.current)) {
      error.value = `Seite ${parsed.page.current} wurde bereits gescannt.`
      return false
    }
    scannedPages.value = [...scannedPages.value, parsed.page.current].sort((a, b) => a - b)
    totalPages.value = Math.max(totalPages.value, parsed.page.total)
    if (parsed.aussteller && !aussteller.value) aussteller.value = parsed.aussteller
    const withResolvedName = (med: (typeof parsed.medications)[number]) => {
      if (!med.name && med.pzn && resolvePzn) {
        const resolved = resolvePzn(med.pzn)
        if (resolved) return { ...med, name: `${resolved} (PZN ${med.pzn}, community/ungeprüft)` }
      }
      return med
    }
    rows.value = [...rows.value, ...parsed.medications.map((m) => medicationToText(withResolvedName(m)))]
    structuredRows.value = [...structuredRows.value, ...parsed.medications.map((m) => medicationToRow(withResolvedName(m)))]
    return true
  }

  function updateRow(index: number, text: string): void {
    rows.value = rows.value.map((r, i) => (i === index ? text : r))
  }

  /**
   * Nur den NAMEN einer strukturierten Zeile überschreiben (#184). Die Roh-PZN
   * (`pzn`) bleibt am Eintrag „im Hintergrund" hinterlegt — Dosierung/Kommentar
   * unverändert. So kann der Nutzer den Namen anpassen, ohne die PZN zu verlieren
   * (für den späteren Einzel-Transfer in die Bibliothek).
   */
  function updateRowName(index: number, name: string): void {
    structuredRows.value = structuredRows.value.map((r, i) =>
      i === index ? { ...r, name } : r,
    )
  }

  /** Wirkstärke einer Zeile setzen (#262) — z. B. aus der eigenen Bibliothek aufgelöst.
   *  Gating (nur leere Stärke füllen, nie überschreiben) liegt beim Aufrufer. */
  function setRowStaerke(index: number, staerke: string): void {
    structuredRows.value = structuredRows.value.map((r, i) =>
      i === index ? { ...r, staerke } : r,
    )
  }

  function removeRow(index: number): void {
    rows.value = rows.value.filter((_, i) => i !== index)
    structuredRows.value = structuredRows.value.filter((_, i) => i !== index)
  }

  /** Verwirft Entwurf + Seitenstand vollstaendig (Datenschutz: nichts bleibt). */
  function reset(): void {
    rows.value = []
    scannedPages.value = []
    totalPages.value = 0
    error.value = null
    aussteller.value = null
    ausstellerRolle.value = ''
    structuredRows.value = []
  }

  /** Noch fehlende Seiten eines mehrseitigen Plans (leer = vollstaendig). */
  const missingPages = computed(() => {
    if (totalPages.value === 0) return []
    const missing: number[] = []
    for (let p = 1; p <= totalPages.value; p++) {
      if (!scannedPages.value.includes(p)) missing.push(p)
    }
    return missing
  })

  /**
   * Entwurf als EIN Feldwert: jedes Medikament auf eigener Zeile (bessere
   * Lesbarkeit im Protokoll, der Renderer rueckt mehrzeilige Werte unter das
   * Label - ohne "-" voran). Bei gewaehlter Rolle (#144) steht der Aussteller
   * als erste Zeile davor.
   */
  const draftText = computed(() => {
    const meds = rows.value.map((r) => r.trim()).filter(Boolean)
    const lines = ausstellerRolle.value && aussteller.value
      ? [ausstellerToText(aussteller.value, ausstellerRolle.value), ...meds]
      : meds
    return lines.join('\n')
  })

  /** Entwurf als strukturierte Zeilen fuers medikamente-Element (#146);
   *  gewaehlter Aussteller steht als erste Zeile (nur Name). */
  const draftRows = computed<MedikamenteRow[]>(() => {
    const meds = structuredRows.value.filter((r) => r.name.trim())
    return ausstellerRolle.value && aussteller.value
      ? [{ name: ausstellerToText(aussteller.value, ausstellerRolle.value) }, ...meds]
      : meds
  })

  return {
    error, rows, structuredRows, totalPages, scannedPages,
    aussteller, ausstellerRolle,
    missingPages, draftText, draftRows,
    ingest, updateRow, updateRowName, setRowStaerke, removeRow, reset,
  }
}
