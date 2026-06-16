<script setup lang="ts">
import { useUsageNotice } from '@/composables/useUsageNotice'

/**
 * „Hinweis zur Nutzung" (release-relevant). Einmaliger Hinweis beim ersten Start,
 * danach erneut über Einstellungen → Info & Hilfe aufrufbar. z-40 (unter dem
 * build-gebundenen Haftungs-Gate z-50), damit beide beim allerersten Start sauber
 * nacheinander bestätigt werden. Reiner Copy-Inhalt, kein Netz.
 */
const usage = useUsageNotice()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="usage.visible.value"
      class="fixed inset-0 z-40 flex items-center justify-center bg-base-300/80 p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="usage-notice-title"
    >
      <div class="card max-h-full w-full max-w-lg overflow-y-auto bg-base-100 shadow-xl">
        <div class="card-body gap-4 p-6">
          <h2 id="usage-notice-title" class="card-title text-lg">Hinweis zur Nutzung</h2>
          <p class="text-sm leading-relaxed text-base-content/90">
            ResQDocs unterstützt die Einsatzdokumentation. Die App trifft keine medizinischen
            Entscheidungen, stellt keine Diagnosen und ersetzt nicht die fachliche Beurteilung durch
            qualifiziertes Personal. Gescannte oder eingegebene Angaben können fehlerhaft sein — die
            Verantwortung für die Richtigkeit der Dokumentation und für jede medizinische Entscheidung
            liegt beim Anwender. Die Software wird ohne Gewähr bereitgestellt (siehe Lizenz,
            GPL-3.0-or-later).
          </p>
          <p class="text-sm leading-relaxed text-base-content/90">
            Datenschutz: Patientendaten werden nicht dauerhaft gespeichert, bleiben lokal auf dem
            Gerät und werden nicht übertragen (keine Telemetrie). Rohe Scan-/Barcode-Daten und Bilder
            werden nicht gespeichert; ein laufender Einsatzentwurf läuft nach Inaktivität automatisch
            ab. Details: DISCLAIMER.md.
          </p>
          <div class="card-actions justify-end">
            <button class="btn btn-primary btn-sm" type="button" @click="usage.acknowledge()">
              Verstanden
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
