// staerkeSuggestion.ts — nicht-destruktiver Wirkstärke-VORSCHLAG aus einem Freitext-Label (#262).
//
// NUR eine Tipp-Hilfe für die Pflege-Maske: Der Vorschlag wird angezeigt und erst durch
// bewusstes Übernehmen + Speichern Teil des Eintrags; das Label bleibt IMMER unangetastet
// (Maintainer-Entscheidung: kein Bulk, kein automatisches Herausschneiden — falsche Stärke
// wäre schlimmer als keine). Deshalb bewusst konservativ:
//  - nur Zahl+Einheit-Muster (mg, g, µg/ug/mcg, ml, %, I.E.), optional Kombi (500/125 mg)
//    und Bezug (1,5 mg/ml, 40 mg/0,4 ml)
//  - MEHRERE Treffer im Label -> KEIN Vorschlag (ambig, z. B. "40 mg 100 ml")
//  - nackte Zahlen ohne Einheit ("Ibu 600", "B12", "D3") -> kein Vorschlag
//  - RATEN ("12 µg/h", "5 mg/24 h") -> KEIN Vorschlag: eine verkuerzte Rate waere eine
//    gefaehrlich falsche Staerke (Pflaster!); unkonsumierter "/"-Rest verwirft den Treffer
//  - reines Volumen ("Pen 3 ml") -> kein Vorschlag: das ist Gebindegroesse, keine Wirkstaerke
export function suggestStaerkeFromLabel(label: string): string | null {
  if (typeof label !== 'string' || !label.trim()) return null
  const unit = '(?:mg|g|µg|ug|mcg|ml|%|I\\.?\\s?E\\.?)'
  const num = '\\d+(?:[.,]\\d+)?'
  const re = new RegExp(
    // Zahl [ /Zahl ...] Einheit [ /[Zahl] (ml|g|Dosis|Hub) ]; danach weder Wortzeichen noch "/"
    `(?<![\\d,.])(${num}(?:\\s*/\\s*${num})*)\\s*(${unit})(\\s*/\\s*(?:${num}\\s*)?(?:ml|g|Dosis|Hub))?(?!\\s*/)(?![\\p{L}\\p{N}_])`,
    'giu',
  )
  const matches = [...label.matchAll(re)]
  if (matches.length !== 1) return null
  const m = matches[0]
  // Reines Volumen ist keine Wirkstaerke (Gebindegroesse) - nur ml MIT Zaehler-Kontext (mg/ml) ok.
  if (/^ml$/i.test(m[2]) && !m[3]) return null
  const zahl = m[1].replace(/\s*\/\s*/g, '/')
  const einheit = m[2].replace(/\s+/g, '')
  const bezug = (m[3] ?? '').replace(/\s+/g, ' ').replace(/\s*\/\s*/, '/').trim()
  return `${zahl} ${einheit}${bezug ? bezug.replace(/^\//, '/') : ''}`.trim()
}
