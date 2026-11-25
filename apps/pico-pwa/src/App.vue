<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, watchEffect, provide } from 'vue'
import BausteineTab from '@/components/library/BausteineTab.vue'
import TabIcon from '@resqdocs/protocol-core-ui/components/TabIcon.vue'
import SettingsTab from '@/components/settings/SettingsTab.vue'
import BridgeButtonTextDialog from '@/components/BridgeButtonTextDialog.vue'
import BridgeConnectDialog from '@/components/BridgeConnectDialog.vue'
import DisclaimerGate from '@/components/DisclaimerGate.vue'
import FirmwareNoticeBanner from '@/components/FirmwareNoticeBanner.vue'
import TypingProgressBar from '@/components/TypingProgressBar.vue'
import PznNoticeBanner from '@/components/PznNoticeBanner.vue'
import AppUpdateDialog from '@/components/AppUpdateDialog.vue'
import ImportChoiceDialog from '@/components/ImportChoiceDialog.vue'
import TabGuide, { TAB_GUIDE_HINT_ID } from '@/components/TabGuide.vue'
import { guideRequested, testNoticeClosed } from '@/components/tabGuideHints'
import TestPhaseScreen from './components/TestPhaseScreen.vue'
import { TEST_PHASE } from './testPhase'
import EinsatzView from '@/components/rebuild/EinsatzView.vue'
import EditorView from '@/components/rebuild/EditorView.vue'
import { useBridgeConnection } from '@/pico/useBridgeConnection'
import { isThisDevice } from '@/pico/targetDevice'
import { useStorage } from '@/storage/useStorage'
import { useProtocolPersistence } from '@resqdocs/protocol-core-ui/protocolPersistence'
import { configureNativeRepositories } from '@/rebuild/configureNativeRepositories'
import { useMedicationLookup } from '@/medications/useMedicationLookup'
import { usePznNotice } from '@/medications/usePznNotice'
import { PZN_DICTIONARY_ENABLED } from '@/medications/featureFlags'
import { useAppUpdateNotice } from '@/appUpdate/useAppUpdateNotice'
import { useReworkCaseDraft } from '@/rebuild/useReworkCaseDraft'
import { useDisclaimer } from '@/composables/useDisclaimer'
import { startIncomingOpen, setIncomingHold, incomingOpen } from '@/composables/useIncomingOpen'
import { keyboardLayoutKey, listCaptureKey, longTextSizeKey, snippetSourceKey } from '@resqdocs/protocol-core-ui/injection'
import { useLongTextSize } from '@/composables/useLongTextSize'
import { useBausteine } from '@/composables/useBausteine'
import { appListCapture } from '@/components/rebuild/listCapture'
import { scrollTabToTop } from '@/shell/tabScroll'
import { currentPageHeader } from '@/shell/back'
import { keyboardOpen } from '@/shell/keyboard'
import { syncAppearance, syncSystemBars } from '@/shell/systemBars'
import { activeTab, type AppTab } from '@/composables/useActiveTab'
import { bridgePageRequest } from '@/composables/useBridgePage'

// Rework-Repositories auf die native Capacitor/SQLite-Schicht verdrahten (Web bleibt Memory). MUSS vor
// dem ersten Aufloesen (protocolPersistence.init / useBlockLibrary) laufen -> synchron im Setup.
configureNativeRepositories()

// App-Einstellungen laden + Storage-Backend wählen (nativ → SQLite, Web → Memory). Einmalig, idempotent.
const storage = useStorage()
// Medikationsplan/Kontakte im gemeinsamen Paket: Kamera-Scan, PZN-Vorschläge und Prüf-Sheets steckt NUR die App
// ein (listCaptureKey) - an der Wurzel, damit jede Einsatz-Stelle sie bekommt.
provide(listCaptureKey, appListCapture)
// Schriftgröße im großen Textfeld: je Gerät gemerkt, gilt für jedes Schreib-Fenster der App.
provide(longTextSizeKey, useLongTextSize())
// Bildschirmtastatur: die App verkleinert das Layout (@capacitor/keyboard). Vollbild-Fenster füllen deshalb die
// Layout-Höhe und passen sich einmal an, statt dem sichtbaren Bereich zu folgen.
provide(keyboardLayoutKey, { open: keyboardOpen })
// Textbausteine für die gemeinsame Auswahl (Editor und Einsatz): die SQLite-Bibliothek der App.
{
  const bausteine = useBausteine()
  provide(snippetSourceKey, { snippets: bausteine.snippets, loaded: bausteine.loaded, reload: bausteine.reload })
}
const protocolPersistence = useProtocolPersistence()
const pznLookup = useMedicationLookup()
const pznNotice = usePznNotice()
const appUpdateNotice = useAppUpdateNotice()
onMounted(async () => {
  void storage.initLibrary()
  void protocolPersistence.init() // Rework-Bibliothek laden (nativ SQLite / Web Memory) + Auto-Save
  // Settings zuerst (await): der optionale Hintergrund-Check liest das Opt-in.
  await storage.loadSettings()
  // Hinweis auf eine neue App-Version (Schalter in den Einstellungen; Abruf bei jedem Oeffnen der App).
  void appUpdateNotice.maybeCheck()
  // PZN-Wörterbuch (Netz-Download) ist deaktiviert (IFA/DSGVO) → nur bei aktivem
  // Flag laden/prüfen. ensureLoaded/maybeCheck sind sonst No-ops (kein Netz).
  if (PZN_DICTIONARY_ENABLED) {
    await pznLookup.ensureLoaded()
    void pznNotice.maybeCheck()
  }
})

