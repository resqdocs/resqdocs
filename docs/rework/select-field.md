# Select-Feld (Auswahl) — Vertrag

> Neuer Blatt-Typ neben dem einfachen Wert-Feld. Quellenbasiert (Workflows `select-field-research`,
> adversarial `select-field-verify`). Variante C: das Select ist nur ein reicheres Eingabe-Control
> INNERHALB des bestehenden Tri-State — `FieldFill` und die Renderer-Wertauflösung bleiben unverändert.

## Modell (`rebuild/model.ts`, am bestehenden `Field`)

- `options?: string[]` — gesetzt ⇒ das Feld IST ein Select. Der Optionstext IST der NIDA-Ausgabetext.
- `allowCustom?: boolean` — zusätzlich „individuell" → Freitext anbieten (Default aus).
- `default` — der Standardwert; bei einem Select **muss** er eine Option sein. **Kein** neuer Node-Typ,
  **keine** Änderung an `FieldFill`.

## Renderer / `fillValue` (`rebuild/fill.ts`)

Unverändert bis auf den confirmed-Fallback: bei einem Select ist der Standard `default`, **falls** er eine
(nicht-leere) Option ist, sonst die **oberste** Option. Leere Options-Strings werden ignoriert.

| Tri-State | Wert |
|---|---|
| ✓ confirmed | `default` (falls Option) · sonst oberste Option |
| ✎ custom | die gewählte Option **oder** Freitext (`value`) |
| − excluded | entfällt |

## Einsatz (`components/rebuild/EinsatzField.vue`)

**Optionen sind beim Select IMMER sichtbar** (quellenbasiert `select-field-ux-critique`: versteckte
Optionen widersprechen der Select-Erwartung; NN/g Recognition-over-Recall + Baymard). Kein
vorgeschalteter ✎-Modus-Tap — der **Erhebungsstatus steckt in der Auswahl selbst**, ein Tap genügt:

- **adaptives Control:** Radios (als `role="radiogroup"`) bei ≤ 6 Optionen, natives Dropdown
  (Index-basiert + Sentinels, kollisionsfrei) bei > 6. Die Standard-Option ist vorgewählt.
- **Standard-Option** wählen → `confirmed` (der Default wird **nie** als `custom` materialisiert →
  keine Schein-Abweichung, Default propagiert weiter). **Andere Option** → `custom`-Wert.
- **„individuell …"** (nur bei `allowCustom`) → `custom` + Freitextfeld. Der individuell-Zustand ist ein
  **sticky ref** (kein Modus-Flip beim Tippen eines Options-Texts) **plus** Ableitung „Wert nicht in
  options"; gatet auf `state==='custom'` → kein veralteter Zustand nach `reset()`/excluded.
- **„nicht erhoben"** → `excluded`, als eigene, optisch abgesetzte Option (Status, kein Wert).
- Optionen werden dedupliziert + leere ignoriert; ein Orphan-Wert (Editor-Änderung der options) fällt
  sichtbar auf die Standard-Option zurück. a11y: Radiogruppe/Dropdown mit Label, `aria-controls` am
  „individuell"-Radio, kein `aria-expanded`.

Das **Freitext-Feld** (keine options) bleibt unverändert beim Tri-State-Toggle ✓/✎/− (Eingabe erst bei
✎ — dort gibt es nichts zu „scannen", Progressive Disclosure korrekt angewandt).

## Editor (`components/rebuild/ContainerProperties.vue`, Feld-Zweig)

Optionen-Liste: „Eintrag hinzufügen", pro Eintrag Text + „als Standard" (Radio, zeigt den effektiven
Default) + ↑/↓ + entfernen; Schalter „individuell erlauben". Der freie „Standardwert" erscheint nur,
solange **keine** Optionen gesetzt sind (beim Select kommt der Standard aus der Liste). Leere Optionen
sind im Editor erlaubt (in Bearbeitung), werden aber in Einsatz/Ausgabe ignoriert.

## Control-Schwellen (quellenbasiert)

2–6 Optionen → Radios (alle sichtbar, ein Tap, Tempo); > 6 → Dropdown als Platz-Kompromiss
(NN/g: Dropdowns = letztes Mittel; Baymard: Sweet-Spot 5–10; GOV.UK: Radios für Einzelauswahl).

## Tests

`rebuild/fill.test.ts` (confirmed-Fallback, default ∉ options, leere Optionen, custom),
`rebuild/render.test.ts` (Select im Baum: confirmed + custom). 57 node-Tests grün.
