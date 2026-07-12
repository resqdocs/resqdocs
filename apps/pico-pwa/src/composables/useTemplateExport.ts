import { ref } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { exportTemplate } from '@resqdocs/protocol-core/templateIO'
import { shareJson } from '@/utils/fileTransfer'

/**
 * Eine EINZELNE Vorlage als versioniertes JSON teilen (nativ: System-Share-Sheet, Web: Download).
 * Zentrale Stelle: der Pro-Vorlage-Export (Bibliotheks-Kebab) UND der Daten-Export (TemplateIO) teilen
 * sich dieselbe Logik - Dateiname, Re-Entrancy-Guard (bug-316) und Fehler-/Abbruch-Behandlung.
 */
export function useTemplateExport() {
  const sharing = ref(false) // Doppeltipp: kein zweites Share, solange das System-Sheet offen ist (bug-316)
  async function shareTemplate(template: Container): Promise<{ ok: boolean; error?: string }> {
    if (sharing.value) return { ok: false }
    sharing.value = true
    const name = (template.title || template.id || 'vorlage').replace(/[^a-z0-9_-]+/gi, '-')
    try {
      // shareJson: nativ Cache-Datei + System-Share-Sheet, Web -> Blob-Download (roher <a download>-Blob
      // funktioniert in der nativen WebView NICHT, bug-315).
      await shareJson(`protokoll-${name}.json`, exportTemplate(template), 'Protokoll exportieren')
      return { ok: true }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      return { ok: false, error: /cancel|abbruch/i.test(m) ? undefined : m } // Nutzer-Abbruch ist kein Fehler
    } finally {
      sharing.value = false
    }
  }
  return { sharing, shareTemplate }
}
