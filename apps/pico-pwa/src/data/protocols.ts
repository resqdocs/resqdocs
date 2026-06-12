// Anbindung der kanonischen Protokoll-Seeds. Single source of truth ist
// `protocols/standardprotokoll.json` (im Repo, gegen protocol.schema.json in CI
// validiert) — bewusst KEINE Kopie in der App, um Drift zu vermeiden.
//
// Die eine kontrollierte Typ-Zusicherung hier kapselt, dass ein JSON-Import von
// TypeScript breit (`string` statt Literal) inferiert wird; Struktur garantiert
// das Schema.
import seed from '@protocols/standardprotokoll.json'
import type { ProtocolTemplate } from '@shared/renderer/render.mjs'

export const standardprotokoll = seed as unknown as ProtocolTemplate
