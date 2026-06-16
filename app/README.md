# app/ — Composer (PWA)

Die komfortable Eingabe-Oberfläche auf dem Handy. Hier lebt die gesamte Flexibilität;
am Ende wird sauberer Fließtext erzeugt und an die Bridge gesendet.

## Status

Noch nicht implementiert. Technologie-Empfehlung: **PWA** (browserbasiert, geräte-
unabhängig, offline-fähig) — *zu bestätigen*.

## Geplante Funktionen

- Strukturierte **Protokoll-Vorlage** (Abschnitte, Felder, Default-„normal"-Befunde).
- Freie **Snippet-Bibliothek** für Sonderfälle.
- **Klick-/Formularstruktur** (z. B. xABCDE auf „normal/auffällig" schalten).
- **Spracheingabe** (Diktat).
- **Renderer** „Felder → sauberer Fließtext".
- Versand an die Bridge (WLAN-AP; BLE als Option).

Datenmodell siehe [`../protocols/`](../protocols/), Architektur siehe
[`../docs/architecture.md`](../docs/architecture.md).
