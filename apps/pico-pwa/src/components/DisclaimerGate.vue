<script setup lang="ts">
import { useDisclaimer } from '@/composables/useDisclaimer'

/**
 * Haftungsausschluss-Overlay. Blockt die App, bis der Hinweis bestätigt wurde —
 * beim ersten Öffnen und nach jedem Update (Logik in useDisclaimer). Nicht per
 * Hintergrund-Tippen schließbar; nur der Bestätigen-Button beendet das Gate.
 */
const { ready, needsAck, acknowledge } = useDisclaimer()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="ready && needsAck"
      class="overlay-backdrop--strong fixed inset-0 z-50 flex items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
    >
      <div class="overlay-surface--strong card max-h-full w-full max-w-lg overflow-y-auto">
        <div class="card-body gap-4 p-6">
          <div class="flex items-center gap-3">
            <img src="/brand.svg" alt="ResQDocs" class="brand-logo brand-logo-light h-8 w-auto" />
            <img src="/brand-dark.svg" alt="ResQDocs" class="brand-logo brand-logo-dark h-8 w-auto" />
          </div>

          <h2 id="disclaimer-title" class="card-title text-lg">Wichtiger Hinweis</h2>

          <div class="flex flex-col gap-3 text-sm leading-relaxed text-base-content/90">
            <p>
              ResQDocs ist ein freies, quelloffenes Projekt (Open Source). Es soll die
              <strong>Dokumentation im Rettungsdienst erleichtern</strong> – als Hilfsmittel,
              nicht als Ersatz für deine eigene fachliche Sorgfalt.
            </p>
            <p>
              Für deine <strong>persönliche Dokumentation bist du selbst vollständig
              verantwortlich</strong>. Prüfe alle Eingaben und Ausgaben eigenverantwortlich auf
              Richtigkeit und Vollständigkeit. Die Nutzung erfolgt auf eigene Verantwortung;
              eine Haftung für Richtigkeit, Eignung oder Folgen der Nutzung wird nicht
              übernommen.
            </p>
            <p class="text-base-content/70">
              Patientendaten werden nicht dauerhaft gespeichert. Dieser Hinweis erscheint beim
              ersten Start und nach jedem Update erneut.
            </p>
          </div>

          <div class="card-actions justify-end">
            <button class="btn btn-primary" type="button" @click="acknowledge">
              Verstanden und einverstanden
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
