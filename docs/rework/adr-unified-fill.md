# ADR: Eine geteilte Renderer-/Ausfüll-Quelle

> Status: **umgesetzt** (App + Package, live auf `dev`). Die ursprüngliche „offene Slice-1-
> Entscheidung" (Option A/B/C) ist obsolet — die Realisierung ist unten beschrieben.

## Kontext (Ausgangslage, jetzt am Tag `alterstand`)

Es gab zwei Ausfüll-Oberflächen, die auseinanderliefen: die App-Maske (`PointInput.vue`,
volle Affordanzen) und eine **abgespeckte** Editor-Vorschau (`previewFill.ts`/
`PreviewControls.vue`), die nur Wert-Shapes abbildete. Folge: im Editor eingestellte Optionen
erschienen in der Vorschau/Ausgabe nicht. Beide teilten zwar den Renderer, aber **nicht** die
Eingabe.

## Entscheidung (Grundsatz)

**Es gibt pro Knotentyp genau eine Definition, und es gibt genau einen Renderer.** Was man im
Editor einstellt, sieht man 1:1 in der Vorschau und im Einsatz. Keine zweite,
abweichende Eingabe-/Anzeige-Implementierung mehr.

## Realisierung (was tatsächlich gebaut wurde)

Statt eine UI über Paketgrenzen zu teilen (die drei ursprünglichen Optionen drehten sich um
geteilte `.vue` vs. Deskriptor vs. App-Maske-im-Editor), wurde der Kern **in ein Package
gehoben** und die App komplett darauf gestellt:

- **Package `@resqdocs/protocol-core` (`packages/shared/`)** hält das Modell (`model.ts`),
  den **einen** Renderer (`render.ts`) und die Fill-Logik (`fill.ts`) — pur, `node --test`.
- **Die App** (`apps/pico-pwa`) hat ihren **eigenen** In-App-Editor (`EditorView` +
  `ContainerProperties`) **und** eine Live-Vorschau (`ContainerPreview`). Beide — Vorschau und
  Einsatz (`EinsatzView`) — rufen **denselben** `render()` aus dem Package.

Damit ist die Konsistenz **strukturell** statt durch einen Parity-Test erzwungen: Vorschau und
App können nicht auseinanderlaufen, weil es nur einen Renderer gibt. Der frühere
`.vue`-Cross-Package-Build-Constraint entfällt, weil nichts UI-seitig über Paketgrenzen geteilt
wird — geteilt wird der pure Kern.

## Konsequenzen

- Die ursprüngliche „Affordanz-Deskriptor + Parity-Test"-Konstruktion ist nicht nötig — die
  Einheit kommt aus dem gemeinsamen Renderer.
- **Scope-Grenze:** Dieser ADR betrifft **App + Package**. Der separate **Web-Editor**
  (`apps/protocol-editor`) ist NICHT Teil davon — er steht noch auf altem Stand (Wartungsmodus)
  und nutzt den alten Renderer/das 0.2.0-Format. Eine Überführung ist offen (siehe `roadmap.md`).
- Das alte 0.2.0-Format + `renderer/render.mjs` bleiben als Altlast lauffähig, bis die Daten
  migriert sind.
