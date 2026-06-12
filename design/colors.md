# ResQDocs Farbpalette

Abgeleitet aus den Logofarben (Navy `#1b2c56`, Koralle `#f05349` (aus den Logo-SVGs)), geprüft gegen
**WCAG 2.2 AA**: 4,5:1 für normalen Text, 3:1 für großen Text und UI-Komponenten
(Quellen unten). Alle Kontrastwerte sind mit der WCAG-Luminanzformel **nachgerechnet**
(nicht von Tools übernommen) - Tabelle unten.

## Kernregel

> **Koralle `#f05349` ist Marken-/Grafikfarbe, KEINE Textfarbe auf Weiß** (3,48:1 - besteht
> nur die 3:1-Grenze für UI/Grafik/großen Text). Für korallefarbenen TEXT/Icons auf hellem
> Grund immer `coral-600 #C73A28` (5,17:1) verwenden; im Dark-Theme `coral-300 #FF7A66`.

## Palette

| Token | Hex | Rolle |
|---|---|---|
| `navy-900` | `#1b2c56` | Primärtext, Marke, dunkle Flächen (13,9:1 auf Weiß) |
| `navy-700` | `#2E3F6E` | Hover/sekundäre dunkle Flächen |
| `navy-100` | `#E2E7F2` | helle Karten-/Sektionshintergründe (Navy-Text darauf: 11,2:1) |
| `slate-700` | `#3F4A63` | Sekundärtext (8,9:1 auf Weiß) |
| `coral-500` | `#f05349` | Marke, EKG-Linie, Grafik, große Akzente - **kein Fließtext auf Weiß** |
| `coral-600` | `#C73A28` | Akzent-**Text**/Icons auf hell, Primary-Button-Fläche (Weiß darauf: 5,2:1) |
| `coral-300` | `#FF7A66` | Akzent im Dark-Theme (6,7:1 auf `dark-bg`) |
| `coral-100` | `#FDE5E1` | Akzent-Hintergründe/Badges (Navy-Text darauf: 11,6:1) |
| `bg-light` | `#F7F8FB` | App-Hintergrund hell |
| `success-700` | `#1A7F4B` | Erfolg (5,0:1 auf Weiß) |
| `warning-700` | `#8A5A00` | Warnung (5,9:1 auf Weiß) |
| `error-700` | `#B3261E` | Fehler (6,5:1 auf Weiß) |
| `dark-bg` | `#141B30` | Dark-Theme-Hintergrund |
| `dark-text` | `#E7EBF5` | Dark-Theme-Text (14,3:1 auf `dark-bg`) |

## Freigegebene Paare (nachgerechnet)

| Paar | Ratio | AA-Text (4,5) | UI (3,0) |
|---|---|---|---|
| navy-900 auf Weiß / bg-light | 13,63 / 13,1 | ✅ | ✅ |
| Weiß auf navy-900 (Buttons, Hero) | 13,63 | ✅ | ✅ |
| **coral-500 auf Weiß** | **3,48** | ❌ | ✅ (nur Grafik/groß) |
| coral-600 auf Weiß · Weiß auf coral-600 | 5,17 | ✅ | ✅ |
| navy-900 auf coral-100 / navy-100 | 11,56 / 11,22 | ✅ | ✅ |
| slate-700 auf Weiß | 8,86 | ✅ | ✅ |
| success/warning/error-700 auf Weiß | 5,02 / 5,93 / 6,54 | ✅ | ✅ |
| dark-text auf dark-bg | 14,32 | ✅ | ✅ |
| coral-500 / coral-300 auf dark-bg | 4,81 / 6,69 | ✅ | ✅ |

## Anwendung (daisyUI-Theme-Mapping, Vorschlag)

- `primary`: coral-600 (`primary-content`: Weiß) · `secondary`: navy-900
- `base-100`: Weiß · `base-200`: bg-light · `base-300`: navy-100 · `base-content`: navy-900
- Dark: `base-100`: dark-bg · `base-content`: dark-text · `primary`: coral-300
- `success/warning/error`: die 700er-Töne (Text-tauglich)
- Niemals Information NUR über Farbe transportieren (WCAG 1.4.1); Fokus-Indikatoren ≥ 3:1.

## Quellen

- WebAIM: Contrast and Color Accessibility - https://webaim.org/articles/contrast/
- Make Things Accessible: Contrast requirements for WCAG 2.2 AA - https://www.makethingsaccessible.com/guides/contrast-requirements-for-wcag-2-2-level-aa/
- WCAG-Schwellen 4,5:1 / 3:1 inkl. Großtext-Definition (18pt/14pt bold) - https://accessibilityassistant.com/blog/accessibility-insights/wcag-2-colour-contrast-accessibility-guidelines/
- Praxis: Markenfarben für Text leicht nachdunkeln statt Identität aufgeben - https://testparty.ai/blog/color-contrast-requirements
