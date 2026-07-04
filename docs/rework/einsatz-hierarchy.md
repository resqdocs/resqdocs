# Einsatz: Hierarchie klar + ruhig zeigen

> Quellenbasiert (Workflow `einsatz-hierarchy-research`, 2026-06-24). Betrifft NUR die Darstellung
> in `EinsatzSection.vue` / `EinsatzField.vue` / `ContainerFillToggle.vue`. Modell, Collapse-Logik
> (P4 kein Accordion-in-Accordion), Indent-Cap und Tri-State bleiben. Ergaenzt `einsatz-nesting.md`.
> **Rollout schrittweise** (Maintainer will jeden Schritt sehen).

## Wurzel-Diagnose (Foto-Analyse + Quellen)

1. **Typo-Hierarchie invertiert.** Abschnittskopf Ebene ≥1 = `text-xs uppercase /60`, Feldlabel =
   `text-sm font-medium` → das Feld ist GROESSER/DUNKLER als der Kopf darueber. (NN/g visual-hierarchy)
2. **Gegensaetzliche Control-Platzierung.** Feld-Tri-State links, Container-Toggle rechts. (Apple HIG Leading-Edge)
3. **Gleiche gefuellte gruene Box fuer zwei Bedeutungen.** Container ein/aus sieht aus wie Feld bestaetigt. (NN/g, Material)
4. **Schwache Gruppierung.** Felder flach in einer Karte; gleicher Abstand Kopf→Feld wie zwischen
   Abschnitten. (NN/g Proximity)

## Hauptrichtung: „Eyebrow-Kopf + Control-Spalte + Proximity-Gruppe"

1. **Kopf → Eyebrow** (klein, Versalien, gedaempft); Feld bleibt der kraeftigere Block → Inversion gedreht.
2. **Beide Controls links** in eine `size-7`-Spalte (Container-Toggle wandert vom Titelrand nach links).
3. **Container-Toggle outline** (kein `bg-success`) → gefuelltes Gruen nur noch fuer den Feld-Tri-State.
4. **Proximity:** eng Kopf→Felder, mehr Luft zwischen Geschwister-Abschnitten; die eine `border-l`-Stufe bleibt leise.

## Rollout (schrittweise)

- **Schritt 1 — Bedienelemente:** Container-Toggle nach links + outline (Fix 2 + 3). ← zuerst
- **Schritt 2 — Typografie:** Eyebrow-Kopf, Feld als kraeftigerer Block (Fix 1).
- **Schritt 3 — Abstand:** Proximity-Gruppierung (Fix 4).
- Danach optional die kreativen Erweiterungen (s. u.).

## Kreative Erweiterungen (optional, spaeter — Maintainer: „am Ende wahrscheinlich alles")

- **B — Default zu, Abweichung auf — UMGESETZT (2026-06-24).** collapsible Sektionen starten
  eingeklappt, wenn alles auf Standard steht (`open = ref(deviations.value > 0)` — nur INITIAL,
  danach frei toggelbar; Ausfuellen klappt NICHT auto auf/zu); Kopf zeigt „N abweichend" bzw.
  „Standard" (reaktiv, `countDeviations` in `deviations.ts`, node-getestet). Bewusst: Badge nur am
  Collapse-Kopf (Vorschau auf Verstecktes), NICHT an flachen Sektionen (Inhalt dort sichtbar);
  excluded Container zaehlt als 1 (Kinder entfallen). ultracode-Verify: spec-konform, kein Bug.
- **C — Review-first:** read-only Uebersicht + „Alles bestaetigen", „Aendern" je Abschnitt. (GOV.UK Check-Answers)
- **A — iOS-Inset-Baender** pro Sektion, nur als Eskalation, falls Abstand allein nicht traegt.

## Behalten

Ein Scroll; kein Accordion-in-Accordion (P4); Indent-Cap auf eine Stufe; Tri-State-Feldsteuerung
(gefuelltes Gruen, jetzt eindeutiger); Heading-Rang folgt der Tiefe (nur visuelle Klasse aendert sich).

## Quellen

- NN/g Visual Hierarchy: https://www.nngroup.com/articles/visual-hierarchy-ux-definition/
- NN/g Gestalt Proximity: https://www.nngroup.com/articles/gestalt-proximity/
- NN/g Common Region: https://www.nngroup.com/articles/common-region/
- NN/g Toggle-Switch Guidelines: https://www.nngroup.com/articles/toggle-switch-guidelines/
- Apple HIG Toggles (Leading-Edge, Checkbox fuer Settings): https://developer.apple.com/design/human-interface-guidelines/toggles/
- GOV.UK Headings (Caption ueber Heading): https://design-system.service.gov.uk/styles/headings/
- GOV.UK Check-Answers: https://design-system.service.gov.uk/patterns/check-answers/
- Material 3 Checkbox: https://m3.material.io/components/checkbox/guidelines
- designsystems.surf Checkbox (filled vs outline): https://designsystems.surf/blueprints/checkbox
