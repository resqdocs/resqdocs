# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
## [1.2.1] - 2026-07-14

### Features

- Capture the medication plan with an external (HID) barcode scanner, offered as a third option in the scan dialog; scanned data runs through the same check and hand-off as a camera scan
- Tap to refocus while scanning the medication-plan barcode (Android)
- Combine several text snippets into a single free-text field instead of replacing it
- Share and import reusable text snippets
- Smart import that detects the file type and routes it to the right destination

### Bug Fixes

- Fixed overlapping rows in the multi-select snippet picker on iOS
- On iOS, only the scanner that actually runs is offered
- iPad and large-screen polish: skip button, block-library width, scan dialogs, onboarding width, body text, settings spacing and 44 pt touch targets
- Complete favicon fallbacks in the online editor (ico / png / apple-touch)

### Changed

- Secondary actions on block-library cards shown as compact icons to save space

## [1.2.0] - 2026-07-12

### Features

- Required fields: mark individual fields or whole functions as required; missing entries are summarized on the parent section, and jumping to an open item expands the relevant sections automatically
- Unified tri-state (confirmed / free text / not recorded) with a standard-text fallback now also covers select fields and calculator functions (for example NEWS2 and pack-years)
- Browser-based online editor: edit protocols directly in the browser with local storage for several protocols side by side, a version selector with matching field gating, and an optional bring-your-own-LLM assistant
- Recommendation and entry point to create templates with your own language model, on the project site and in the app's onboarding guide

### Bug Fixes

- The default protocol is reliably preselected when starting a new case
- Editor theming and utility-class fixes (including the "+" menu)
- The AI starter suggestion is phrased more neutrally so it is not misread as an instruction

### Changed

- Typed free text is preserved instead of discarded on mistypes
- Online editor layout: collapsible sidebars, a width-adjustable preview, clearer chevrons, wordmark and favicon
- Updated the UI library (daisyUI) and aligned shared dependencies to a common baseline

## [1.1.1] - 2026-07-10

### Features

- Tri-state entry for medications and doctors in the case view: confirm the standard text, type your own free text, or mark an entry as not recorded — with a configurable standard text as the fallback
- Wide-screen layouts: the editor, case view and building blocks now make better use of the available width on larger notebook and desktop screens
- Export a single template directly from its menu with a selection dialog
- Reorganized settings: an overview with sub-pages (device, medication library) and collapsible sections for rarely used options
- The editor preview can be switched between example values and an empty state

### Bug Fixes

- "Paragraph before" now takes effect on the first child of a banner section
- Several editor layout fixes: property fields no longer shift on first render, and the sticky preview switcher no longer causes a scroll jump
- The editor now hides options that cannot take effect (for example title format without a title, width without a fill character, or a field separator without children)
- A long unbroken snippet or block no longer breaks the layout on narrow screens
- Larger touch targets throughout the settings tab
- The connection indicator is now a Wi-Fi icon with a calmer, steadier state

### Performance

- Heavy full-tree preview segments are kept off the toggle path on mobile

## [1.1.0] - 2026-07-04

### Features

- Reusable building blocks: create text snippets and whole blocks, insert them into templates and cases, and share them as a file
- Score helpers NEWS2 and Pack-Years as native functions in the editor and case view (based on published tables, not a diagnosis)
- Two-step add menu in the template editor with grouped functions and inline editing; preview with example values
- Delete protection in the case view: confirmation before removing entries plus a reset-all action
- Medication library with dose strength as a dedicated field and card-based maintenance
- AI-assisted template hint in the editor and on import; adaptive bridge polling with a tappable connection indicator
- Self-contained AI documentation with version gating; generated protocols import directly into the app

### Bug Fixes

- File export now opens the native system share sheet
- Pack-Years rounds to a whole number
- Multi-line snippets insert without loss; empty snippets can no longer be selected
- A cleared inventory row is no longer removed without confirmation

## [1.0.0] - 2026-06-27

### Features

- First stable release: consolidated v1 protocol model, native iOS and Android apps, and the template-editor and case workflow

## [0.2.0] - 2026-06-21

### Features

- Release 0.2.0

## [0.1.2] - 2026-06-18

### Documentation

- Add git-cliff CHANGELOG

### Features

- Native debug symbols, privacy summary, protocol-core package and version 0.1.2

## [0.1.1] - 2026-06-18

### Bug Fixes

- Splash/edge-to-edge, scanner default and version 0.1.1

## [0.1.0] - 2026-06-17

### CI

- Add security checks for tracked content and configuration
- Harden pattern matching, add selftest and hook setup script

### Chores

- Drop firmware-artifact test and unfinished license-compliance CI
- Remove internal app store listing doc from public repo
- Drop obsolete allowlist entry for removed app store listing doc

### Documentation

- Clarify optional PZN manifest check in security policy

### Features

- Initial open-source release
- Fetch medication dictionary from the project website
- Remind about newer PZN dictionary versions and normalize lookup keys
- Personal local PZN library and v1 application snapshot
- Native Android Data-Matrix scanner and v1 snapshot
- PZN library, app signing config and version 0.1.0

### Tests

- Cover PZN normalization and medication-plan parsing


