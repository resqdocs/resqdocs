# Drittanbieter-Hinweise

ResQDocs verwendet externe Open-Source-Pakete. Diese unterliegen **ihren eigenen Lizenzen**. Für
diese Pakete wird keine eigene Gewährleistung übernommen.

Diese Datei wird gepflegt, sobald Abhängigkeiten hinzukommen. Maßgeblich sind jeweils die
Lizenzangaben der Pakete selbst (z. B. in `node_modules/<paket>/LICENSE`) bzw. die Ausgabe eines
Lizenz-Checks im jeweiligen App-Modul.

## Übersicht (wird ergänzt)

| Paket | Zweck | Lizenz | Quelle |
|-------|-------|--------|--------|
| _(noch keine Laufzeit-Abhängigkeiten committet)_ | | | |

## Firmware (`firmware/`)

Die Bridge-Firmware basiert auf dem arduino-pico-Core (Earle F. Philhower III) und dessen
gebündelten Bibliotheken; diese stehen unter ihren jeweiligen Lizenzen (überwiegend LGPL/BSD).
Die Belege werden im Firmware-Modul dokumentiert.

| Paket | Zweck | Lizenz | Quelle |
|-------|-------|--------|--------|
| Crypto (rweather/arduino-libs) 0.4.x | Ed25519-Verifikation + SHA-256 für OTA-Updates (#130) | MIT | <https://github.com/rweather/arduinolibs> (Arduino Library Manager: `Crypto`) |

## Hinweis

Vor Einführung neuer Abhängigkeiten sind Lizenzkompatibilität (mit GPL-3.0-or-later) und
Pflegezustand zu prüfen. Unmaintained oder deprecated Pakete werden nicht verwendet.
