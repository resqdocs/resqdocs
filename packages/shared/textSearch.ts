// Gemeinsamer Such-Kern (#278): EINE Suchsemantik fuer die ganze App.
//
// Genutzt von der Medikamentensuche (apps/pico-pwa/src/medications/pznSuggest.ts) und von der Suche in
// langen Optionslisten im Einsatz (EinsatzField). Damit verhalten sich beide garantiert gleich - so wie
// es fuer die Felder im Bestand gilt: moeglichst viele Funktionen ueberall gleich.
//
// Bedeutung:
//  - Teiltreffer ueberall (Infix), Gross-/Kleinschreibung egal.
//  - `*` und Leerraum = beliebige Zeichen dazwischen („meto 500", „me*for").
//  - Treffer, deren Text mit dem fuehrenden Fragment BEGINNT, stehen vorn - bei Einsatzcodes ist das
//    die Nummer vom Pieper („012" vor „112: …").
// Mindestlaengen sind Sache des Aufrufers: die Medikamentensuche gatet bei 3 Zeichen (rund 317k Eintraege),
// Optionslisten suchen ab dem 1. Zeichen (Codes sind kurz).

/** Bedeutungstragende Laenge (ohne Platzhalter/Leerraum). */
export function meaningfulLength(query: string): number {
  return query.replace(/[*\s]+/g, '').length
}

/**
 * RegExp fuer Infix + Platzhalter: `*`/Leerraum -> `.*`, alles andere literal (regex-escaped).
 * Testet gegen lowercase-Text. null, wenn die Anfrage nichts Bedeutungstragendes enthaelt.
 */
export function wildcardRegExp(query: string): RegExp | null {
  const q = query.trim().toLowerCase()
  if (meaningfulLength(q) === 0) return null
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // alles regex-escapen, inkl. \*
  return new RegExp(escaped.replace(/\\\*/g, '.*').replace(/\s+/g, '.*'))
}

/** Fuehrendes Fragment (bis zum ersten `*`/Leerraum), lowercase. Leer, wenn die Anfrage mit `*` beginnt. */
export function queryHead(query: string): string {
  return query.trim().toLowerCase().split(/[*\s]/)[0] ?? ''
}

/** Ab so vielen Optionen bekommt eine Optionsliste im Einsatz ein Suchfeld (#278, Maintainer-Entscheid:
 *  Felder bis 15 Optionen bleiben exakt wie bisher). */
export const OPTION_SEARCH_MIN = 16

/**
 * Optionen filtern und reihen: Anfangstreffer zuerst, danach die uebrigen Treffer - innerhalb beider
 * Gruppen in der Reihenfolge der Vorlage (die ist kuratiert, z. B. nach Codenummer). Leere Anfrage ->
 * alle Optionen unveraendert.
 */
export function searchOptions(options: readonly string[], query: string): string[] {
  const re = wildcardRegExp(query)
  if (!re) return [...options]
  const head = queryHead(query)
  const anfang: string[] = []
  const rest: string[] = []
  for (const option of options) {
    const text = option.toLowerCase()
    if (!re.test(text)) continue
    if (head !== '' && text.startsWith(head)) anfang.push(option)
    else rest.push(option)
  }
  return [...anfang, ...rest]
}

/**
 * Was die durchsuchbare Liste anzeigt. Bei Mehrfachauswahl (`selected` gesetzt) stehen die gewaehlten
 * Optionen IMMER oben - auch wenn sie nicht zur Suche passen -, damit sich eine Auswahl jederzeit wieder
 * abwaehlen laesst; darunter die Treffer ohne die bereits gewaehlten. Einfachauswahl: nur die Treffer.
 */
export function visibleOptions(options: readonly string[], query: string, selected?: ReadonlySet<string>): string[] {
  const hits = searchOptions(options, query)
  if (!selected) return hits
  return [...options.filter((o) => selected.has(o)), ...hits.filter((o) => !selected.has(o))]
}
