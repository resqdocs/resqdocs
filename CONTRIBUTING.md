# Beiträge zu ResQDocs

Beiträge sind willkommen. Mit dem Einreichen eines Beitrags erklärst du dich damit einverstanden,
dass dein Beitrag unter der Projektlizenz **GPL-3.0-or-later** eingebracht wird.

## Grundregeln

- **Stack:** Vue 3 (Composition API), Vite, TypeScript, Tailwind CSS, Konsta UI / daisyUI, Capacitor.
  Vorhandene Framework-/Komponenten-/Plugin-Lösungen sind einer Eigenentwicklung vorzuziehen.
- **Mobile-first & lokal-first.** Touchfreundlich, offlinefähig, soweit fachlich sinnvoll.
- **Kapselung:** Pico-Kommunikation, lokaler Speicher, optionaler Cloud-Sync, Plattform- und
  Datenschutz-/Löschlogik gehören in Services/Composables, nicht verstreut in UI-Komponenten.
- **Datenschutz ist Architektur:** keine persistente Speicherung von Patientendaten; keine sensiblen
  Daten in Logs, URLs, Caches oder Service-Worker.
- **Keine Secrets** im Code; nur neutrale Beispielwerte (`.env.example`).
- **Keine deprecated/unmaintained Abhängigkeiten;** neue Abhängigkeiten begründen.
- **Keine falschen Garantien** (rechtlich/medizinisch/sicherheitstechnisch).

## Pull Requests

- Kleine, klar abgegrenzte Änderungen; aussagekräftige, konventionelle Commit-Messages.
- Tests/Lint, soweit vorhanden, müssen grün sein.
- Bei größeren Änderungen den projektüblichen Compliance-Check im PR dokumentieren.

## Verhalten

Es gilt der [Verhaltenskodex](CODE_OF_CONDUCT.md).
