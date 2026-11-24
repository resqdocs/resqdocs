// useBridgePage.ts — von anderen Stellen aus die Seite Einstellungen → Bridge öffnen (Muster useActiveTab).
//
// Der Einsatz zeigt ohne verbundene Bridge statt eines gesperrten „An Zielgerät senden“ den Knopf
// „Mit ResQDocs-Bridge verbinden“. Er öffnet die kurze Anleitung (BridgeConnectDialog, openBridgeConnect).
// Von dort führt „Weitere Einstellungen“ auf die Seite Bridge (openBridgePage): App.vue wechselt in den Tab
// Einstellungen, SettingsTab öffnet dort die Unterseite Bridge.
import { ref } from 'vue'

export const bridgePageRequest = ref(0)

export function openBridgePage(): void {
  bridgePageRequest.value++
}

export const bridgeConnectRequest = ref(0)

export function openBridgeConnect(): void {
  bridgeConnectRequest.value++
}
