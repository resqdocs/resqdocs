# protocols/ — Protokoll-Schema & Beispiel-Vorlage

Das Datenmodell der Dokumentation als **versionierte Daten**, getrennt von App und Firmware.

- **Schema** [`protocol.schema.json`](protocol.schema.json) + Spezifikation
  [`SCHEMA.md`](SCHEMA.md): Vorlagen bestehen aus Blöcken → Punkten mit Variablen,
  Bedingungen (`visibleIf`), `de-gender`-Grammatik und Spezialelementen
  (z. B. `medikamente`). Datenformat = **JSON** (sprachneutral, in App und Tests nutzbar).
- **Beispiel-Vorlage** [`standardprotokoll.json`](standardprotokoll.json): die in der App
  ausgelieferte, bewusst **neutrale Funktionsdemo** — zeigt alle Punkttypen, Variablen,
  Platzhalter, Bedingungen und Feld-Tools. Kein reales Einsatzprotokoll: Jede Organisation
  erstellt ihre eigenen Vorlagen direkt in der App (Protokoll-Kreator).

Der Renderer (`render(template, values) → Klartext`) lebt in
[`packages/shared/renderer/`](../packages/shared/renderer/).
