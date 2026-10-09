# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
## [1.7.0] - 2026-10-09

### Features

- New full-screen camera scanner in the Android and iOS apps for the medication plan, medication packages and QR codes, built on CameraX (Android) and AVFoundation (iOS) with the ZXing-C++ decoder
- The scanner starts at a zoom level matched to the camera's close-focus distance and supports pinch and slider zoom, tap to focus and the torch
- The scanner screen follows the selected color theme (light/dark)
- Settings: technical scanner details (camera, resolution, zoom) can be shown for troubleshooting

### Changed

- All scans share one camera component with decoder profiles per use case; in the browser the JavaScript scanner remains
- The photo-based decoding path and the camera plugin dependency were removed
- Debug builds install as a separate test app next to the store version
- Android: Kotlin Gradle plugin 2.4.21; a build check rejects machine-learning, Firebase and similar tracking dependencies in release builds

### Bug Fixes

- Android: the camera no longer picks a fixed-focus wide-angle lens, which prevented scanning on many multi-camera devices
- Weak or poorly printed medication plans are read considerably faster

## [1.6.0] - 2026-10-08

### Features

- Manual medication entries get a PZN search field; suggestions are ranked by name and more of them are visible
- The active-ingredient strength from a PZN lookup is only applied after a short confirmation dialog
- Long option lists (16 options or more) can be searched while documenting
- The editor can insert selection options as a pasted list
- Multiple-choice fields can optionally start without a preselection

### Changed

- The doctors function is now labelled "Kontakte/Ärzte" (contacts/doctors), and its edit card starts with the role (default: doctor)
- Updated app dependencies (Capacitor 8.5.2, Vue, Vite, Tailwind, daisyUI) and closed known vulnerabilities in build tools
- Android: the build no longer bundles the Facebook SDK (the social-login plugin is limited to Google, used for the Google Drive backup), and the Gradle daemon is pinned to JDK 21

### Bug Fixes

- iOS: the app adopts the UIScene lifecycle, so builds with Xcode 27 no longer crash at startup
- Typing via the bridge uses the full timeout budget, fixing send errors on low battery
- The medication plan review list scrolls correctly, including with external scanners, and the issuing practice is part of the scroll area
- Open dropdowns appear above the following sections and end above the tab bar and keyboard
- Long template names are shortened instead of breaking the row, and the template import button uses an icon that renders on Android

## [1.5.0] - 2026-09-10

### Features

- Fields and sections can default to "not collected": individual fields and whole sections can be preset to "not collected" (UNO Reverse), which is handy for anything that is only documented in specific cases

### Changed

- The typing-speed slider now runs in the expected direction and has a clearer label

### Bug Fixes

- A running case is preserved and a storage problem is shown instead of failing silently
- Sharing text snippets and scrolling cards now behave correctly

## [1.4.0] - 2026-07-22

### Features

- Optional multiple choice for option fields: fields with predefined options can be set to allow selecting several options at once (small checkboxes, or a multi-select dropdown when there are many options); the layout stays consistent with the existing option field and existing templates keep working unchanged
- Share templates securely: protocols, blocks and text snippets can be transferred between the app, the online editor and other users via a short code, link or QR code; the transfer is end-to-end encrypted, the server only ever sees encrypted data and deletes it automatically (single read up to at most seven days). Not intended for patient data.

### Bug Fixes

- Received templates never overwrite existing ones without asking: on a name clash you are prompted instead of replacing
- Removed an unnecessary advertising-ID permission on Android
- Various stability improvements

## [1.3.0] - 2026-07-20

### Features

- Optional cloud backup of your templates, blocks and text snippets to a hidden, app-private folder of your iCloud (iPhone/iPad) or Google account (Android), with restore on a new device; backups run automatically in the background and you restore by picking a snapshot from the history
- Automatic local backups of your library that you can share and import again
- Progress indicator when saving and importing large medication-code (PZN) libraries, so the app no longer freezes

### Bug Fixes

- Never overwrite the library when individual entries are unreadable (partial corruption)
- Report errors when opening or restoring the library instead of silently discarding them
- Various stability improvements

### Changed

- Clearer factory reset that resets the app in a single step and deletes patient data first

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


