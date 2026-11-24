<script setup lang="ts">
/**
 * Startbildschirm einer Testversion (Testphase, siehe testPhase.ts): ersetzt die Einführung. Sagt klar, dass
 * es eine Testversion ist, und führt zur Testanleitung. Erscheint bei jedem Start der App nach dem
 * Haftungshinweis; „Weiter zur App“ schließt ihn bis zum nächsten Start.
 */
import { computed } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { useDisclaimer } from '@/composables/useDisclaimer'
import { TEST_PHASE } from '@/testPhase'
import { testNoticeClosed } from './tabGuideHints'

const storage = useStorage()
const disclaimer = useDisclaimer()
const closed = testNoticeClosed
const visible = computed(
  // erst nach dem Hinweis beim Start, sonst laege der Testhinweis neben ihm
  () => !!TEST_PHASE && !closed.value && storage.settingsLoaded.value && disclaimer.ready.value && !disclaimer.needsAck.value,
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && TEST_PHASE"
      class="fixed inset-0 z-40 overflow-y-auto bg-base-200"
      role="dialog"
      aria-modal="true"
      :aria-label="`Testversion: ${TEST_PHASE.title}`"
      data-test-phase-screen
    >
      <div class="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-5 pb-[max(24px,env(safe-area-inset-bottom))] pl-[max(24px,env(safe-area-inset-left))] pr-[max(24px,env(safe-area-inset-right))] pt-[max(32px,env(safe-area-inset-top))]">
        <div class="space-y-3 text-center">
          <span class="badge badge-neutral badge-lg font-semibold">Testversion</span>
          <h1 class="text-2xl font-bold">{{ TEST_PHASE.title }}</h1>
          <p class="text-base">Diese Version gibt es nur zum Testen. Sie wird so nicht veröffentlicht.</p>
        </div>
        <div class="space-y-2 rounded-box border border-base-300 bg-base-100 p-4 text-base">
          <p><strong>Bitte geh die Testanleitung Schritt für Schritt durch</strong> und gib uns danach Rückmeldung. Dort steht auch, wie.</p>
          <p>Arbeite nur mit ausgedachten Test- und Beispieldaten, nie mit echten Patientendaten.</p>
          <p><strong>Deine Vorlagen bleiben erhalten.</strong> Lösche die App nicht und installiere sie nicht neu, sonst sind die Daten auf dem Handy weg. Sichere sie vorher wie in der Anleitung beschrieben.</p>
        </div>
        <div class="space-y-2">
          <a draggable="false" :href="TEST_PHASE.url" target="_blank" rel="noopener" class="btn btn-primary min-h-12 w-full text-base" data-test-phase-open>Testanleitung öffnen</a>
          <button type="button" class="btn btn-ghost min-h-12 w-full text-base" data-test-phase-close data-back-close @click="closed = true">Weiter zur App</button>
        </div>
        <p class="text-center text-sm text-base-content/80">Die Anleitung ist jederzeit über den Streifen „Testversion“ oben erreichbar.</p>
      </div>
    </div>
  </Teleport>
</template>
