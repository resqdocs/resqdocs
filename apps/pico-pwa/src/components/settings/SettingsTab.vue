<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { useAppVersion } from '@/composables/useAppVersion'
import { usePznLibrary } from '@/medications/usePznLibrary'
import { PZN_DICTIONARY_ENABLED } from '@/medications/featureFlags'
import AppSettingsSection from './AppSettingsSection.vue'
import DeviceSection from './DeviceSection.vue'
import PznSection from './PznSection.vue'
import PznLibraryPage from './PznLibraryPage.vue'
import ScannerSection from './ScannerSection.vue'
import PrivacyDataSection from './PrivacyDataSection.vue'
import InfoHelpSection from './InfoHelpSection.vue'
import LegalSection from './LegalSection.vue'
import OpenSourceSection from './OpenSourceSection.vue'

/**
 * Einstellungen-Tab (#14-A). Strukturierte Shell: App-Einstellungen · Gerät/Pico
 * (Vorschau) · Datenschutz & lokale Daten · Info/Hilfe · Open Source. Alle
 * Storage-/Reset-Aktionen laufen über die gekapselte Schicht (useStorage) — keine
 * Komponente greift direkt auf SQLite/Preferences zu. Keine Patientendaten, kein
 * persistenter caseState.
 *
 * Die PZN-Bibliothek (#190) ist ein eigener Unterpunkt: aus der Übersicht öffnet
 * eine Navi-Zeile die dedizierte Seite (eigene Suche/Liste für bis zu ~1000
 * Einträge); „Zurück" kehrt in die Übersicht zurück. Reiner Sub-Seiten-State,
 * kein Router (App ist tab-basiert).
 */
const { loadSettings } = useStorage()
const lib = usePznLibrary()

// Version + Build-Nummer für die dezente Fußzeile (nativ aus App.getInfo(), Web-Fallback Version).
const { display: appVersion } = useAppVersion()

// Eintragszahl async (SQLite, ~317k): kein In-Memory-Voll-Spiegel. Beim Start und bei
// jeder Rückkehr aus der Bibliotheks-Seite frisch laden.
const pznCount = ref(0)
async function refreshPznCount(): Promise<void> {
  pznCount.value = await lib.count()
}
onMounted(() => {
  void loadSettings()
  void refreshPznCount()
})

type Page = 'overview' | 'pznLibrary'
const page = ref<Page>('overview')
watch(page, (p) => {
  if (p === 'overview') void refreshPznCount()
})
</script>

<template>
  <!-- Eigene Unterseite: PZN-Bibliothek (#190) -->
  <PznLibraryPage v-if="page === 'pznLibrary'" @back="page = 'overview'" />

  <div v-else class="flex flex-col gap-4">
    <h2 class="text-base font-semibold">Einstellungen</h2>
    <p class="text-sm text-base-content/60">
      App, Bridge/Gerät, Backup, Hilfe und Rechtliches.
    </p>

    <p class="px-1 text-xs font-semibold uppercase tracking-wide text-base-content/50">App &amp; Darstellung</p>
    <AppSettingsSection />

    <p class="mt-2 px-1 text-xs font-semibold uppercase tracking-wide text-base-content/50">Gerät &amp; Daten</p>
    <DeviceSection />
    <!-- Altes PZN-Wörterbuch (Netz-Download) — deaktiviert (IFA/DSGVO), nur sichtbar wenn Flag an. -->
    <PznSection v-if="PZN_DICTIONARY_ENABLED" />

    <!-- Navi-Zeile zur eigenen PZN-Bibliothek-Seite (#190): nutzergepflegt, lokal, protokollentkoppelt. -->
    <button
      type="button"
      class="card bg-base-100 text-left shadow transition hover:bg-base-200"
      aria-label="PZN-Bibliothek öffnen"
      @click="page = 'pznLibrary'"
    >
      <div class="card-body flex-row items-center justify-between gap-3 p-4">
        <div class="flex flex-col">
          <span class="font-medium">PZN-Bibliothek (persönlich)</span>
          <span class="text-xs text-base-content/60">
            {{ pznCount }} {{ pznCount === 1 ? 'Eintrag' : 'Einträge' }} · lokal, eigene Bezeichnungen
          </span>
        </div>
        <span class="text-base-content/40" aria-hidden="true">›</span>
      </div>
    </button>

    <ScannerSection />
    <PrivacyDataSection />

    <p class="mt-2 px-1 text-xs font-semibold uppercase tracking-wide text-base-content/50">Info &amp; Rechtliches</p>
    <InfoHelpSection />
    <LegalSection />
    <OpenSourceSection />

    <!-- Dezente Fusszeile: Version/Build (nativ „X.Y.Z (Build)", Web nur „X.Y.Z") + Herausgeber + Entwickler. -->
    <p class="mt-1 text-center text-xs leading-relaxed text-base-content/40">
      ResQDocs {{ appVersion }}<br />
      Herausgeber: [Anbieter] · Entwicklung: [Name]
    </p>
  </div>
</template>
