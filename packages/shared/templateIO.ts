// Vorlage exportieren/importieren — reine Serialisierung + Validierung (node-testbar).
// Versioniertes JSON, damit ein anderes Geraet pruefen kann, ob es die Vorlage unterstuetzt.

import type { Container } from './model.ts'
import { pruneCloze } from './cloze.ts'
import { parseNeeds, templateNeeds, type FeatureVersions, type Needs } from './templateNeeds.ts'

export const PROTOCOL_SCHEMA = 'resqdocs-protocol'
export const PROTOCOL_VERSION = 1

/**
 * Mit `fv` (ai-docs/feature-versions.json) trägt die Datei einen Vermerk `requires`: welche Funktionen die Vorlage
 * nutzt und ab welcher App-Version es sie gibt. Eine ältere App kann so beim Import sagen, was ihr fehlt. Nutzt die
 * Vorlage nichts oberhalb der Grundversion, bleibt die Datei wie bisher. Ältere Apps überlesen den Vermerk.
 */
export function exportTemplate(root: Container, fv?: FeatureVersions): string {
  const requires = fv ? templateNeeds(fv, [root]) : null
  return JSON.stringify({ schema: PROTOCOL_SCHEMA, version: PROTOCOL_VERSION, ...(requires ? { requires } : {}), tree: root }, null, 2)
}

/**
 * Eine oder mehrere Vorlagen exportieren (Datei, Link, QR). Eine Vorlage = das bekannte Einzelformat (auch ältere
 * Apps lesen es); mehrere = Sammlung als JSON-Liste von Einzelvorlagen (importRouter erkennt sie als 'bundle').
 */
export function exportTemplates(roots: readonly Container[], fv?: FeatureVersions): string {
  if (roots.length === 1) return exportTemplate(roots[0], fv)
  return JSON.stringify(roots.map((r) => JSON.parse(exportTemplate(r, fv))), null, 2)
}

/** `needs`: Vermerk der Datei (siehe exportTemplate), falls vorhanden und wohlgeformt. */
export type ParseResult = { ok: true; tree: Container; needs?: Needs } | { ok: false; error: string }

function isContainerLike(x: unknown): x is Container {
  return (
    !!x &&
    typeof x === 'object' &&
    (x as { type?: unknown }).type === 'container' &&
    typeof (x as { id?: unknown }).id === 'string' &&
    Array.isArray((x as { children?: unknown }).children)
  )
}

export function parseTemplate(json: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'Kein gueltiges JSON.' }
  }
  const o = parsed as { schema?: unknown; version?: unknown; tree?: unknown; requires?: unknown }
  if (o?.schema !== PROTOCOL_SCHEMA) return { ok: false, error: 'Keine ResQDocs-Vorlage (schema fehlt oder falsch).' }
  if (typeof o.version !== 'number' || o.version > PROTOCOL_VERSION) {
    return { ok: false, error: `Version ${String(o.version)} wird von dieser App-Version nicht unterstuetzt.` }
  }
  if (!isContainerLike(o.tree)) return { ok: false, error: 'Die Vorlage hat keinen gültigen Aufbau.' }
  const needs = parseNeeds(o.requires)
  return { ok: true, tree: pruneCloze(o.tree), ...(needs ? { needs } : {}) } // Lücken ohne Ziel (fremde/gekürzte Vorlage) entfernen
}
