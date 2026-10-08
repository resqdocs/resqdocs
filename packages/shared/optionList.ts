// „Liste einfuegen" im Editor (#278): viele Auswahl-Optionen auf einmal anlegen - etwa mehrere hundert
// Alarmierungscodes „Zahl: Einsatzmeldung" oder eine lange Vorerkrankungen-Liste.
//
// Regeln:
//  - Eine Option pro Zeile; Leerzeilen fallen weg; Leerraum innerhalb einer Zeile wird zu EINEM Leerzeichen
//    (beim Kopieren aus Tabellen kommen sonst Tabs mit).
//  - Bestehende Optionen bleiben unangetastet (Reihenfolge, Standard, Exklusiv-Markierungen haengen am
//    exakten Text). Neue werden hinten angehaengt; exakt Vorhandenes wird nicht doppelt angelegt.
//  - Leere Platzhalter-Zeilen (frisch per „Eintrag hinzufuegen" angelegt, noch ohne Text) fallen weg -
//    sie sind keine Option und stuenden sonst mitten in der Liste.

export interface OptionAppend {
  options: string[]
  /** neu angelegte Optionen */
  added: number
  /** uebersprungene Zeilen, weil schon vorhanden (oder im Eingefuegten doppelt) */
  duplicates: number
}

export function appendOptions(existing: readonly string[], text: string): OptionAppend {
  const options = existing.filter((o) => o !== '')
  const seen = new Set(options)
  let added = 0
  let duplicates = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (line === '') continue
    if (seen.has(line)) {
      duplicates++
      continue
    }
    seen.add(line)
    options.push(line)
    added++
  }
  return { options, added, duplicates }
}
