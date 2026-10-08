// Query-Aufbereitung fuer das Medikamenten-Suchfeld (#275).
//
// Zwei Anforderungen des Maintainers bei unleserlichen Plaenen:
//  - Fragmente ab 3 Zeichen genuegen, auch aus der Wortmitte (Infix), nicht nur als Praefix.
//  - `*` als Platzhalter fuer beliebige Zeichen nutzbar (meto* / *sartan / me*for*).
//
// Beide Backends teilen sich DIESE Semantik: der native Pfad setzt sie in SQL-LIKE um (durch den
// Trigram-Index beschleunigt), der In-Memory-Pfad in eine RegExp. Damit beide gleich matchen, ist die
// Aufbereitung hier zentralisiert und einzeln getestet.
//
// `*` und Leerraum bedeuten beides „beliebige Zeichen dazwischen": „meto 500" findet „Metoprolol …
// 500". Die 3-Zeichen-Schwelle zaehlt die BEDEUTUNGSTRAGENDEN Zeichen (ohne * und Leerraum) - sonst
// wuerde „**" oder „a b" eine Volltabellensuche ausloesen.
//
// Der Kern dieser Semantik (Infix, Platzhalter, Kopf-Fragment) liegt seit #278 im gemeinsamen
// Such-Kern packages/shared/textSearch.ts - dieselbe Suche nutzen die langen Optionslisten im Einsatz.
// Hier bleibt nur, was die Medikamentensuche zusaetzlich braucht: die 3-Zeichen-Schwelle, SQL-LIKE
// fuer den nativen Pfad und die PZN-Ziffern.
import { meaningfulLength, wildcardRegExp, queryHead } from '@resqdocs/protocol-core/textSearch'

export { meaningfulLength, queryHead }

/** Mindestzahl bedeutungstragender Zeichen, ab der ueberhaupt gesucht wird. */
export const SUGGEST_MIN_CHARS = 3

/**
 * SQL-LIKE-Muster fuer den nativen Pfad. `*` und Leerraum -> `%`; LIKE-Sonderzeichen (% _ \) werden
 * escaped (die Abfrage nutzt `ESCAPE '\'`). Gibt null zurueck, wenn zu wenig Substanz da ist.
 */
export function toLikePattern(query: string): string | null {
  const q = query.trim().toLowerCase()
  if (meaningfulLength(q) < SUGGEST_MIN_CHARS) return null
  const escaped = q.replace(/[\\%_]/g, '\\$&') // Backslash zuerst, dann % und _
  const body = escaped.replace(/\*+/g, '%').replace(/\s+/g, '%')
  return `%${body}%`
}

/**
 * RegExp fuer den In-Memory-Pfad, gleiche Semantik wie toLikePattern. `*`/Leerraum -> `.*`, alles
 * andere literal (regex-escaped). Gibt null zurueck, wenn zu wenig Substanz da ist.
 */
export function toSuggestRegExp(query: string): RegExp | null {
  if (meaningfulLength(query) < SUGGEST_MIN_CHARS) return null
  return wildcardRegExp(query)
}

/** Extrahiert eine PZN-Ziffernfolge fuer die zusaetzliche PZN-Suche; null unter 3 Ziffern. */
export function pznDigits(query: string): string | null {
  const digits = query.replace(/\D/g, '')
  return digits.length >= SUGGEST_MIN_CHARS ? digits : null
}

/** LIKE-Praefixmuster (`frag%`) aus queryHead; null, wenn kein fuehrendes Fragment da ist. */
export function toPrefixPattern(query: string): string | null {
  const head = queryHead(query)
  if (!head) return null
  return `${head.replace(/[\\%_]/g, '\\$&')}%`
}
