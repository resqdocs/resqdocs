// releaseNotes.ts — Versionsverlauf: die Release-Notes (release-notes/de/<version>.md) lesbar machen.
//
// Reine Logik ohne Vite/Vue (im Node-Test nutzbar). Die Dateien sind die eine Quelle fuer App, Webseite
// und GitHub-Release; hier werden sie nur zerlegt, nichts wird umformuliert.
import { compareVersions } from '@resqdocs/protocol-core/version'

export type NoteKind = 'neu' | 'verbessert' | 'behoben'

export interface NoteSection {
  kind: NoteKind
  /** Ueberschrift fuer die Anzeige */
  label: string
  items: string[]
}

export interface ReleaseNote {
  version: string
  /** Ein Satz Zusammenfassung unter der Ueberschrift (kann leer sein) */
  summary: string
  sections: NoteSection[]
}

const KINDS: Record<string, { kind: NoteKind; label: string }> = {
  added: { kind: 'neu', label: 'Neu' },
  neu: { kind: 'neu', label: 'Neu' },
  changed: { kind: 'verbessert', label: 'Verbessert' },
  verbessert: { kind: 'verbessert', label: 'Verbessert' },
  fixed: { kind: 'behoben', label: 'Behoben' },
  behoben: { kind: 'behoben', label: 'Behoben' },
}

/** `**fett**` aus dem Markdown entfernen - angezeigt wird schlichter Text. */
const plain = (s: string): string => s.replace(/\*\*(.+?)\*\*/g, '$1').trim()

/**
 * Eine Notes-Datei zerlegen. Erwartet `# ResQDocs x.y.z`, optional einen Satz, dann `## Added|Changed|Fixed`
 * mit Listen. Unbekannte Abschnitte werden uebersprungen. null = keine gueltige Version im Kopf.
 */
export function parseReleaseNote(markdown: string): ReleaseNote | null {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const head = lines.find((l) => l.startsWith('# '))
  const version = head?.match(/(\d+\.\d+\.\d+)/)?.[1]
  if (!version) return null
  const note: ReleaseNote = { version, summary: '', sections: [] }
  let current: NoteSection | null = null
  let seenSection = false
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('# ')) continue
    if (line.startsWith('## ')) {
      seenSection = true
      const known = KINDS[line.slice(3).trim().toLowerCase()]
      current = known ? { kind: known.kind, label: known.label, items: [] } : null
      if (current) note.sections.push(current)
      continue
    }
    if (line.startsWith('- ') || line.startsWith('• ')) {
      if (current) current.items.push(plain(line.slice(2)))
      continue
    }
    if (!seenSection && !note.summary) note.summary = plain(line)
  }
  note.sections = note.sections.filter((s) => s.items.length > 0)
  return note
}

/** Alle Dateien zerlegen und absteigend nach Version ordnen (neueste zuerst). Ungueltige fallen weg. */
export function buildHistory(files: readonly string[]): ReleaseNote[] {
  return files
    .map(parseReleaseNote)
    .filter((n): n is ReleaseNote => n !== null && n.sections.length > 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}

export interface NoteItem {
  /** Kurzer Vorspann vor dem Doppelpunkt („Fortschritt beim Tippen:"), sonst leer */
  lead: string
  text: string
}

/** Hoechstlaenge eines Vorspanns: laengere Satzanfaenge mit Doppelpunkt sind kein Stichwort. */
const LEAD_MAX = 48

/**
 * Einen Punkt in Stichwort und Rest teilen, damit die Anzeige das Stichwort hervorheben kann.
 * Nur wenn der Teil vor dem ersten „: " kurz ist und kein Satzende enthaelt; der Text bleibt woertlich.
 */
export function splitLead(item: string): NoteItem {
  const at = item.indexOf(': ')
  if (at <= 0 || at > LEAD_MAX) return { lead: '', text: item }
  const lead = item.slice(0, at)
  if (/[.!?]\s/.test(lead)) return { lead: '', text: item }
  return { lead: lead + ':', text: item.slice(at + 2) }
}

/** Reine Versionsnummer aus der Anzeige „1.10.0 (22)". */
export function baseVersion(display: string): string {
  return display.match(/\d+\.\d+\.\d+/)?.[0] ?? ''
}
