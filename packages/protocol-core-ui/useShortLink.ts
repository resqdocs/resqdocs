// useShortLink — optionaler Kurzlink (resq.li/<code>) zu einem gerade erzeugten Transfer-Link.
// Der QR-Code zeigt immer den langen Link. Der Kurzlink ist eine bewusste Wahl beim Teilen: er verweist auf den
// langen Link, der Transfer-Dienst kennt damit den Schlüssel, bis der Inhalt weg ist. Wird der Haken wieder
// entfernt, löscht der Dienst den gespeicherten langen Link sofort.
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { removeShortLink, shortenTransferLink, TransferError, type TransferConfig } from '@resqdocs/protocol-core/transferClient'

/** Geteilter Inhalt: langer Link und (zum Zurücknehmen des Kurzlinks) das Lösch-Token aus shareTransfer. */
export interface SharedLink {
  link: string
  deleteToken?: string
}

export function useShortLink(source: MaybeRefOrGetter<SharedLink | null | undefined>, cfg?: TransferConfig) {
  const shared = computed(() => toValue(source) ?? null)
  const longLink = computed(() => shared.value?.link ?? null)
  /** Haken „Kurzlink“; aus, bis jemand ihn setzt. */
  const short = ref(false)
  const shortUrl = ref<string | null>(null)
  const shortCode = ref<string | null>(null) // Code aus der Antwort des Dienstes
  const shortBusy = ref(false)
  const shortError = ref('')
  let made: string | null = null // langer Link, zu dem shortUrl gehört

  async function ensure(): Promise<void> {
    const link = longLink.value
    if (!short.value || !link || made === link || shortBusy.value) return
    shortBusy.value = true
    shortError.value = ''
    try {
      const r = await shortenTransferLink(link, cfg)
      if (longLink.value === link) {
        shortUrl.value = r.url
        shortCode.value = r.code
        made = link
      }
    } catch (e) {
      shortError.value = e instanceof TransferError ? e.message : 'Der Kurzlink konnte nicht angelegt werden.'
    } finally {
      shortBusy.value = false
    }
    // Hat sich der lange Link oder die Wahl währenddessen geändert, jetzt nachziehen.
    if (!short.value) void remove()
    else if (longLink.value && longLink.value !== made && !shortError.value) void ensure()
  }
  /** Haken entfernt: einen schon angelegten Kurzlink beim Dienst löschen. Geht das nicht, bleibt der Haken gesetzt
   *  (sonst stünde „ohne Kurzlink“ da, obwohl der Dienst den Schlüssel noch kennt). */
  async function remove(): Promise<void> {
    const link = made
    if (!link || shortBusy.value) return
    const token = shared.value?.link === link ? shared.value.deleteToken : undefined
    shortBusy.value = true
    shortError.value = ''
    const ok = token ? await removeShortLink(link, token, cfg) : false
    shortBusy.value = false
    if (ok) {
      if (made === link) {
        made = null
        shortUrl.value = null
        shortCode.value = null
      }
      if (short.value) void ensure() // inzwischen wieder gesetzt
      return
    }
    short.value = true
    shortError.value = 'Der Kurzlink konnte nicht entfernt werden. Er gilt weiter, bis der Inhalt abgelaufen oder übernommen ist.'
  }
  watch(longLink, (link) => {
    if (link !== made) {
      shortUrl.value = null
      shortCode.value = null
      made = null
      shortError.value = ''
    }
    void ensure()
  })
  watch(short, (on) => void (on ? ensure() : remove()))

  /** Was zum Weitergeben kopiert wird: der Kurzlink, wenn gewählt und fertig, sonst der lange. */
  const shownLink = computed(() => (short.value && shortUrl.value ? shortUrl.value : (longLink.value ?? '')))
  /** Anzeige: beim Kurzlink nur der Code (zum Abtippen), sonst der lange Link ohne „https://“. Kopiert wird immer
   *  shownLink mit https://. Alle Formen lassen sich in App und Editor wieder einfügen. */
  const isCode = computed(() => short.value && !!shortUrl.value && !!shortCode.value)
  const displayLink = computed(() => (isCode.value ? (shortCode.value as string) : shownLink.value.replace(/^https:\/\//, '')))
  /** Name des Anzeigefelds für Screenreader: was gerade drinsteht. */
  const displayLabel = computed(() => (isCode.value ? 'Kurzlink-Code' : 'Transfer-Link'))
  /** Kopieren: immer der vollständige Link. Geht die Zwischenablage nicht, wird er unter dem Feld eingeblendet (im Feld
   *  steht beim Kurzlink nur der Code). Wirft weiter, damit der Aufrufer keine Bestätigung zeigt. */
  const copyFailed = ref(false)
  watch(shownLink, () => (copyFailed.value = false))
  async function copyShown(): Promise<void> {
    try {
      await navigator.clipboard.writeText(shownLink.value)
      copyFailed.value = false
    } catch (e) {
      copyFailed.value = true
      throw e
    }
  }
  return { short, shortUrl, shortBusy, shortError, shownLink, displayLink, displayLabel, isCode, copyFailed, copyShown }
}
