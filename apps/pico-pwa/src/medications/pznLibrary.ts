// pznLibrary.ts — nutzergepflegte, lokale PZN-Bibliothek (reine, testbare Logik).
//
// Rechtlicher Rahmen (belegbar, keine Rechtsberatung):
//  - IFA-/sui-generis-DB-Recht: KEINE Entnahme aus IFA-abgeleiteten Sammlungen,
//    KEIN externer/automatischer PZN→Name-Lookup. Bezeichnung/Kategorie/Bemerkung
//    vergibt NUR der Nutzer selbst (Erfassung eines Primärfaktums).
//  - Art. 9 DSGVO: die Bibliothek ist eine **Menge** eindeutiger PZN, vollständig
//    ENTKOPPELT vom Einsatz/Protokoll (#173). Sie darf zu KEINEM Zeitpunkt
//    rekonstruieren, welche PZN zusammen auf einem Plan standen — daher KEIN
//    Zeitstempel, KEINE Sitzungs-/Scan-ID, KEINE Reihenfolge/Gruppierung/Quelle.
//
// Speicherform: Map pzn -> Eintrag (Bezeichnung + Kategorie + Bemerkung; "" = leer).
// Eine Map ist inhärent eine Menge (Dedup über den Schlüssel); Auflistung/Export
// werden nach PZN SORTIERT, damit auch die Einfüge-Reihenfolge nicht nach außen
// dringt. Abwärtskompatibel: ältere Bibliotheken (pzn -> Bezeichnung als String)
// werden beim Parsen transparent in die Objektform migriert (#190 Kategorie/Bemerkung).
//
// Kategorie = FIXE, admin-gepflegte Auswahl (pznCategories.ts), gegen die Liste
// validiert (unbekannt → ""); Bemerkung = freier Nutzer-Text.
import { isPznCategory } from './pznCategories.ts'

/** Pro-Eintrag-Daten: alles nutzergepflegt, alles optional außer dem PZN-Schlüssel. */
export interface PznEntryData {
  /** Wirkstoff (z. B. „Ibuprofen") — wichtiger als die Bezeichnung; "" wenn keiner. */
  wirkstoff: string
  /** Selbst vergebene Bezeichnung/Handelsname ("" wenn keine). */
  label: string
  /** Selbst vergebene Kategorie/Gruppe (z. B. „Analgetikum"); "" wenn keine. */
  category: string
  /** Kurze eigene Bemerkung zur Funktion/zum Hinweis; "" wenn keine. */
  note: string
}

/** EINE Bibliothek = Menge eindeutiger PZN mit selbst vergebenen Eintrags-Daten. */
export interface PznLibrary {
  version: 2
  /** 8-stellige PZN -> Eintrags-Daten. */
  entries: Record<string, PznEntryData>
}

export interface PznEntry {
  pzn: string
  wirkstoff: string
  label: string
  category: string
  note: string
}

export function emptyLibrary(): PznLibrary {
  return { version: 2, entries: {} }
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

/** Einzeiligen Freitext säubern (Trim, keine Steuerzeichen/Umbrüche, Längenlimit). */
function sanitizeText(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max)
}
/** Wirkstoff säubern (≤120). Exportiert: auch der SQLite-Repo sanitisiert vor jedem Write. */
export function sanitizeWirkstoff(wirkstoff: unknown): string {
  return sanitizeText(wirkstoff, 120)
}
/** Bezeichnung säubern (≤120). Exportiert: auch der SQLite-Repo sanitisiert vor jedem Write. */
export function sanitizeLabel(label: unknown): string {
  return sanitizeText(label, 120)
}
/** Kategorie gegen die FIXE Admin-Liste validieren; Unbekanntes/Freitext → "" (keine). */
export function sanitizeCategory(category: unknown): string {
  const c = sanitizeText(category, 60)
  return isPznCategory(c) ? c : ''
}
/** Bemerkung säubern (≤240 — „kurze" Bemerkung, einzeilig). */
export function sanitizeNote(note: unknown): string {
  return sanitizeText(note, 240)
}

/**
 * Roh-Wert eines Eintrags in die Objektform bringen. Abwärtskompatibel: ein
 * String ist die alte „nur Bezeichnung"-Form (v1) und wird zu { label, '', '' }.
 */
