<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { useAppVersion } from '@/composables/useAppVersion'
import { usePznLibrary } from '@/medications/usePznLibrary'
import { PZN_DICTIONARY_ENABLED } from '@/medications/featureFlags'
import { useBridgeConnection } from '@/pico/useBridgeConnection'
import AppSettingsSection from './AppSettingsSection.vue'
import DeviceSection from './DeviceSection.vue'
import PznSection from './PznSection.vue'
import PznLibraryPage from './PznLibraryPage.vue'
import ScannerSection from './ScannerSection.vue'
import PrivacyDataSection from './PrivacyDataSection.vue'
import BackupSection from './BackupSection.vue'
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
// Geteilter Bridge-Status (Singleton, derselbe wie im Header) für das Badge auf der Gerät-Navi-Zeile.
const { reachable } = useBridgeConnection()

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

type Page = 'overview' | 'device' | 'pznLibrary'
const page = ref<Page>('overview')
watch(page, (p) => {
  if (p === 'overview') void refreshPznCount()
})
</script>

<template>
  <!-- Eigene Unterseite: PZN-Bibliothek (#190) -->
  <PznLibraryPage v-if="page === 'pznLibrary'" @back="page = 'overview'" />

  <!-- Eigene Unterseite: Bridge/Gerät (großer Bereich, aus der Übersicht ausgelagert — Muster wie PZN). -->
  <div v-else-if="page === 'device'" class="flex flex-col gap-4">
    <button type="button" class="btn btn-ghost btn-sm min-h-11 self-start gap-1 px-2" @click="page = 'overview'">
      <span aria-hidden="true">‹</span> Einstellungen
    </button>
    <DeviceSection />
  </div>

  <div v-else class="flex flex-col gap-4">
    <h2 class="text-base font-semibold">Einstellungen</h2>
    <p class="text-sm text-base-content/60">
      App-Einstellungen, Bridge/Gerät, Daten und Rechtliches.
    </p>

    <!-- Täglich benötigt: immer sichtbar. -->
    <AppSettingsSection />
    <ScannerSection />

    <!-- Große/tiefe Bereiche als eigene Unterseiten (Navi-Zeilen, Muster #190). Wert/Status direkt auf der Zeile. -->
    <button
      type="button"
      class="card bg-base-100 text-left shadow transition hover:bg-base-200"
      aria-label="Bridge / Gerät öffnen"
      @click="page = 'device'"
    >
      <div class="card-body flex-row items-center justify-between gap-3 p-4">
        <div class="flex flex-col">
          <span class="font-medium">Bridge / Gerät</span>
          <span class="text-xs text-base-content/60">Verbindung · Firmware · Testtext · Geräte-ID</span>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="badge badge-sm"
            :class="reachable === true ? 'badge-success' : reachable === false ? 'badge-error' : 'badge-ghost'"
          >
            {{ reachable === true ? 'verbunden' : reachable === false ? 'getrennt' : 'unbekannt' }}
          </span>
          <span class="text-base-content/40" aria-hidden="true">›</span>
        </div>
      </div>
    </button>

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

    <!-- Selten benötigt: eingeklappt. Unabhängige Collapses (checkbox, NICHT radio-gruppiert -> einzeln auf/zu). -->
    <div class="collapse collapse-arrow bg-base-100 shadow">
      <input type="checkbox" aria-label="Daten und lokale Daten ein- oder ausklappen" />
      <div class="collapse-title min-h-11 font-semibold">Daten &amp; lokale Daten</div>
      <div class="collapse-content flex flex-col gap-4">
        <PrivacyDataSection />
        <!-- Altes PZN-Wörterbuch (Netz-Download) — deaktiviert (IFA/DSGVO), nur sichtbar wenn Flag an. -->
        <PznSection v-if="PZN_DICTIONARY_ENABLED" />
      </div>
    </div>

    <div class="collapse collapse-arrow bg-base-100 shadow">
      <input type="checkbox" aria-label="Sicherung und Wiederherstellung ein- oder ausklappen" />
      <div class="collapse-title min-h-11 font-semibold">Sicherung &amp; Wiederherstellung</div>
      <div class="collapse-content flex flex-col gap-4">
        <BackupSection />
      </div>
    </div>

    <div class="collapse collapse-arrow bg-base-100 shadow">
      <input type="checkbox" aria-label="Info und Rechtliches ein- oder ausklappen" />
      <div class="collapse-title min-h-11 font-semibold">Info &amp; Rechtliches</div>
      <div class="collapse-content flex flex-col gap-4">
        <InfoHelpSection />
        <LegalSection />
        <OpenSourceSection />
      </div>
    </div>

    <!-- Dezente Fusszeile: Version/Build (nativ „X.Y.Z (Build)", Web nur „X.Y.Z") + Herausgeber + Entwickler. -->
    <p class="mt-1 text-center text-xs leading-relaxed text-base-content/40">
      ResQDocs {{ appVersion }}<br />
      Herausgeber: [Anbieter] · Entwicklung: [Name]
    </p>
  </div>
</template>
