<script setup lang="ts">
import { ref } from 'vue'
import { useMedicationLookup } from '@/medications/useMedicationLookup'
import { useStorage } from '@/storage/useStorage'

/**
 * PZN-Wörterbuch (#11): Stand anzeigen + nutzerinitiierter Sync. Einzige
 * Remote-Verbindung der App neben der Bridge (SECURITY.md). Daten sind
 * neutrale CC0-Referenzdaten der Community - unverifiziert, daher werden
 * Auflösungen im Scan als "community/ungeprüft" markiert.
 */
const lookup = useMedicationLookup()
void lookup.ensureLoaded()
const storage = useStorage()

const msg = ref<string | null>(null)
async function onSync(): Promise<void> {
  msg.value = null
  msg.value = await lookup.syncNow()
}
</script>

<template>
  <div class="flex flex-col gap-3">
      <h3 class="font-medium">PZN-Wörterbuch (Medikamentennamen)</h3>
      <p class="text-sm text-base-content/70">{{ lookup.status.value }}</p>
      <div class="flex items-center gap-2">
        <button class="btn btn-sm min-h-11" type="button" :disabled="lookup.state.busy" @click="onSync">
          Jetzt aktualisieren
        </button>
        <span v-if="lookup.state.busy" class="loading loading-spinner loading-sm" aria-label="lädt" />
      </div>
      <p v-if="msg" class="text-sm text-base-content/70">{{ msg }}</p>

      <label class="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          class="checkbox checkbox-sm mt-0.5"
          :checked="storage.settings.pznAutoCheck"
          @change="storage.saveSettings({ pznAutoCheck: ($event.target as HTMLInputElement).checked })"
        />
        <span>
          Im Hintergrund auf neue Versionen prüfen
          <span class="block text-xs text-base-content/60">
            Lädt gelegentlich nur die kleine Versionsangabe von resqdocs.app, um auf eine neue Datenbank
            hinzuweisen. Ohne diese Option erscheint der Hinweis rein lokal, wenn die Daten älter als 7 Tage sind.
          </span>
        </span>
      </label>

      <p class="text-xs text-base-content/60">
        Community-Wörterbuch (CC0) zum Auflösen gescannter PZNs in Medikamentennamen - offline nutzbar,
        Aktualisierung nur auf Knopfdruck. Namen sind <strong>ungeprüfte Community-Angaben</strong> und
        werden im Scan entsprechend markiert. Es werden nie Patientendaten übertragen.
      </p>
  </div>
</template>
