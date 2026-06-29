import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderHeading, renderContainer, render } from './render.ts'
import type { Container, Heading } from './model.ts'
import { DEFAULT_SEPARATOR } from './model.ts'

const H = (p: Partial<Heading>): Heading => ({ prefix: '', suffix: '', fill: '', width: 0, fillMode: 'inclusive', ...p })

test('heading: prefix + suffix unabhaengig', () => {
  assert.equal(renderHeading('Anamnese', H({ prefix: '## ' })), '## Anamnese')
  assert.equal(renderHeading('Anamnese', H({ prefix: '# ', suffix: ' :' })), '# Anamnese :')
})

test('heading: inclusive = konstante Gesamtbreite', () => {
  const out = renderHeading('Anamnese', H({ prefix: '# ', suffix: ' ', fill: '=', width: 20, fillMode: 'inclusive' }))
  assert.equal(out, '# Anamnese ' + '='.repeat(9))
  assert.equal(out.length, 20)
  const out2 = renderHeading('Untersuchung', H({ prefix: '# ', suffix: ' ', fill: '=', width: 20, fillMode: 'inclusive' }))
  assert.equal(out2.length, 20)
})

test('heading: exclusive = feste Fuellzahl, Gesamtbreite variiert', () => {
  const a = renderHeading('Anamnese', H({ prefix: '# ', suffix: ' ', fill: '=', width: 8, fillMode: 'exclusive' }))
  const b = renderHeading('Untersuchung', H({ prefix: '# ', suffix: ' ', fill: '=', width: 8, fillMode: 'exclusive' }))
  assert.ok(a.endsWith('='.repeat(8)))
  assert.ok(b.endsWith('='.repeat(8)))
  assert.notEqual(a.length, b.length)
})

test('heading: inclusive kappt nicht (Titel laenger als width) -> kein Fuellzeichen', () => {
  const out = renderHeading('LangerTitel', H({ prefix: '# ', fill: '=', width: 3, fillMode: 'inclusive' }))
  assert.equal(out, '# LangerTitel')
})

test('container: Titel nur in Ausgabe wenn showTitle', () => {
  const base: Container = { type: 'container', id: 'a', title: 'Block', children: [] }
  assert.equal(renderContainer({ ...base, showTitle: false }), '')
  assert.equal(renderContainer({ ...base, showTitle: true, heading: H({ prefix: '## ' }) }), '## Block')
})

test('container: transparenter Wrapper rendert nur Kinder', () => {
  const tree: Container = {
    type: 'container',
    id: 'root',
    children: [
      { type: 'container', id: 'c1', title: 'A', showTitle: true, heading: H({ prefix: '# ' }), children: [] },
      { type: 'container', id: 'c2', title: 'B', showTitle: true, heading: H({ prefix: '# ' }), children: [] },
    ],
  }
  assert.equal(render(tree), '# A\n# B')
})

test('container: Verschachtelung ueber prefix (Markdown-Hierarchie)', () => {
  const tree: Container = {
    type: 'container',
    id: 'root',
    children: [
      {
        type: 'container',
        id: 'c1',
        title: 'Oben',
        showTitle: true,
        heading: H({ prefix: '# ' }),
        children: [{ type: 'container', id: 'c2', title: 'Unten', showTitle: true, heading: H({ prefix: '## ' }), children: [] }],
      },
    ],
  }
  assert.equal(render(tree), '# Oben\n## Unten')
})

test('tiefe Verschachtelung (50 Ebenen) rendert ohne Stack-Ueberlauf', () => {
  let node: Container = { type: 'container', id: 'n50', title: 'L50', showTitle: true, heading: H({ prefix: '# ' }), children: [] }
  for (let i = 49; i >= 1; i--) {
    node = { type: 'container', id: 'n' + i, title: 'L' + i, showTitle: true, heading: H({ prefix: '# ' }), children: [node] }
  }
  assert.equal(render(node).split('\n').length, 50)
})

test('container: Titel inline ohne Inhalt = nur prefix+title+suffix', () => {
  const c: Container = { type: 'container', id: 'x', title: 'x', showTitle: true, titleInline: true, heading: H({ prefix: '* ', suffix: ':' }), children: [] }
  assert.equal(renderContainer(c), '* x:')
})

test('container: Titel inline ignoriert Fuellzeichen/Breite (kein Banner)', () => {
  const c: Container = { type: 'container', id: 'x', title: 'x', showTitle: true, titleInline: true, heading: H({ prefix: '# ', suffix: ' ', fill: '=', width: 40 }), children: [] }
  assert.equal(renderContainer(c), '# x ')
})

