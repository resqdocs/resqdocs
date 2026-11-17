// Zentrales Import-Routing (pico-pwa): erkennt eine Datei am Schema (detectAndParse) und leitet sie ans
// richtige Ziel — egal, an welcher Import-Stelle sie eingeworfen wurde. So ist es „nicht so schlimm, an der
// falschen Stelle zu importieren, solange es richtig gespeichert wird". Block/Snippet/Vorlage sind in der App
// globale Singletons und damit von jeder Stelle erreichbar. Vorlagen (einzeln oder als Sammlung) gehen IMMER in den
// ImportChoiceDialog: Name wählen, bei Namensgleichheit überschreiben oder als neue Vorlage. PZN bleibt
// außen vor (eigene Domäne, kein schema-Envelope).
import type { Container } from '@resqdocs/protocol-core/model'
import { detectAndParse, kindNoun, type DetectResult } from '@resqdocs/protocol-core/importRouter'
import { useBlockLibrary } from '@resqdocs/protocol-core-ui/useBlockLibrary'
import { useBausteine } from './useBausteine'
import { offerImport } from './useImportChoice'

export type ImportOutcome = { ok: boolean; message: string }

async function routeBlock(tree: Container): Promise<ImportOutcome> {
  const out = await useBlockLibrary().addBausteinFromContainer(tree, (tree.title ?? '').trim() || 'Importierter Abschnitt')
  return out.ok ? { ok: true, message: `Als gespeicherter Abschnitt „${out.title}“ importiert.` } : { ok: false, message: out.error }
}
async function routeSnippet(title: string, text: string): Promise<ImportOutcome> {
  const saved = title.trim() || 'Importierter Textbaustein' // gleicher Fallback wie addSnippetFrom -> Meldung == gespeichert
  await useBausteine().addSnippetFrom(title, text)
  return { ok: true, message: `Als Textbaustein „${saved}“ importiert.` }
}
/** Vorlage(n) zur Entscheidung anbieten (ImportChoiceDialog): Name, Überschreiben oder neu - nichts wird
 *  ungefragt übernommen. */
function offerProtocols(trees: Container[]): ImportOutcome {
  offerImport(trees)
  return { ok: true, message: trees.length === 1 ? 'Vorlage erkannt: bitte Namen prüfen und übernehmen.' : `${trees.length} Vorlagen erkannt: bitte auswählen und übernehmen.` }
}
type OkResult = Extract<DetectResult, { ok: true }>

/** Ein bereits erkanntes Objekt ans Ziel routen (Block/Snippet zentral, Vorlage „als neu"). Für Aufrufer,
 *  die das Schema selbst prüfen (z. B. das Vorlagen-Sheet mit eigenem Kollisions-Dialog für Protokolle). */
export function routeDetected(r: OkResult): Promise<ImportOutcome> {
  if (r.kind === 'block') return routeBlock(r.tree)
  if (r.kind === 'snippet') return routeSnippet(r.snippet.title, r.snippet.text)
  if (r.kind === 'bundle') return Promise.resolve(offerProtocols(r.trees))
  return Promise.resolve(offerProtocols([r.tree]))
}

/**
 * Erkennt `json` am Schema und routet ans richtige Ziel. Block/Snippet werden immer zentral übernommen.
 * Vorlagen: ohne onProtocol „als neu"; mit onProtocol (z. B. Vorlagen-Sheet mit Kollisions-Dialog) wird die
 * Behandlung an den Aufrufer delegiert. Gibt eine nutzerlesbare Erfolgs-/Fehlermeldung zurück.
 */
export async function routeImport(
  json: string,
  onProtocol?: (tree: Container) => ImportOutcome | Promise<ImportOutcome>,
): Promise<ImportOutcome> {
  const r = detectAndParse(json)
  if (!r.ok) {
    // Bekanntes-aber-abgelehntes Schema -> „Vorlage erkannt, aber …" statt nacktem Fehler.
    return { ok: false, message: (r.kind ? `${kindNoun(r.kind)} erkannt, aber ` : '') + r.error }
  }
  if (r.kind === 'protocol' && onProtocol) return onProtocol(r.tree)
  return routeDetected(r)
}
