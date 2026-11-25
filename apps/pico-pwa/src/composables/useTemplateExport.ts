import { ref } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { exportTemplate, exportTemplates } from '@resqdocs/protocol-core/templateIO'
import { exportCollection, type Collection } from '@resqdocs/protocol-core/collectionIO'
import { shareJson } from '@/utils/fileTransfer'
import { FEATURE_VERSIONS } from '@/featureVersions'

/**
 * Eine EINZELNE Vorlage als versioniertes JSON teilen (nativ: System-Share-Sheet, Web: Download).
 * Zentrale Stelle: der Pro-Vorlage-Export (Bibliotheks-Kebab) UND der Daten-Export (TemplateIO) teilen
 * sich dieselbe Logik - Dateiname, Re-Entrancy-Guard und Fehler-/Abbruch-Behandlung.
 */
export function useTemplateExport() {
  const sharing = ref(false) // Doppeltipp: kein zweites Share, solange das System-Sheet offen ist
  async function shareTemplate(template: Container): Promise<{ ok: boolean; error?: string }> {
    if (sharing.value) return { ok: false }
    sharing.value = true
    const name = (template.title || template.id || 'vorlage').replace(/[^a-z0-9_-]+/gi, '-')
    try {
      // shareJson: nativ Cache-Datei + System-Share-Sheet, Web -> Blob-Download (roher <a download>-Blob
      // funktioniert in der nativen WebView NICHT).
      await shareJson(`protokoll-${name}.json`, exportTemplate(template, FEATURE_VERSIONS), 'Vorlage exportieren')
      return { ok: true }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      return { ok: false, error: /cancel|abbruch/i.test(m) ? undefined : m } // Nutzer-Abbruch ist kein Fehler
    } finally {
      sharing.value = false
    }
  }
  /** Eine oder mehrere Vorlagen als Datei teilen (mehrere = Sammlung). */
  async function shareTemplates(templates: readonly Container[]): Promise<{ ok: boolean; error?: string }> {
    if (templates.length === 1) return shareTemplate(templates[0])
    if (sharing.value || !templates.length) return { ok: false }
    sharing.value = true
    try {
      await shareJson('resqdocs-vorlagen.json', exportTemplates(templates, FEATURE_VERSIONS), 'Vorlagen exportieren')
      return { ok: true }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      return { ok: false, error: /cancel|abbruch/i.test(m) ? undefined : m }
    } finally {
      sharing.value = false
    }
  }
  /** Sammlung mit gespeicherten Abschnitten und/oder Textbausteinen als Datei teilen; nur Vorlagen wie bisher. */
  async function shareCollection(c: Collection): Promise<{ ok: boolean; error?: string }> {
    if (!c.blocks.length && !c.snippets.length) return shareTemplates(c.templates)
    if (sharing.value) return { ok: false }
    sharing.value = true
    try {
      await shareJson('resqdocs-sammlung.json', exportCollection(c, FEATURE_VERSIONS), 'Sammlung exportieren')
      return { ok: true }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      return { ok: false, error: /cancel|abbruch/i.test(m) ? undefined : m }
    } finally {
      sharing.value = false
    }
  }
  return { sharing, shareTemplate, shareTemplates, shareCollection }
}