// --- Felder -------------------------------------------------------------------

test('field: confirmed -> Standardwert (im Container, ohne Titel = nur Wert)', () => {
  const root: Container = { type: 'container', id: 'r', children: [{ type: 'field', id: 'f', default: '120/80' }] }
  assert.equal(render(root), '120/80')
})

test('field: excluded -> nichts', () => {
  const root: Container = { type: 'container', id: 'r', children: [{ type: 'field', id: 'f', default: 'x' }] }
  assert.equal(render(root, { f: { state: 'excluded' } }), '')
})

test('field: custom -> bearbeiteter Wert', () => {
  const root: Container = { type: 'container', id: 'r', children: [{ type: 'field', id: 'f', default: 'x' }] }
  assert.equal(render(root, { f: { state: 'custom', value: 'editiert' } }), 'editiert')
})

test('field: showTitle -> prefix+title+suffix+Wert (Fuellzeichen/Breite ignoriert)', () => {
  const root: Container = {
    type: 'container',
    id: 'r',
    children: [{ type: 'field', id: 'f', title: 'RR', showTitle: true, default: '120', heading: H({ suffix: ': ', fill: '=', width: 40 }) }],
  }
  assert.equal(render(root), 'RR: 120')
})

test('inline/block: block = neue Zeile, inline = an die laufende Zeile (mit Default-Trenner)', () => {
  const root: Container = {
    type: 'container',
    id: 'r',
    children: [
      { type: 'field', id: 'a', default: 'A' },
      { type: 'field', id: 'b', default: 'B', inline: true },
      { type: 'field', id: 'c', default: 'C' },
    ],
  }
  // B inline -> Default-Trenner ", " davor; C block -> neue Zeile (kein Trenner)
  assert.equal(render(root), 'A, B\nC')
})

test('xABCDE: Inline-Container + Inline-Feld -> eine Zeile', () => {
  const root: Container = {
    type: 'container',
    id: 'root',
    children: [
      {
        type: 'container',
        id: 'banner',
        title: 'xABCDE',
        showTitle: true,
        heading: H({ prefix: '# ', suffix: ' ', fill: '=', width: 30 }),
        children: [
          {
            type: 'container',
            id: 'x',
            title: 'x',
            showTitle: true,
            titleInline: true,
            heading: H({ prefix: '* ', suffix: ': ' }),
            children: [{ type: 'field', id: 'f', default: 'keine Hinweise auf starke Blutung', inline: true }],
          },
        ],
      },
    ],
  }
  assert.equal(render(root).split('\n')[1], '* x: keine Hinweise auf starke Blutung')
})

test('container: excludable + excluded -> ganzer Container (inkl. Kinder) entfaellt', () => {
  const root: Container = {
    type: 'container',
    id: 'r',
    children: [
      {
        type: 'container',
        id: 'sec',
        title: 'Sektion',
        showTitle: true,
        excludable: true,
        heading: H({ prefix: '# ' }),
        children: [{ type: 'field', id: 'f', default: 'Wert' }],
      },
    ],
  }
  assert.equal(render(root, { sec: { state: 'excluded' } }), '')
  assert.equal(render(root), '# Sektion\nWert')
})

// --- Feld-Trenner ------------------------------------------------------------

test('Trenner: zentraler Wert an der Wurzel, zwischen inline-Feldern', () => {
  const root: Container = {
    type: 'container',
    id: 'r',
    separator: ' · ',
    children: [
      { type: 'field', id: 'a', default: 'A' },
      { type: 'field', id: 'b', default: 'B', inline: true },
      { type: 'field', id: 'c', default: 'C', inline: true },
    ],
  }
  assert.equal(render(root), 'A · B · C')
})

test('Trenner: Opt-out "kein Trenner davor" klebt ans vorherige (Wert+Einheit)', () => {
  const root: Container = {
    type: 'container',
    id: 'r',
    separator: ', ',
    children: [
      { type: 'field', id: 'rr', default: '120/80' },
      { type: 'field', id: 'spo2', default: '98', inline: true },
      { type: 'field', id: 'einheit', default: '%', inline: true, noSeparatorBefore: true },
    ],
  }
  assert.equal(render(root), '120/80, 98%')
})

test('Trenner: kein Trenner zwischen Inline-Titel und erstem Feld (Suffix uebernimmt)', () => {
  const root: Container = {
    type: 'container',
    id: 'r',
    children: [
      {
        type: 'container',
        id: 'x',
        title: 'x',
        showTitle: true,
        titleInline: true,
        heading: H({ prefix: '* ', suffix: ': ' }),
        separator: ', ',
        children: [
          { type: 'field', id: 'f1', default: 'A', inline: true },
          { type: 'field', id: 'f2', default: 'B', inline: true },
        ],
      },
    ],
  }
  assert.equal(render(root), '* x: A, B')
})

