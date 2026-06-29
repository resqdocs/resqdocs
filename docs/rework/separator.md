# Feld-Trenner (zwischen inline-Elementen)

> Vom Maintainer Schritt fuer Schritt durchgespielt + entschieden (2026-06-24). Betrifft Renderer
> (`render.ts` joinNodes) + Editor (`ContainerProperties.vue`). Modell: `model.ts`.

## Modell

- **`Container.separator?: string`** — der Trenner. Zentral am **Protokoll (Wurzel)** gesetzt;
  vererbt sich nach unten und kann von einem Container fuer seinen Teilbaum ueberschrieben werden.
  Fehlt -> `DEFAULT_SEPARATOR`.
- **`DEFAULT_SEPARATOR = ", "`** (Komma + Leerzeichen).
- **`noSeparatorBefore?: boolean`** (Field UND Container) — Opt-out: kein Trenner VOR diesem Element.

## Entscheidungen (a–e)

- **(a) Zentral** am Protokoll (Wurzel), **vererbbar**; wandert mit der Vorlage (Export/Import); pro
  Container **aktiv ueberschreibbar** (Modell, Renderer UND Editor; leer = erbt). [Editor-Freischaltung 2026-06-24]
- **(b)** Trenner **nur zwischen zwei benachbarten inline-Elementen**. NICHT zwischen einem
  Inline-Titel und dem ersten Kind — dort macht das Titel-**Suffix** den Uebergang
  (`* x: A`, nicht `* x: , A`).
- **(c) Opt-out** pro Element: **„kein Trenner davor"** (klebt ans vorherige; z. B. Wert+Einheit
  `98%`). Funktional vollstaendig — jede Luecke ist „vor" genau einem Element; „danach" ist nicht
  noetig (waere nur der zweite Weg zur selben Luecke).
- **(d) Default = `", "`**.
- **(e) Generisch:** gilt fuer **alle** inline-Elemente (Feld UND inline-Container), nicht nur Felder.

## Renderer (joinNodes)

Vor jedem **inline**-Kind kommt der (vererbte) Trenner, AUSSER:
- es ist das **erste** Kind nach einem Inline-Titel (Glue ans Suffix), oder
- das Element setzt **`noSeparatorBefore`**.
Block-Kinder -> neue Zeile (kein Trenner). Leere/excluded Kinder zaehlen nicht als „vorheriges Element".

## Editor

- **Trenner-Eingabe an JEDEM Container** (vererbbar), in einem default eingeklappten Abschnitt
  „Erweitert: Feld-Trenner" (Progressive Disclosure, siehe `separator-disclosure.md`; aktueller
  Wert als Vorschau im Kopf). Leer = erbt vom naechsten Vorfahren (Wurzel-Default `", "`); einen
  Wert eintragen = fuer diesen Teilbaum aktiv ueberschreiben. Leeres Feld -> `separator = undefined`
  (NICHT `""`), damit `?? geerbt` greift; geerbter Wert als Platzhalter, wirksamer im Hinweis (via `findPath`).
- **„Kein Trenner davor"**-Schalter am Feld, sichtbar wenn `inline` an ist.
