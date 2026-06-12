<script setup lang="ts">
import { ref, onMounted, watch, watchEffect, nextTick } from 'vue'
import ProtocolRuntimeView from '@/components/ProtocolRuntimeView.vue'
import ProtocolsTab from '@/components/protocols/ProtocolsTab.vue'
import BausteineTab from '@/components/library/BausteineTab.vue'
import SettingsTab from '@/components/settings/SettingsTab.vue'
import DisclaimerGate from '@/components/DisclaimerGate.vue'
import FirmwareNoticeBanner from '@/components/FirmwareNoticeBanner.vue'
import TabGuide, { TAB_GUIDE_HINT_ID } from '@/components/TabGuide.vue'
import { usePicoApi, type OsMode } from '@/composables/usePicoApi'
import { useBridgeConnection } from '@/pico/useBridgeConnection'
import { useFirmwareNotice } from '@/pico/useFirmwareNotice'
import { useStorage } from '@/storage/useStorage'

// App-Einstellungen laden + Storage-Backend wählen (nativ → SQLite, Web → Memory). Einmalig, idempotent.
const storage = useStorage()
onMounted(() => {
  void storage.loadSettings()
  void storage.initLibrary()
})

// Dauerhaft ausblendbarer Hinweis (#72-Mechanik): id landet in settings.dismissedHints
// und ist über Einstellungen → „Alle Hinweise erneut anzeigen" wieder einblendbar.
function dismissHint(id: string): void {
  if (!storage.settings.dismissedHints.includes(id)) {
    storage.settings.dismissedHints = [...storage.settings.dismissedHints, id]
    void storage.saveSettings()
  }
}

// ?-Symbol im Header (#138): blendet die Tab-Erklaerung (TabGuide) wieder ein.
function reshowGuide(): void {
  storage.settings.dismissedHints = storage.settings.dismissedHints.filter((h) => h !== TAB_GUIDE_HINT_ID)
  void storage.saveSettings()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Theme (#51/#78): Familie (classic|resqdocs) x Erscheinung (hell|dunkel|system),
// beim Start UND live. classic+system = Attribut entfernen (daisyUI prefersdark);
// resqdocs+system folgt prefers-color-scheme via matchMedia (reaktiv).
const prefersDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  prefersDark.value = e.matches
})
watchEffect(() => {
  const t = storage.settings.theme
  const family = storage.settings.themeFamily
  if (family === 'resqdocs') {
    const dark = t === 'dark' || (t === 'system' && prefersDark.value)
    document.documentElement.setAttribute('data-theme', dark ? 'resqdocs-dark' : 'resqdocs')
  } else if (t === 'light' || t === 'dark') {
    document.documentElement.setAttribute('data-theme', t)
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
})

// S4-Navigation: 4 Tabs. Gerät/Pico + Info/Hilfe liegen später unter Einstellungen.
type Tab = 'einsatz' | 'protokolle' | 'bausteine' | 'einstellungen'
const activeTab = ref<Tab>('einsatz')

// Dock-Navigation. Die Tabs teilen sich EINEN window-Scroll (v-show), deshalb
// merkt sich jeder Tab seine eigene Scrollposition: beim Verlassen speichern,
// beim Zurückkehren wiederherstellen. Sonst „vererbt" z. B. das Runterscrollen
// in Einsatz die Position an alle anderen Tabs.
// Erneutes Tippen auf den BEREITS aktiven Tab scrollt an den Seitenanfang.
const scrollPositions: Record<Tab, number> = { einsatz: 0, protokolle: 0, bausteine: 0, einstellungen: 0 }
function selectTab(tab: Tab): void {
  if (activeTab.value === tab) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    scrollPositions[tab] = 0
    return
  }
  scrollPositions[activeTab.value] = window.scrollY // aktuellen Stand sichern
  activeTab.value = tab
  void nextTick(() => window.scrollTo({ top: scrollPositions[tab] })) // Ziel-Tab wiederherstellen
}

// Einsatz: fertige Klartext-Ausgabe + getrennte Bridge-/Verbindungs-Schicht.
const output = ref('')
const osMode = ref<OsMode>('win_de')
const { typeText } = usePicoApi()
const firmwareNotice = useFirmwareNotice()
const sending = ref(false)
const status = ref<string | null>(null)
const statusIsError = ref(false)

// Geteilter Verbindungszustand (#157): EINE Quelle für Header + Einsatz. Automatisch
// geprüft beim App-Start und beim Öffnen des Einsatz-Tabs (sparsam, kein Polling).
const { reachable, checking, check } = useBridgeConnection()
onMounted(() => void check())
watch(activeTab, (t) => {
  if (t === 'einsatz') void check()
})