test('Trenner: generisch auch um einen inline-Container herum', () => {
  const root: Container = {
    type: 'container',
    id: 'r',
    separator: ', ',
    children: [
      { type: 'field', id: 'a', default: '120/80' },
      { type: 'container', id: 'g', inline: true, children: [{ type: 'field', id: 'gv', default: 'SpO2 98%' }] },
      { type: 'field', id: 'c', default: 'P 80', inline: true },
    ],
  }
  assert.equal(render(root), '120/80, SpO2 98%, P 80')
})

test('titleInline: erstes Kind (block) klebt an den Titel statt dangling Suffix + Umbruch', () => {
  const root: Container = {
    type: 'container',
    id: 'r',
    children: [
      {
        type: 'container',
        id: 'x',
        title: 'x',
        showTitle: true,
        titleInline: true,
        heading: H({ prefix: '* ', suffix: ': ' }),
        separator: ', ',
        children: [
          { type: 'field', id: 'a', default: 'A' }, // block (kein inline)
          { type: 'field', id: 'b', default: 'B', inline: true },
        ],
      },
    ],
  }
  assert.equal(render(root), '* x: A, B')
})

test('Trenner: Container ueberschreibt den vererbten Trenner fuer seinen Teilbaum', () => {
  const root: Container = {
    type: 'container',
    id: 'r',
    separator: ', ',
    children: [
      {
        type: 'container',
        id: 'sub',
        separator: ' | ',
        children: [
          { type: 'field', id: 'a', default: 'A' },
          { type: 'field', id: 'b', default: 'B', inline: true },
        ],
      },
    ],
  }
  assert.equal(render(root), 'A | B')
})

// --- emptyText (Ersatztext bei leerem Inhalt) --------------------------------

test('emptyText: leerer Inhalt -> Ersatztext (inline-Titel)', () => {
  const root: Container = {
    type: 'container',
    id: 'r',
    children: [
      { type: 'container', id: 'x', title: 'Neuro', showTitle: true, titleInline: true, heading: H({ suffix: ': ' }), emptyText: 'unauffällig', children: [] },
    ],
  }
  assert.equal(render(root), 'Neuro: unauffällig')
})

test('emptyText: bei block-Titel -> eigene Zeile', () => {
  const c: Container = { type: 'container', id: 'x', title: 'Sonstiges', showTitle: true, heading: H({ prefix: '## ' }), emptyText: 'keine Angaben', children: [] }
  assert.equal(renderContainer(c), '## Sonstiges\nkeine Angaben')
})

test('emptyText: greift NICHT, wenn Inhalt vorhanden ist', () => {
  const root: Container = {
    type: 'container',
    id: 'r',
    children: [
      {
        type: 'container',
        id: 'x',
        title: 'Neuro',
        showTitle: true,
        titleInline: true,
        heading: H({ suffix: ': ' }),
        emptyText: 'unauffällig',
        children: [{ type: 'field', id: 'f', default: 'GCS 15', inline: true }],
      },
    ],
  }
  assert.equal(render(root), 'Neuro: GCS 15')
})

test('emptyText: bei „nicht erhoben" (excluded) Container greift NICHT - entfaellt ganz', () => {
  const root: Container = {
    type: 'container',
    id: 'r',
    children: [
      { type: 'container', id: 'x', title: 'x', showTitle: true, excludable: true, emptyText: 'leer', heading: H({ prefix: '# ' }), children: [] },
    ],
  }
  assert.equal(render(root, { x: { state: 'excluded' } }), '')
})

test('emptyText: ohne emptyText bleibt leerer Inhalt leer (wie bisher)', () => {
  const c: Container = { type: 'container', id: 'x', title: 'x', showTitle: true, titleInline: true, heading: H({ suffix: ':' }), children: [] }
  assert.equal(renderContainer(c), 'x:')
})

// --- Select (options) -------------------------------------------------------

test('Select: confirmed rendert die Standard-Option (oberste ohne default)', () => {
  const root: Container = {
    type: 'container',
    id: 'r',
    children: [{ type: 'field', id: 'gcs', title: 'GCS', showTitle: true, heading: H({ suffix: ' ' }), options: ['15', '14', '13'] }],
  }
  assert.equal(render(root), 'GCS 15')
})

