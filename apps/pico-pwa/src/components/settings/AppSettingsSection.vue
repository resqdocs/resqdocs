<script setup lang="ts">
import { useStorage } from '@/storage/useStorage'

/** App-Einstellungen (Zielgerät, Design, Erscheinung). Über die
 * gekapselte Storage-Schicht — kein Backend-Wissen.
 * Das Überschriftenmuster (#68/#88) wurde hier entfernt; es wird beim
 * Vorlagen-/Protokoll-Rework auf der Vorlagen-Ebene neu verortet. Die
 * gespeicherten Werte + die Renderer-Default-Logik bleiben unberührt. */
const { settings, saveSettings } = useStorage()

/** Stufen-Label fuer die Tippgeschwindigkeit (kleineres delayMs = schneller). */
function typingSpeedLabel(ms: number): string {
  if (ms <= 30) return 'Schnell'
  if (ms <= 90) return 'Normal'
  return 'Langsam'
}
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
          <span class="text-xs text-base-content/60">{{ typingSpeedLabel(settings.typingDelayMs) }} · {{ settings.typingDelayMs }} ms</span>
        </div>
        <input
          v-model.number="settings.typingDelayMs"
          type="range"
          min="20"
          max="70"
          step="10"
          class="range range-sm w-full"
          aria-label="Tippgeschwindigkeit der Bridge in Millisekunden pro Zeichen"
          @change="saveSettings()"
        />
        <div class="mt-1 flex justify-between text-xs text-base-content/60">
          <span>Schnell</span>
          <span>Langsam</span>
        </div>
      </fieldset>

      <p class="text-xs text-base-content/60">Einstellungen werden lokal gespeichert (keine Cloud).</p>
    </div>
  </section>
</template>
