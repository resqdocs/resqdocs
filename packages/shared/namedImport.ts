// Gewählte gespeicherte Abschnitte und Textbausteine aus einer Sammlung übernehmen - dieselben Regeln wie bei
// Vorlagen (library.importWithChoices), damit sich der Import überall gleich verhält:
//  - Name = eingegebener Name, sonst eigener Titel.
//  - Gibt es den Namen schon (getrimmt, ohne Groß/klein) und ist „Überschreiben“ gewählt, wird der VOR diesem
//    Import vorhandene Eintrag ersetzt (jeder höchstens einmal, nie ein gerade erst übernommener).
//  - Sonst kommt er neu dazu; bei Namensgleichheit mit dem Zusatz „ (Import)“.
// Rein (node-testbar): liefert nur den Plan; anlegen/ersetzen erledigt die jeweilige Bibliothek.
export interface NamedChoice<T> {
  item: T
  /** Name, unter dem der Eintrag ankommt; leer = sein eigener Titel. */
  name: string
  /** Nur wirksam bei Namensgleichheit mit einem vorhandenen Eintrag. */
  overwrite: boolean
}
export interface NamedExisting {
  id: string
  title?: string
}
export type NamedAction<T> =
  | { kind: 'add'; item: T; title: string; /** Name war vergeben, „(Import)“ angehängt */ renamed?: true }
  | { kind: 'overwrite'; item: T; id: string; title: string }

const norm = (t: string | undefined): string => (t ?? '').trim().toLowerCase()

export function planNamedImport<T extends { title?: string }>(
  existing: readonly NamedExisting[],
  choices: readonly NamedChoice<T>[],
): { actions: NamedAction<T>[]; overwritten: number; renamed: number } {
  const before = new Map(existing.filter((e) => norm(e.title)).map((e) => [norm(e.title), e.id]))
  const vergeben = new Set(existing.map((e) => norm(e.title)).filter(Boolean))
  const actions: NamedAction<T>[] = []
  let overwritten = 0
  let renamed = 0
  for (const c of choices) {
    const title = c.name.trim() || c.item.title?.trim() || ''
    const key = norm(title)
    const ziel = before.get(key)
    if (c.overwrite && ziel) {
      before.delete(key) // jeden vorhandenen Eintrag höchstens einmal ersetzen
      actions.push({ kind: 'overwrite', item: c.item, id: ziel, title })
      overwritten++
      continue
    }
    if (key && vergeben.has(key)) {
      renamed++
      const neu = `${title} (Import)`
      vergeben.add(norm(neu))
      actions.push({ kind: 'add', item: c.item, title: neu, renamed: true })
      continue
    }
    if (key) vergeben.add(key)
    actions.push({ kind: 'add', item: c.item, title })
  }
  return { actions, overwritten, renamed }
}