// Buch-Symbol im Header: blendet die Tab-Erklaerung (TabGuide) wieder ein.
function reshowGuide(): void {
  guideRequested.value = true
  // Testversion: die Kennung der Einführung nicht anfassen, sie gehört zur echten Version (siehe TabGuide.dismiss).
  if (!TEST_PHASE) {
    storage.settings.dismissedHints = storage.settings.dismissedHints.filter((h) => h !== TAB_GUIDE_HINT_ID)
    void storage.saveSettings()
  }
  scrollTabToTop(activeTab.value)
}

// Thema: Design „resqdocs“ in hell oder dunkel (Erscheinung hell|dunkel|system), beim Start UND live.
// „system“ folgt prefers-color-scheme via matchMedia (reaktiv).
const prefersDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  prefersDark.value = e.matches
})
watchEffect(() => {
  const t = storage.settings.theme
  const dark = t === 'dark' || (t === 'system' && prefersDark.value)
  document.documentElement.setAttribute('data-theme', dark ? 'resqdocs-dark' : 'resqdocs')
})
// Android: Farbe hinter den Systemleisten dem Thema nachführen (nach dem Setzen des Attributs, daher 'post').
watch([() => storage.settings.theme, prefersDark], () => syncSystemBars(), { immediate: true, flush: 'post' })
// iOS: Fenster der App auf die gewählte Erscheinung stellen (Statusleiste, Tastatur, Fläche hinter der WebView und
// prefers-color-scheme folgen ihm). Beim Start hat das der native Code schon aus den gespeicherten Einstellungen
// getan; gemeldet wird deshalb erst, wenn die Einstellungen geladen sind, und danach bei jedem Umschalten.
// Bei „System“ folgt das Fenster wieder dem iPhone, und prefersDark oben meldet dessen Wechsel live.
watch([() => storage.settingsLoaded.value, () => storage.settings.theme], ([loaded, theme]) => syncAppearance(loaded, theme), { immediate: true })

// S4-Navigation: 4 Tabs. Gerät/Pico + Info/Hilfe liegen unter Einstellungen.
// Der aktive Tab ist geteilt (useActiveTab): Meldungen anderer Stellen richten sich danach.
type Tab = AppTab

// Tab-Leiste. Jeder Tab scrollt in seinem eigenen Bereich (App-Hülle, siehe Template) und behält dort seine
// Position, während er ausgeblendet ist: ein Wechsel zeigt den Tab sofort an seiner alten Stelle, ohne Sprung.
// Erneutes Tippen auf den BEREITS aktiven Tab führt zu seiner Startseite: Eine Unterseite mit Titelzeile (z. B.
// eine geöffnete Vorlage) schließt sich, sonst scrollt der Bereich an den Anfang.
// Titelzeile: Meldet die sichtbare Unterseite einen Titel, zeigt die Kopfzeile ‹ und den Titel statt der Marke.
const pageHeader = computed(() => currentPageHeader())
function selectTab(tab: Tab): void {
  if (activeTab.value === tab) {
    if (pageHeader.value) pageHeader.value.close()
    else scrollTabToTop(tab)
    return
  }
  activeTab.value = tab
}
// „Weitere Einstellungen“ im Fenster „Mit ResQDocs-Bridge verbinden“: in die Einstellungen (SettingsTab öffnet
// dort die Bridge-Seite und beginnt oben).
watch(bridgePageRequest, () => {
  if (activeTab.value !== 'einstellungen') selectTab('einstellungen')
})

