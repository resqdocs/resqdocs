<script setup lang="ts">
import { ref } from 'vue'
import { usePznNotice } from '@/medications/usePznNotice'
import { useMedicationLookup } from '@/medications/useMedicationLookup'

/**
 * Globaler PZN-Aktualitaets-Hinweis: erscheint unter dem Header auf allen Tabs,
 * wenn das lokale Woerterbuch aelter als 7 Tage ist (lokal, ohne Netz) oder -
 * bei aktivem Opt-in - ein Hintergrund-Check eine neue Version gemeldet hat.
 * "Jetzt aktualisieren" fuehrt den bewussten Sync aus (gleicher Flow wie in den
 * Einstellungen, lookup.syncNow()); "Spaeter" blendet den Hinweis fuer die
 * laufende Sitzung aus. KEINE eigene HTTP-Logik hier.
 */
const notice = usePznNotice()
const lookup = useMedicationLookup()

const resultMsg = ref<string | null>(null)

async function onSync(): Promise<void> {
  resultMsg.value = null
  resultMsg.value = await lookup.syncNow()
  notice.reset()
}
</script>

<template>
  <div v-if="notice.visible.value" class="mx-auto w-full max-w-xl px-4 pt-4 md:max-w-3xl md:px-6 xl:max-w-5xl">
    <div class="alert alert-info items-start text-sm" role="status">
      <div class="flex w-full flex-col gap-2">
        <span v-if="notice.reason.value === 'newer'">
          <strong>Neue PZN-Datenbank verfügbar</strong> (Version {{ notice.remoteVersion.value }}).
          Jetzt aktualisieren, um aktuelle Medikamentennamen aufzulösen.
        </span>
        <span v-else>
          <strong>PZN-Datenbank prüfen:</strong> deine Medikamentennamen-Daten sind älter als 7 Tage –
          eventuell gibt es eine neue Version.
        </span>

        <div v-if="!resultMsg" class="flex flex-wrap items-center gap-2">
          <button class="btn btn-primary btn-xs" type="button" :disabled="lookup.state.busy" @click="onSync">
            Jetzt aktualisieren
          </button>
          <button class="btn btn-ghost btn-xs" type="button" @click="notice.dismiss()">Später</button>
          <span v-if="lookup.state.busy" class="loading loading-spinner loading-xs" aria-label="lädt" />
        </div>

        <span v-if="resultMsg">{{ resultMsg }}</span>
      </div>
    </div>
  </div>
</template>
