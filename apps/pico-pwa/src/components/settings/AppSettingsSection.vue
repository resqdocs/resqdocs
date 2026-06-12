<script setup lang="ts">
import { computed } from 'vue'
import { useStorage } from '@/storage/useStorage'

/** App-Einstellungen (OS, Design, Theme, Überschriftenmuster). Über die
 * gekapselte Storage-Schicht — kein Backend-Wissen. */
const { settings, saveSettings } = useStorage()

/** Live-Vorschau der Block-Kopfzeile (#68/#88). */
const headingPreview = computed(() => {
  const pattern = settings.headingPattern.includes('{titel}') ? settings.headingPattern : '# {titel} '
  const prefix = pattern.replaceAll('{titel}', 'Anamnese')
  if (!settings.headingFill) return prefix.trimEnd()
  return prefix + settings.headingFill.repeat(Math.max(3, settings.headingWidth - prefix.length))
})
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <h3 class="font-medium">App-Einstellungen</h3>

      <label class="form-control">
        <span class="label-text mb-1">Standard-Zielgerät (OS)</span>
        <select v-model="settings.defaultOs" class="select select-bordered select-sm w-full max-w-xs" @change="saveSettings()">
          <option value="win_de">NIDA (win_de)</option>
          <option value="mac_de">macOS</option>
          <option value="ios">iPad (ios)</option>
        </select>
      </label>
      <label class="form-control">
        <span class="label-text mb-1">Design</span>
        <select v-model="settings.themeFamily" class="select select-bordered select-sm w-full max-w-xs" @change="saveSettings()">
          <option value="classic">Klassisch</option>
          <option value="resqdocs">ResQDocs</option>
        </select>
      </label>
      <label class="form-control">
        <span class="label-text mb-1">Erscheinung</span>
        <select v-model="settings.theme" class="select select-bordered select-sm w-full max-w-xs" @change="saveSettings()">
          <option value="system">System</option>
          <option value="light">Hell</option>
          <option value="dark">Dunkel</option>
        </select>
      </label>

      <!-- Überschriftenmuster der Ausgabe (#68); Layout-Politur #88 -->
      <div class="divider my-1 text-xs text-base-content/50">Überschriftenmuster (getippte Ausgabe)</div>
      <label class="form-control">
        <span class="label-text mb-1">Muster (<code>{titel}</code> = Blocktitel)</span>
        <input
          v-model="settings.headingPattern"
          class="input input-bordered input-sm w-full max-w-xs font-mono"
          @change="saveSettings()"
        />
      </label>
      <!-- Untereinander, Label jeweils oben (#88-Nachschliff): daisyUI 5
           stapelt form-control nicht mehr selbst -> explizit flex-col. -->
      <label class="form-control flex flex-col items-start gap-1">
        <span class="label-text">Füllzeichen</span>
        <input
          v-model="settings.headingFill"
          maxlength="1"
          placeholder="aus"
          class="input input-bordered input-sm w-24 font-mono"
          @change="saveSettings()"
        />
      </label>
      <label class="form-control flex flex-col items-start gap-1">
        <span class="label-text">Breite</span>
        <input
          v-model.number="settings.headingWidth"
          type="number"
          min="10"
          max="200"
          class="input input-bordered input-sm w-24"
          @change="saveSettings()"
        />
      </label>
      <div class="form-control">
        <span class="label-text mb-1 text-xs text-base-content/60">Vorschau</span>
        <pre class="overflow-x-auto rounded bg-base-200 px-2 py-1 text-xs"><code>{{ headingPreview }}</code></pre>
      </div>

      <p class="text-xs text-base-content/60">Einstellungen werden lokal gespeichert (keine Cloud).</p>
    </div>
  </section>
</template>
