# Security Policy

## Sicherheitsprobleme melden

Bitte melde Sicherheitslücken **nicht** über öffentliche Issues, sondern vertraulich an den
Maintainer (Kontakt siehe Projektseite / `PUBLIC_CONTACT_EMAIL`). Beschreibe das Problem, die
betroffene Komponente und – wenn möglich – einen Reproduktionsweg. Wir bemühen uns um eine zeitnahe
Rückmeldung; feste Reaktionszeiten können nicht garantiert werden (Open-Source-Projekt ohne Gewähr).

## Grundsätze

- Keine echten Secrets, Tokens, Schlüssel oder privaten Zugangsdaten im Repository.
- Sichere Voreinstellungen; Datenminimierung; keine sensiblen Daten in Logs, URLs oder Caches.
- Updates und Wartung sollen unkompliziert möglich bleiben.

## Netzwerk-Policy der App (bindend, 2026-06-10)

Die App telefoniert **nirgendwo** hin. Die einzigen erlaubten Remote-Verbindungen:

1. **Lokale Pico-Bridge** (LAN, `http://10.10.10.1` bzw. konfigurierte Base-URL).
2. **PZN-Wörterbuch-Abruf** (geplant, #11): Versions-/Manifest-Check + Download des
   CC0-Artefakts - nur neutrale Referenzdaten, keine Patientendaten, nutzerinitiiert.

**Keine Analytics, keine Telemetrie, keine Crash-Reporter, keine SDK-Heimsender, keine
CDNs/Web-Fonts.** Jede neue Dependency wird vor Aufnahme auf Telemetrie-Verhalten geprüft
(Konsequenz umgesetzt in #36: Google ML Kit entfernt, Scanner ist reines lokales JS).
Ein Test (`useMedplanScan.test.ts`, "NETZWERK-POLICY") wacht über die Dependency-Liste.

## Pico-Access-Point: öffentlicher Standard-Zugang (bewusste Entscheidung)

Die Bridge ist ein WLAN-Access-Point mit **festem, öffentlichem Standard-Passwort** (WPA2), damit das
Gerät out-of-the-box von jedem Anwender nutzbar ist. Das Passwort ist **bewusst nicht änderbar** — kein
geheimer Schlüssel, sondern ein dokumentierter Default zugunsten der Einfachheit/Usability.

Die **SSID** lautet `ResQDocs-<id>`; die `<id>` ist **konfigurierbar** (Default: 6-stelliges Hex aus der
Board-ID, überschreibbar). Sie dient der **Unterscheidung mehrerer Geräte** am selben Ort — **nicht** dem
Zugriffsschutz. Details: [`docs/pico-api.md`](docs/pico-api.md).

**Sicherheits-Einordnung (ehrlich):** Ein bekanntes, festes Passwort macht den AP praktisch offen. Da die
Bridge als **Tastatur** wirkt, kann jede Person in WLAN-Reichweite, die den (öffentlichen) Default kennt,
Text an das Zielsystem senden. Es gibt **keine App-Authentifizierung** auf den API-Endpunkten. Dieses
Rest-Risiko wird **bewusst akzeptiert** (nur Tippen, physische Nähe, der Dokumentierende prüft die Ausgabe).
Der Betrieb in einem konkreten Kontext ist durch die verantwortliche Stelle zu bewerten.

## OTA-Firmware-Updates: signiert (Ed25519)

Die Bridge akzeptiert Firmware-Updates über WLAN (`/ota/*`, ab fw 0.3.0) **nur mit gültiger
Signatur**: Der Maintainer signiert den SHA-256-Digest jedes Firmware-Binaries lokal mit einem
**Ed25519-Schlüssel** (`scripts/ota/sign.mjs`); der zugehörige Public Key ist in die Firmware
einkompiliert (`OtaPublicKey.h`). Die Bridge verifiziert **vollständig vor dem Anwenden** — bei
ungültiger Signatur oder falschem Hash bleibt die alte Firmware aktiv.

- Der **private Schlüssel liegt nie im Repository** (Standardablage `~/.resqdocs/`, vom
  Generator-Skript erzwungen). Im Repo steht nur der Public Key.
- Da nur signierte Images angewendet werden, brauchen die `/ota/*`-Endpunkte **kein
  zusätzliches API-Auth**. Restrisiko im offenen AP: Dritte in WLAN-Reichweite können
  sinnlose Uploads starten (DoS auf die Session) — bewusst akzeptiert, analog zur
  `/type`-Einordnung oben.
- **Kein A/B-Rollback:** Die Verifikation passiert komplett vor dem Reboot; das Restrisiko
  „Stromausfall exakt während des Flash-Schreibens" wird akzeptiert. Fallback ist immer der
  manuelle BOOTSEL-Flash (`firmware/bridge/README.md`).

## Keine falsche Sicherheit

Dieses Projekt macht keine Zusagen wie „100 % sicher", „rechtlich geprüft" oder „garantiert
datenschutzkonform". Betreiber müssen eigene Sicherheits- und Datenschutzpflichten prüfen.