function toEntryData(v: unknown): PznEntryData {
  if (typeof v === 'string') return { wirkstoff: '', label: sanitizeLabel(v), category: '', note: '' }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return {
      wirkstoff: sanitizeWirkstoff(o.wirkstoff),
      label: sanitizeLabel(o.label),
      category: sanitizeCategory(o.category),
      note: sanitizeNote(o.note),
    }
  }
  return { wirkstoff: '', label: '', category: '', note: '' }
}

function withEntry(lib: PznLibrary, pzn: string, data: PznEntryData): PznLibrary {
  return { version: 2, entries: { ...lib.entries, [pzn]: data } }
}

/**
 * PZN aufnehmen (Dedup, Mengen-Semantik). Konfliktregel (bewusst, dokumentiert):
 * eine bereits vorhandene **nicht-leere** Bezeichnung GEWINNT immer — sie wird von
 * Add/Transfer/Import NIE überschrieben (kein Zerstören kuratierter Einträge). Eine
 * leere Bezeichnung darf durch einen nicht-leeren Vorschlag gefüllt werden. Kategorie
 * und Bemerkung eines vorhandenen Eintrags bleiben unberührt. Das gezielte Ändern
 * läuft ausschließlich über setLabel/setCategory/setNote/upsertEntry (bewusste
 * Nutzer-Eingabe in der Verwaltung). So überschreibt weder ein entkoppelter
 * Plan-Transfer noch ein Backup-Import eine Eigen-Bezeichnung.
 */
export function addPzn(lib: PznLibrary, raw: string, label?: string): PznLibrary {
  const pzn = normalizePzn(raw)
  if (!pzn) return lib
  const next = sanitizeLabel(label)
  const existing = lib.entries[pzn]
  if (existing) {
    // Vorhandenes nicht-leeres Label gewinnt; leeres wird mit `next` gefüllt.
    return withEntry(lib, pzn, { ...existing, label: existing.label !== '' ? existing.label : next })
  }
  return withEntry(lib, pzn, { wirkstoff: '', label: next, category: '', note: '' })
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

/**
 * Eintrag erfassen/aktualisieren (bewusste Verwaltung): legt neu an oder überschreibt
 * gezielt die angegebenen Felder eines vorhandenen Eintrags. Anders als addPzn (Transfer/
 * Import) ist dies eine ausdrückliche Nutzer-Eingabe, darf also kuratierte Werte ersetzen.
 * Nicht angegebene Felder (undefined) bleiben unverändert.
 */
export function upsertEntry(
  lib: PznLibrary,
  raw: string,
  fields: { wirkstoff?: string; label?: string; category?: string; note?: string },
): PznLibrary {
  const pzn = normalizePzn(raw)
  if (!pzn) return lib
  const base = lib.entries[pzn] ?? { wirkstoff: '', label: '', category: '', note: '' }
  return withEntry(lib, pzn, {
    wirkstoff: fields.wirkstoff !== undefined ? sanitizeWirkstoff(fields.wirkstoff) : base.wirkstoff,
    label: fields.label !== undefined ? sanitizeLabel(fields.label) : base.label,
    category: fields.category !== undefined ? sanitizeCategory(fields.category) : base.category,
    note: fields.note !== undefined ? sanitizeNote(fields.note) : base.note,
  })
}

/** Wirkstoff einer vorhandenen PZN setzen/ändern (nur Nutzer-Eingabe). */
export function setWirkstoff(lib: PznLibrary, raw: string, wirkstoff: string): PznLibrary {
  const pzn = normalizePzn(raw)
  if (!pzn || !(pzn in lib.entries)) return lib
  return withEntry(lib, pzn, { ...lib.entries[pzn], wirkstoff: sanitizeWirkstoff(wirkstoff) })
}

/** Bezeichnung einer vorhandenen PZN setzen/ändern (nur Nutzer-Eingabe). */
export function setLabel(lib: PznLibrary, raw: string, label: string): PznLibrary {
  const pzn = normalizePzn(raw)
  if (!pzn || !(pzn in lib.entries)) return lib
  return withEntry(lib, pzn, { ...lib.entries[pzn], label: sanitizeLabel(label) })
}

/** Kategorie einer vorhandenen PZN setzen/ändern (nur Nutzer-Eingabe). */
export function setCategory(lib: PznLibrary, raw: string, category: string): PznLibrary {
  const pzn = normalizePzn(raw)
  if (!pzn || !(pzn in lib.entries)) return lib
  return withEntry(lib, pzn, { ...lib.entries[pzn], category: sanitizeCategory(category) })
}

/** Bemerkung einer vorhandenen PZN setzen/ändern (nur Nutzer-Eingabe). */
export function setNote(lib: PznLibrary, raw: string, note: string): PznLibrary {
  const pzn = normalizePzn(raw)
  if (!pzn || !(pzn in lib.entries)) return lib
  return withEntry(lib, pzn, { ...lib.entries[pzn], note: sanitizeNote(note) })
}

export function removePzn(lib: PznLibrary, raw: string): PznLibrary {
  const pzn = normalizePzn(raw)
  if (!pzn || !(pzn in lib.entries)) return lib
  const entries = { ...lib.entries }
  delete entries[pzn]
  return { version: 2, entries }
}

/** Eigene Bezeichnung zu einer PZN (für Re-Scan-Vorbefüllung), null wenn unbekannt. */
export function getLabel(lib: PznLibrary, raw: string): string | null {
  const pzn = normalizePzn(raw)
  if (!pzn) return null
  return pzn in lib.entries ? lib.entries[pzn].label : null
}

/** Vollständiger Eintrag zu einer PZN (Scan→Identifizieren), null wenn unbekannt. */
export function getEntry(lib: PznLibrary, raw: string): PznEntry | null {
  const pzn = normalizePzn(raw)
  if (!pzn || !(pzn in lib.entries)) return null
  const d = lib.entries[pzn]
  return { pzn, wirkstoff: d.wirkstoff, label: d.label, category: d.category, note: d.note }
}

export function hasPzn(lib: PznLibrary, raw: string): boolean {
  const pzn = normalizePzn(raw)
  return pzn !== null && pzn in lib.entries
}

/** Sortierte Liste (nach PZN) — verhindert, dass die Einfüge-Reihenfolge leakt. */
export function listSorted(lib: PznLibrary): PznEntry[] {
  return Object.keys(lib.entries)
    .sort()
    .map((pzn) => ({ pzn, ...lib.entries[pzn] }))
}

export function count(lib: PznLibrary): number {
  return Object.keys(lib.entries).length
}

/**
 * Freie Suche über eine (bereits sortierte) Eintragsliste (#190): leerer/Whitespace-
 * Query → unverändert; sonst case-insensitiver Teilstring-Match auf PZN, Bezeichnung,
 * Kategorie ODER Bemerkung. Rein/Vue-frei (node --test).
 */
export function filterEntries(entries: PznEntry[], query: string): PznEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  return entries.filter(
    (e) =>
      e.pzn.toLowerCase().includes(q) ||
      e.wirkstoff.toLowerCase().includes(q) ||
      e.label.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      e.note.toLowerCase().includes(q),
  )
}