test('Select: custom-Wert (gewaehlte Option oder Freitext) rendert', () => {
  const root: Container = { type: 'container', id: 'r', children: [{ type: 'field', id: 'gcs', options: ['15', '14', '13'] }] }
  assert.equal(render(root, { gcs: { state: 'custom', value: '14' } }), '14')
  assert.equal(render(root, { gcs: { state: 'custom', value: 'unbekannt' } }), 'unbekannt')
})

test('multiline: Zeilenumbrueche im custom-Wert bleiben verlustfrei (block + inline)', () => {
  const multi = 'Patient klagt ueber Schmerzen.\nSeit 2 Stunden.\nKeine Vorerkrankungen.'
  // BLOCK (Default): voriges Feld auf eigener Zeile, dann der ganze Mehrzeiler 1:1.
  const block: Container = {
    type: 'container',
    id: 'root',
    children: [
      { type: 'field', id: 'vorher', default: 'A' },
      { type: 'field', id: 'anam', multiline: true },
    ],
  }
  assert.equal(render(block, { anam: { state: 'custom', value: multi } }), 'A\n' + multi)

  // INLINE: der Trenner steht NUR am Elementrand; die \n im Wert bleiben unangetastet.
  const inline: Container = {
    type: 'container',
    id: 'root',
    children: [
      { type: 'field', id: 'vorher', default: 'A' },
      { type: 'field', id: 'anam', multiline: true, inline: true },
    ],
  }
  assert.equal(render(inline, { anam: { state: 'custom', value: multi } }), 'A' + DEFAULT_SEPARATOR + multi)
})

test('multiline + showTitle: Titel auf eigener Zeile, Wert (mit \\n) darunter', () => {
  const multi = 'Zeile 1\nZeile 2'
  const withTitle: Container = {
    type: 'container',
    id: 'root',
    children: [{ type: 'field', id: 'anam', title: 'Anamnese', showTitle: true, heading: H({ prefix: '## ' }), multiline: true }],
  }
  assert.equal(render(withTitle, { anam: { state: 'custom', value: multi } }), '## Anamnese\n' + multi)
  // einzeilig (kein multiline): Titel + Wert inline wie gehabt
  const single: Container = {
    type: 'container',
    id: 'root',
    children: [{ type: 'field', id: 'a', title: 'X', showTitle: true, heading: H({ prefix: '# ', suffix: ': ' }), default: 'v' }],
  }
  assert.equal(render(single), '# X: v')
})

test('Feld-Trenner: titleInline=false -> Banner (Fuellzeichen/Breite) + Wert auf naechster Zeile', () => {
  const tree: Container = {
    type: 'container',
    id: 'root',
    children: [{ type: 'field', id: 'an', title: 'Anamnese', showTitle: true, titleInline: false, heading: H({ prefix: '## ', fill: '=', width: 20, fillMode: 'inclusive' }) }],
  }
  // Banner = renderHeading auf eigener Zeile (head 11 + 9 Fuellzeichen = 20), Wert in der naechsten Zeile.
  assert.equal(render(tree, { an: { state: 'custom', value: 'lange Geschichte' } }), '## Anamnese' + '='.repeat(9) + '\nlange Geschichte')
  // leerer Wert -> nur die Banner-Zeile (kein dangling Umbruch)
  assert.equal(render(tree, { an: { state: 'custom', value: '' } }), '## Anamnese' + '='.repeat(9))
})

test('blankLineBefore: Leerzeile (Absatz) nur wenn etwas darueber steht', () => {
  const tree: Container = {
    type: 'container',
    id: 'root',
    children: [
      { type: 'field', id: 'a', title: 'Anamnese', showTitle: true, titleInline: false, heading: H({ prefix: '# ' }), blankLineBefore: true },
      { type: 'field', id: 's', title: 'Sonstiges', showTitle: true, titleInline: false, heading: H({ prefix: '# ' }), blankLineBefore: true },
    ],
  }
  // erstes Element (nichts darueber) -> KEIN Absatz; zweites -> Leerzeile davor.
  assert.equal(render(tree, { a: { state: 'custom', value: '' }, s: { state: 'custom', value: '' } }), '# Anamnese\n\n# Sonstiges')
})

