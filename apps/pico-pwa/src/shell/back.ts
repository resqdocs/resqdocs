// back.ts — „Zurück“ an EINER Stelle.
//
// Android: Systemtaste und Zurück-Geste (über @capacitor/app). Reihenfolge und Regeln stehen in backRules.ts,
// das Finden und Schließen des obersten Fensters im gemeinsamen Paket (backLayer.ts): Dort wird die Seite gefragt,
// was zuoberst liegt, und das Fenster über sein eigenes Bedienelement geschlossen. Kein Fenster braucht dafür
// eigenen Code, und für ungespeicherte Eingaben gilt, was beim Schließen des Fensters ohnehin gilt.
//
// An der Wurzel (Tab Einsatz, nichts offen) geht die App in den Hintergrund, wie beim Wechsel zum Startbildschirm.
// Sie wird nicht beendet: Ein laufender Einsatz bleibt, wie er ist.
//
// iOS hat keine Zurück-Taste und bleibt unberührt. Im Browser (Vorschau der App) schließt Escape das oberste
// Fenster, und das Ereignis `backbutton` am Dokument spielt die Android-Taste nach (so wird es geprüft).
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { closeLayer, installEscapeClose, topLayer } from '@resqdocs/protocol-core-ui/backLayer'
import { activeTab } from '@/composables/useActiveTab'
import { HOME_TAB, nextBackStep, openSubpage, type BackStep, type BackTab, type Subpage } from './backRules'

const subpages: Subpage[] = []

/** Eine Unterseite anmelden (z. B. Einstellungen → Bridge). Die Rückgabe meldet sie wieder ab. */
export function registerSubpage(tab: BackTab, isOpen: () => boolean, close: () => void): () => void {
  const entry: Subpage = { tab, isOpen, close }
  subpages.push(entry)
  return () => {
    const i = subpages.indexOf(entry)
    if (i >= 0) subpages.splice(i, 1)
  }
}

/** Ein „Zurück“ ausführen. Gibt zurück, was getan wurde ('system' = an der Wurzel, das System ist dran). */
export function handleBack(): BackStep {
  const layer = topLayer()
  // Fenster: schließen über seinen eigenen Weg; hat es keinen, bleibt es offen.
  const window = layer ? (closeLayer(layer) === 'closed' ? 'open' : 'locked') : null
  const subpage = window ? null : openSubpage(subpages, activeTab.value)
  const step = nextBackStep({ window, subpage: !!subpage, tab: activeTab.value })
  if (step === 'subpage') subpage?.close()
  else if (step === 'tab') activeTab.value = HOME_TAB
  return step
}

/** Einmal beim Start der App. */
export function installAppBack(): void {
  if (Capacitor.getPlatform() === 'android') {
    void CapApp.addListener('backButton', () => {
      // Wurzel: in den Hintergrund, nicht beenden (kein exitApp).
      if (handleBack() === 'system') void CapApp.minimizeApp().catch(() => {})
    }).catch(() => {})
    return
  }
  if (Capacitor.isNativePlatform()) return // iOS: keine Zurück-Taste
  installEscapeClose()
  document.addEventListener('backbutton', () => {
    document.documentElement.dataset.lastBack = handleBack()
  })
}