/** Sortierfeld (#190): nach PZN, Wirkstoff, Bezeichnung oder Kategorie/Gruppe. */
export type PznSortKey = 'pzn' | 'wirkstoff' | 'label' | 'category'
/** Sortierrichtung. */
export type SortDirection = 'asc' | 'desc'

const byPzn = (a: PznEntry, b: PznEntry): number => a.pzn.localeCompare(b.pzn)

/** Locale-/zahlenbewusster Textvergleich (de), leere Werte IMMER ans Ende. */
function compareText(av: string, bv: string, tieBreak: (a: PznEntry, b: PznEntry) => number, a: PznEntry, b: PznEntry, factor: number): number {
  const at = av.trim()
  const bt = bv.trim()
  if (!at && !bt) return tieBreak(a, b) // beide leer → Tiebreak (stabil)
  if (!at) return 1 // a leer → ans Ende (richtungsunabhängig)
  if (!bt) return -1 // b leer → ans Ende
  const c = at.localeCompare(bt, 'de', { sensitivity: 'base', numeric: true })
  return (c !== 0 ? c : tieBreak(a, b)) * factor
}

/**
 * Sortiert eine Eintragsliste nach PZN, Bezeichnung oder Kategorie, auf-/absteigend
 * (#190). Bei Text-Schlüsseln stehen Einträge OHNE den Wert IMMER am Ende
 * (richtungsunabhängig), damit benannte/kategorisierte Einträge nicht unter leeren
 * verschwinden; PZN ist der stabile Zweitschlüssel. Nicht-mutierend (kopiert vor sort).
 */