// Angetippter Transfer-Link / geteilte Vorlagen-Datei (nativ): erst anbieten, wenn die Bibliothek geladen
// und kein Start-Gate offen ist, dann auf den Vorlagen-Tab. Nachfrage und Import: LibraryBar/TemplateIO.
// Die Einfuehrung zaehlt mit: sie erscheint nach einem Update allen einmal, die Nachfrage laege sonst
// ueber ihr. Abgerufen wird vorher nichts, das Warten verbraucht also keinen Link.
const disclaimer = useDisclaimer()
startIncomingOpen(import.meta.env.VITE_TRANSFER_URL as string | undefined)
watchEffect(() => {
  setIncomingHold(
    !protocolPersistence.libraryLoaded.value ||
      !disclaimer.ready.value ||
      disclaimer.needsAck.value ||
      !storage.settingsLoaded.value ||
      // Testversion: Die Einführung erscheint dort nicht von selbst; gewartet wird auf den Testhinweis und,
      // falls über ? geöffnet, auf die Einführung. Sonst bliebe ein angetippter Link ohne Wirkung.
      (TEST_PHASE ? !testNoticeClosed.value || guideRequested.value : !storage.settings.dismissedHints.includes(TAB_GUIDE_HINT_ID)),
  )
})
watch(incomingOpen, (item) => {
  if (item && activeTab.value !== 'protokolle') selectTab('protokolle')
})

// Geteilter Verbindungszustand der Bridge (useBridgeConnection): Die Kopfzeile zeigt ihn nicht mehr, der Einsatz
// liest ihn für „Mit ResQDocs-Bridge verbinden“ und „An Zielgerät senden“. Geprüft wird beim App-Start, beim Öffnen
// des Einsatz-Tabs und beim Zurückkehren in die App.
const { check, startPolling, stopPolling } = useBridgeConnection()
// Zielgerät „Dieses Gerät“ (pico/targetDevice.ts): keine Bridge im Spiel. Dann fragt die App die Bridge nicht ab.
const thisDevice = computed(() => isThisDevice(storage.settings.defaultOs))
onMounted(() => {
  watch(thisDevice, (local) => {
    if (local) stopPolling()
    else { void check(); startPolling() }
  }, { immediate: true })
})
watch(activeTab, (t) => {
  if (t === 'einsatz' && !thisDevice.value) void check()
})

