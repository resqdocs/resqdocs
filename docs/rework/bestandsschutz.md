# Bestandsschutz (Must-Preserve)

> Bindend fuer den Branch `experiment/protocol-rework`. Diese Funktionen muessen im Rework
> **vollstaendig erhalten und funktionsfaehig** bleiben. Vor jeder Slice gegen diese Liste
> pruefen. Erweiterungen/Ausnahmen gibt nur der Maintainer vor.

## Grundregel: Einstellungen [Maintainer 2026-06-22]

**In den Einstellungen bleibt ALLES erhalten und funktionsfaehig. EINZIGE Ausnahme: das
„Ueberschriftenmuster" darf im Zuge des Protokoll-/Editor-Reworks geaendert oder verschoben
werden.**

Settings-Sektionen (`apps/pico-pwa/src/components/settings/`):

| Sektion / Datei | Inhalt | Status |
|---|---|---|
| `DeviceSection.vue` - „Geraet / Pico" | Pico-Verbindung, **Geraete-ID**, **Firmware-Update** | **BLEIBT** - Basis des Gesamtsystems |
| `ScannerSection.vue` - „Scanner-Modus" | BMP-Data-Matrix-Scan-Strategie | **BLEIBT** |
| `PznLibraryPage.vue` + `PznSection.vue` | PZN-Bibliothek / -Woerterbuch | **BLEIBT** (Detail unten) |
| `PrivacyDataSection.vue` - „Datenschutz & lokale Daten" | Loesch-/Datenschutzfunktion | **BLEIBT** |
| `LegalSection.vue` - „Rechtliches" | Impressum + Datenschutzerklaerung | **BLEIBT** |
| `InfoHelpSection.vue` - „Info & Hilfe" | Hilfe/Onboarding | **BLEIBT** |
| `OpenSourceSection.vue` - „Open Source" | OSS-Hinweise | **BLEIBT** |
| `AppSettingsSection.vue` - „App-Einstellungen" | Standard-Zielgeraet (OS), Design, Erscheinung | **BLEIBT** |
| ^ derselbe File | ~~Ueberschriftenmuster~~ (Muster/Fuellzeichen/Breite/Vorschau) | **ENTFERNT** (2026-06-22) aus den App-Einstellungen; Werte + Renderer-Default bleiben, Re-Home auf der Vorlagen-Ebene offen |
| `SettingsTab.vue` | Container/Navigation der Einstellungen | **BLEIBT** |

Hinweise:
- **Firmware-Update** lebt in `DeviceSection.vue` (+ `FirmwareNoticeBanner.vue`, `App.vue`) -
  ausdruecklich erhalten.
- Das **Ueberschriftenmuster** gehoert thematisch zur Ausgabe-Formatierung
  (`packages/shared/renderer/render.mjs` `DEFAULT_HEADING` / `options.heading`). Kandidat, in
  die Protokoll-/Vorlagen-Ebene zu wandern statt globaler App-Einstellung - Entscheidung beim
  Maintainer (deshalb die Ausnahme).

## A. PZN-Bibliothek (Detail)

Die persoenliche PZN-Bibliothek (#184/#190) - patientenentkoppelt, lokal, nie geteilt - darf
nicht entfernt, veraendert oder gebrochen werden: weder UI, noch Persistenz, noch Integration.

- **Einstellungen-UI:** `settings/PznLibraryPage.vue`, `settings/PznSection.vue`,
  Verlinkung in `settings/SettingsTab.vue`.
- **Logik + Persistenz** (`apps/pico-pwa/src/medications/`): `pznLibrary.ts`,
  `usePznLibrary.ts`, `pznLibraryRepository.ts`, `pznLibrarySqliteRepository.ts`
  (SQLite-Persistenz auf dem Geraet), `pznLibraryBackend.ts`, `pznLibraryNativeBackend.ts`,
  `pznExport.ts`, `featureFlags.ts` (+ zugehoerige `*.test.ts` muessen gruen bleiben).
- **Integrations-Punkte** (Medikamentenplan-Funktion im Rework):
  `components/rebuild/MedplanFunction.vue` + `components/rebuild/MedplanReviewSheet.vue`
  (Packungs-/BMP-Scan -> PZN -> Name, Transfer in die Bibliothek). Scan/Transfer bleibt App-only.
- **Vor Merge:** PZN-Tests gruen + manueller Check (Eintrag anlegen, ueberlebt Neustart,
  Transfer aus dem Medikamente-Element funktioniert).

## B. Layout-Vorgabe fuer erhaltene Formular-Felder [Maintainer 2026-06-22]

Fuer die erhaltenen Auswahl-/Eingabefelder gilt auf **allen Geraeten (iPad wie iPhone wie
alle)**: **Label steht oben, Feld in voller Breite darunter.** Kein Nebeneinander, keine
Breitenbegrenzung.

- Muster: Container `form-control flex flex-col items-start gap-1`, Feld `w-full` **ohne**
  `max-w-xs` (daisyUI 5 stapelt `form-control` nicht mehr selbst, Cerebrum #149/#88).
- Umgesetzt: die drei Selects in `AppSettingsSection.vue` (Standard-Zielgeraet, Design,
  Erscheinung) nutzen jetzt das idiomatische `fieldset` + `fieldset-legend` + `select w-full`
  (Label oben, volle Breite, geraeteidentisch; ohne tote `form-control`/`select-bordered`).
  Gilt als Qualitaetsbar fuer die weiteren erhaltenen Settings-Controls (sektionsweise
  migrieren). Nicht noetig fuer das Ueberschriftenmuster - das ist die Ausnahme.
