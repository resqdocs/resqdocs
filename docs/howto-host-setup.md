# How-To: Host-Einrichtung (Windows 11 & aktuelles macOS)

> **Projektregel:** Jede Anleitung in ResQDocs muss vollständige How-Tos für **Windows 11**
> **und aktuelles macOS** enthalten. Diese Datei ist die Heimat dieser How-Tos und wächst mit.

## Warum das nötig ist

Die Bridge ist eine USB-Tastatur und sendet **Tastencodes (HID)**, keine Zeichen. Welches
Zeichen erscheint, entscheidet das **am Host eingestellte Tastatur-Layout** — nicht die Bridge
(`bCountryCode` wird von keinem OS ausgewertet, siehe [`umlauts.md`](umlauts.md)). Damit
Umlaute **und** Sonderzeichen korrekt ankommen (Akzeptanzkriterium #1), muss das Host-Layout
zur Keymap der Bridge passen.

> ⚠️ **Wichtig:** Das deutsche Layout ist auf Windows und Mac **nicht identisch.** Buchstaben
> und Umlaute (QWERTZ, ä ö ü ß) sitzen gleich, aber die Sonderzeichen-Ebene unterscheidet sich:
> Windows nutzt **AltGr**, der Mac die **Option**-Taste — mit teils anderen Kombinationen
> (z. B. `\`: Windows `AltGr+ß`, Mac `Shift+Option+7`). Die Bridge braucht deshalb einen
> **OS-Zielmodus** (`win_de` / `mac_de`). Quellen: [Wikipedia – German keyboard layout](https://en.wikipedia.org/wiki/German_keyboard_layout),
> [worldlangs](https://worldlangs.org/german-keyboard-guide/).

---

## Windows 11 — deutsches Tastaturlayout setzen

1. **Einstellungen** öffnen (`Win` + `I`).
2. **Zeit und Sprache → Sprache und Region**.
3. Unter *Bevorzugte Sprachen*: ist **Deutsch (Deutschland)** nicht gelistet, auf
   **„Sprache hinzufügen"** → *Deutsch (Deutschland)* → **Installieren**.
4. Das Layout **Deutsch (QWERTZ)** wird mitinstalliert. Mehrere Layouts: per **`Win` + `Leertaste`**
   umschalten; aktive Sprache steht rechts in der Taskleiste (**DEU**).
5. **Prüfen:** ein Textfeld öffnen, `+`/`-`/`ü`/`ä`/`ö`/`ß` und `AltGr+Q` (→ `@`) tippen.

→ Für diesen Host die Bridge im Modus **`win_de`** betreiben (bewährt, SaniScript-Pfad).

## Aktuelles macOS (Ventura/Sonoma/Sequoia+) — deutsche Eingabequelle setzen

1. **Systemeinstellungen** öffnen (Apple-Menü  → *Systemeinstellungen*).
2. **Tastatur** → Abschnitt **Texteingabe** → bei *Eingabequellen* auf **„Bearbeiten…"**.
3. **„+"** (unten links) → **Deutsch** → *Deutsch* → **Hinzufügen**.
4. Umschalten über das **Eingabemenü** in der Menüleiste oder die **🌐/Fn**-Taste; mit der
   **Tastaturübersicht** (im Eingabemenü) die Belegung sichtbar machen.
5. **Prüfen:** Umlaute/`ß` funktionieren; Sonderzeichen liegen auf **Option** (`@` = `Option+L`,
   `\` = `Shift+Option+7`, `{` = `Option+8`, `[` = `Option+5`, `€` = `Option+E`/Layout-abhängig).

→ Für diesen Host braucht die Bridge den Modus **`mac_de`**. **Offener Punkt:** ein fertiges
`mac_de`-Keymap (Neradoc liefert nur `win_de`) existiert noch nicht — für macOS-Sonderzeichen
muss eine eigene Mac-Keymap bzw. der Unicode-Pfad gebaut werden (Issue #1).

---

## iPadOS (aktuell) — Primärziel, aber der schwierigste Fall

USB-HID-Tastaturen funktionieren am iPad (genau unser Pfad, da BLE blockiert ist):

1. **Anschluss:** USB-C-iPad → Pico direkt per USB-C-Kabel/-Adapter. Lightning-iPad → **Lightning-auf-
   USB-3-Kamera-Adapter** (idealerweise mit Stromzufuhr). Basis-HID (Tastatur) wird unterstützt.
2. **Hardwaretastatur-Layout:** *Einstellungen → Allgemein → Tastatur → Hardwaretastatur* → **Deutsch**.

> ⚠️ **Einschränkung (belegt):** iPadOS bietet **kein vollwertiges deutsches QWERTZ-Hardware-Layout**,
> und eigene Hardware-Layouts sind nicht möglich. Sonderzeichen/Diakritika laufen **Apple-typisch
> über die Option-Taste** (`é` = `Option+E`; „ABC – Extended" als Hilfe). Quellen:
> [Apple Support – Diakritika mit externer Tastatur](https://support.apple.com/guide/ipad/ipadb05adc28/ipados),
> [Apple-Community](https://discussions.apple.com/thread/252365083).

→ Die `win_de`-Keymap trifft am iPad voraussichtlich **nicht** alle Zeichen (Umlaute evtl. ok,
Sonderzeichen wahrscheinlich falsch). **Genau hier testen** liefert die echten Daten (Issue #1).
Lösungsrichtung: Apple/Option-konforme Keymap **oder** Unicode-Eingabepfad — offen.

---

## Verifizieren mit dem Test-Rig

Mit [`../firmware/test/umlaut-test/`](../firmware/test/umlaut-test/) (Pico 1) lässt sich die
Ausgabe direkt prüfen. Der Teststring deckt Umlaute, DE-Sonderzeichen, AltGr/Option-Zeichen
(inkl. `€`), Akzente und Zahlen ab. **Hinweis:** das aktuelle Test-Rig nutzt `win_de` →
für **Windows** korrekt; auf dem **Mac** kommen Buchstaben/Umlaute richtig, Sonderzeichen aber
falsch (kein `mac_de`).

## Status pro Plattform

| Host | Umlaute (ä ö ü ß) | Sonderzeichen (@ € { } \ …) | Keymap-Modus |
|------|-------------------|------------------------------|--------------|
| **Windows 11** | ✅ (bewährt) | ✅ via `win_de` | `win_de` |
| **macOS aktuell** | ✅ (Layout gleich) | ⚠️ offen (kein `mac_de`) | `mac_de` (zu bauen) |
| **iPadOS aktuell** | ⚠️ zu testen | ⚠️ offen (kein QWERTZ-HW-Layout, Apple/Option) | `ios` (offen) |
