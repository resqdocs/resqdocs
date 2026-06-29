# Einstellungen-Struktur: Rework-Vorschlag

> Status: Vorschlag, umsetzbar. Stack: Vue 3 + Tailwind CSS 4 + daisyUI 5 (5.5.23), mobile-first, tab-basiert OHNE Router (Capacitor iOS/Android + Web).
> Datei heute: `apps/pico-pwa/src/components/settings/SettingsTab.vue` (Single-Scroll aus ~8 `card`-Sektionen + PZN-Navi-Zeile + Versions-Fuszeile).
> Bestandsschutz: alles bleibt. Einzig entfernbar: das Ueberschriftenmuster (siehe Abschnitt 5).

---

## 1. Kurz-Prinzipien fuer gute mobile Settings

1. **Verwandtes gruppieren, Gruppen sichtbar trennen.** Zusammengehoeriges per Naehe/Weiszraum oder Trennlinie bilden, getrennte Bereiche klar abgrenzen. — https://developer.apple.com/design/human-interface-guidelines/settings , https://www.nngroup.com/articles/form-design-white-space/
2. **Nach Wichtigkeit/Haeufigkeit ordnen.** Das Wichtigste zuerst zeigen, Sekundaeres in eine andere Ansicht verschieben; innerhalb einer Gruppe haeufige Werte zuerst. — https://developer.apple.com/design/human-interface-guidelines/settings , https://www.nngroup.com/articles/web-form-design/
3. **Single-Scroll bei verbundenem Inhalt, Accordion nur bei lose verwandtem.** Langer Scroll, wenn Inhalte zusammenhaengen/verglichen werden; Accordion, wenn Nutzer nur einzelne Teile brauchen (jedes Auf/Zu kostet kognitive Last). — https://www.nngroup.com/articles/accordions-complex-content/
4. **Tabs nur fuer wenige (~4-5) parallele Ansichten; mehr Struktur in Drill-down.** Ueber 5 Tabs passen nicht mehr in Touch-Groesze; tiefer schachteln per Unterseite. Drill-down passt, wenn pro Sitzung nur ein Zweig genutzt wird. — https://www.nngroup.com/articles/mobile-navigation-patterns/
5. **Label oben, persistent sichtbar, einspaltig.** Top-aligned Labels sind schnellster Scan (Label+Feld in einer Fixation); Platzhalter sind keine Labels. Eine Spalte beibehalten. — https://www.uxmatters.com/mt/archives/2006/07/label-placement-in-forms.php , https://www.nngroup.com/articles/web-form-design/ , https://www.nngroup.com/articles/form-design-placeholders/
6. **Touch-Targets >= 44x44 pt / 48x48 dp; destruktive Aktionen abgesetzt + bestaetigt.** Loeschaktionen rot, vom Routinekontext getrennt, Bestaetigungsdialog mit konkreter Folge und beschreibenden Buttons. — https://developer.apple.com/design/human-interface-guidelines/ , https://m3.material.io/foundations/designing/structure , https://www.nngroup.com/articles/confirmation-dialog/ , https://developer.apple.com/design/human-interface-guidelines/buttons

---

## 2. daisyUI-5-Baukasten fuer Settings (verifiziert, v5.5.23)

| Komponente | Einsatz in 1 Satz | Quelle |
|---|---|---|
| `fieldset` + `fieldset-legend` + `label` | Standard-Formularblock: Legend als Feldgruppen-Titel, `<p class="label">` als Hilfetext unter dem Feld. | https://daisyui.com/components/fieldset/ |
| `input` / `select` / `toggle` (+ Farben + Groeszen `*-xs..xl`) | Einzelne Eingabefelder; Border ist Default (`input-bordered`/`select-bordered` sind v5-Altlasten ohne Effekt). | https://daisyui.com/components/input/ , https://daisyui.com/components/select/ , https://daisyui.com/components/toggle/ |
| `list` + `list-row` (+ `list-col-grow`, `list-col-wrap`) | Zeilen "Label + Wert + Toggle/Chevron"; ideal fuer dichte Settings-Reihen; ein `<li>` als dezenter Gruppen-Header. | https://daisyui.com/components/list/ |
| `collapse` (+ `collapse-arrow`/`collapse-plus`, `collapse-open`/`collapse-close`) | Auf-/zuklappbare Bereiche OHNE JS (checkbox- oder `<details>`-basiert); fuer selten genutzte Gruppen. | https://daisyui.com/components/collapse/ |
| `tabs` + `tab` + `tab-content` (Stil `tabs-box`/`tabs-border`) | Umschaltbare Panels ohne Router/JS via Radio-Input-Pattern; auf Phone <= 4 Tabs, kompakte Stile. | https://daisyui.com/components/tab/ |
| `card` + `card-body` + `card-title` (+ `card-border`, Groeszen) | Gruppen-Container; `card-title` als Gruppen-Label, `w-full` statt `w-96` auf Phone. | https://daisyui.com/components/card/ |
| `divider` (+ `divider-start`/`-end`, Farben) | Beschrifteter Trenner zwischen Gruppen; sparsam, oft sind `card-title`/`list`-Header sauberer. | https://daisyui.com/components/divider/ |
| `join` + `join-item` (`join-vertical`/`-horizontal`) | Kleine 2-3-Optionen-Segmentgruppe in einer Zeile; KEIN Layout-Container; auf Phone ggf. vertikal. | https://daisyui.com/components/join/ |

