# Decision Record 0003 — Protokoll-Kreator MVP-Scope (#13)

Datum: 2026-06-09 · Status: angenommen (Maintainer-Entscheidungen via Frage-Tool) · Bezug:
`docs/protocol-creator-mvp.md`, S1 (`protocols/SCHEMA.md`/`protocol.schema.json`), S4 (`docs/app-ia.md`),
S3 (`docs/data-flow.md`), Runtime (`docs/app-runtime.md`).

Maintainer-Entscheidungen, ohne Chat-Kontext nachvollziehbar festgehalten. Legt den MVP-Schnitt des
Protokoll-Kreators fest, **bevor** Code gebaut wird.

## Entscheidungen

- **`visibleIf`-Editor im MVP:** **einfacher Regel-Editor** (eine Bedingung, `var`/`point` +
  `eq`/`in`/`truthy`; geführte Wertauswahl). Komplexe (`all`/`any`/`not`) Regeln aus Seed/Import nur
  **Anzeige**, keine Bearbeitung.
- **Import/Export im MVP:** **beide** — JSON-Export (nur valide) **und** validierter JSON-Import
  (Schema-Prüfung gegen `protocol.schema.json`, ungültiges JSON wird abgelehnt).
- **Raw-JSON/Expert-Modus im MVP:** **nur Ansicht (read-only)**; Bearbeitung ausschließlich über den
  geführten Editor. Editierbares Raw-JSON/freie IDs = Post-MVP.
- **Editierbarer Umfang im MVP:** **alle S1-Typen** — Punkte `field/finding/findingGroup/list/text`,
  Variablen `select/boolean/text/number` (vollständiges CRUD).
- **Storage:** in diesem Schritt nur das **fachliche Modell** (`library.protocols`, `library.blocks`,
  getrennte App-Einstellungen). Storage-**Technik** (Preferences vs. SQLite) ist ein bewusst späterer
  Entscheidungspunkt — **kein** Code in diesem Schritt.

## Verbindlich übernommen (S1/S3/S4)

- **Kreator ↔ Einsatz getrennt:** neutrale Strukturen persistent (`library`) vs. flüchtiger `caseState`;
  **keine** automatische Übernahme; **keine** Patientendaten in `library`.
- **Bausteine copy-on-insert** (neue `block.id`, keine Referenz) → portable Protokolle.
- **System-generierte, stabile, kollisionsfreie IDs**; Nutzer bearbeitet IDs im MVP nicht.
- **Rendern/Sichtbarkeit nur über die zentrale Runtime** (keine Doppel-Logik).
- **Kein kanonisches Maintainer-Protokoll**; persönliches Protokoll privat; Seeds = neutrale Muster.

## Offene Folgearbeit

- Storage-Technik-Wahl; Typwechsel nach Anlage; Drag-and-drop-Reorder; verschachtelter
  `visibleIf`-Editor; editierbares Raw-JSON/Expert-Modus; Patientendaten-Muster-Warnungen — Post-MVP.
