// featureVersions.ts — ab welcher App-Version es eine Funktion gibt (ai-docs/feature-versions.json, dieselbe
// Datei wie im Online-Editor). Die App braucht sie beim Export: Die Datei bekommt einen Vermerk, was die Vorlage
// nutzt, damit eine ältere App beim Import sagen kann, was ihr fehlt.
import featureVersions from '@feature-versions'
import type { FeatureVersions } from '@resqdocs/protocol-core/templateNeeds'

export const FEATURE_VERSIONS = featureVersions as FeatureVersions