**Verifizierte Kanon-Markup fuer einen Formularblock (v5):**
```html
<fieldset class="fieldset">
  <legend class="fieldset-legend">Standard-Zielgeraet</legend>
  <select class="select w-full"> ... </select>
  <p class="label">Wird beim Anlegen neuer Protokolle vorausgewaehlt.</p>
</fieldset>
```
Hinweis: `fieldset`/`legend`/`select` setzen Label oben und Feld volle Breite (`w-full`) ohne `flex flex-col`-Krueckstock.

---

## 3. Struktur-Varianten fuer unsere 9 Sektionen

Bestand (Reihenfolge heute): 1 App-Einstellungen, 2 Geraet/Pico, 3 PZN-Woerterbuch (Flag, aus), 4 PZN-Bibliothek (Sub-Seite), 5 Scanner-Modus, 6 Datenschutz & lokale Daten, 7 Info & Hilfe, 8 Rechtliches, 9 Open Source.

### Variante A — Gruppierter Single-Scroll mit klaren Gruppen-Headern

```
Einstellungen
  ───────────── App & Darstellung ──────────────
  ┌ card ─────────────────────────────┐
  │ App-Einstellungen                 │   (fieldsets: Zielgeraet, Design, Erscheinung)
  └───────────────────────────────────┘
  ───────────── Geraet & Daten ─────────────────
  ┌ card ─────────────────────────────┐
  │ Geraet / Pico                     │   Bridge, Geraete-ID, Firmware
  ├ card ─────────────────────────────┤
  │ PZN-Bibliothek (persoenlich)   ›  │   Navi-Zeile -> Sub-Seite (Bestand)
  ├ card ─────────────────────────────┤
  │ Scanner-Modus                     │
  ├ card ─────────────────────────────┤
  │ Datenschutz & lokale Daten        │   destruktiv, rot, am Gruppenende
  └───────────────────────────────────┘
  ───────────── Info & Rechtliches ─────────────
  ┌ card ─┐ ┌ card ─┐ ┌ card ─┐
  │ Info  │ │ Recht │ │ OSS   │
  └───────┘ └───────┘ └───────┘
  ResQDocs X.Y.Z (Build)
```
- **Pro:** minimaler Umbau (Bestand bleibt, nur Gruppen-Header `divider`/Subhead + Reihenfolge); alles sichtbar/scanbar; null neuer State; passt zu "Inhalte zusammenhaengend" (NNG). Label-oben-Regel sauber per `fieldset`.
- **Contra:** weiterhin langer Scroll; Gruppen-Header tragen die ganze Orientierung.
- **Aufwand:** klein (Reorder + 3 Gruppen-Trenner + Sektionen auf `fieldset` migrieren, additiv).
- **Tab-App ohne Router:** ideal, kein Router/State noetig; Drill-down bleibt nur fuer PZN-Bibliothek (Bestand).

### Variante B — Collapse/Accordion pro Gruppe

```
Einstellungen
  ▸ App & Darstellung            (collapse, offen by default)
  ▾ Geraet & Daten               (collapse)
      Geraet / Pico
      PZN-Bibliothek          ›
      Scanner-Modus
      Datenschutz & lokale Daten
  ▸ Info & Rechtliches           (collapse, zu)
  ResQDocs X.Y.Z (Build)
```
- **Pro:** kurzer Initial-Scroll; selten genutzte Gruppen (Info/Recht/OSS) eingeklappt; `<details>`-basiert = kein JS, find-in-page erreicht Inhalt.
- **Contra:** jedes Auf/Zu kostet Last; bei verbundenem Inhalt schlechter als Scroll (NNG); Bridge/Firmware-Aktionen versteckt; Risiko, dass Datenschutz-Loeschen "weggeklappt" untergeht.
- **Aufwand:** mittel (Gruppen in `collapse` wrappen, Default-States festlegen).
- **Tab-App ohne Router:** gut machbar ohne JS; aber Settings sind teils handlungskritisch (Bridge, Loeschen) -> Verstecken eher Nachteil.

### Variante C — Drill-down-Hub via list/menu zu Unterseiten

