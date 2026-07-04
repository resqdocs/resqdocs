# Trenner-Optionen: Progressive Disclosure (Editor)

> Quellenbasiert (Workflow `separator-disclosure-research`, 2026-06-24). Frage des Maintainers:
> die Trenner-Optionen gebuendelt hinter EINEN Schalter zum „aktiv freischalten/aufklappen"?
> Antwort der Quellen: **Disclosure JA, aber NICHT gebuendelt und KEIN An/Aus-Gate.**

## Entscheidung

- **Container-Panel:** „Feld-Trenner" liegt in einem **default eingeklappten** Abschnitt
  „Erweitert: Feld-Trenner" (daisyUI 5 `collapse collapse-arrow`). Der **aktuell wirksame Wert**
  steht im eingeklappten Kopf als Status-Vorschau (Discoverability).
- **Feld-Panel:** „kein Trenner davor" bleibt, wo es ist - es erscheint ohnehin nur bei „Inline"
  (bedingt offengelegt) und IST ein echtes An/Aus (Toggle korrekt). Kein extra Abschnitt fuer die
  eine Checkbox.

## Warum so

- **Kein Gate.** Der Trenner ist IMMER aktiv (Default `", "`); nur der Wert ist anpassbar. Ein
  „eigenen Trenner verwenden (an/aus)" wuerde faelschlich ein Abschalten suggerieren. (NN/g
  Toggle-Guidelines: Toggle = sofort wirkende Zustandsaenderung; Apple HIG: kein Switch fuer ein
  einzelnes/permanentes Detail.) -> reines Ein-/Ausblenden der Anzeige.
- **Nicht gebuendelt.** `separator` (Container) und `noSeparatorBefore` (Feld) gehoeren zu
  VERSCHIEDENEN Knoten; das Panel zeigt immer nur einen. Ein Sammelschalter waere Ueber-Abstraktion
  (Hick's Law: „nicht zur Abstraktion vereinfachen") und schlechter Information Scent.
- **Disclosure statt immer sichtbar.** Sekundaere, selten gebrauchte Optionen -> Progressive
  Disclosure (NN/g: nur zeigen, wenn gefragt; verbessert Learnability, Effizienz, Fehlerrate;
  max. 2 Ebenen).
- **Discoverability abgefedert.** Beschreibendes Label (nicht nur „Erweitert"), Caret
  (`collapse-arrow`, laut NN/g klarster Aufklapp-Signifier), Wert-Vorschau im Kopf, Default
  eingeklappt (die Mehrheit braucht den Default `", "`, nicht die Feineinstellung).

## Umsetzung

`ContainerProperties.vue`: `<details class="collapse collapse-arrow …">` am Ende der
Container-Optionen, Wert via `effectiveSeparator` im `<summary>`. daisyUI-5-Markup
(`fieldset`/`input`, KEIN v4 `form-control`/`label-text`/`input-bordered`).

**Update 2026-06-25 (emptytext-placement-research):** Der Abschnitt heisst jetzt **„Erweitert:
Ausgabe"** und buendelt ZWEI sekundaere Output-Optionen in EINER Disclosure (nicht zwei Aufklapper):
**Feld-Trenner** + **„Text wenn leer"** (`emptyText`). Beleg: GOV.UK „details fuer 1 Abschnitt,
Accordion erst fuer mehrere"; 2 thematisch verwandte Felder = 1 Abschnitt; NN/g „advanced features
in eine Gruppe, ein Nachschauort". Kopf-Vorschau kombiniert: `„, " · leer: „unauffaellig"` (emptyText
nur wenn gesetzt) -> Discoverability auch eingeklappt. Leeres emptyText-Feld -> `undefined` (kein
leerer String im Modell), analog zur Trenner-Logik.

## Quellen

- NN/g Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/
- NN/g Toggle-Switch Guidelines: https://www.nngroup.com/articles/toggle-switch-guidelines/
- NN/g Accordions on Desktop: https://www.nngroup.com/articles/accordions-on-desktop/
- GOV.UK Details: https://design-system.service.gov.uk/components/details/
- IBM Carbon Accordion: https://carbondesignsystem.com/components/accordion/usage/
- Laws of UX – Hick's Law: https://lawsofux.com/hicks-law/
- Material 3 Bottom Sheets (Status-Vorschau im collapsed state): https://m3.material.io/components/bottom-sheets/guidelines
- Apple HIG Toggles: https://developer.apple.com/design/human-interface-guidelines/components/selection-and-input/toggles/
