// Sichere Knoten-id: dient als Identifier UND als Key im Einsatz-Werte-Store. Daher als Slug:
// immer KLEIN, Umlaute/ß transliteriert (ae/oe/ue/ss), Leerzeichen + Sonderzeichen (/, ., …) -> _,
// Mehrfach- und Rand-Unterstriche bereinigt. Erlaubt bleibt: a-z, 0-9, _ und -.
// Eindeutigkeit pruefen die Aufrufer per findNode (kann hier nicht, braucht den Baum).
export function sanitizeId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}