```
Einstellungen (Hub)
  ┌ list ─────────────────────────────┐
  │ App & Darstellung              ›  │
  │ Geraet / Pico                  ›  │
  │ PZN-Bibliothek (persoenlich)   ›  │   (Bestand schon so)
  │ Scanner-Modus                  ›  │
  │ Datenschutz & lokale Daten     ›  │
  │ Info & Hilfe                   ›  │
  │ Rechtliches                    ›  │
  │ Open Source                    ›  │
  └───────────────────────────────────┘
  ResQDocs X.Y.Z (Build)
        -> jede Zeile oeffnet eigene Sub-Seite (page-State, kein Router)
```
- **Pro:** kuerzeste Uebersicht, jede Seite fokussiert; skaliert; nutzt das bestehende `page`-State-Muster der PZN-Bibliothek.
- **Contra:** jede Einstellung ist mind. 1 Tap tief (Discoverability/Prioritaet leidet, NNG); deutlich mehr State (n Sub-Seiten) + Back-Handling; bei nur 9 kleinen Sektionen Overkill; Routing-faehnliches Verhalten ohne Router selbst gebaut.
- **Aufwand:** grosz (8 Navi-Zeilen + 7 neue Sub-Seiten-Wrapper + Back/Hardware-Back).
- **Tab-App ohne Router:** technisch machbar (page-State), aber teuerste Variante; nur lohnend, wenn Sektionen stark wachsen.

---

## 4. Empfehlung: Variante A (gruppierter Single-Scroll), PZN-Bibliothek bleibt Drill-down

**Begruendung.** Unsere Settings sind verbundener, ueberschaubarer Inhalt (9 kompakte Sektionen), bei dem Nutzer scannen und gelegentlich mehrere Dinge in einer Sitzung anfassen (z. B. Zielgeraet + Bridge). NNG: bei verbundenem/vergleichbarem Inhalt schlaegt der einheitliche Scroll das Klicken durch Sektionen; Accordion lohnt erst bei lose verwandtem Inhalt, Tabs nur fuer wenige parallele Ansichten. Handlungskritische Dinge (Bridge-Status, Datenschutz-Loeschen) duerfen nicht hinter Auf/Zu oder Taps verschwinden. Variante A ist zugleich der kleinste, additive Eingriff und schuetzt den Bestand am besten. Drill-down behalten wir nur dort, wo er fachlich passt: die PZN-Bibliothek (eigene Suche/Liste fuer ~1000 Eintraege) ist ein eigener Zweig pro Sitzung -> klassischer Drill-down-Fall, bereits so umgesetzt.

**Empfohlene Gruppierung + Reihenfolge (3 Gruppen, klare Header):**

1. **App & Darstellung** (zuerst, am haeufigsten/erwartet)
   - App-Einstellungen: Standard-Zielgeraet (OS), Design, Erscheinung
2. **Geraet & Daten** (System-Basis + alles Datenbezogene zusammen)
   - Geraet / Pico (Bridge, Geraete-ID, Firmware-Update)
   - PZN-Woerterbuch (nur wenn Flag an; bleibt unveraendert)
   - PZN-Bibliothek (persoenlich) -> Navi-Zeile zur Sub-Seite (Bestand)
   - Scanner-Modus (BMP-Data-Matrix)
   - Datenschutz & lokale Daten -> **ans Gruppenende**, destruktive Aktionen rot/abgesetzt, mit Bestaetigungsdialog (konkrete Folge, beschreibende Buttons)
3. **Info & Rechtliches** (Fusz-Block, selten genutzt, ruhig)
   - Info & Hilfe
   - Rechtliches (Impressum + Datenschutz)
   - Open Source
   - dezente Versions-/Build-Fuszzeile (Bestand)

Gruppen-Header als kurzer Subhead bzw. `divider` mit Text (sparsam); innerhalb der Gruppe weiter `card` pro Sektion. So bleibt jede Sektion als eigenstaendiger Block erhalten (Bestandsschutz), gewinnt aber sichtbare Zugehoerigkeit.

---

## 5. Konsistenz mit den Constraints

- **Bestandsschutz:** Jede der 9 Sektionen bleibt als eigene Komponente/Block erhalten; Variante A ordnet nur um und setzt Gruppen-Header. Keine Sektion wird entfernt. Einzige Ausnahme laut Vorgabe: das **Ueberschriftenmuster** darf aus den App-Einstellungen raus.
  - **Wohin mit dem Ueberschriftenmuster:** Es ist eine Protokoll-/Vorlagen-Eigenschaft, keine globale App-Einstellung. Empfehlung: in die **Protokoll-/Vorlagen-Ebene** verschieben (dort, wo Protokolle erzeugt/konfiguriert werden), nicht in Settings behalten. Damit verschlankt sich "App-Einstellungen" auf das, was wirklich app-global ist (Zielgeraet, Design, Erscheinung). Falls die Vorlagen-Ebene das (noch) nicht traegt: vorerst in App-Einstellungen lassen und erst beim Vorlagen-Rework verschieben - aber nicht in eine der anderen Settings-Gruppen verschieben.
