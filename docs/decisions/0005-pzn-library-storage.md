# Decision Record 0005 — PZN-Bibliothek: Speicher-Architektur & Skalierung

Datum: 2026-06-16 · Status: angenommen (Maintainer-Entscheidung via Frage-Tool) · Bezug:
`docs/decisions/0004-storage-architecture.md`, `apps/pico-pwa/src/medications/pznLibrary.ts`,
`apps/pico-pwa/src/storage/sqlite/*`. **Umsetzung/Arbeitsplan: Issue #194.**

> Entscheidungs-Record (kurz). Der ausführliche, abarbeitbare Plan (Phasen, Checklisten,
> Akzeptanzkriterien) liegt im Issue #194 — hier steht nur die Entscheidung + Begründung.

## Entscheidung

**SQLite (nativ) als Live-Speicher der PZN-Bibliothek, mit FTS5 für Suche und SQL-seitigem Paging.**

- Nativ: neue Tabelle `pzn_entries` über den bestehenden SQLite-Stack (`@capacitor-community/sqlite`,
  bereits Dependency); granulare Einzelzeilen-Writes, FTS5-Suche, `ORDER BY pzn`-Paging.
- Web/Dev: bleibt auf dem heutigen Preferences-/In-Memory-Fallback (kein SQLite im Browser; die App
  läuft nativ, Web ist kein Skalierungsziel).
- JSON nur noch als Backup-Format, ausgeliefert als gezipptes `.json.gz` (`CompressionStream`).
- Geteilte reine Logik (`pznLibrary.ts`) bleibt Quelle für Web-Fallback, Import/Export und Tests.
- Folge: `usePznLibrary` wird async (`list/page/entry/ownLabel/count`) — bei ~317k ist ein reaktiver
  In-Memory-Spiegel nicht tragbar.

## Begründung

Verifizierter Engpass ist der **Schreibpfad**: heute wird pro Einzeländerung die ganze Bibliothek neu
sortiert/serialisiert und als ein Preferences-Blob geschrieben (≈ O(N)). Echter 3-Wege-Vergleich
(Sharded Preferences / SQLite-Tabelle / SQLite+FTS5): bis niedrige Zehntausende wäre Sharded
Preferences am einfachsten (Web mitgelöst, kein Dependency), aber bei der Zielgröße **~317.000**
Einträgen kippen RAM-Residenz und lineare JS-Suche → SQL-Paging + **FTS5** sind erforderlich. SQLite ist
bereits eingebaut (kein neuer nativer Dependency), über `user_version`-Migrationen + `fakeSqlClient`
testbar, ACID-sicher (Bulk-Backfill alles-oder-nichts).

## Rechtliche Grundlage (verbindlich)

**Die App stellt nur den Mechanismus.** Sie liefert keinen PZN-/Arzneimittel-Datensatz mit und nimmt
nichts aus fremden Sammlungen; der Nutzer pflegt **eigene, rechtmäßig lizenzierte** Daten lokal ein
(BYO-Data). Damit bleibt die IFA-/sui-generis-Grundlage gewahrt. Kategorien sind eine feste,
Maintainer-gepflegte Auswahl. DSGVO-Entkopplung bleibt: Tabelle ohne Zeitstempel/Reihenfolge, nur
`ORDER BY pzn`. Ein `.json.gz`-Export ist eine Kopie der lizenzierten Nutzerdaten — Weitergabe regelt
dessen Lizenz, nicht die App.

## Nicht im Scope

Web-SQLite (jeep-sqlite), Cloud/Sync, externe PZN→Name-Auflösung, mitgelieferter Datensatz.
