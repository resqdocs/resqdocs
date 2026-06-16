# protocols/ — Standardprotokoll & Snippets

Die Inhalte der Dokumentation als **versionierte Daten**, getrennt von App und Firmware.

## Modell (Slice 2 — umgesetzt)

- **Standardprotokoll** als maschinenlesbare **Vorlage** [`standardprotokoll.json`](standardprotokoll.json):
  11 Abschnitte (Alarmierung, Allergien, Vorerkrankungen, Anamnese, **xABCDE**, Risikofaktoren,
  Dauermedikation, Impf-Status, Verlauf/Maßnahmen, Transport/Verbleib, Aufklärung). xABCDE ist
  **klinisch-semantisch** modelliert: jeder Buchstabe (x/A/B/C/D/E) ist eine Gruppe atomarer
  Befunde, jeder einzeln „normal ↔ auffällig" schaltbar.
- **Snippet-Bibliothek** [`snippets.json`](snippets.json): freie Textbausteine für Sonderfälle.
- **Renderer** [`renderer/render.mjs`](renderer/render.mjs): reine, abhängigkeitsfreie Funktion
  `render(template, values) → Klartext`. Tests: `node --test protocols/renderer/render.test.mjs`.

Format & Renderer-Vertrag: siehe [`SCHEMA.md`](SCHEMA.md). Datenformat = **JSON** (sprachneutral,
in der späteren PWA und in den Tests nutzbar).

## `reference/`

Original-Inhalte der Vorläuferlösung „SaniScript" (DuckyScript-Payloads), als Seed für das
Datenmodell gesichert — die Upload-Quelle ist flüchtig. Diese Dateien sind **Referenz**, kein
Produktivformat.
