// Packungs-Scan (#167) - PZN aus dem Code EINER Medikamentenpackung extrahieren.
//
// STRIKT datensparsam: es wird AUSSCHLIESSLICH die PZN extrahiert. Zusatzinhalte
// (Seriennummer, Charge/Lot, Verfalldatum, GTIN) werden IGNORIERT - nie
// zurueckgegeben, nie gespeichert, nie geloggt. Reine, testbare Logik ohne
// Netz/Telemetrie. Kein securPharm/keine externe Verifikation.
//
// MVP-Formate: Code 39 (klassischer PZN-Barcode) + Data Matrix NUR ueber das
// PPN-Datenelement (IFA-Agentur '11'). KEIN GTIN/EAN-Mapping (separates Follow-up).

export type PackageBarcodeFormat = 'code39' | 'datamatrix' | 'unknown'

/**
 * Liefert die 8-stellig normalisierte PZN oder null (kein gueltiger PZN-Code).
 * @param raw    dekodierter Roh-String des Scanners (wird NICHT gespeichert/geloggt)
 * @param format erkanntes Barcode-Format (aus dem Scanner)
 */
export function extractPznFromPackageCode(raw: string, format: PackageBarcodeFormat = 'unknown'): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null

  // Data Matrix (PPN/securPharm): PZN aus dem PPN (DI '9N' + IFA-Agentur '11' + 8 Ziffern).
  // Alle weiteren GS1-AIs (21 Serien-, 10 Chargennr., 17 Verfall) werden IGNORIERT.
  if (format === 'datamatrix' || format === 'unknown') {
    const ppn = s.match(/9N11(\d{8})/)
    if (ppn) return ppn[1]
    // Data Matrix ohne PPN (z. B. nur GTIN) -> keine PZN im MVP (kein GTIN-Mapping).
    if (format === 'datamatrix') return null
  }

  // Code 39 / klassischer PZN-Barcode: optionales fuehrendes '-' + PZN-Ziffern.
  const digits = s.replace(/^-/, '').replace(/\D/g, '')
  if (digits.length < 4 || digits.length > 8) return null
  return digits.padStart(8, '0')
}

/**
 * Anzeigename fuer eine per Packungs-Scan erkannte PZN - gleiche Markierung wie der
 * BMP-Pfad (community/ungeprueft), bzw. reiner PZN-Platzhalter ohne Woerterbuch-Treffer.
 */
export function packageScanName(pzn: string, resolved: string | null): string {
  return resolved ? `${resolved} (PZN ${pzn}, community/ungeprüft)` : `PZN ${pzn}`
}
