// useButtonTextStatus.ts — geteilter Stand zum Text fuer den Knopf an der Bridge (Singleton).
//
// Abschnitt (Einstellungen > Bridge) und Dialog zeigen denselben Stand: kann die Bridge das, liegt ein
// Text dort, besteht er die Pruefung. Nur Angaben, nie Inhalt.
import { computed, ref, watch } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { capacitorHttpAdapter } from './httpAdapter'
import { createPicoClient } from './picoClient'
import { useBridgeConnection } from './useBridgeConnection'
import type { PicoClient, StoredTextInfo } from './picoTypes'

export type ButtonTextSupport = 'unknown' | 'offline' | 'old' | 'ok'

const support = ref<ButtonTextSupport>('unknown')
/** Grund, wenn die Abfrage scheitert (nur Technik, kein Inhalt) - hilft beim Eingrenzen. */
const failReason = ref('')
const checking = ref(false)
const info = ref<StoredTextInfo | null>(null)
let client: PicoClient | null = null
let bridgeReachable: { readonly value: boolean | null } = { value: null }

/**
 * Meldet der Verbindungs-Indikator schon „keine Bridge", gilt das sofort - sonst wartet man beim ersten
 * Oeffnen die ganze Zeitueberschreitung ab. Die echte Abfrage laeuft danach trotzdem.
 */
function presumeOfflineIfDisconnected(): void {
  if (support.value === 'unknown' && bridgeReachable.value === false) {
    support.value = 'offline'
    failReason.value = ''
  }
}

async function refresh(): Promise<void> {
  if (checking.value || !client) return
  checking.value = true
  try {
    const i = await client.storedInfo()
    failReason.value = ''
    if (i === null) {
      support.value = 'old'
      info.value = null
    } else {
      support.value = 'ok'
      info.value = i
    }
  } catch (e) {
    support.value = 'offline'
    failReason.value = (e as Error)?.message ?? ''
  } finally {
    checking.value = false
  }
}

const savedText = computed(() => {
  const s = info.value?.savedAt ?? 0
  if (!s) return ''
  return `, gespeichert am ${new Date(s * 1000).toLocaleDateString('de-DE')}`
})

const summary = computed(() => {
  switch (support.value) {
    case 'offline': return 'Die Bridge ist nicht verbunden oder nicht erreichbar.'
    case 'old': return 'Diese Bridge kann das erst nach dem Firmware-Update.'
    case 'unknown': return ''
    default:
      if (!info.value?.present) return 'Auf der Bridge liegt noch kein Text.'
      if (info.value.blocked) return 'Der Text auf der Bridge besteht die Prüfung nicht und wird nicht getippt. Bitte neu speichern oder entfernen.'
      return `Auf der Bridge liegt ein Text mit ${info.value.chars} Zeichen${savedText.value}.`
  }
})

export function useButtonTextStatus() {
  if (!client) {
    const storage = useStorage()
    client = createPicoClient(capacitorHttpAdapter, () => storage.settings.picoBaseUrl)
    // Der Stand darf nicht am ersten Versuch haengen bleiben: neu fragen, sobald die Bridge (wieder)
    // erreichbar ist - etwa nach dem WLAN-Wechsel oder dem Neustart nach einem Firmware-Update.
    const { reachable } = useBridgeConnection()
    bridgeReachable = reachable
    watch(reachable, (r) => {
      if (r === true && support.value !== 'ok') void refresh()
    })
  }
  return { client: client as PicoClient, support, failReason, checking, info, summary, refresh, presumeOfflineIfDisconnected }
}
