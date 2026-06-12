<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFirmwareNotice } from '@/pico/useFirmwareNotice'
import { useFirmwareUpdate } from '@/pico/useFirmwareUpdate'

/**
 * Globaler Update-Hinweis (#134): erscheint unter dem Header auf allen Tabs,
 * sobald ein Bridge-Kontakt eine veraltete Firmware gemeldet hat. "Jetzt
 * aktualisieren" fuehrt das OTA-Update direkt hier aus (gleicher Flow wie in
 * den Einstellungen, useFirmwareUpdate); "Spaeter" blendet den Hinweis fuer
 * die laufende Sitzung aus. KEINE HTTP-Logik hier (nur Composables).
 */
const notice = useFirmwareNotice()
const fw = useFirmwareUpdate()

const resultMsg = ref<string | null>(null)
const done = ref(false)

const phaseText = computed(() => {
  switch (fw.phase.value) {
    case 'uploading': return `Übertrage Firmware ... ${Math.round(fw.progress.value * 100)} %`
    case 'verifying': return 'Bridge verifiziert Signatur ...'
    case 'rebooting': return 'Bridge startet neu - bitte warten ...'
    default: return null
  }
})

async function onUpdate(): Promise<void> {
  resultMsg.value = null
  const r = await fw.start()
  if (r.ok) {
    done.value = true
    resultMsg.value = `Update erfolgreich - Bridge läuft jetzt mit ${fw.manifest?.version}.`
    // Hinweis-Zustand aktualisieren: Bridge meldet jetzt die gebündelte Version.
    if (fw.manifest) notice.reportStatus({
      name: '', apiVersion: '', ready: true, defaultOs: '',
      fwVersion: fw.manifest.version, otaSupported: true,
    })
  } else {
    resultMsg.value = `Update fehlgeschlagen: ${r.error ?? ''} Die Bridge behält bei Verifikationsfehlern die alte Firmware.`
  }
}
</script>

<template>
  <div v-if="notice.visible.value || done" class="mx-auto w-full max-w-xl px-4 pt-4 md:max-w-3xl md:px-6 xl:max-w-5xl">
    <div class="alert items-start text-sm" :class="done ? 'alert-success' : 'alert-info'" role="status">
      <div class="flex w-full flex-col gap-2">
        <template v-if="!done">
          <span>
            <strong>Firmware-Update für die Bridge verfügbar:</strong>
            {{ notice.bridgeVersion.value }} → {{ notice.manifest?.version }}.
          </span>

          <template v-if="fw.running.value">
            <progress class="progress progress-primary w-full" :value="fw.progress.value" max="1" />
            <span class="text-xs">{{ phaseText }} Strom-/USB-Verbindung der Bridge nicht trennen.</span>
          </template>

          <div v-else class="flex flex-wrap items-center gap-2">
            <button class="btn btn-primary btn-xs" type="button" @click="onUpdate">Jetzt aktualisieren</button>
            <button class="btn btn-ghost btn-xs" type="button" @click="notice.dismiss()">Später</button>
            <span class="text-xs opacity-70">Dauert ~1 Minute; die Bridge startet dabei neu.</span>
          </div>
        </template>

        <span v-if="resultMsg" :class="fw.phase.value === 'error' ? 'text-error' : ''">{{ resultMsg }}</span>
        <div v-if="done" class="flex justify-end">
          <button class="btn btn-ghost btn-xs" type="button" @click="done = false">OK</button>
        </div>
      </div>
    </div>
  </div>
</template>
