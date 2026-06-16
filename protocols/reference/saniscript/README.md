# SaniScript — Referenz-Payloads (Seed)

Original-DuckyScript-Payloads aus der Vorläuferlösung „SaniScript" (RP2040 + pico-ducky),
gesichert als **Seed** für das künftige Protokoll-Datenmodell (Slice 2). Die Upload-Quelle
ist flüchtig — daher hier im Repo bewahrt.

| Datei | Inhalt |
|-------|--------|
| `payload16-standardprotokoll.dd` | Vollständiges Standardprotokoll: Alarmierung → Allergien → Vorerkrankungen → Anamnese → xABCDE → Risikofaktoren → Dauermedikation → Impf-Status → Verlauf/Maßnahmen → Transport/Verbleib → Aufklärung |
| `payload07-aufklaerung-transportverweigerung.dd` | Aufklärungs-/Einverständnistext (Transportverweigerung, Unterschriftenblock) |
| `payload15-transportverweigerung-langform.dd` | Transportverweigerung, ausführliche Form |

## Format

DuckyScript: `STRING <text>`, `ENTER`, `DELAY <ms>`, `ATTACKMODE HID/OFF`. Dies ist das alte
Hardware-Format — **kein** Produktivformat von ResQDocs. Der Renderer in Slice 2 überführt
die Inhalte in das neue Vorlagen-/Snippet-Modell.

## Lizenz

pico-ducky (Laufzeit der Payloads) steht unter **GPLv2** (Dave Bailey). Die hier abgelegten
Inhalte sind die selbst verfassten Dokumentationstexte des Autors.
