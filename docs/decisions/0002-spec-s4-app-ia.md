# Decision Record 0002 — Spezifikation S4 (App-Informationsarchitektur)

Datum: 2026-06-09 · Status: angenommen (Maintainer-Entscheidungen via Frage-Tool) · Bezug:
`docs/app-ia.md`, S1 (`protocols/SCHEMA.md`), S2 (`docs/pico-api.md`), S3 (`docs/data-flow.md`),
`docs/app-runtime.md`.

Maintainer-Entscheidungen, ohne Chat-Kontext nachvollziehbar festgehalten. Ersetzt die frühere,
vorläufige 4-Bereichs-Fassung von `docs/app-ia.md` durch die finalisierte S4.

## Entscheidungen

- **Navigation:** **4 Bottom-Tabs** — *Einsatz · Protokolle · Bausteine · Einstellungen*.
  **Gerät/Pico** ist Unterbereich von *Einstellungen* (kein eigener Tab); Verbindungs-Indikator global
  im Header. Begründung: „Einsatz" im Fokus, Erstellung getrennt (Protokolle/Bausteine), Geräte-Config
  selten → unter Einstellungen; 4 Tabs sind mobil komfortabel.
- **Protokoll-Kreator (#13):** **Teil des MVP** (Erstellen/Bearbeiten eigener Protokolle).
- **Info/Hilfe:** **Unterbereich von *Einstellungen*** (kein eigener Tab/Bereich).
- **Datenschutz/Reset:** **„Sitzung zurücksetzen" prominent im *Einsatz***; „Lokale Bausteine löschen"
  und „Alle lokalen Daten löschen" in *Einstellungen → Datenschutz*.

## Verbindlich übernommen (aus S1–S3)

- **Runtime ↔ Creator getrennt:** `caseState` (flüchtig) vs. `library` (persistent, neutral); keine
  automatische Übernahme; neutrale Übernahme nur durch bewusste Nutzeraktion.
- **Keine Patientendaten-Persistenz**; Cloud nur optional und nur für neutrale Bausteine.
- **Mobile-first, lokal-first**; Pico bleibt einfache HTTP-API; Capacitor als native Hülle.

## Offene Folgearbeit

- UI-Design/Styling je Bereich; `library`-Storage-Backend (Preferences vs. SQLite); Cloud-Sync-/
  Konfliktmodell; konkreter Kreator-MVP-Umfang (editierbare Punkt-/Variablentypen) → mit #13.
- Medplan-Scan (#9–#11) und Cloud-Sync sind **Post-MVP-Tracks**, nicht Teil von S4.
