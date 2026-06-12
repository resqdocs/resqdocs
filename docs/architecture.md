# Architektur

ResQDocs besteht aus drei **entkoppelten** Schichten. Der Kerngedanke: flexibler Inhalt
(Vorlagen, Snippets, Diktat) wird vom festen Tipp-Transport (USB-HID) getrennt, damit der
Eingabekomfort nicht mehr an physischen Tasten oder statischen Dateien hängt.

```
┌─────────────────────────┐   Text/JSON    ┌──────────────────┐   USB-HID    ┌──────────┐
│  Composer (Handy-PWA)    │ ─────────────▶ │  Bridge (Pico 2W)│ ───────────▶ │  NIDA    │
│  - Protokoll-Vorlage     │  (lokal,WLAN/  │  - empfängt Text │  (DE-Layout) │ (Tablet) │
│  - Snippet-Bibliothek    │   BLE)         │  - tippt via HID │              └──────────┘
│  - Formular/Klickstruktur│                │  - DE-Keymap +   │
│  - Spracheingabe         │                │    Alt-Code-FB   │
│  - Renderer → Klartext   │                └──────────────────┘
└─────────────────────────┘
```

## Schichten

### Composer (App)
Trägt die gesamte Flexibilität: strukturierte Protokoll-Vorlage, freie Snippet-Bibliothek,
Formular-/Klickstruktur (z. B. xABCDE auf „normal/auffällig" schalten), Spracheingabe und
den Renderer „Felder → sauberer Fließtext". Plattform: **PWA** (browserbasiert, geräte-
unabhängig, offline-fähig). *Zu bestätigen.*

### Bridge (Firmware)
Schlanke, „dumme" Brücke: nimmt Text entgegen und tippt ihn als HID-Tastatur in NIDA.
Umlaute/Sonderzeichen über deutsches HID-Layout + Alt-Code-Fallback (siehe
[`umlauts.md`](umlauts.md)).

> **Bindend [2026-06-04]:** Die Ziele (NIDA, iPadOS) akzeptieren kein BLE → die Bridge **muss
> USB-HID** sein. Bridge-Hardware braucht zwingend natives USB. Details: Issues #3/#8.

**Die Brücke ist hardware-abstrahiert** (siehe Issue #8) — drei Teile:
1. **Wire-Protokoll** (Handy→Brücke) — hardwareunabhängig.
2. **Keymap-/Umlaut-Logik** — geteilt (HID-Scancodes, host-DE-Layout).
3. **USB-HID-Emitter** — dünn, pro Chip getauscht (aber immer USB-HID).

| Plattform | Rolle | HID-Pfad | Firmware-Stack |
|-----------|-------|----------|----------------|
| **Pico 2 W** (`SC1633`) | **Hauptziel** (15× bestellt) | USB-HID (Kabel) + WLAN-AP | CircuitPython 9.x+ |
| Pico 1 (RP2040, Bestand) | Umlaut-Test jetzt | USB-HID (Kabel) | CircuitPython 8/9 |
| ESP32-WROOM-32 (Bestand) | ❌ verworfen | kein USB-HID möglich | — |
| ESP32-S2/S3 bzw. WROOM-32+CH9329 | mögliche Alt-Hardware | USB-HID nativ / via CH9329 | — |

**Flotte:** 15 Bridges → der Flash-/Provisionierungs-Ablauf muss wiederholbar und
dokumentiert sein (ggf. pro-Gerät eindeutige AP-SSID).

### Transport (Composer → Bridge)
**WLAN-AP auf dem Pico 2 W** — voll lokal/offline, kein Pairing-Stress, die PWA kann direkt vom
Board ausgeliefert werden. (Nur der Handy→Bridge-Transport; der Bridge→Ziel-Weg ist immer
USB-HID.) BLE wird projektweit nicht genutzt.

## Datenmodell

Das Standardprotokoll ist eine maschinenlesbare **Vorlage** (Abschnitte, Felder,
Default-„normal"-Befunde) **plus** eine freie **Snippet-Bibliothek** für Sonderfälle. Der
Renderer erzeugt daraus verlustfrei sauberen Fließtext. Siehe [`../protocols/`](../protocols/).

## Roadmap (vertikale Slices)

1. **Dumme Brücke** — Firmware empfängt Text (WLAN-AP) → tippt per DE-HID. *(braucht Hardware)*
2. **Protokoll-Datenmodell** — Vorlage + Snippets + Renderer. *(rein softwareseitig, Unit-Test)*
3. **Composer-PWA** — Abschnitte, Klickstruktur, Snippets, Freitext → sendet an die Brücke.
4. **Spracheingabe** — Diktat in die Composer-Felder.
5. *(optional)* alte Tasten-Box als Schnell-Trigger gegen dieselbe Brücke.
