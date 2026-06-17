# Decision Record 0004 — Storage-Architektur (`library` + App-Einstellungen)

Datum: 2026-06-09 · Status: angenommen (Maintainer-Entscheidung via Frage-Tool) · Bezug:
`docs/data-flow.md` (S3), `docs/app-ia.md` (S4), `docs/protocol-creator-mvp.md` (#13).

> **Architektur-/Spezifikationsentscheidung. In diesem Schritt wird KEIN Storage-Code gebaut.** Die
> Umsetzung ist ein separater, ausdrücklich zu beauftragender Folgeschritt.

## Entscheidung

**Option C — Hybrid.**

- **Capacitor Preferences** (offizielles Plugin) für **kleine, flache App-Einstellungen.**
- **SQLite** (`@capacitor-community/sqlite`) für **strukturierte `library`-Daten** (Protokolle, Blöcke,
  Snippets) sowie Import-/(später) Sync-Metadaten.
- Beides **hinter einer gekapselten Persistenz-/Repository-Schicht** (`useStorage()` o. ä.), sodass die
  UI/Composables die konkrete Technik nicht kennen und sie testbar/austauschbar bleibt.

```
Preferences (Key-Value, klein):
  app.defaultOs · app.theme · app.privacyNoticeAccepted
  app.lastSelectedProtocolId · app.uiPreferences

SQLite (strukturiert):
  library.protocols · library.blocks · library.snippets
  import/export-metadata · (später) sync-metadata
```

## Begründung

- **Passt zu #13:** Der Protokoll-Kreator erzeugt viele Protokolle/Blöcke; Suche, Sortierung,
  Migration und später Sync sind absehbar → strukturierte DB (SQLite) ist dafür die tragfähige Basis
  (sqlite.org: klein, selbst-contained, gutes Application-File-Format; Android-Doku: SQLite für
  strukturierte/wiederholte Daten).
- **Einstellungen bleiben simpel:** kleine Flags/Prefs über das **offizielle** Preferences-Plugin —
  robuster als `window.localStorage` auf Mobile (kann vom OS geleert werden), kein DB-Overhead.
- **Kapselung:** Eine `useStorage()`-Schicht erlaubt, einen **ersten** Persistenz-Slice notfalls mit
  einem Preferences-Backend zu starten und SQLite **hinter derselben Schnittstelle** nachzuziehen —
  ohne die Entscheidung zu verwässern oder UI-Code zu ändern.
- **Open-Source-nachbaubar:** beide Plugins sind offen; SQLite ist Standard und gut dokumentiert.

**Verworfen:** A (nur Preferences) — Key-Value skaliert schlecht für strukturierte `library`-Daten,
Migration/Suche/Sync werden unsauber. B (nur SQLite) — für kleine App-Settings überdimensioniert.
D (vertagen) — MVP bliebe nicht real nutzbar (nichts überlebt App-Neustart).

## Datenschutzgrenze (unverändert, S3)

- **Keine Patientendaten** in Storage; **keine** Einsatzdaten; **keine** `caseState`-Persistenz.
- **Keine automatische Übernahme** aus der Einsatzansicht in `library`.
- `library` enthält **nur** neutrale Protokolle, Blöcke, Snippets und Einstellungen.
- Nutzerhinweise bleiben erforderlich. Schreibt jemand bewusst Patientendaten in neutrale Vorlagen,
  liegt das **außerhalb des Designs** und in Nutzerverantwortung.
- **Cloud ist nicht Teil dieser Entscheidung** (eigener späterer Track, opt-in, nur neutrale Daten).

## Auswirkungen

- **Neue Dependency** (bei Umsetzung): `@capacitor-community/sqlite` (Community-Plugin) — bewusst und
  hier dokumentiert. `@capacitor/preferences` ist bereits vorhanden.
- **Architektur:** gekapselte `useStorage()`/Repository-Schicht; `caseState` bleibt davon getrennt und
  flüchtig. Die flüchtige Creator-Session (#13-B…E) wird später über diese Schicht aus `library` geladen
  bzw. (bewusst) dorthin übernommen.
- **Tests:** müssen beide Backends abdecken; das Repository-Interface wird gegen ein In-Memory-/Fake-
  Backend pur testbar gehalten.

## Offene Folgearbeit (separat zu beauftragen)

- `library`-Schema/Tabellen + Migrationsstrategie (SQLite), Preferences-Keys final.
- `useStorage()`/Repository-Interface + In-Memory-Fake für Tests.
- Anbindung der Creator-Session an `library` (Laden/Speichern als **bewusste** Nutzeraktion).
- Bausteine- und Einstellungen-Tabs (S4) auf dieser Schicht.

## Nachtrag (#173): begrenzter temporärer Einsatzentwurf

Die ursprüngliche Regel „`caseState` wird NIE persistiert" gilt weiterhin für die
**typisierte Repository-Schicht** (Settings, Library = nur neutrale Daten). #173 führt
einen **bewusst eng begrenzten Ausnahmefall** ein: ein laufender Einsatzentwurf darf
kurzfristig **lokal** fortgesetzt werden (auch über App-Neustart), wird aber per
**Sliding-Idle-TTL** (1–5 h, Default 3 h) nach Inaktivität **automatisch gelöscht**.

Leitplanken: eigenes, gekapseltes Modul (`composables/temporaryCaseDraft*`, Key
`case.draft.temp`) über denselben `KeyValueAdapter` wie `creatorSessionStore` — **kein**
direkter Browser-Storage. Gespeichert wird **nur** der aktuelle Arbeitsstand (die drei
caseState-Sammlungen) — **keine** Roh-BMP-/Barcode-Payloads, **keine** Bilder, **keine**
Telemetrie, **kein** Netz/Sync/Cloud, **kein** Archiv. Ablaufprüfung beim Start, beim
Resume (`visibilitychange`) und vor jedem Laden/Speichern; abgelaufene Entwürfe werden vor
jeder Anzeige gelöscht. Grundlage: DSGVO Art. 5/25 (Datenminimierung, Speicherbegrenzung,
Privacy-by-Default), OWASP HTML5 Storage Cheat Sheet.
