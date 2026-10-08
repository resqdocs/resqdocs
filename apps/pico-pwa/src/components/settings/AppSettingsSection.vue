<script setup lang="ts">
import { computed } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { speedFromDelay, delayFromSpeed, typingSpeedLabel, DELAY_MIN_MS, DELAY_MAX_MS } from '@/pico/typingSpeed'

/** App-Einstellungen (Zielgerät, Design, Erscheinung). Über die
 * gekapselte Storage-Schicht — kein Backend-Wissen.
 * Das Überschriftenmuster wurde hier entfernt; es wird beim
 * Vorlagen-/Protokoll-Rework auf der Vorlagen-Ebene neu verortet. Die
 * gespeicherten Werte + die Renderer-Default-Logik bleiben unberührt. */
const { settings, saveSettings } = useStorage()

/**
 * Der Regler zeigt GESCHWINDIGKEIT, gespeichert wird die VERZOEGERUNG.
 * Ohne diese Umkehrung machte „nach rechts" langsamer - bei einem Feld namens „Tippgeschwindigkeit".
 * Gespeichert bleibt weiterhin typingDelayMs, weil die Bridge genau das erwartet.
 */
const typingSpeed = computed({
  get: () => speedFromDelay(settings.typingDelayMs),
  set: (v: number) => {
    settings.typingDelayMs = delayFromSpeed(v)
  },
})
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <h3 class="font-medium">App-Einstellungen</h3>

      <fieldset class="fieldset">
        <legend class="fieldset-legend">Standard-Zielgerät (OS)</legend>
        <select v-model="settings.defaultOs" class="select select-sm w-full min-h-11" @change="saveSettings()">
          <option value="win_de">Windows DE (z. B. NIDA)</option>
          <option value="mac_de">macOS</option>
          <option value="ios">iPad (ios)</option>
        </select>
      </fieldset>
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Design</legend>
        <select v-model="settings.themeFamily" class="select select-sm w-full min-h-11" @change="saveSettings()">
          <option value="classic">Klassisch</option>
          <option value="resqdocs">ResQDocs</option>
        </select>
      </fieldset>
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Erscheinung</legend>
        <select v-model="settings.theme" class="select select-sm w-full min-h-11" @change="saveSettings()">
          <option value="system">System</option>
          <option value="light">Hell</option>
          <option value="dark">Dunkel</option>
        </select>
      </fieldset>
      <fieldset class="fieldset">
        <div class="flex items-center justify-between">
          <legend class="fieldset-legend">Tippgeschwindigkeit</legend>
          <span class="text-xs text-base-content/60">{{ typingSpeedLabel(settings.typingDelayMs) }}</span>
        </div>
        <input
          v-model.number="typingSpeed"
          type="range"
          :min="DELAY_MIN_MS"
          :max="DELAY_MAX_MS"
          step="10"
          class="range range-sm w-full"
          aria-label="Tippgeschwindigkeit der Bridge — weiter rechts tippt schneller"
          :aria-valuetext="typingSpeedLabel(settings.typingDelayMs)"
          @change="saveSettings()"
        />
        <div class="mt-1 flex justify-between text-xs text-base-content/60">
          <span>Langsam</span>
          <span>Schnell</span>
        </div>
      </fieldset>

      <p class="text-xs text-base-content/60">Einstellungen werden lokal gespeichert (keine Cloud).</p>
    </div>
  </section>
</template>
