<script setup lang="ts">
import { onMounted } from 'vue'
import { useButtonTextStatus } from '@/pico/useButtonTextStatus'
import { requestButtonText } from '@/pico/buttonTextEntry'

/**
 * Text fuer den Knopf an der Bridge: Stand und Einstieg. Das Textfeld selbst ist ein eigener Dialog
 * (BridgeButtonTextDialog), der auch ueber die Kopfleiste und aus dem Einsatz aufgeht.
 */
const { support, checking, summary, failReason, refresh } = useButtonTextStatus()
onMounted(() => void refresh())
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <h3 class="font-medium">Text für den Knopf an der Bridge</h3>
      <p class="text-sm text-base-content/75">
        Die Bridge kann einen festen Text speichern und ihn ohne Handy tippen: Ein kurzer Druck auf ihren Knopf
        startet das Tippen, ein weiterer Druck bricht es ab.
      </p>
      <!-- Der Stand kommt erst nach der Abfrage an der Bridge. Sein Platz ist von Anfang an reserviert (drei Zeilen),
           damit die Knöpfe darunter beim Öffnen der Seite nicht nachrutschen. -->
      <div class="min-h-[3.75rem]" data-button-text-status>
        <p class="text-sm" role="status">{{ summary || (checking ? 'Stand an der Bridge wird abgefragt …' : '') }}</p>
        <p v-if="support === 'offline' && failReason" class="text-xs text-base-content/75">Technischer Grund: {{ failReason }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <!-- Gesperrt nur, wenn die Bridge es sicher nicht kann (aeltere Firmware); sonst fragt der Dialog selbst neu. -->
        <button class="btn btn-sm min-h-11" type="button" :disabled="support === 'old' || checking" @click="requestButtonText()">Text bearbeiten</button>
        <button v-if="support !== 'ok'" class="btn btn-ghost btn-sm min-h-11" type="button" :disabled="checking" @click="refresh">
          <span v-if="checking" class="loading loading-spinner loading-sm"></span>
          Erneut prüfen
        </button>
      </div>
    </div>
  </section>
</template>
