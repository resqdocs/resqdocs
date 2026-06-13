# apps/pico-pwa — Composer-App

Mobile-first Composer-App von ResQDocs. Gemeinsame **Vue-3-Codebasis** (Composition API, Vite,
TypeScript, Tailwind CSS, Konsta UI / daisyUI), die über **Capacitor** als native iOS-/Android-App
ausgeliefert wird und **lokal-first** funktioniert.

Die Kommunikation mit dem Pico 2 W läuft über eine **gekapselte HTTP-Schicht** (`@capacitor/http`,
z. B. `usePicoApi()` / `usePicoConnection()`). Patientendaten werden nur flüchtig verarbeitet und
**nicht persistent** gespeichert.

> Wird im nächsten Schritt scaffolded (Vite + Vue 3 + TS + Tailwind + Capacitor).

## Medikamenten-Datenbank (PZN)

Der Medikationsplan-Scan löst PZN über das öffentliche, gemeinfreie (CC0)
PZN-Wörterbuch auf. Die App nutzt standardmäßig die öffentliche Datenquelle der
Projektseite:

- Manifest: `https://resqdocs.app/pzn/manifest.json`
- Daten-Datei: aus dem `file`-Feld des Manifests abgeleitet

Der Abruf erfolgt nur auf bewusste Nutzeraktion (Sync-Button) und wird lokal
zwischengespeichert; der Lookup selbst läuft offline.

## Tests

```bash
npm test            # Unit-Tests (offline, deterministisch) - so läuft auch die CI
npm run test:pzn-live   # BEWUSSTER Live-Test gegen die echte öffentliche PZN-Datenbank
```

- **Unit-Tests** hängen **nicht** vom Live-Endpunkt ab (sie nutzen Fake-URLs) und
  bleiben in der CI reproduzierbar ohne Internet.
- **`npm run test:pzn-live`** ruft bewusst `resqdocs.app/pzn` ab und prüft:
  Manifest erreichbar, Daten-Datei erreichbar, Anzahl Einträge, letzter
  Datenstand und ob ein SHA256 im Manifest vorhanden ist. **Benötigt
  Internetzugang.** Nicht Teil der normalen Unit-Tests/CI.
