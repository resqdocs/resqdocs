# Einsatz-Anzeige: Protokoll beim Ausfuellen darstellen (quellenbasiert)

> Branch experiment/protocol-rework. Vorschlag, wie der **Einsatz** (Ausfuell-Tab) den
> Container-Baum beim „Protokoll schreiben" anzeigt. Synthese aus dem Workflow
> `einsatz-display-research` (NN/g, Baymard, GOV.UK, JSONForms, SurveyJS, FormKit, Material/
> Apple). Keine Uebernahme der alten `ProtocolRuntimeView`. Stand 2026-06-23. **Status: Vorschlag.**

## Rahmen

Einsatz = wiederkehrendes Experten-Werkzeug, unter Zeitdruck, einhaendig am iPhone/iPad,
offline; Ausgabe ist getippter Text fuer NIDA. Heute gibt es nur Container (keine Felder) -
der Einsatz zeigt also die **Struktur** (Sektionen). Felder kommen INNERHALB der Container.

## Prinzipien (je mit Quelle)

- **P1 Eine Spalte, Label ueber Feld, volle Breite** (deckt sich mit der Projektregel). [NN/g 4-principles, Baymard mobile-checkout]
- **P2 Gruppierung primaer ueber Weissraum**, Rahmen/Kasten nur wenn noetig (Abstand zwischen Gruppen > innerhalb). [NN/g common-region, form-white-space]
- **P3 Sektionsueberschriften** machen ein langes Formular scanbar („mehrere kurze Formulare"). [NN/g form-white-space]
- **P4 Verschachtelung flach halten, NIE Accordion-in-Accordion.** Modell erlaubt beliebige Tiefe; die Anzeige spiegelt sie NICHT 1:1 als geschachtelte Klappboxen. [GOV.UK accordion]
- **P5 Eingegebene Daten sichtbar halten** - eingeklappte, ausgefuellte Sektion zeigt LESBARE Zusammenfassung, nicht nur Kopf (sicherheitskritisch: „was geht an NIDA?"). [Baymard accordion-checkout]
- **P6 Experten/wiederkehrend -> ein langer Scroll, kein Wizard.** [NN/g wizards]

## Empfehlung: ein langer, einspaltiger Scroll mit Sektionen

Top-Level-Container = Sektionen mit Ueberschrift, per Weissraum getrennt. **Kein** Wizard
(erzwingt lineare Reihenfolge - Einsatz springt aber dorthin, wo der Patient gerade etwas
hergibt), **kein** globales Accordion (im Einsatz braucht man potenziell jede Sektion; jeder
Klapp = Extra-Tap), **keine** eine-Sektion-pro-Screen (verhindert Ueberblick/Vergleich).
`collapsible` bleibt eine **bewusste Vorlagen-Entscheidung pro Container**.

### Plattform-Abstufung (gleiches Formular ueberall)

- **iPhone (zuerst):** ein Scroll, eine Spalte, volle Breite. Sticky-Sektionskopf, sobald eine
  Sektion laenger als ein Screen ist; Geraete-Zurueck klappt eine offene Sektion zu.
- **iPad/Desktop:** dasselbe einspaltige Formular, zentriert mit begrenzter Lesebreite (nicht
  auf zwei Spalten aufblasen). Der Platz geht in eine **persistente Sektions-Navi links**
  (Inhaltsverzeichnis der Top-Level-Container, aktuelle Sektion = Koralle) + optional die
  **Live-Text-Vorschau rechts** (zeigt, was wirklich an NIDA geht). Formular = eine Quelle der
  Wahrheit, kein zweiter Renderpfad.

## Container-Eigenschaften im Einsatz

| Eigenschaft | Einsatz (Anzeige) | NIDA-Text-Ausgabe |
|---|---|---|
| `title` | **immer als Sektionsueberschrift sichtbar** (Orientierung) | nur wenn `showTitle` |
| `showTitle` | **ohne Wirkung auf die Anzeige** | steuert NUR, ob die Ueberschrift in den Text geht |
| `heading` | **ohne Wirkung auf die Anzeige** | formt die Textzeile (`## Anamnese`, `Anamnese ===`) |
| `collapsible` | ob die Sektion ein Klapp-Kopf ist (Default: collapsible -> startet **eingeklappt**, sonst immer offen) | keine Wirkung |
| Verschachtelung | flach: Top-Level = Sektion, Ebene 2 = kleinerer Unter-Kopf + Weissraum, Ebene 3+ nicht weiter eindellen | ueber `prefix` pro Container |

**Wichtig:** Titel ist im Einsatz IMMER da (Bedienung/Orientierung); `showTitle`/`heading`
betreffen NUR den getippten NIDA-Text. Deshalb auf iPad/Desktop die Live-Vorschau daneben.

### daisyUI 5 (zurueckhaltend: navy, Koralle nur fuer aktiv/primaer)

- Offene, nicht-klappbare Sektion: KEIN Kasten - nur Ueberschrift (`font-semibold`) + Weissraum.
- Klappbare Sektion: daisyUI `collapse` + `collapse-arrow` (Pfeil = einziger Koralle-Akzent).
- Tiefere Ebene: zurueckhaltender Unter-Kopf (`text-sm font-medium`, gedaempft) + Einrueckung/
  Weissraum - NICHT erneut als `collapse` schachteln (P4). Divider nur sparsam.
- Keine vollflaechigen farbigen Baender (erzeugen „false floor").

## Architektur: geteilter Protokoll-Zustand (eine Quelle der Wahrheit)

- **Eine Definition, zwei Sichten.** Der Container-Baum (Vorlage) ist die einzige Quelle der
  Wahrheit. Editor SCHREIBT sie, Einsatz LIEST sie. Den `provide`/`inject`-Wurzelzustand aus
  `EditorView` in ein gemeinsames Composable (`useProtocolTree`) heben, das beide Tabs einhaengen.
- **Definition vs Werte getrennt.** Baum = Definition; die im Einsatz eingegebenen WERTE sind ein
  zweiter, fluechtiger Zustand (per `id` verschluesselt - dafuer ist die Pflicht-`id` der Hook),
  nie persistiert (Projektkonvention). Renderer bekommt `(definition, werte)` -> NIDA-Text; die
  Definition wird nie mutiert.
- **Reiner Renderer als dritte Saeule.** Die Live-Vorschau ruft denselben `render.ts` wie die
  finale Ausgabe - kein zweiter Pfad (Garantie hinter P5).

## Wie Felder (spaeter) sich einfuegen (Ecke-Vermeidung)

- `Node` wird Union (`container | field | …`); die Anzeige iteriert schon ueber `children` und
  rendert je `type` Sektion (Container) oder Eingabe-Control (Feld). Nur ein Render-Zweig mehr,
  kein Layout-Umbau (wie JSONForms Layout vs Control, SurveyJS Panel enthaelt Fragen).
- Felder erben Ein-Spalten + Label-oben (P1), fuellen die Sektionsbreite.
- Klapp-Zusammenfassung (P5) wird mit Feldern echt; bis dahin zeigt ein klappbarer Container nur
  seinen Titel - konsistent, kein Sonderfall.
- No-Nesting (P4) bleibt feldsicher: Felder sind Blaetter, Tiefe entsteht nur durch Container.

## Quellen (Auswahl)

NN/g: wizards, mobile-accordions, common-region, form-design-white-space, gestalt-proximity,
4-principles-reduce-cognitive-load. Baymard: accordion-style-checkout, accordion-and-tab-design,
checkout-process-should-be-linear, form-design, mobile-ecommerce-checkout-forms. GOV.UK:
components/accordion. Form-Runtime: jsonforms.io (layouts, categorization), surveyjs.io
(panel-model, dynamic-panel, survey-data-model), formkit.com (inputs/group). Material 3:
layout/spacing, divider, cards. (Apple HIG layout/entering-data: client-side, nicht abrufbar.)
