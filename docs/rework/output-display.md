# Anzeige der „Text für NIDA"-Vorschau (quellenbasiert)

> Wie die generierte, read-only Text-Ausgabe dargestellt wird (Editor- + Einsatz-Vorschau).
> Synthese aus dem Workflow `output-preview-research` (MDN, WCAG, NN/g, Carbon, GOV.UK, axe/TPGi).
> Stand 2026-06-23. Umgesetzt als geteilte Komponente `components/rebuild/OutputText.vue`.

## Verdikt

`<pre>` + horizontaler Scroll + Monospace ist fuer diesen Inhalt **richtig** — kein `pre-wrap`,
keine Karten-Spielereien. Grund: die Banner sind per Fuellzeichen auf eine Breite ausgerichtet
(`fillMode: inclusive` = konstante Gesamtbreite); die **Zeichen-Spalten-Ausrichtung ist die
Bedeutung**. Umbrechen wuerde sie zerstoeren.

## Entscheidungen (je belegt)

- **Monospace + `<pre><samp>`** — `<samp>` ist die korrekte Semantik fuer generierte System-/
  Programmausgabe; `<pre>` bewahrt Whitespace exakt. [MDN pre/code/samp]
- **`white-space: pre` (Scroll), NICHT `pre-wrap`** — Ausrichtung bleibt; gedeckt durch die
  **WCAG-1.4.10-Reflow-Ausnahme** fuer Inhalt mit bedeutungstragendem 2D-Layout. Die Ausnahme gilt
  NUR fuer den `<pre>`-Block; Karten-Header + Kopier-Button reflowen bei 320px normal. [WCAG 1.4.10, WebAIM]
- **Scroll-Region abgesichert:** `tabindex="0"` + `role="group"` + `aria-label` (tastatur-/
  screenreader-erreichbar, WCAG 2.1.1) + dezenter rechter **Fade als Scroll-Cue**. [axe scrollable-region-focusable, TPGi, CSS-Tricks scroll-shadows]
- **`aria-live="polite"` + `aria-atomic`** — Update der Vorschau wird komplett angekuendigt. [MDN ARIA live regions]
- **Read-only = volle Textfarbe (nicht ausgegraut), `text-sm`** statt `text-xs` — lesbar fuer eine
  sicherheitsrelevante Ausgabe, 4.5:1 Kontrast, ueberlebt 200% Zoom. [Carbon read-only, WCAG 1.4.3/1.4.4]
- **Kopier-Button:** echter `<button>` + `aria-label`, `navigator.clipboard.writeText` in
  `try/catch`, sichtbares „Kopiert"-Feedback (Reset nach 2s). [MDN writeText, NN/g button-states]
- **EINE geteilte Komponente** `OutputText.vue` (Prop `text`) — Editor- und Einsatz-Vorschau
  nutzen sie; kein doppeltes `<pre>`, kein Duplikat-Drift. Sie *ist* der NIDA-Text (gleicher
  `render()`-Pfad). [NN/g visibility-of-system-status]

## Optionaler naechster Schritt (nicht jetzt)

Vollbild-Button (daisyUI `modal`, volle Breite) fuer einen scrollfreien Blick auf breite Banner
am Telefon. [Adrian Roselli]

## Quellen (Auswahl)

w3.org/WAI/WCAG21/Understanding/reflow.html · resize-text.html · webaim.org/techniques/reflow ·
MDN: pre, code, white-space, Clipboard/writeText, ARIA-Live-Regions ·
dequeuniversity.com/rules/axe/4.8/scrollable-region-focusable · tpgi.com (scrollable regions) ·
css-tricks.com scroll-shadows · nngroup.com (visibility-system-status, button-states, ui-copy) ·
carbondesignsystem.com read-only-states · design-system.service.gov.uk/patterns/check-answers.
