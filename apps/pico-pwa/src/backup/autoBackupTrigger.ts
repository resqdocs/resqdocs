// autoBackupTrigger.ts - Wann die automatische Sicherung anlaufen darf. Rein, ohne Capacitor, headless testbar.
//
// Jede Sicherung laedt die ganze PZN-Bibliothek ueber die SQLite-Bruecke (bei 160.000 Eintraegen Sekunden).
// Laeuft sie zur falschen Zeit, warten alle anderen Abfragen dahinter, etwa die Namen nach dem Medikationsplan-Scan.
// Zwei Fallen:
// 1. Ein unveraenderter Stand wird nicht geschrieben (Dedup). Zaehlte nur das letzte GESCHRIEBENE Backup, galt die
//    Sicherung nach einem Tag ohne Aenderung bei JEDEM Wechsel in den Hintergrund wieder als faellig.
// 2. Eigene Vollbild-Screens der App (nativer Scanner = eigene Activity auf Android) melden der App „Hintergrund"
//    und bei der Rueckkehr „Vordergrund". Das ist kein Verlassen der App und loest keine Sicherung aus.

export interface AutoBackupDueInput {
  /** Vorlagen/Bausteine/Mustertexte seit der letzten Pruefung geaendert. */
  dirty: boolean
  /** Zeitpunkt des letzten geschriebenen Backups (0 = keins). */
  lastSnapshotAt: number
  /** Zeitpunkt der letzten Pruefung, die „unveraendert" ergab (0 = keine). */
  lastCheckAt: number
  /** Mindestabstand der Automatik; null = keine zeitgesteuerte Sicherung. */
  intervalMs: number | null
  now: number
}

/** Faellig bei Aenderung oder wenn seit dem letzten Backup UND der letzten Pruefung das Intervall verstrichen ist. */
export function autoBackupDue(i: AutoBackupDueInput): boolean {
  if (i.dirty) return true
  if (i.intervalMs == null) return false
  return i.now - Math.max(i.lastSnapshotAt, i.lastCheckAt) >= i.intervalMs
}

export interface OwnScreenGate {
  /** Vor dem Oeffnen eines eigenen Vollbild-Screens aufrufen; die Rueckgabe beim Schliessen (mehrfach harmlos). */
  hold(): () => void
  /** App meldet Hintergrund. false = ein eigener Screen ist offen, nichts ausloesen. */
  background(): boolean
  /** App meldet Vordergrund. false = Rueckkehr von einem eigenen Screen, nichts ausloesen. */
  foreground(): boolean
  isOpen(): boolean
}

export function createOwnScreenGate(): OwnScreenGate {
  let open = 0
  // Auf Android kommt das Scan-Ergebnis VOR dem „Vordergrund"-Ereignis an: der Screen ist dann schon
  // freigegeben. Darum merkt sich der unterdrueckte Hintergrund, dass die naechste Rueckkehr dazugehoert.
  let skipNextForeground = false
  return {
    hold() {
      open++
      let released = false
      return () => {
        if (released) return
        released = true
        open = Math.max(0, open - 1)
      }
    },
    background() {
      if (open > 0) {
        skipNextForeground = true
        return false
      }
      return true
    },
    foreground() {
      if (skipNextForeground) {
        skipNextForeground = false
        return false
      }
      return true
    },
    isOpen() {
      return open > 0
    },
  }
}

/** App-weite Instanz: der native Scanner haelt sie, useBackup fragt sie ab. */
export const ownScreenGate = createOwnScreenGate()