// Verantwortungs-Hinweis vor dem Übertragen: EINMAL pro Sitzung (flüchtiges Flag,
// nicht persistiert → erscheint nach jedem App-Start beim ersten Senden erneut).
const transferConfirmed = ref(false)
const showTransferModal = ref(false)

function sendToBridge(): void {
  if (!transferConfirmed.value) {
    showTransferModal.value = true
    return
  }
  void doSend()
}
function confirmTransfer(): void {
  transferConfirmed.value = true
  showTransferModal.value = false
  void doSend()
}
async function doSend(): Promise<void> {
  sending.value = true
  status.value = null
  statusIsError.value = false
  try {
    await typeText(output.value, osMode.value)
    status.value = 'An Bridge gesendet.'
    reachable.value = true // erfolgreicher Kontakt → Indikator aktualisieren
    void firmwareNotice.checkAfterContact() // erfolgreicher Kontakt (#134)
  } catch (e) {
    // Ursache klären: kein Funk-Kontakt vs. Bridge erreichbar, aber Fehler (#157).
    const ok = await check(true)
    statusIsError.value = true
    status.value = ok
      ? `Bridge erreichbar, aber Senden fehlgeschlagen: ${(e as Error).message}`
      : 'Keine Bridge gefunden. Mit dem WLAN „ResQDocs-…" verbunden? IP in den Einstellungen prüfen.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <!-- Haftungsausschluss-Gate: Erst-Start + nach jedem Update (blockt bis bestätigt) -->
  <DisclaimerGate />

  <!-- Welcome-Seite (#138/#142): vollflaechig, erscheint nach dem Disclaimer
       (liegt unter dessen z-50); ueber das ?-Symbol im Header wieder abrufbar. -->
  <TabGuide />

  <!-- Verantwortungs-Hinweis vor dem Übertragen, einmal pro Sitzung -->
  <Teleport to="body">
    <div
      v-if="showTransferModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-base-300/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-modal-title"
    >
      <div class="card w-full max-w-sm bg-base-100 shadow-xl">
        <div class="card-body gap-3 p-5">
          <h2 id="transfer-modal-title" class="card-title text-base">Vor dem Übertragen</h2>
          <p class="text-sm text-base-content/80">
            Hilfsmittel, kein Ersatz: Du bleibst für Vorgehen, Bewertung und Dokumentation selbst
            verantwortlich. Patientendaten werden nicht dauerhaft gespeichert.
          </p>
          <div class="card-actions justify-end">
            <button class="btn btn-ghost btn-sm" type="button" @click="showTransferModal = false">
              Abbrechen
            </button>
            <button class="btn btn-primary btn-sm" type="button" @click="confirmTransfer">
              Übertragen
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <div class="min-h-full bg-base-200 pb-24">
    <!-- Safe-Area oben: Header weicht der iOS-Statusleiste aus (#27). max(4px, …)
         gibt mind. 4px Abstand, damit das Logo auf Android (env()=0) nicht oben
         klebt; auf iOS bleibt der größere Notch-Inset erhalten. Web: 4px. -->
    <header class="navbar sticky top-0 z-10 bg-base-100 pt-[max(4px,env(safe-area-inset-top))] shadow-sm">
      <div class="flex-1 px-2">
        <!-- Wort-Bild-Marke; helle Variante auf dunklen Themes (Regeln in style.css) -->
        <img src="/brand.svg" alt="ResQDocs" class="brand-logo brand-logo-light h-14 w-auto" />
        <img src="/brand-dark.svg" alt="ResQDocs" class="brand-logo brand-logo-dark h-14 w-auto" />
      </div>
      <div class="flex-none items-center gap-1 px-2">
        <span
          class="badge"
          :class="checking ? 'badge-ghost' : reachable === true ? 'badge-success' : reachable === false ? 'badge-error' : 'badge-ghost'"
        >
          {{ checking ? 'Prüfe …' : reachable === true ? 'Bridge verbunden' : reachable === false ? 'keine Bridge' : 'Bridge ?' }}
        </span>
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-circle"
          aria-label="Erklärung der Bereiche anzeigen"
          title="Was macht welcher Bereich?"
          @click="reshowGuide"
        >?</button>
      </div>
    </header>

    <!-- Globaler Firmware-Update-Hinweis (#134): erscheint nach einem Bridge-Kontakt
         mit veralteter Firmware, auf allen Tabs; Update direkt im Banner. -->
    <FirmwareNoticeBanner />

    <!-- Mobile-first; auf Tablet/Desktop waechst der Container mit (statt 576-px-Spalte, #23) -->
    <main class="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 md:max-w-3xl md:p-6 xl:max-w-5xl">
      <!-- Einsatz (Composer) — caseState bleibt beim Tabwechsel erhalten (v-show) -->
      <div v-show="activeTab === 'einsatz'" class="flex flex-col gap-4">
        <p class="text-sm text-base-content/60">Dokumentieren und ans Zielgerät übertragen.</p>
        <div
          v-if="!storage.settings.dismissedHints.includes('einsatz-haftung')"
          role="note"
          class="flex items-start gap-2 rounded-lg bg-info/15 px-4 py-3 text-sm"
        >
          <span class="flex-1">
            Hilfsmittel, kein Ersatz: Du bleibst für Vorgehen, Bewertung und Dokumentation selbst
            verantwortlich. Patientendaten werden nicht dauerhaft gespeichert.
          </span>
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-circle shrink-0"
            aria-label="Hinweis dauerhaft ausblenden"
            @click="dismissHint('einsatz-haftung')"
          >✕</button>
        </div>
        <ProtocolRuntimeView v-model:output="output" />
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-2 p-4">
            <h2 class="card-title text-base">An Zielgerät senden</h2>
            <!-- Klare „keine Bridge"-Meldung (#157): erscheint, sobald eine Prüfung
                 die Bridge nicht erreicht — mit Handlungshinweis statt nur Badge. -->
            <div
              v-if="reachable === false"
              role="alert"
              class="alert alert-error items-start gap-2 text-sm"
            >
              <span class="flex-1">
                Keine Bridge gefunden. Mit dem WLAN „ResQDocs-…" verbunden? IP in den
                Einstellungen prüfen.
              </span>
              <button class="btn btn-ghost btn-xs shrink-0" type="button" :disabled="checking" @click="check(true)">
                Erneut prüfen
              </button>
            </div>
            <div class="flex items-center gap-2">
              <select v-model="osMode" class="select select-bordered select-sm w-32" aria-label="Ziel-OS">
                <option value="win_de">NIDA (win_de)</option>
                <option value="mac_de">macOS</option>
                <option value="ios">iPad (ios)</option>
              </select>
              <button class="btn btn-ghost btn-sm" type="button" :disabled="checking" @click="check(true)">
                {{ checking ? 'Prüfe …' : 'Prüfen' }}
              </button>
              <button
                class="btn btn-primary btn-sm flex-1"
                type="button"
                :disabled="sending"
                @click="sendToBridge"
              >
                {{ sending ? 'Sende …' : 'In Zielgerät tippen' }}
              </button>
            </div>
            <p v-if="status" class="text-sm" :class="statusIsError ? 'text-error' : 'text-success'">{{ status }}</p>
          </div>
        </section>
      </div>

      <!-- Vorlagen (Kreator-Shell #13-B; Tab hiess bis #138 "Protokolle") -->
      <div v-show="activeTab === 'protokolle'">
        <ProtocolsTab />
      </div>

      <!-- Textbausteine (#13-F3; Tab hiess bis #138 "Bausteine") -->
      <div v-show="activeTab === 'bausteine'">
        <BausteineTab />
      </div>

      <!-- Einstellungen -->
      <div v-show="activeTab === 'einstellungen'">
        <SettingsTab />
      </div>
    </main>

    <!-- Dock mit Icons (#52): inline-SVGs (stroke), kein Icon-Font/CDN (Netzwerk-Policy) -->
    <nav class="dock border-t border-base-300 bg-base-100">
      <button type="button" :class="{ 'dock-active text-primary': activeTab === 'einsatz' }" @click="selectTab('einsatz')">
        <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
          <path d="M9 4.5V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v1" />
          <path d="M9 11h6M9 15h4" />
        </svg>
        <span class="dock-label">Einsatz</span>
      </button>
      <button type="button" :class="{ 'dock-active text-primary': activeTab === 'protokolle' }" @click="selectTab('protokolle')">
        <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="8" y="3" width="12" height="15" rx="2" />
          <path d="M4 7v12a2 2 0 0 0 2 2h11" />
          <path d="M11.5 8h5M11.5 11.5h5" />
        </svg>
        <span class="dock-label">Vorlagen</span>
      </button>
      <button type="button" :class="{ 'dock-active text-primary': activeTab === 'bausteine' }" @click="selectTab('bausteine')">
        <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
        <span class="dock-label">Textbausteine</span>
      </button>
      <button type="button" :class="{ 'dock-active text-primary': activeTab === 'einstellungen' }" @click="selectTab('einstellungen')">
        <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 7h9M19 7h1M4 17h5M15 17h5" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="12" cy="17" r="2" />
        </svg>
        <span class="dock-label">Einstellungen</span>
      </button>
    </nav>
  </div>
</template>