- **Design zurueckhaltend:** Keine `divider`-Farben/`card`-Vollflaechen einsetzen; Navy fuer Text/Struktur. Coral (`accent`/`primary`) nur fuer die primaere/aktive Aktion (z. B. aktiver Tab, Primaer-Button), nie als Flaeche. `card-border`/dezenter Shadow statt farbiger Container. Destruktiv = `error`/Rot, ausschlieszlich bei Loeschaktionen.
- **Label oben, volle Breite, geraeteidentisch:** Konsequent `fieldset` + `fieldset-legend` (Label oben) + Feld mit `w-full` (volle Breite darunter). Das gilt iPad = iPhone = Web identisch (kein responsives Umspringen auf Seiten-Labels). Hilfetext als `<p class="label">` unter dem Feld. Platzhalter ersetzen kein Label.
- **Usability top:** Wichtigstes zuerst (App-Einstellungen), handlungskritisches sichtbar (Bridge, Loeschen nicht eingeklappt/vertieft), Touch-Targets >= 44pt/48dp fuer alle Zeilen, Buttons, Toggles.
- **Offline:** Keine Struktur-Aenderung beruehrt Netzwerk; weiterhin nur LAN-Bridge + PZN-Datenbezug, keine Telemetrie.

---

## 6. Migrations-Hinweise (additiv, nichts loeschen)

- **`form-control` und `label-text`/`label-text-alt` sind in daisyUI 5 entfernt** (altes HTML rendert, die Klassen stylen aber nicht mehr). Genau das hat das Projekt getroffen (musste `flex flex-col` von Hand nachruesten).
  - `form-control` -> `fieldset` (Quelle: https://daisyui.com/docs/upgrade/)
  - `label-text` / `label-text-alt` -> `label` (Hilfetext: `<p class="label">`)
  - `input-group` / `btn-group` -> `join` / `join-item`
  - `input-bordered` / `select-bordered` -> ersatzlos entfernen (Border ist Default; Klassen sind No-ops)
- **Vorgehen:** Pro Sektion schrittweise von `form-control`/`label-text`(+ manuellem `flex flex-col`) auf `fieldset`/`fieldset-legend`/`label` umstellen. Additiv und sektionsweise testbar - keine globale Big-Bang-Migration. Nach Umstellung kann der manuelle `flex flex-col`-Workaround entfallen, da `fieldset` Label-oben/Feld-volle-Breite selbst liefert.
- **Reihenfolge der Migration:** Beginnen mit Sektionen, die Formularfelder haben (App-Einstellungen, Geraet/Pico, Scanner-Modus); reine Info-/Link-Sektionen (Info, Rechtliches, OSS) brauchen kein `fieldset`.
- **Verifizieren je Sektion:** Label sitzt oben, Feld ist `w-full`, identisch auf iPhone/iPad/Web; kein Rest von `label-text`/`form-control` im Markup.

---

## 7. Quellen

UX / Mobile Settings:
- https://developer.apple.com/design/human-interface-guidelines/settings
- https://developer.apple.com/design/human-interface-guidelines/buttons
- https://developer.apple.com/design/human-interface-guidelines/
- https://m3.material.io/components/divider/guidelines
- https://m3.material.io/components/navigation-drawer/guidelines
- https://m3.material.io/foundations/designing/structure
- https://www.nngroup.com/articles/accordions-complex-content/
- https://www.nngroup.com/articles/mobile-navigation-patterns/
- https://www.nngroup.com/articles/tabs-used-right/
- https://www.nngroup.com/articles/web-form-design/
- https://www.nngroup.com/articles/form-design-white-space/
- https://www.nngroup.com/articles/form-design-placeholders/
- https://www.nngroup.com/articles/progressive-disclosure/
- https://www.nngroup.com/articles/confirmation-dialog/
- https://www.uxmatters.com/mt/archives/2006/07/label-placement-in-forms.php

daisyUI 5 (v5.5.23):
- https://daisyui.com/components/fieldset/
- https://daisyui.com/components/label/
- https://daisyui.com/components/input/
- https://daisyui.com/components/select/
- https://daisyui.com/components/toggle/
- https://daisyui.com/components/list/
- https://daisyui.com/components/menu/
- https://daisyui.com/components/collapse/
- https://daisyui.com/components/tab/
- https://daisyui.com/components/card/
- https://daisyui.com/components/divider/
- https://daisyui.com/components/join/
- https://daisyui.com/docs/upgrade/
