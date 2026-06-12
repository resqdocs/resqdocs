<script setup lang="ts">
import { onMounted } from 'vue'
import { useStorage } from '@/storage/useStorage'
import AppSettingsSection from './AppSettingsSection.vue'
import DeviceSection from './DeviceSection.vue'
import PznSection from './PznSection.vue'
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
 */
const { loadSettings } = useStorage()
onMounted(loadSettings)
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-base font-semibold">Einstellungen</h2>
    <p class="text-sm text-base-content/60">
      App, Bridge/Gerät, Backup, Hilfe und Rechtliches.
    </p>
    <AppSettingsSection />
    <DeviceSection />
    <PznSection />
    <PrivacyDataSection />
    <InfoHelpSection />
    <LegalSection />
    <OpenSourceSection />
  </div>
</template>
