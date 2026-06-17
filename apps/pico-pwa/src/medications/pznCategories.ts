// pznCategories.ts — FIXE, admin-gepflegte Kategorienliste der PZN-Bibliothek (#190).
//
// Bewusst zentral und unveränderlich für den Nutzer: Kategorien werden NICHT vom
// Nutzer angelegt/umbenannt, sondern hier vom Maintainer ("Admin") gepflegt und in
// der UI nur AUSGEWÄHLT. So bleiben die Gruppen konsistent und vergleichbar. Die
// Bemerkung pro Eintrag ist davon getrennt und bleibt freier Nutzer-Text.
//
// Reines Daten-/Validierungsmodul (Vue-frei, node --test-fähig). Ergänzen/Ändern der
// Liste = bewusste Pflege durch den Maintainer; bestehende Einträge mit einer dann
// nicht mehr gelisteten Kategorie verlieren beim nächsten Speichern die Kategorie
// (Validierung gegen diese Liste).

/** Admin-gepflegte Kategorien (funktionale Gruppen, Rettungsdienst-orientiert). */
export const PZN_CATEGORIES = [
  'Analgetikum (Nicht-Opioid)',
  'Opioid',
  'Sedativum/Hypnotikum',
  'Anästhetikum',
  'Antihypertensivum',
  'Antiarrhythmikum',
  'Antianginosum (Nitrat)',
  'Vasopressor/Katecholamin',
  'Diuretikum',
  'Lipidsenker',
  'Antikoagulans',
  'Thrombozytenaggregationshemmer',
  'Bronchodilatator',
  'Kortikosteroid',
  'Antihistaminikum',
  'Antiemetikum',
  'Magenschutz/PPI',
  'Antidiabetikum',
  'SGLT2-Hemmer',
  'Schilddrüse',
  'Antikonvulsivum',
  'Psychopharmakon',
  'Parkinson-/Antidementivum',
  'Immunsuppressivum/Onkologikum',
  'Sexualhormon/HRT',
  'Antibiotikum',
  'Antidot',
  'Elektrolyt/Infusion',
  'Sonstiges',
] as const

export type PznCategory = (typeof PZN_CATEGORIES)[number]

const CATEGORY_SET: ReadonlySet<string> = new Set(PZN_CATEGORIES)

/** Ob ein Wert eine gültige, admin-gepflegte Kategorie ist (leer = „keine"). */
export function isPznCategory(value: string): boolean {
  return CATEGORY_SET.has(value)
}
