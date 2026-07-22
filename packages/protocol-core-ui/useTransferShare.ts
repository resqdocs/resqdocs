// useTransferShare — geteilte Teilen-per-Link-Logik des Vorlagen-Transfers.
// Verschluesselt ein Export-JSON (AES-GCM, Schluessel im URL-Fragment), legt das Chiffrat beim Dienst ab und
// liefert den Kurz-Link + Code zurueck. Von Vorlagen-, Baustein- UND Snippet-Teilen genutzt (App + Editor),
// damit TTL-Wahl, Busy-/Fehler-Handling und Link-Zustand nicht ueber vier Stellen divergieren.
import { ref } from 'vue'
import { shareTransfer, TransferError, type TransferTtl, type TransferConfig } from '@resqdocs/protocol-core/transferClient'

export function useTransferShare(cfg?: TransferConfig) {
  const ttl = ref<TransferTtl>('burn')
  const shareBusy = ref(false)
  const shareLink = ref<{ link: string; code: string } | null>(null)
  const shareError = ref('')

  /** payloadJson = Ausgabe von exportTemplate/exportBlock/exportSnippet. Setzt shareLink bei Erfolg. */
  async function share(payloadJson: string): Promise<void> {
    shareBusy.value = true
    shareError.value = ''
    shareLink.value = null
    try {
      const r = await shareTransfer(payloadJson, ttl.value, cfg)
      shareLink.value = { link: r.link, code: r.code }
    } catch (e) {
      shareError.value = e instanceof TransferError ? e.message : 'Teilen fehlgeschlagen.'
    } finally {
      shareBusy.value = false
    }
  }
  /** Panel schliessen / vor einem neuen Teilen zuruecksetzen. */
  function reset(): void {
    shareLink.value = null
    shareError.value = ''
  }
  return { ttl, shareBusy, shareLink, shareError, share, reset }
}