test('renderFunction: Medikamentenliste als Block unter dem Titel; leer + namelos gefiltert', () => {
  const tree: Container = {
    type: 'container',
    id: 'root',
    children: [{ type: 'function', id: 'mp', functionKind: 'medikamentenplan', title: 'Medikamente', showTitle: true, heading: H({ prefix: '## ' }) }],
  }
  const rows = [
    { name: 'ASS', dosierung: '1-0-0' },
    { name: 'Ramipril 5mg', dosierung: '1-0-1', kommentar: 'nüchtern' },
  ]
  assert.equal(render(tree, { mp: { state: 'function', rows } }), '## Medikamente\nASS 1-0-0\nRamipril 5mg 1-0-1 (nüchtern)')
  assert.equal(render(tree, { mp: { state: 'function', rows: [] } }), '## Medikamente') // leer + Titel -> nur Ueberschrift (wie Container)
  assert.equal(render(tree, { mp: { state: 'function', rows: [{ name: '' }, { name: 'ASS' }] } }), '## Medikamente\nASS') // namelos raus
  // ohne Titel + leer -> entfaellt
  const noTitle: Container = { type: 'container', id: 'root', children: [{ type: 'function', id: 'mp', functionKind: 'medikamentenplan' }] }
  assert.equal(render(noTitle, { mp: { state: 'function', rows: [] } }), '')
})

test('Funktion ist immer Block + Absatz davor (kein Inline-Klebe-Bug)', () => {
  const tree: Container = {
    type: 'container',
    id: 'root',
    children: [
      { type: 'field', id: 'v', default: 'A' },
      { type: 'function', id: 'mp', functionKind: 'medikamentenplan', title: 'Medikamente', showTitle: true, heading: H({ prefix: '## ' }), blankLineBefore: true },
    ],
  }
  assert.equal(render(tree, { mp: { state: 'function', rows: [{ name: 'ASS' }] } }), 'A\n\n## Medikamente\nASS')
})

test('Funktion titleInline: Titel inline vor den Zeilen (prefix+title+suffix+body)', () => {
  const tree: Container = {
    type: 'container',
    id: 'root',
    children: [{ type: 'function', id: 'mp', functionKind: 'medikamentenplan', title: 'Medikamente', showTitle: true, titleInline: true, heading: H({ prefix: '', suffix: ': ' }), config: { rowLayout: 'inline' } }],
  }
  assert.equal(render(tree, { mp: { state: 'function', rows: [{ name: 'ASS' }, { name: 'Ramipril' }] } }), 'Medikamente: ASS, Ramipril')
  // titleInline aus -> Titel auf eigener Zeile (Regression)
  const own: Container = {
    type: 'container',
    id: 'root',
    children: [{ type: 'function', id: 'mp', functionKind: 'medikamentenplan', title: 'Medikamente', showTitle: true, heading: H({ prefix: '## ' }) }],
  }
  assert.equal(render(own, { mp: { state: 'function', rows: [{ name: 'ASS' }] } }), '## Medikamente\nASS')
})

test('renderFunction: unbekannter functionKind -> null (kein Crash)', () => {
  const tree: Container = {
    type: 'container',
    id: 'root',
    children: [{ type: 'function', id: 'x', functionKind: 'unbekannt' as 'medikamentenplan', title: 'X', showTitle: true }],
  }
  assert.equal(render(tree, { x: { state: 'function', rows: [{ name: 'A' }] } }), '')
})

test('blankLineBefore wirkt nur auf Banner-Elemente (Stale-Flag auf Normalfeld ignoriert)', () => {
  const tree: Container = {
    type: 'container',
    id: 'root',
    children: [
      { type: 'field', id: 'a', default: 'A' },
      { type: 'field', id: 'b', default: 'B', blankLineBefore: true }, // kein Banner -> kein Absatz
    ],
  }
  assert.equal(render(tree), 'A\nB')
})

test('Banner-Feld ist immer Block - inline=true wird ignoriert (Banner bleibt am Zeilenanfang)', () => {
  const tree: Container = {
    type: 'container',
    id: 'root',
    children: [
      { type: 'field', id: 'v', default: 'A' },
      { type: 'field', id: 'an', title: 'Anamnese', showTitle: true, titleInline: false, inline: true, heading: H({ prefix: '## ' }) },
    ],
  }
  // trotz inline:true steht der Banner am Zeilenanfang (Blockzwang), Wert darunter
  assert.equal(render(tree, { an: { state: 'custom', value: 'Text' } }), 'A\n## Anamnese\nText')
})

test('Feld titleInline=true erzwingt inline - auch mehrzeilig', () => {
  const tree: Container = {
    type: 'container',
    id: 'root',
    children: [{ type: 'field', id: 'm', title: 'M', showTitle: true, titleInline: true, multiline: true, heading: H({ prefix: '# ', suffix: ': ' }) }],
  }
  assert.equal(render(tree, { m: { state: 'custom', value: 'a\nb' } }), '# M: a\nb') // inline trotz multiline
})
