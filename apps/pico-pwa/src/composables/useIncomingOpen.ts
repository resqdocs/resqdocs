// Von aussen geoeffnete Links/Dateien (nativ): das System meldet sie ueber @capacitor/app `appUrlOpen`,
// auch beim Kaltstart (das Ereignis wird bis zum ersten Listener aufbewahrt). Hier wird nur EINGEORDNET
// und angeboten; Abruf und Import passieren erst nach Bestaetigung in TemplateIO.
// Ablauf: App.vue wechselt auf den Vorlagen-Tab, LibraryBar oeffnet das Daten-Blatt, TemplateIO fragt
// nach und holt den Eintrag mit takeIncomingOpen() ab (Bestaetigen wie Abbrechen).
import { ref, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import { classifyIncomingUrl, createIncomingGate, type IncomingOpen } from '@/rebuild/incomingOpen'
import { discardIncomingFile } from '@/utils/fileTransfer'

const pending = ref<IncomingOpen | null>(null)
// Zurueckhalten, bis die App bereit ist (Bibliothek geladen, kein Start-Gate offen): sonst laege die
// Nachfrage ueber dem Haftungshinweis oder der Import liefe in eine noch nicht geladene Bibliothek.
const held = ref(true)
let started = false
let baseUrl: string | undefined
const gate = createIncomingGate()

/** Eine vom System gemeldete URL einordnen und anbieten. true = wird angeboten. */
export function offerIncomingUrl(url: string | undefined): boolean {
  if (!url || !gate.accept(url)) return false
  const hit = classifyIncomingUrl(url, baseUrl)
  if (hit) {
    // Eine noch unbeantwortete Datei wird verdraengt: ihre Inbox-Kopie mit entfernen, sonst bliebe sie liegen.
    const prev = pending.value
    if (prev?.kind === 'file' && !(hit.kind === 'file' && hit.url === prev.url)) void discardIncomingFile(prev.url)
    pending.value = hit
  }
  return hit !== null
}

/** Einmal beim App-Start aufrufen. Im Web (kein nativer Layer) wird nichts abonniert. */
export function startIncomingOpen(transferBaseUrl?: string): void {
  if (started) return
  started = true
  baseUrl = transferBaseUrl
  if (!Capacitor.isNativePlatform()) return
  void (async () => {
    const { App } = await import('@capacitor/app')
    await App.addListener('appUrlOpen', (event) => void offerIncomingUrl(event.url))
  })().catch(() => {
    /* ohne Listener bleibt der Weg ueber Einfuegen/QR */
  })
}

export function setIncomingHold(hold: boolean): void {
  held.value = hold
}

/** Wartender Eintrag; null, solange zurueckgehalten wird. */
export const incomingOpen = computed<IncomingOpen | null>(() => (held.value ? null : pending.value))

/** Eintrag abholen und leeren. */
export function takeIncomingOpen(): IncomingOpen | null {
  const value = pending.value
  pending.value = null
  return value
}
