// Wächter für die Zeilen im Aufbau einer Vorlage: Name, bei Abschnitten das + und EIN Mehr-Knopf. Die Aktionen der
// Zeile stehen als Wörter in einem Blatt von unten; gelöscht wird ohne Rückfrage, mit „Rückgängig“.
// Quellen: docs/sources.md, Abschnitt „Aufbau der Vorlage: Aktionen einer Zeile, Löschen mit „Rückgängig““.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (f: string): string => readFileSync(new URL(f, import.meta.url), 'utf8')
const node = read('../../../../../packages/protocol-core-ui/components/ContainerTreeNode.vue')
const view = read('./EditorView.vue')
const values = read('../../../../../packages/protocol-core-ui/useCaseValues.ts')
const markup = node.slice(node.indexOf('<template>')).replace(/<!--[\s\S]*?-->/g, '')

test('Zeile: ein Mehr-Knopf statt dreier Symbol-Knöpfe, 44-px-Tippfläche, gedämpft wie am Menü je Vorlage', () => {
  // Kein Regex über die Attribute: v-if="depth > 0" enthält selbst ein „>“.
  const at = markup.indexOf('data-tree-more')
  const more = markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('@click="menuOpen = true"', at))
  assert.match(more, /v-if="depth > 0"/, 'die Wurzel hat keine Zeilenaktionen')
  assert.match(more, /min-h-11 min-w-11/)
  assert.match(more, /text-base-content\/75/)
  assert.match(more, /:aria-label="`Aktionen für \$\{label\(node\)\}`"/)
  assert.match(more, /aria-haspopup="dialog"/)
  assert.match(more, /:aria-expanded="menuOpen"/)
  assert.doesNotMatch(markup, /aria-label="`(Verschieben|Duplizieren|Löschen): /, 'keine einzelnen Symbol-Knöpfe mehr in der Zeile')
  // Der Tipp auf den Namen öffnet weiter die Eigenschaften (ein Tipp).
  assert.match(markup, /@click="tree\.select\(node\.id\)"/)
})

test('Blatt von unten: Wörter, Löschen zuletzt und in Rot, mit Namen für Screenreader', () => {
  const sheet = markup.slice(markup.indexOf('data-tree-menu'), markup.indexOf('</Teleport>', markup.indexOf('data-tree-menu')))
  assert.match(markup, /<div v-if="menuOpen" class="modal modal-open modal-bottom" role="dialog" aria-modal="true" :aria-labelledby="menuTitleId" data-tree-menu>/)
  assert.match(sheet, /<h3 :id="menuTitleId"[^>]*>\{\{ label\(node\) \}\}<\/h3>/)
  const entries = [...sheet.matchAll(/<button type="button" class="min-h-12[^"]*"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1])
  assert.deepEqual(entries, ['Verschieben nach …', 'Duplizieren', 'Löschen'])
  assert.match(sheet, /class="min-h-12 text-error" data-tree-menu-delete/)
  assert.match(sheet, /<li v-if="tree\.duplicate">/, 'Duplizieren nur, wenn der Host es anbietet')
  // Abstand zur Gestenleiste und ein Rand zum Schließen (Zurück auf Android findet ihn).
  assert.match(sheet, /pb-\[calc\(1\.5rem\+env\(safe-area-inset-bottom\)\)\]/)
  assert.match(sheet, /class="modal-backdrop" aria-label="Schließen" @click="closeMenu"/)
  assert.match(node, /function closeMenu\(\): void \{\s*menuOpen\.value = false\s*void nextTick\(\(\) => menuButton\.value\?\.focus\(\)\)/, 'Fokus zurück an den Knopf')
})

test('Löschen fragt im Aufbau nicht nach', () => {
  assert.match(node, /function menuDelete\(\): void \{\s*menuOpen\.value = false\s*tree\.remove\(props\.node\.id\)/)
  assert.doesNotMatch(node, /confirmOpen|Endgültig löschen|lässt sich nicht rückgängig/)
})

test('Meldung mit „Rückgängig“: über der Tab-Leiste, als Live-Region, 8 Sekunden', () => {
  assert.match(view, /const REMOVED_NOTE_MS = 8000/)
  assert.match(view, /role="status" aria-live="polite">\s*<div v-if="removedNote"[^>]*data-removed-note>/)
  assert.match(view, /<button type="button" class="btn btn-ghost btn-sm min-h-11 shrink-0 text-primary" data-removed-undo @click="undo">Rückgängig<\/button>/)
  assert.match(view, /bottom: calc\(4\.5rem \+ env\(safe-area-inset-bottom\)\)/)
  // Jede weitere Änderung nimmt die Meldung weg: „Rückgängig“ gälte sonst dem neueren Schritt.
  assert.match(view, /watch\(tree\.protocols, \(v\) => \{\s*if \(removedNote\.value && v !== removedAt\) hideRemoved\(\)/)
})

test('„Rückgängig“ bringt auch die Eingaben des laufenden Einsatzes zurück, aber nur in denselben Einsatz', () => {
  // Beim Löschen: Eingaben merken, dann entfernen.
  assert.match(view, /const v = caseValues\.values\.value\[i\]\s*if \(v !== undefined\) kept\[i\] = v/)
  assert.match(view, /caseValues\.drop\(ids\)[^\n]*\n[\s\S]{0,160}removedStash\.push\(\{ id, ids, values: kept, epoch: caseValues\.epoch\.value, dropped: true \}\)/)
  // Nach Rückgängig und Wiederholen: zurückgeben bzw. erneut entfernen; ein anderer Einsatz bekommt nichts.
  assert.match(view, /if \(r\.epoch !== caseValues\.epoch\.value\) \{\s*removedStash\.splice\(i, 1\)/)
  assert.match(view, /if \(present && r\.dropped\) \{\s*caseValues\.values\.value = \{ \.\.\.r\.values, \.\.\.caseValues\.values\.value \}/)
  assert.match(view, /else if \(!present && !r\.dropped\) \{\s*caseValues\.drop\(r\.ids\)/)
  assert.match(view, /function undo\(\): void \{\s*hideRemoved\(\)\s*hist\.undo\(\)\s*syncRemoved\(\)/)
  assert.match(view, /function redo\(\): void \{\s*hideRemoved\(\)\s*hist\.redo\(\)\s*syncRemoved\(\)/)
  assert.doesNotMatch(view, /@click="hist\.(undo|redo)\(\)"/, 'jeder Weg zurück läuft über undo()/redo()')
  // Höchstens die letzten Löschungen, und nichts über das Schließen des Editors hinaus.
  assert.match(view, /if \(removedStash\.length > REMOVED_KEEP\) removedStash\.shift\(\)/)
  assert.match(view, /onUnmounted\(\(\) => \{\s*window\.clearTimeout\(removedTimer\)\s*removedStash\.length = 0/)
  // Neuer Einsatz oder wiederhergestellter Entwurf zählt als anderer Einsatz.
  assert.match(values, /reset\(\): void \{\s*values\.value = \{\}\s*epoch\.value\+\+/)
  assert.match(values, /setAll\(next: Record<string, FieldFill>\): void \{\s*values\.value = \{ \.\.\.next \}\s*epoch\.value\+\+/)
})
