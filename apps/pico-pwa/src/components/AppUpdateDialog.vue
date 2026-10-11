<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppUpdateNotice } from '@/appUpdate/useAppUpdateNotice'

/**
 * Hinweis „neue App-Version im Store" als Dialog beim Oeffnen der App, wenn resqdocs.app fuer die
 * eigene Plattform eine neuere Version meldet. Der Store-Button oeffnet die Store-Seite (target=_blank
 * -> Capacitor gibt die Adresse an das System, das den Store oeffnet). „Später" schliesst bis zum
 * naechsten App-Start; mit Haken erst wieder bei einer neueren Version. z-30: unter Haftungs-Gate (z-50)
 * und Nutzungshinweis (z-40), damit der erste Start nicht mit drei Dialogen beginnt. KEINE HTTP-Logik hier.
 */
const notice = useAppUpdateNotice()
const untilNext = ref(false)
const storeLabel = computed(() => (notice.platform.value === 'android' ? 'Bei Google Play öffnen' : 'Im App Store öffnen'))
const storeName = computed(() => (notice.platform.value === 'android' ? 'bei Google Play' : 'im App Store'))

function close(): void {
  void notice.dismiss(untilNext.value)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="notice.visible.value"
      class="overlay-backdrop--strong fixed inset-0 z-30 flex items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
    >
      <div class="overlay-surface--strong card max-h-full w-full max-w-lg overflow-y-auto">
        <div class="card-body gap-4 p-6">
          <h2 id="app-update-title" class="card-title text-lg">Neue Version verfügbar</h2>
          <p class="text-sm leading-relaxed text-base-content/90">
            ResQDocs {{ notice.latest.value }} ist {{ storeName }} verfügbar. Installiert ist
            {{ notice.current.value }}.
          </p>
          <p class="text-sm leading-relaxed text-base-content/90">
            Ein laufender Einsatz geht beim Aktualisieren normalerweise nicht verloren. Wir empfehlen
            trotzdem, nicht während eines laufenden Einsatzes zu aktualisieren.
          </p>
          <label class="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input v-model="untilNext" type="checkbox" class="checkbox checkbox-sm" />
            Nicht mehr anzeigen bis zur nächsten Version
          </label>
          <div class="card-actions justify-end">
            <button class="btn btn-ghost btn-sm min-h-11" type="button" @click="close">Später</button>
            <a
              v-if="notice.storeUrl.value"
              :href="notice.storeUrl.value"
              target="_blank"
              rel="noopener"
              class="btn btn-primary btn-sm min-h-11"
              @click="close"
            >{{ storeLabel }}</a>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
