<script setup lang="ts">
import { ref } from 'vue'
import { useMedicationLookup } from '@/medications/useMedicationLookup'

/**
 * PZN-Wörterbuch (#11): Stand anzeigen + nutzerinitiierter Sync. Einzige
 * Remote-Verbindung der App neben der Bridge (SECURITY.md). Daten sind
 * neutrale CC0-Referenzdaten der Community - unverifiziert, daher werden
 * Auflösungen im Scan als "community/ungeprüft" markiert.
 */
const lookup = useMedicationLookup()
void lookup.ensureLoaded()

const msg = ref<string | null>(null)
async function onSync(): Promise<void> {
  msg.value = null
  msg.value = await lookup.syncNow()
}
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <h3 class="font-medium">PZN-Wörterbuch (Medikamentennamen)</h3>
      <p class="text-sm text-base-content/70">{{ lookup.status.value }}</p>
      <div class="flex items-center gap-2">
        <button class="btn btn-sm" type="button" :disabled="lookup.state.busy" @click="onSync">
          Jetzt aktualisieren
        </button>
        <span v-if="lookup.state.busy" class="loading loading-spinner loading-sm" aria-label="lädt" />
      </div>
      <p v-if="msg" class="text-sm text-base-content/70">{{ msg }}</p>
      <p class="text-xs text-base-content/60">
        Community-Wörterbuch (CC0) zum Auflösen gescannter PZNs in Medikamentennamen - offline nutzbar,
        Aktualisierung nur auf Knopfdruck. Namen sind <strong>ungeprüfte Community-Angaben</strong> und
        werden im Scan entsprechend markiert. Es werden nie Patientendaten übertragen.
      </p>
    </div>
  </section>
</template>
