import { ref, watch, type Ref } from 'vue'
import { preferencesAdapter } from '@/storage/preferencesAdapter'
import { LONG_TEXT_SIZE_DEFAULT, parseLongTextSize, type LongTextSize } from '@resqdocs/protocol-core-ui/longTextSize'

/**
 * Schriftgröße im großen Textfeld, gemerkt je Gerät.
 *
 * Persistenz über den Preferences-Adapter (eigener Key, kein roher Browser-Storage, keine neue Abhängigkeit).
 * Gespeichert wird nur die Stufe (klein, normal, groß), keine Patientendaten.
 */
export const LONG_TEXT_SIZE_KEY = 'ui.longTextSize'

let shared: Ref<LongTextSize> | null = null

export function useLongTextSize(): Ref<LongTextSize> {
  if (shared) return shared
  const size = ref<LongTextSize>(LONG_TEXT_SIZE_DEFAULT)
  shared = size

  // Erst nach dem Laden speichern: sonst würde der Startwert die gemerkte Stufe überschreiben.
  let loaded = false
  void preferencesAdapter
    .get(LONG_TEXT_SIZE_KEY)
    .then((stored) => {
      if (stored !== null) size.value = parseLongTextSize(stored)
    })
    .catch(() => undefined)
    .finally(() => {
      loaded = true
    })
  watch(size, (v) => {
    if (loaded) void preferencesAdapter.set(LONG_TEXT_SIZE_KEY, v).catch(() => undefined)
  })
  return size
}
