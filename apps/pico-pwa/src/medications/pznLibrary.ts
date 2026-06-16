// pznLibrary.ts — nutzergepflegte, lokale PZN-Bibliothek (reine, testbare Logik).
//
// Rechtlicher Rahmen (belegbar, keine Rechtsberatung):
//  - IFA-/sui-generis-DB-Recht: KEINE Entnahme aus IFA-abgeleiteten Sammlungen,
//    KEIN externer/automatischer PZN→Name-Lookup. Bezeichnungen vergibt NUR der
//    Nutzer selbst (Erfassung eines Primärfaktums).
//  - Art. 9 DSGVO: die Bibliothek ist eine **Menge** eindeutiger PZN, vollständig
//    ENTKOPPELT vom Einsatz/Protokoll (#173). Sie darf zu KEINEM Zeitpunkt
//    rekonstruieren, welche PZN zusammen auf einem Plan standen — daher KEIN
//    Zeitstempel, KEINE Sitzungs-/Scan-ID, KEINE Reihenfolge/Gruppierung/Quelle.
//
// Speicherform: Map pzn -> Bezeichnung ("" = keine). Eine Map ist inhärent eine
// Menge (Dedup über den Schlüssel); Auflistung/Export werden nach PZN SORTIERT,
// damit auch die Einfüge-Reihenfolge nicht nach außen dringt.

/** EINE Bibliothek = Menge eindeutiger PZN mit optionaler Eigen-Bezeichnung. */
export interface PznLibrary {
  version: 1
  /** 8-stellige PZN -> selbst vergebene Bezeichnung ("" wenn keine). */
  entries: Record<string, string>
}

export interface PznEntry {
  pzn: string
  label: string
}

export function emptyLibrary(): PznLibrary {
  return { version: 1, entries: {} }
}

/**
 * PZN auf 8 Stellen normalisieren oder null. 4–8 Ziffern (führende Nullen werden
 * aufgefüllt); alles andere (zu kurz, >8 Ziffern, nicht-numerisch) → null.
 */
export function normalizePzn(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const digits = raw.trim().replace(/^-/, '').replace(/\D/g, '')
  if (digits.length < 4 || digits.length > 8) return null
  return digits.padStart(8, '0')
}

/** Bezeichnung säubern (Trim, Längenbegrenzung; keine Steuerzeichen/Zeilenumbrüche). */
function sanitizeLabel(label: string | undefined): string {
  if (typeof label !== 'string') return ''
  return label.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120)
}

/**
 * PZN aufnehmen (Dedup, Mengen-Semantik). Konfliktregel (bewusst, dokumentiert):
 * eine bereits vorhandene **nicht-leere** Bezeichnung GEWINNT immer — sie wird von
 * Add/Transfer/Import NIE überschrieben (kein Zerstören kuratierter Einträge). Eine
 * leere Bezeichnung darf durch einen nicht-leeren Vorschlag gefüllt werden. Das
 * gezielte Ändern eines vorhandenen Labels läuft ausschließlich über `setLabel`
 * (bewusste Nutzer-Eingabe in der Verwaltung). So überschreibt weder ein
 * entkoppelter Plan-Transfer noch ein Backup-Import eine Eigen-Bezeichnung.
 */
export function addPzn(lib: PznLibrary, raw: string, label?: string): PznLibrary {
  const pzn = normalizePzn(raw)
  if (!pzn) return lib
  const next = sanitizeLabel(label)
  const existing = lib.entries[pzn]
  // Vorhandenes nicht-leeres Label gewinnt; leeres/neues wird mit `next` gefüllt.
  const value = existing !== undefined && existing !== '' ? existing : next
  return { version: 1, entries: { ...lib.entries, [pzn]: value } }
}

