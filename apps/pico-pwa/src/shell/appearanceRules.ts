// appearanceRules.ts — Erscheinung der App für das iOS-Fenster (reine Regel, ohne Capacitor testbar).
//
// Die Einstellung „Erscheinung“ kennt Hell, Dunkel und System. Auf iOS bekommt das Fenster der App genau diese
// Erscheinung (systemBars.ts → Plugin ResQChrome, AppChromePlugin.swift): Hell und Dunkel legen es fest, System
// lässt es dem iPhone folgen. Dieselbe Zuordnung macht der native Start aus den gespeicherten Einstellungen
// (AppAppearance in AppChromePlugin.swift); beide müssen gleich bleiben.

export type AppearanceTheme = 'light' | 'dark' | 'system'

/** Einstellung → Wert für das Fenster. Alles Unbekannte oder Fehlende heißt: dem System folgen. */
export function appearanceTheme(theme: unknown): AppearanceTheme {
  return theme === 'light' || theme === 'dark' ? theme : 'system'
}

/** Wert, den das Fenster bekommt, sobald die Einstellungen geladen sind; null = noch nichts melden.
 *  Vor dem Laden steht in der App der Standard („System“). Würde der gemeldet, nähme er die Erscheinung zurück,
 *  die der native Start gerade aus den gespeicherten Einstellungen gesetzt hat, und die App spränge doch. */
export function appearanceToSync(settingsLoaded: boolean, theme: unknown): AppearanceTheme | null {
  return settingsLoaded ? appearanceTheme(theme) : null
}
