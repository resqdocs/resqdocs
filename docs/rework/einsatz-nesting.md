# Einsatz: verschachtelte Sektionen auf kleinen Screens

> Quellenbasiert (Workflow `einsatz-nesting-research`). Betrifft NUR die **Anzeige** in
> `EinsatzSection.vue` — das rekursive Modell und die bewusste Verschachtelung bleiben. Ergaenzt
> `einsatz-display.md` (P1–P6). Stand 2026-06-23.

## Problem (Maintainer, iPhone 17 Pro)

Ab Ebene 2 wird es eng. Ursache: drei an `depth` gekoppelte Mechanismen addieren sich genau dort,
wo der Platz knapp wird — (a) kumulierende Einrueckung, (b) immer kleinere Headings, (c) ein
a11y-Bug: Heading-Rang nach Optik (`depth===0 ? h3 : h4` → alles ab Ebene 1 = `h4`).

## Loesung — Hierarchie ueber Cues, die KEINE Breite kosten

1. **Heading-Rang = Schachtelungstiefe** (nicht Optik): `h${min(depth + 3, 6)}` (Protokoll-Titel
   im EinsatzView ist `h2` → Sektionen ab `h3`; bei `h6` deckeln). Behebt die
   WCAG-Heading-Order-Verletzung. [getwcag heading-order; WAI headings]
2. **Heading-Groesse stoppt ab Ebene 2** = gleichbleibendes **Eyebrow-Label** (uppercase,
   tracking-wide, Kontrast `/50` → `/60`). Tiefe 3–4 sieht typografisch gleich aus; Tiefe kommt
   aus Whitespace + Akzent, nicht aus immer kleinerer Schrift. [NN/g visual-hierarchy]
3. **Indent-Cap = EIN Schritt:** Akzentstrich (`border-l pl-3`) nur auf **Ebene 1** (vorher
   effektiv kumulativ pro Tiefe). Ab Ebene 2 friert die horizontale Geometrie ein → Lesebreite
   bleibt konstant. [NN/g local-navigation, common-region; Baymard line-length]
4. **Whitespace** staffelt Gruppen (Ebene 0: `gap-6` aussen; innerhalb `gap-3`). [NN/g
   visual-hierarchy]

## Bewusst behalten

Ein Scroll statt Wizard (P6); kein Accordion-in-Accordion (P4); collapse startet eingeklappt mit
`collapse-arrow` (Caret signalisiert in-place-Expand); Whitespace-Gruppierung **ohne** flaechige
Kaesten fuer offene Sektionen (P2); `insideCollapse` als Prop (ein Hop, kein Prop-Drilling).

## Offen / Reserve

- **Sticky Sektionskopf** (nur Ebene 0) bei ueberlangen Sektionen — spaeter; das Stacking unter
  dem bereits stickenden Umschalter braucht Geraetetest. [NN/g sticky-headers]
- **Inset-Region** (`bg-base-200/40 rounded`) fuer Tiefe 3–4 nur als **Reserve**, falls
  Whitespace + Akzent real nicht reichen — kein Default (P2). [NN/g common-region]
- **Collapse-Kopf** ist `<summary>` (keine Heading-Ebene); bei top-level collapse entsteht ein
  `h2 → h4`-Sprung in den Kindern. Kleiner Folgepunkt, falls a11y-Audit es verlangt.
- **Verschachteltes Einklappen (P4 „kein Accordion-in-Accordion") lockern — PARKED, 2026-06-23.**
  Maintainer: „bis zu einer gewissen Ebene macht das evtl. Sinn." Also kein Ja/Nein, sondern eine
  **Tiefen-Grenze**: nested collapse bis Ebene N erlauben, darunter flach. Noch NICHT entschieden;
  aktuell unveraendert (`renderAsCollapse = collapsible && !insideCollapse` → nur der oberste
  collapsible einer Kette wird zum Accordion). Hinweis: das harte „nicht verschachteln"-Argument
  war in der Recherche **unbelegt** — Lockern ist vertretbar. Spaeter gemeinsam festlegen.

## Quellen

- NN/g local-navigation: https://www.nngroup.com/articles/local-navigation/
- NN/g common-region: https://www.nngroup.com/articles/common-region/
- NN/g visual-hierarchy: https://www.nngroup.com/articles/visual-hierarchy-ux-definition/
- NN/g sticky-headers: https://www.nngroup.com/articles/sticky-headers/
- WAI headings: https://www.w3.org/WAI/tutorials/page-structure/headings/
- WCAG H69: https://www.w3.org/WAI/WCAG22/Techniques/html/H69
- getwcag heading-order: https://getwcag.com/en/accessibility-guide/heading-order
- GOV.UK step-by-step: https://design-system.service.gov.uk/patterns/step-by-step-navigation/
- Baymard line-length: https://baymard.com/blog/line-length-readability