// Temporärer Einsatzentwurf: Ablaufprüfung beim App-Resume und sparsam
// periodisch, solange die App offen ist. `visibilitychange` deckt iOS/Android-
// WebView (Vorder-/Hintergrund) UND Web ab — ohne zusätzliche Capacitor-Plugins.
// Der LIVE-Entwurf (Rework): ohne diese laufende Prüfung liefe die Ablaufzeit nie
// ab, solange die App offen bleibt — im Dienst also praktisch nie.
const draft = useReworkCaseDraft()
function onVisible(): void {
  if (document.visibilityState === 'visible') {
    void draft.checkExpiry()
    if (!thisDevice.value) void check() // beim Zurückkehren Bridge gleich neu prüfen
    void appUpdateNotice.maybeCheck() // die App bleibt oft tagelang im Speicher; jede Rueckkehr zaehlt als Oeffnen
  }
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
  <!-- Hinweis beim Start (Haftung und Nutzung, ein Dialog): erster Start und geänderter Text, sperrt bis bestätigt -->
  <DisclaimerGate />
  <!-- Hinweis auf eine neue App-Version im Store (resqdocs.app/app-version.json), erst nach dem Hinweis beim Start. -->
  <AppUpdateDialog />
  <!-- Vorlagen-Import: Auswahl, Name, Überschreiben oder neu, über allen Tabs. -->
  <ImportChoiceDialog />

  <!-- Welcome-Seite: vollflaechig, erscheint nach dem Hinweis beim Start
       (wartet auf dessen Bestaetigung); ueber das ?-Symbol im Header wieder abrufbar. -->
  <TabGuide />
  <!-- Testversion (Testphase): ersetzt die Einführung durch den Hinweis auf die Testanleitung. -->
  <TestPhaseScreen />

  <!-- App-Hülle: Kopfzeile, Inhalt und Tab-Leiste füllen genau den Bildschirm (h-dvh), das Dokument selbst scrollt
       nie (style.css). Nur der Bereich des aktiven Tabs scrollt; Kopfzeile, Umschalter und Tab-Leiste bleiben
       stehen, auch wenn das System ein Eingabefeld ins Bild holt. -->
  <div class="flex h-dvh flex-col overflow-hidden bg-base-200" data-app-shell>
    <!-- Safe-Area oben: Header weicht der iOS-Statusleiste aus. max(4px, …)
         gibt mind. 4px Abstand, damit das Logo auf Android (env()=0) nicht oben
         klebt; auf iOS bleibt der größere Notch-Inset erhalten. Web: 4px. -->
    <header class="navbar relative z-10 shrink-0 bg-base-100 pt-[max(4px,env(safe-area-inset-top))] shadow-sm">
      <!-- Unterseite mit Titelzeile (z. B. eine geöffnete Vorlage): ‹ führt zurück, daneben der Name der Seite.
           Nur das Zeichen, kein Wort „Zurück“; den Namen des Knopfs liest der Screenreader. min-h wie die Marke
           (45 px + Abstand), damit die Kopfzeile beim Wechsel nicht springt. -->
      <div v-if="pageHeader" class="flex min-h-[61px] min-w-0 flex-1 items-center gap-1 px-1 py-2" data-header-page>
        <button type="button" class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5" :aria-label="pageHeader.backLabel" :title="pageHeader.backLabel" data-header-back @click="pageHeader.close()">
          <span aria-hidden="true" class="text-xl leading-none">‹</span>
        </button>
        <h1 class="min-w-0 flex-1 truncate text-base font-semibold" data-header-title>{{ pageHeader.title }}</h1>
      </div>
      <div v-else class="flex-1 px-3 py-2">
        <!-- Wort-Bild-Marke; helle Variante auf dunklen Themes (Regeln in style.css) -->
        <img draggable="false" src="/brand.svg" alt="ResQDocs" class="brand-logo brand-logo-light h-[45px] w-auto" />
        <img draggable="false" src="/brand-dark.svg" alt="ResQDocs" class="brand-logo brand-logo-dark h-[45px] w-auto" />
      </div>
      <div class="flex flex-none items-center gap-1 px-2">
        <!-- Einziger Knopf der Kopfzeile: Einführung und Anleitung (Buch im getönten Kreis). Verbindungs-Anzeige und
             Knopf-Text stehen hier nicht mehr: verbunden wird im Einsatz, der Text für den Knopf an der Bridge
             liegt unter Einstellungen > Bridge. 44-px-Tippfläche, der 32-px-Kreis ist nur die sichtbare Form. -->
        <button
          type="button"
          class="grid min-h-11 min-w-11 shrink-0 cursor-pointer place-items-center rounded-full"
          aria-label="Einführung und Anleitung"
          title="Einführung und Anleitung"
          data-header-guide
          @click="reshowGuide"
        >
          <span class="grid size-8 place-items-center rounded-full bg-primary/15 text-primary" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-[22px]">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
          </span>
        </button>
      </div>
    </header>
    <!-- Testversion: dauerhaft sichtbar, führt zur Testanleitung. -->
    <a draggable="false"
      v-if="TEST_PHASE"
      :href="TEST_PHASE.url"
      target="_blank"
      rel="noopener"
      class="flex min-h-11 shrink-0 items-center justify-center gap-2 bg-neutral px-3 text-sm font-semibold text-neutral-content"
      data-test-phase-strip
    >
      Testversion „{{ TEST_PHASE.title }}“ · Testanleitung öffnen
    </a>

    <!-- Globaler Firmware-Update-Hinweis: erscheint nach einem Bridge-Kontakt
         mit veralteter Firmware, auf allen Tabs; Update direkt im Banner. -->
    <FirmwareNoticeBanner />

    <!-- Globaler PZN-Aktualitaets-Hinweis — deaktiviert (IFA/DSGVO), nur bei aktivem Flag. -->
    <PznNoticeBanner v-if="PZN_DICTIONARY_ENABLED" />

    <!-- Inhalt: je Tab ein eigener Scrollbereich (bleibt per v-show gemountet und behält so seine Position).
         overscroll-y-contain: am Ende der Liste läuft das Wischen nicht auf die Hülle über. Der Abstand oben liegt
         am Inhalt, nicht am Bereich: sonst hielten klebende Umschalter (sticky top-0) diesen Abstand zur Kopfzeile,
         und dazwischen liefe Inhalt sichtbar durch.
         Mobile-first. Bereich voll breit + Padding; die MAX-BREITE liegt PRO ANSICHT, damit der Vorlagen-Editor
         (Werkzeug, 3 Spalten) auf grossen Screens Breite bekommt, Lese-/Formular-Ansichten aber schmal bleiben. -->
    <main class="relative min-h-0 w-full flex-1">
      <!-- Einsatz — Neuaufbau. Die fruehere Einsatz-Ansicht (ProtocolRuntimeView) wurde entfernt;
           bei Bedarf in der Git-Historie nachschlagbar. -->
      <div v-show="activeTab === 'einsatz'" class="absolute inset-0 overflow-y-auto overscroll-y-contain px-4 pb-4 md:px-6 md:pb-6" data-tab-scroll="einsatz">
        <div class="mx-auto pt-4 md:pt-6 flex w-full max-w-xl flex-col gap-4 md:max-w-3xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[110rem]">
          <EinsatzView />
        </div>
      </div>

      <!-- Vorlagen-Editor — Neuaufbau. Der fruehere Editor (ProtocolsTab / protocols/editor/*) wurde
           entfernt; bei Bedarf in der Git-Historie nachschlagbar. -->
      <!-- Editor = Werkzeug: waechst mit dem Screen. Breite aligned mit dem 3-Spalten-Grid (lg) + weiter auf xl/2xl. -->
      <div v-show="activeTab === 'protokolle'" class="absolute inset-0 overflow-y-auto overscroll-y-contain px-4 pb-4 md:px-6 md:pb-6" data-tab-scroll="protokolle">
        <div class="mx-auto pt-4 md:pt-6 w-full max-w-xl md:max-w-3xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[110rem]">
          <EditorView />
        </div>
      </div>

      <!-- Bausteine: Karten-Listen (Snippets/Bloecke). Nutzt die Breite bis 110rem; die Sektionen zeigen
           ihre Zeilen als Dichte-Grid (2->3->4 Spalten), die offene Edit-Karte spannt volle Breite. -->
      <div v-show="activeTab === 'bausteine'" class="absolute inset-0 overflow-y-auto overscroll-y-contain px-4 pb-4 md:px-6 md:pb-6" data-tab-scroll="bausteine">
        <div class="mx-auto pt-4 md:pt-6 w-full max-w-xl md:max-w-3xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[110rem]">
          <BausteineTab />
        </div>
      </div>

      <!-- Einstellungen -->
      <div v-show="activeTab === 'einstellungen'" class="absolute inset-0 overflow-y-auto overscroll-y-contain px-4 pb-4 md:px-6 md:pb-6" data-tab-scroll="einstellungen">
        <div class="mx-auto pt-4 md:pt-6 w-full max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          <SettingsTab />
        </div>
      </div>
    </main>

    <!-- Tipp-Anzeige: steht über der Tab-Leiste und nimmt dem Inhalt Platz weg, statt ihn zu verdecken. -->
    <TypingProgressBar />
    <!-- Textfeld fuer den Knopf an der Bridge: einmal eingehaengt, von Kopfleiste, Bridge-Seite und Einsatz geoeffnet. -->
    <BridgeButtonTextDialog />
    <BridgeConnectDialog />

    <!-- Dock mit Icons: inline-SVGs (stroke), kein Icon-Font/CDN (Netzwerk-Policy).
         static: Teil der Hülle statt daisyUI-fixed am Fensterrand. z-10 wie die Kopfzeile: daisyUI setzt das Dock
         nur auf z-index 1 - eine Einsatz-Karte mit offenem Dropdown (z-index 4, style.css) lag sonst darüber. -->
    <nav class="dock static z-10 shrink-0 border-t border-base-300 bg-base-100">
      <button type="button" :class="{ 'dock-active text-primary': activeTab === 'einsatz' }" @click="selectTab('einsatz')">
        <TabIcon tab="einsatz" class="size-5" />
        <span class="dock-label">Einsatz</span>
      </button>
      <button type="button" :class="{ 'dock-active text-primary': activeTab === 'protokolle' }" @click="selectTab('protokolle')">
        <TabIcon tab="vorlagen" class="size-5" />
        <span class="dock-label">Vorlagen</span>
      </button>
      <button type="button" :class="{ 'dock-active text-primary': activeTab === 'bausteine' }" @click="selectTab('bausteine')">
        <TabIcon tab="bausteine" class="size-5" />
        <span class="dock-label">Bausteine</span>
      </button>
      <button type="button" :class="{ 'dock-active text-primary': activeTab === 'einstellungen' }" @click="selectTab('einstellungen')">
        <TabIcon tab="einstellungen" class="size-5" />
        <span class="dock-label">Einstellungen</span>
      </button>
    </nav>
  </div>
</template>
