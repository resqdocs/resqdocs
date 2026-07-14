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
import { useProtocolPersistence } from '@resqdocs/protocol-core-ui/protocolPersistence'
import { configureNativeRepositories } from '@/rebuild/configureNativeRepositories'
import { useMedicationLookup } from '@/medications/useMedicationLookup'
import { usePznNotice } from '@/medications/usePznNotice'
import { PZN_DICTIONARY_ENABLED } from '@/medications/featureFlags'
import { useTemporaryCaseDraft } from '@/composables/useTemporaryCaseDraft'
import { useUsageNotice } from '@/composables/useUsageNotice'

// Rework-Repositories auf die native Capacitor/SQLite-Schicht verdrahten (Web bleibt Memory). MUSS vor
// dem ersten Aufloesen (protocolPersistence.init / useBlockLibrary) laufen -> synchron im Setup.
configureNativeRepositories()

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
      <div class="flex flex-none items-center gap-1 px-2">
        <!-- Bridge-Indikator als WLAN-Icon (Maintainer): Farbe NUR nach Verbindungszustand (gruen verbunden /
             rot nicht) -> kein Grau-Flackern beim Poll; feste Groesse -> springt nicht. Icon: verbunden = WLAN,
             keine Bridge = WLAN durchgestrichen, waehrend der Pruefung = Spinner. -->
        <!-- 44pt-Touch-Target (min-h/w-11); der farbige 32px-Kreis bleibt optisch gleich (innerer Span). -->
        <button
          type="button"
          class="grid min-h-11 min-w-11 shrink-0 cursor-pointer place-items-center rounded-full"
          :aria-label="checking ? 'Bridge-Verbindung wird geprüft' : reachable === true ? 'Bridge verbunden — tippen zum Prüfen' : 'keine Bridge — tippen zum Prüfen'"
          :title="checking ? 'Prüfung läuft …' : reachable === true ? 'Bridge verbunden' : 'keine Bridge'"
          @click="check(true)"
        >
          <span class="grid size-8 place-items-center rounded-full text-white transition-colors" :class="reachable === true ? 'bg-success' : 'bg-error'" aria-hidden="true">
            <span v-if="checking" class="loading loading-spinner loading-sm"></span>
            <svg v-else-if="reachable === true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
              <path stroke-linecap="round" d="M4 4 20 20" />
            </svg>
          </span>
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-circle min-h-11 min-w-11"
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

    <!-- Mobile-first. Haupt-Container voll breit + Padding; die MAX-BREITE liegt PRO ANSICHT (unten), damit der
         Vorlagen-Editor (Werkzeug, 3 Spalten) auf grossen Screens Breite bekommt, Lese-/Formular-Ansichten aber
         komfortabel schmal bleiben. (frueher: eine geteilte max-w-5xl-Deckelung, #23) -->
    <main class="flex w-full flex-col gap-4 p-4 md:p-6">
      <!-- Einsatz — Neuaufbau. Die fruehere Einsatz-Ansicht (ProtocolRuntimeView) wurde entfernt;
           bei Bedarf im Git-Tag alterstand nachschlagbar. -->
      <div v-show="activeTab === 'einsatz'" class="mx-auto flex w-full max-w-xl flex-col gap-4 md:max-w-3xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[110rem]">
        <EinsatzView />
      </div>

      <!-- Vorlagen-Editor — Neuaufbau. Der fruehere Editor (ProtocolsTab / protocols/editor/*) wurde
           entfernt; bei Bedarf im Git-Tag alterstand nachschlagbar. -->
      <!-- Editor = Werkzeug: waechst mit dem Screen. Breite aligned mit dem 3-Spalten-Grid (lg) + weiter auf xl/2xl. -->
      <div v-show="activeTab === 'protokolle'" class="mx-auto w-full max-w-xl md:max-w-3xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[110rem]">
        <EditorView />
      </div>

      <!-- Bausteine: Karten-Listen (Snippets/Bloecke). Nutzt die Breite bis 110rem; die Sektionen zeigen
           ihre Zeilen als Dichte-Grid (2->3->4 Spalten), die offene Edit-Karte spannt volle Breite. -->
      <div v-show="activeTab === 'bausteine'" class="mx-auto w-full max-w-xl md:max-w-3xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[110rem]">
        <BausteineTab />
      </div>

      <!-- Einstellungen -->
      <div v-show="activeTab === 'einstellungen'" class="mx-auto w-full max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
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