/**
 * Einzel-Transfer (genau EINE PZN, bewusste Nutzerhandlung — kein Bulk). Identische
 * Mengen-/Konfliktsemantik wie `addPzn`; eigener Name, damit der Protokoll→Bibliothek-
 * Pfad im Code unverwechselbar „eine PZN" ist. Es wird KEINE Gruppierung/Reihenfolge/
 * Zeit/Fall-Verknüpfung übertragen — nur die PZN (+ optionaler Label-Vorschlag).
 */
export function addOne(lib: PznLibrary, raw: string, label?: string): PznLibrary {
  return addPzn(lib, raw, label)
}

/** Bezeichnung einer vorhandenen PZN setzen/ändern (nur Nutzer-Eingabe). */
export function setLabel(lib: PznLibrary, raw: string, label: string): PznLibrary {
  const pzn = normalizePzn(raw)
  if (!pzn || !(pzn in lib.entries)) return lib
  return { version: 1, entries: { ...lib.entries, [pzn]: sanitizeLabel(label) } }
}

export function removePzn(lib: PznLibrary, raw: string): PznLibrary {
  const pzn = normalizePzn(raw)
  if (!pzn || !(pzn in lib.entries)) return lib
  const entries = { ...lib.entries }
  delete entries[pzn]
  return { version: 1, entries }
}

/** Eigene Bezeichnung zu einer PZN (für Re-Scan-Vorbefüllung), null wenn unbekannt. */
export function getLabel(lib: PznLibrary, raw: string): string | null {
  const pzn = normalizePzn(raw)
  if (!pzn) return null
  return pzn in lib.entries ? lib.entries[pzn] : null
}

export function hasPzn(lib: PznLibrary, raw: string): boolean {
  const pzn = normalizePzn(raw)
  return pzn !== null && pzn in lib.entries
}

/** Sortierte Liste (nach PZN) — verhindert, dass die Einfüge-Reihenfolge leakt. */
export function listSorted(lib: PznLibrary): PznEntry[] {
  return Object.keys(lib.entries)
    .sort()
    .map((pzn) => ({ pzn, label: lib.entries[pzn] }))
}

export function count(lib: PznLibrary): number {
  return Object.keys(lib.entries).length
}

/**
 * Plan-/Mehrfach-Scan ENTKOPPELT übernehmen: rohe PZN-Liste → normalisierte,
 * deduplizierte Einzel-PZN OHNE Reihenfolge/Gruppierung/Zeit. Bezeichnungen werden
 * NICHT aus dem Plan aufgelöst (Label bleibt leer bzw. vorhandene Eigen-Bezeichnung).
 */
export function addManyDecoupled(lib: PznLibrary, rawPzns: string[]): PznLibrary {
  let out = lib
  for (const raw of rawPzns) out = addPzn(out, raw) // kein Label → keine Linkage
  return out
}

/** Export: NUR Version + PZN→Bezeichnung, sortiert; keine Metadaten/Linkage. */
export function exportLibrary(lib: PznLibrary): { version: 1; entries: Record<string, string> } {
  const entries: Record<string, string> = {}
  for (const { pzn, label } of listSorted(lib)) entries[pzn] = label
  return { version: 1, entries }
}

/** Roh-Import validieren; nur 8-stellige PZN + Bezeichnungen, sonst verworfen. */
export function parseImport(raw: unknown): PznLibrary | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { entries?: unknown }
  if (!o.entries || typeof o.entries !== 'object') return null
  let lib = emptyLibrary()
  for (const [k, v] of Object.entries(o.entries as Record<string, unknown>)) {
    const label = typeof v === 'string' ? v : ''
    lib = addPzn(lib, k, label)
  }
  return lib
}

/** Import zusammenführen (Mengen-Vereinigung; Ergebnis bleibt eine Menge, keine Linkage). */
export function importMerge(lib: PznLibrary, incoming: PznLibrary): PznLibrary {
  let out = lib
  for (const { pzn, label } of listSorted(incoming)) out = addPzn(out, pzn, label)
  return out
}
