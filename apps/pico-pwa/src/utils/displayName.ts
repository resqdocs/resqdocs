// displayName.ts — App-lokaler Anzeige-Name-Fallback (#70): title (nur Anzeige) > label
// (getippt) > key > lesbare id. Der optionale `resolve` loest Platzhalter in title/label auf
// (PointInput reicht seinen props.resolve durch; Aufrufer ohne Platzhalter-Kontext nutzen die
// Identitaet). Bewusst App-lokal gehalten (eigene Kopie wie im Editor) — NICHT in packages/shared.

/** Macht eine id lesbar: "vorerkrankungen" -> "Vorerkrankungen". */
export function humanize(id: string | undefined): string {
  const s = (id ?? '').replace(/[-_]+/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function displayName(
  p: { title?: unknown; label?: unknown; id?: unknown; key?: unknown },
  resolve: (s: string) => string = (s) => s,
): string {
  return (
    resolve(String(p.title ?? '')) ||
    resolve(String(p.label ?? '')) ||
    (p.key as string) ||
    humanize(p.id as string)
  )
}
