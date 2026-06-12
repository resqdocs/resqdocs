<script setup lang="ts">
import { ref } from 'vue'
import { useCreatorSession } from '@/composables/useCreatorSession'
import { shareJson, copyToClipboard, readTextFile } from '@/utils/fileTransfer'

/**
 * Voll-Backup (#108 Teil 2): ALLE eigenen Protokolle in EINE Datei sichern und
 * wieder einlesen — Sicherungsnetz vor App-Neuinstallation/Gerätewechsel.
 * Datei/Clipboard über die fileTransfer-Helfer (Share-Sheet #76); die Session-/
 * Validierungslogik bleibt in useCreatorSession/creatorSession. Nur neutrale
 * Vorlagen, keine Patientendaten. Import ist additiv (überschreibt nichts).
 */
const { exportBackup, importBackup } = useCreatorSession()

const status = ref<{ kind: 'ok' | 'err'; msg: string } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function onExport(): Promise<void> {
  const out = exportBackup()
  if (!out.ok || !out.json || !out.filename) {
    status.value = { kind: 'err', msg: `Backup nicht möglich: ${out.errors.join('; ')}` }
    return
  }
  try {
    await shareJson(out.filename, out.json)
    status.value = { kind: 'ok', msg: `Backup bereit: ${out.filename}` }
  } catch {
    const ok = await copyToClipboard(out.json)
    status.value = ok
      ? { kind: 'ok', msg: 'Teilen nicht möglich — Backup in die Zwischenablage kopiert.' }
      : { kind: 'err', msg: 'Backup-Export fehlgeschlagen.' }
  }
}

function pickFile(): void {
  fileInput.value?.click()
}

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await readTextFile(file)
    const r = importBackup(text)
    status.value = r.ok
      ? {
          kind: 'ok',
          msg: `${r.imported} Protokoll(e) importiert.${r.errors.length ? ` ${r.errors.length} übersprungen.` : ''}`,
        }
      : { kind: 'err', msg: `Import abgelehnt: ${r.errors.join('; ')}` }
  } catch (err) {
    status.value = { kind: 'err', msg: `Datei nicht lesbar: ${(err as Error).message}` }
  } finally {
    input.value = '' // erneuter Import derselben Datei möglich
  }
}
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <h3 class="font-semibold">Voll-Backup (alle Protokolle)</h3>
      <p class="text-xs text-base-content/60">
        Sichert <strong>alle deine Protokolle</strong> in eine einzige Datei (ohne die
        Beispiel-Vorlage) — Sicherungsnetz vor App-Neuinstallation oder Gerätewechsel. Der Import
        fügt hinzu und überschreibt nichts. Nur neutrale Vorlagen, keine Patientendaten.
      </p>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-sm" type="button" @click="onExport">Alle Protokolle exportieren</button>
        <button class="btn btn-primary btn-sm" type="button" @click="pickFile">Backup importieren</button>
        <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="onFile" />
      </div>
      <p v-if="status" class="text-sm" :class="status.kind === 'ok' ? 'text-success' : 'text-error'">
        {{ status.msg }}
      </p>
    </div>
  </section>
</template>
