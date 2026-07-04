# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
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