export function sortEntries(
  entries: PznEntry[],
  key: PznSortKey,
  dir: SortDirection = 'asc',
): PznEntry[] {
  const factor = dir === 'desc' ? -1 : 1
  return [...entries].sort((a, b) => {
    if (key === 'wirkstoff') return compareText(a.wirkstoff, b.wirkstoff, byPzn, a, b, factor)
    if (key === 'label') return compareText(a.label, b.label, byPzn, a, b, factor)
    if (key === 'category') return compareText(a.category, b.category, byPzn, a, b, factor)
    return byPzn(a, b) * factor
  })
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

/** Baut eine Bibliothek aus einer Eintragsliste (z. B. allSorted() eines Backends) — sanitisiert. */
export function fromEntries(entries: PznEntry[]): PznLibrary {
  let lib = emptyLibrary()
  for (const e of entries) {
    const pzn = normalizePzn(e.pzn)
    if (!pzn) continue
    lib = withEntry(lib, pzn, {
      wirkstoff: sanitizeWirkstoff(e.wirkstoff),
      label: sanitizeLabel(e.label),
      category: sanitizeCategory(e.category),
      note: sanitizeNote(e.note),
    })
  }
  return lib
}

/** Export-Wert eines Eintrags: kompakt als String, wenn NUR eine Bezeichnung vorliegt. */
type ExportedEntry = string | { wirkstoff: string; label: string; category: string; note: string }

/**
 * Export: NUR Version + PZN→Eintrag, sortiert; keine Metadaten/Linkage. Einträge mit
 * NUR einer Bezeichnung (kein Wirkstoff/Kategorie/Bemerkung) werden als reiner String
 * exportiert (klein + v1-formgleich), sonst als Objekt. parseImport liest beide Formen.
 */
export function exportLibrary(lib: PznLibrary): { version: 2; entries: Record<string, ExportedEntry> } {
  const entries: Record<string, ExportedEntry> = {}
  for (const e of listSorted(lib)) {
    entries[e.pzn] = e.wirkstoff === '' && e.category === '' && e.note === ''
      ? e.label
      : { wirkstoff: e.wirkstoff, label: e.label, category: e.category, note: e.note }
  }
  return { version: 2, entries }
}

/**
 * Roh-Import validieren; nur 8-stellige PZN + (String|Objekt-)Einträge, sonst verworfen.
 * Akzeptiert v1 (Wert=Bezeichnung als String) UND v2 (Wert={label,category,note}).
 */
export function parseImport(raw: unknown): PznLibrary | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { entries?: unknown }
  if (!o.entries || typeof o.entries !== 'object') return null
  let lib = emptyLibrary()
  for (const [k, v] of Object.entries(o.entries as Record<string, unknown>)) {
    const pzn = normalizePzn(k)
    if (!pzn) continue
    lib = withEntry(lib, pzn, toEntryData(v))
  }
  return lib
}

/** Konflikt-Strategie beim Import (Nutzerwahl VOR der Dateiauswahl). */
export type ImportMode = 'overwrite' | 'skip'

/**
 * Import zusammenführen = MERGE, NICHT Ersetzen der ganzen Bibliothek: PZNs, die nur
 * lokal existieren, bleiben IMMER erhalten (keine Löschung); PZNs nur im Import kommen
 * dazu. Bei KONFLIKT (PZN in beiden) entscheidet der Modus:
 *  - 'overwrite' (Default): der Import gewinnt — vorhandener Eintrag wird mit den
 *    importierten Werten (Bezeichnung/Kategorie/Bemerkung) überschrieben.
 *  - 'skip': Duplikate werden übersprungen — nur fehlende Einträge werden ergänzt,
 *    vorhandene bleiben unverändert.
 *
 * Dies ist die EINZIGE Stelle mit „Import gewinnt"-Option. Der entkoppelte Protokoll-
 * Transfer (addPzn/addOne) behält bewusst „vorhandenes Label gewinnt".
 */
export function importMerge(
  lib: PznLibrary,
  incoming: PznLibrary,
  mode: ImportMode = 'overwrite',
): PznLibrary {
  let out = lib
  for (const e of listSorted(incoming)) {
    if (mode === 'skip' && e.pzn in out.entries) continue // Duplikat überspringen
    out = withEntry(out, e.pzn, { wirkstoff: e.wirkstoff, label: e.label, category: e.category, note: e.note })
  }
  return out
}
