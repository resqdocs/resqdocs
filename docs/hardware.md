# Hardware-Wahl

## Entscheidung: Raspberry Pi Pico 2 W (RP2350) — Hauptziel

Gewählt wegen bestem Verhältnis aus Kosten, Reserve und Flexibilität (~8–10 €):

- **Bestell-Code: `SC1633`** = Pico 2 W (Wireless). **Nicht** SC1631 (Pico 2) oder SC1632
  (Pico 2 H) — die haben **kein** Funkmodul. SC1634 = Pico 2 WH (mit vorgelöteten Headern).
  Header sind für den USB-HID-Pfad nicht nötig; nur relevant, wenn später die Tasten-Box
  als Trigger angelötet wird. **15 Stück bestellt** (Flotte → Provisionierung muss
  wiederholbar sein, siehe `architecture.md`).
- **Native USB-HID** + stabiles **CircuitPython** (9.x+ für RP2350).
- **WLAN 2,4 GHz** → derselbe Chip erledigt das **USB-HID-Tippen** **und** den Transport
  (WLAN-AP fürs Handy). Bluetooth/BLE wird **nicht** genutzt (siehe unten).
- Dual-Core (ARM Cortex-M33 *oder* RISC-V), 520 KB RAM (2× ggü. RP2040), genug Reserve.

### Cross-Platform: USB-HID ist Pflicht, BLE ist raus

> **Bindende Anforderung [2026-06-04]:** Die Ziele (**NIDA**, **iPadOS**) akzeptieren **kein**
> BLE (managed/blockiert). Die Bridge **muss eine USB-Tastatur imitieren**. BLE-HID ist damit
> kein gangbarer Weg — die Bridge-Hardware braucht zwingend **natives USB**.

- **NIDA / iPadOS / Windows / macOS:** alle über **USB-HID (Kabel)**; iPad per USB-C-/Lightning-Adapter.
- Geräteübergreifendes *Anschließen* heißt nicht geräteübergreifend *gleiche* Sonderzeichen —
  die Umlaut-Behandlung ist per-OS unterschiedlich, siehe [`umlauts.md`](umlauts.md).

## ESP32-WROOM-32 — verworfen (kein USB-HID)

Mehrere ESP32-WROOM-32 sind im Bestand, **können aber nicht als Bridge dienen**: Der klassische
WROOM-32 hat **kein natives USB** (der USB-Port ist nur ein UART-Bridge-Chip, CP2102/CH340) →
**keine USB-HID-Emulation**. Da BLE bei den Zielen ausscheidet, gibt es für ihn keinen Weg zum
Ziel. Nutzbar nur mit externem **CH9329** (UART→USB-HID) — Bestellung/Verdrahtung nötig. Details:
Issue #8.

> **Pico 1 (RP2040) im Bestand:** hat **natives USB-HID** (Basis von SaniScript) → eignet sich,
> um den kritischen Umlaut-Pfad **jetzt** auf echter Hardware gegen NIDA/iPad zu verifizieren
> (Issue #1). Die WLAN-Variante (Pico W / Pico 2 W) braucht es erst für den Handy-Transport.

## Wichtiger Hinweis zur alten Firmware

Die Vorläufer-Firmware „SaniScript" (pico-ducky auf RP2040) **läuft nicht** auf dem RP2350:
deren gebündelte CircuitPython 8.x (`.uf2`) und `.mpy`-Libs sind RP2040-only. Der RP2350
braucht **CircuitPython 9.x+**. Daher wird die Bridge-Firmware **neu** entwickelt; die alte
Lösung dient nur als Referenz.

## Alternativen mit nativem USB-HID + WLAN (~10 €)

Auswahlkriterium nach dem Pivot: **natives USB-HID** (Pflicht) **+ WLAN** (Handy-Transport) **+
CircuitPython**. BLE ist egal. Preise = grobe Straßenpreise (2026), Fähigkeiten belegt über die
CircuitPython-Boardseiten ([sources.md](sources.md)).

| Board | ~Preis | USB-HID | WLAN | Hinweis |
|-------|--------|---------|------|---------|
| **Pico 2 W (RP2350)** | ~9–11 € | ✅ nativ | ✅ (AP bis 4 Clients) | ✅ **die Wahl** — bestellt, RP2350-Reserve, CircuitPython 9.x |
| Pico W (RP2040) | ~7 € | ✅ nativ | ✅ | Älter, aber **bewährt** (SaniScript-Basis); günstigste Pi-Option |
| ESP32-S2 (z. B. Lolin/Wemos S2 Mini, Waveshare S2-Pico) | ~4–8 € | ✅ nativ | ✅ (kein BLE) | Günstigste USB+WLAN-Option; Single-Core |
| ESP32-S3 (XIAO ESP32-S3, QT Py S3, S3-DevKitC) | ~7–11 € | ✅ nativ | ✅ + BLE | Mehr Leistung; BLE ungenutzt |
| Adafruit Feather/QT Py ESP32-S2/S3 | ~10–15 € | ✅ nativ | ✅ | Premium, top CircuitPython-Support |

**Nicht geeignet** (Kriterium verfehlt): ESP32-WROOM-32 (kein natives USB), XIAO RP2040/RP2350
(kein WLAN, Platzgründe), Pico/Pico 2 ohne „W" (kein WLAN), Pro Micro/STM32 Blue Pill (kein WLAN),
Teensy 4.x (kann USB-HID exzellent, aber ~25 €+ und kein WLAN).

**Fazit:** Der **Pico 2 W bleibt die ideale Wahl** (bewährtes Pi-Ökosystem, CircuitPython 9.x,
WLAN-AP, RP2350-Reserve, bereits als Flotte bestellt). Günstigere valide Notnägel wären Pico W
oder ein ESP32-S2-Board — funktional gleichwertig für unseren Zweck, aber kein Grund zu wechseln.

## Chip-Vergleich (verworfene Alternativen)

| Chip | Preis | Bewertung |
|------|-------|-----------|
| **Pico 2 W (RP2350)** | ~8–10 € | ✅ Hauptziel (`SC1633`) — natives USB-HID + WLAN-AP |
| Pico / Pico W (RP2040) | ~5–8 € | ✅ USB-HID nativ (SaniScript-Basis); Pico-1 im Bestand für Umlaut-Test |
| ESP32-WROOM-32 | im Bestand | ❌ verworfen — **kein** natives USB → kein USB-HID (#8) |
| ESP32-S2 / S3 | ~3–5 € | USB-HID nativ + WLAN, mehr Setup; valide Alternative |
| CH9329 | ~2–3 € | UART→USB-HID — macht den WROOM-32 als USB-Tastatur nutzbar (Workaround) |
| CH552 | ~0,5–1 € | billigst, aber kein CircuitPython, dünnes Tooling → Trial-and-Error |

Quellen: [`sources.md`](sources.md).
