<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, watchEffect, nextTick } from 'vue'
import BausteineTab from '@/components/library/BausteineTab.vue'
import SettingsTab from '@/components/settings/SettingsTab.vue'
import DisclaimerGate from '@/components/DisclaimerGate.vue'
import UsageNoticeModal from '@/components/UsageNoticeModal.vue'
import FirmwareNoticeBanner from '@/components/FirmwareNoticeBanner.vue'
import PznNoticeBanner from '@/components/PznNoticeBanner.vue'
import TabGuide, { TAB_GUIDE_HINT_ID } from '@/components/TabGuide.vue'
import EinsatzView from '@/components/rebuild/EinsatzView.vue'
import EditorView from '@/components/rebuild/EditorView.vue'
import { useBridgeConnection } from '@/pico/useBridgeConnection'
import { useStorage } from '@/storage/useStorage'
import { useProtocolPersistence } from '@/rebuild/protocolPersistence'
import { useMedicationLookup } from '@/medications/useMedicationLookup'
import { usePznNotice } from '@/medications/usePznNotice'
import { PZN_DICTIONARY_ENABLED } from '@/medications/featureFlags'
import { useTemporaryCaseDraft } from '@/composables/useTemporaryCaseDraft'
import { useUsageNotice } from '@/composables/useUsageNotice'

// App-Einstellungen laden + Storage-Backend wählen (nativ → SQLite, Web → Memory). Einmalig, idempotent.
const storage = useStorage()
const protocolPersistence = useProtocolPersistence()
const pznLookup = useMedicationLookup()
const pznNotice = usePznNotice()
onMounted(async () => {
  void storage.initLibrary()
  void protocolPersistence.init() // Rework-Bibliothek laden (nativ SQLite / Web Memory) + Auto-Save
  // Settings zuerst (await): der optionale Hintergrund-Check liest das Opt-in.
  await storage.loadSettings()
  // PZN-Wörterbuch (Netz-Download) ist deaktiviert (IFA/DSGVO) → nur bei aktivem
  // Flag laden/prüfen. ensureLoaded/maybeCheck sind sonst No-ops (kein Netz).
  if (PZN_DICTIONARY_ENABLED) {
    await pznLookup.ensureLoaded()
    void pznNotice.maybeCheck()
  }
})

// „Hinweis zur Nutzung" (einmalig beim ersten Start, danach über Einstellungen).
const usageNotice = useUsageNotice()
watchEffect(() => {
  if (usageNotice.ready.value) usageNotice.checkFirstStart()
})

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

// S4-Navigation: 4 Tabs. Gerät/Pico + Info/Hilfe liegen unter Einstellungen.
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

// Geteilter Verbindungszustand (#157): EINE Quelle für den Header-Indikator. Beim
// App-Start und beim Öffnen des Einsatz-Tabs sparsam geprüft (kein Polling).
const { reachable, checking, check, startPolling, stopPolling } = useBridgeConnection()
onMounted(() => { void check(); startPolling() })
watch(activeTab, (t) => {
  if (t === 'einsatz') void check()
})

// Temporärer Einsatzentwurf (#173): Ablaufprüfung beim App-Resume und sparsam
// periodisch, solange die App offen ist. `visibilitychange` deckt iOS/Android-
// WebView (Vorder-/Hintergrund) UND Web ab — ohne zusätzliche Capacitor-Plugins.
const draft = useTemporaryCaseDraft()
function onVisible(): void {
  if (document.visibilityState === 'visible') { void draft.checkExpiry(); void check() } // beim Zurückkehren Bridge gleich neu prüfen
}
const draftExpiryTimer = window.setInterval(() => {
  if (document.visibilityState === 'visible') void draft.checkExpiry()
}, 60_000)
onMounted(() => document.addEventListener('visibilitychange', onVisible))
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  window.clearInterval(draftExpiryTimer)
  stopPolling()
})
</script>

<template>
  <!-- Haftungsausschluss-Gate: Erst-Start + nach jedem Update (blockt bis bestätigt) -->
  <DisclaimerGate />
  <UsageNoticeModal />

  <!-- Welcome-Seite (#138/#142): vollflaechig, erscheint nach dem Disclaimer
       (liegt unter dessen z-50); ueber das ?-Symbol im Header wieder abrufbar. -->
  <TabGuide />

  <div class="min-h-full bg-base-200 pb-24">
    <!-- Safe-Area oben: Header weicht der iOS-Statusleiste aus (#27). max(4px, …)
         gibt mind. 4px Abstand, damit das Logo auf Android (env()=0) nicht oben
         klebt; auf iOS bleibt der größere Notch-Inset erhalten. Web: 4px. -->
    <header class="navbar sticky top-0 z-10 bg-base-100 pt-[max(4px,env(safe-area-inset-top))] shadow-sm">
      <div class="flex-1 px-3 py-2">
        <!-- Wort-Bild-Marke; helle Variante auf dunklen Themes (Regeln in style.css) -->
        <img src="/brand.svg" alt="ResQDocs" class="brand-logo brand-logo-light h-[45px] w-auto" />
        <img src="/brand-dark.svg" alt="ResQDocs" class="brand-logo brand-logo-dark h-[45px] w-auto" />
      </div>
      <div class="flex-none items-center gap-1 px-2">
        <button
          type="button"
          class="badge gap-1 border-0 transition cursor-pointer disabled:cursor-default"
          :class="checking ? 'badge-ghost' : reachable === true ? 'badge-success' : reachable === false ? 'badge-error' : 'badge-ghost'"
          :disabled="checking"
          :aria-label="checking ? 'Verbindung wird geprüft' : 'Bridge-Verbindung jetzt prüfen'"
          :title="checking ? 'Prüfung läuft …' : 'Tippen, um die Verbindung zu prüfen'"
          @click="check(true)"
        >
          <span v-if="checking" class="loading loading-spinner loading-xs" aria-hidden="true"></span>
          {{ checking ? 'Prüfe …' : reachable === true ? 'Bridge verbunden' : reachable === false ? 'keine Bridge' : 'Bridge ?' }}
        </button>
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

    <!-- Globaler PZN-Aktualitaets-Hinweis — deaktiviert (IFA/DSGVO), nur bei aktivem Flag. -->
    <PznNoticeBanner v-if="PZN_DICTIONARY_ENABLED" />

    <!-- Mobile-first; auf Tablet/Desktop waechst der Container mit (statt 576-px-Spalte, #23) -->
    <main class="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 md:max-w-3xl md:p-6 xl:max-w-5xl">
      <!-- Einsatz — Neuaufbau. Die fruehere Einsatz-Ansicht (ProtocolRuntimeView) wurde entfernt;
           bei Bedarf im Git-Tag alterstand nachschlagbar. -->
      <div v-show="activeTab === 'einsatz'" class="flex flex-col gap-4">
        <EinsatzView />
      </div>

      <!-- Vorlagen-Editor — Neuaufbau. Der fruehere Editor (ProtocolsTab / protocols/editor/*) wurde
           entfernt; bei Bedarf im Git-Tag alterstand nachschlagbar. -->
      <div v-show="activeTab === 'protokolle'">
        <EditorView />
      </div>

      <!-- Bausteine (#13-F3): Snippets (Textbausteine); wiederverwendbare Bloecke folgen in Slice 2 -->
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
        <span class="dock-label">Bausteine</span>
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
