<script setup lang="ts">
import { computed } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { useAppUpdateNotice } from '@/appUpdate/useAppUpdateNotice'
import { speedFromDelay, delayFromSpeed, typingSpeedLabel, DELAY_MIN_MS, DELAY_MAX_MS, DELAY_STEP_MS } from '@/pico/typingSpeed'
import { hapticsLevelLabel, normalizeHapticsLevel, HAPTICS_LEVEL_MIN, HAPTICS_LEVEL_MAX } from '@/shell/hapticsRules'
import { previewHaptics } from '@/shell/haptics'
import { THIS_DEVICE } from '@/pico/targetDevice'

/** App-Einstellungen (Zielgerät, Design, Erscheinung). Über die
 * gekapselte Storage-Schicht — kein Backend-Wissen.
 * Das Überschriftenmuster wurde hier entfernt; es wird beim
 * Vorlagen-/Protokoll-Rework auf der Vorlagen-Ebene neu verortet. Die
 * gespeicherten Werte + die Renderer-Default-Logik bleiben unberührt. */
const { settings, saveSettings } = useStorage()
const appUpdateNotice = useAppUpdateNotice()

function onAppUpdateCheck(e: Event): void {
  const on = (e.target as HTMLInputElement).checked
  void saveSettings({ appUpdateCheck: on }).then(() => {
    if (on) void appUpdateNotice.maybeCheck()
  })
}

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

/**
 * Regler „Vibration“: an wie vielen Stellen die App eine Rückmeldung gibt (0 Aus, 1 Wenig, 2 Normal, 3 Viel).
 * Beim Loslassen wird gespeichert, und die neue Stufe ist einmal kurz zu spüren (außer bei „Aus“).
 */
const hapticsLevel = computed({
  get: () => normalizeHapticsLevel(settings.hapticsLevel),
  set: (v: number) => {
    settings.hapticsLevel = normalizeHapticsLevel(v)
  },
})
function onHapticsLevel(): void {
  void saveSettings()
  previewHaptics(settings.hapticsLevel)
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
          <!-- Dokumentation auf dem Gerät mit der App: keine Bridge, der Einsatz bietet Kopieren an (pico/targetDevice.ts). -->
          <option :value="THIS_DEVICE">Dieses Gerät</option>
        </select>
      </fieldset>
      <!-- Design: derzeit nur ResQDocs. Das Feld bleibt, weil später weitere Designs dazukommen sollen. -->
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Design</legend>
        <select v-model="settings.themeFamily" class="select select-sm w-full min-h-11" data-design-select @change="saveSettings()">
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
          <span class="text-xs text-base-content/75">{{ typingSpeedLabel(settings.typingDelayMs) }}</span>
        </div>
        <input
          v-model.number="typingSpeed"
          type="range"
          :min="DELAY_MIN_MS"
          :max="DELAY_MAX_MS"
          :step="DELAY_STEP_MS"
          class="range range-sm w-full"
          aria-label="Tippgeschwindigkeit der Bridge — weiter rechts tippt schneller"
          :aria-valuetext="typingSpeedLabel(settings.typingDelayMs)"
          @change="saveSettings()"
        />
        <div class="mt-1 flex justify-between text-xs text-base-content/75">
          <span>Langsam</span>
          <span>Schnell</span>
        </div>
      </fieldset>

      <!-- Haptik: gleiche Bauart wie die Tippgeschwindigkeit. Stufen statt Ein/Aus (hapticsRules.ts). -->
      <fieldset class="fieldset">
        <div class="flex items-center justify-between">
          <legend class="fieldset-legend">Vibration</legend>
          <span class="text-xs text-base-content/75" data-haptics-level-label>{{ hapticsLevelLabel(settings.hapticsLevel) }}</span>
        </div>
        <input
          v-model.number="hapticsLevel"
          type="range"
          :min="HAPTICS_LEVEL_MIN"
          :max="HAPTICS_LEVEL_MAX"
          step="1"
          class="range range-sm w-full"
          aria-label="Vibration als Rückmeldung — weiter rechts an mehr Stellen"
          :aria-valuetext="hapticsLevelLabel(settings.hapticsLevel)"
          data-haptics-level
          @change="onHapticsLevel"
        />
        <div class="mt-1 flex justify-between text-xs text-base-content/75">
          <span>Aus</span>
          <span>Viel</span>
        </div>
      </fieldset>

      <!-- Ein/Aus ist ein Schalter (wie in Sicherung und in den Funktionsfenstern), kein Kästchen. Die ganze Zeile
           ist die Trefferfläche (mindestens 44 px). -->
      <label class="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          class="toggle toggle-primary shrink-0"
          :checked="settings.appUpdateCheck"
          data-app-update-switch
          @change="onAppUpdateCheck"
        />
        <span>
          Auf neue App-Versionen hinweisen
          <span class="block text-xs text-base-content/75">
            Fragt bei jedem Öffnen der App die kleine Versionsangabe von resqdocs.app ab. Dabei werden
            keine Einsatz- oder Gerätedaten übertragen.
          </span>
        </span>
      </label>

      <p class="text-xs text-base-content/75">Einstellungen werden lokal gespeichert (keine Cloud).</p>
    </div>
  </section>
</template>
