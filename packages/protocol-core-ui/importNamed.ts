// importNamed.ts — gewählte gespeicherte Abschnitte und Textbausteine einer Sammlung übernehmen (App und Editor).
// Plan nach den Regeln von namedImport.planNamedImport (wie bei Vorlagen); hier nur das Ausführen in die
// jeweilige Bibliothek. Die Bibliotheken kommen als Parameter (Abschnitte: useBlockLibrary in App und Editor;
// Textbausteine: App useBausteine, Editor useSnippetLibrary), damit die Datei ohne Vue im Node-Test läuft.
import type { Container } from '@resqdocs/protocol-core/model'
import type { SnippetPayload } from '@resqdocs/protocol-core/snippetIO'
import { planNamedImport, type NamedChoice } from '@resqdocs/protocol-core/namedImport'

export interface NamedImportResult {
  added: number
  overwritten: number
  renamed: number
  /** Einträge, die nicht gespeichert werden konnten (Titel), damit nichts still verloren geht. */
  failed: string[]
}

type SaveOutcome = { ok: true; title: string } | { ok: false; error: string }
export interface BlockWriter {
  loaded: { value: boolean }
  blocks: { value: readonly Container[] }
  reload: () => Promise<void>
  addBausteinFromContainer: (c: Container, name: string) => Promise<SaveOutcome>
  replaceBlock: (id: string, c: Container, name: string) => Promise<SaveOutcome>
}
export async function importBlocksWithChoices(choices: readonly NamedChoice<Container>[], lib: BlockWriter): Promise<NamedImportResult> {
  if (!lib.loaded.value) await lib.reload().catch(() => {})
  const plan = planNamedImport(lib.blocks.value.map((b) => ({ id: b.id, title: b.title })), choices)
  const failed: string[] = []
  // Gezählt wird nur, was wirklich gespeichert wurde (nicht der Plan).
  let added = 0, overwritten = 0, renamed = 0
  for (const a of plan.actions) {
    const r = a.kind === 'overwrite' ? await lib.replaceBlock(a.id, a.item, a.title) : await lib.addBausteinFromContainer(a.item, a.title)
    if (!r.ok) failed.push(a.title)
    else if (a.kind === 'overwrite') overwritten++
    else {
      added++
      if (a.renamed) renamed++
    }
  }
  return { added, overwritten, renamed, failed }
}

/** add/update MÜSSEN werfen, wenn das Speichern scheitert; sonst gilt der Eintrag als übernommen. */
export interface SnippetWriter {
  existing: () => readonly { id: string; title?: string }[]
  add: (title: string, text: string) => Promise<unknown>
  update: (id: string, patch: { title: string; text: string }) => Promise<unknown>
}
export async function importSnippetsWithChoices(choices: readonly NamedChoice<SnippetPayload>[], w: SnippetWriter): Promise<NamedImportResult> {
  const plan = planNamedImport(w.existing(), choices)
  const failed: string[] = []
  let added = 0, overwritten = 0, renamed = 0
  for (const a of plan.actions) {
    try {
      if (a.kind === 'overwrite') {
        await w.update(a.id, { title: a.title, text: a.item.text })
        overwritten++
      } else {
        await w.add(a.title, a.item.text)
        added++
        if (a.renamed) renamed++
      }
    } catch {
      failed.push(a.title)
    }
  }
  return { added, overwritten, renamed, failed }
}

/** Ergebnis für die Meldung: „2 Vorlagen, 1 gespeicherter Abschnitt übernommen. 1 vorhandener ersetzt. …“ */
export function importMessage(r: { /** übernommene Vorlagen inkl. ersetzter */ trees: number; blocks: NamedImportResult | null; snippets: NamedImportResult | null; treesOverwritten: number; treesRenamed: number }): string {
  const teil = (n: number, eins: string, viele: string): string => (n ? `${n} ${n === 1 ? eins : viele}` : '')
  const b = r.blocks, s = r.snippets
  // übernommen = neu angelegt oder ersetzt (wie bisher bei Vorlagen); Ersetztes wird zusätzlich genannt
  const neu = [teil(r.trees, 'Vorlage', 'Vorlagen'), teil((b?.added ?? 0) + (b?.overwritten ?? 0), 'gespeicherter Abschnitt', 'gespeicherte Abschnitte'), teil((s?.added ?? 0) + (s?.overwritten ?? 0), 'Textbaustein', 'Textbausteine')].filter(Boolean)
  const ersetzt = r.treesOverwritten + (b?.overwritten ?? 0) + (s?.overwritten ?? 0)
  const umbenannt = r.treesRenamed + (b?.renamed ?? 0) + (s?.renamed ?? 0)
  const fehler = [...(b?.failed ?? []), ...(s?.failed ?? [])]
  return [
    neu.length ? `${neu.join(', ')} übernommen.` : '',
    ersetzt ? `${ersetzt} ${ersetzt === 1 ? 'vorhandener Eintrag' : 'vorhandene Einträge'} ersetzt.` : '',
    umbenannt ? `${umbenannt} mit dem Zusatz „(Import)“, weil der Name schon vergeben war.` : '',
    fehler.length ? `Nicht gespeichert: ${fehler.map((t) => `„${t}“`).join(', ')}.` : '',
  ].filter(Boolean).join(' ')
}
