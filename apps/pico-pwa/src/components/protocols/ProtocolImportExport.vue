<script setup lang="ts">
import { ref } from 'vue'
import { useCreatorSession } from '@/composables/useCreatorSession'
import { shareJson, copyToClipboard, readTextFile } from '@/utils/fileTransfer'

/**
 * Import-/Export-UX (#13-E). Bewusste Nutzeraktionen. Export nur für valide
 * Protokolle (Domain: exportProtocol). Import validiert (parseImport) und landet
 * NUR in der flüchtigen Session — keine Persistenz. Datei/Clipboard via
 * fileTransfer-Helfer; Session-/Validierungslogik bleibt in useCreatorSession.
 */
const { selected, exportSelected, importJson } = useCreatorSession()

const status = ref<{ kind: 'ok' | 'err'; msg: string } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function onExport(): Promise<void> {
  const out = exportSelected()
  if (!out.ok || !out.json || !out.filename) {
    status.value = { kind: 'err', msg: `Export nicht möglich: ${out.errors.join('; ')}` }
    return
  }
  try {
    // Nativ: System-Dialog (in Dateien sichern/teilen); Web: Download (#76).
    await shareJson(out.filename, out.json)
    status.value = { kind: 'ok', msg: `Export bereit: ${out.filename}` }
  } catch {
    const ok = await copyToClipboard(out.json)
    status.value = ok
      ? { kind: 'ok', msg: 'Teilen nicht möglich — JSON in die Zwischenablage kopiert.' }
      : { kind: 'err', msg: 'Export fehlgeschlagen.' }
  }
}

async function onCopy(): Promise<void> {
  const out = exportSelected()
  if (!out.ok || !out.json) {
    status.value = { kind: 'err', msg: `Export nicht möglich: ${out.errors.join('; ')}` }
    return
  }
  const ok = await copyToClipboard(out.json)
  status.value = ok
    ? { kind: 'ok', msg: 'JSON in die Zwischenablage kopiert.' }
    : { kind: 'err', msg: 'Kopieren nicht möglich.' }
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
    const r = importJson(text)
    status.value = r.ok
      ? { kind: 'ok', msg: `Importiert.${r.warnings.length ? ` (${r.warnings.length} Warnung[en])` : ''}` }
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
      <h3 class="font-semibold">Import / Export</h3>
      <p class="text-xs text-base-content/60">
        Import und Export sind für neutrale Protokollvorlagen gedacht. Keine Patientendaten oder
        Einsatzdaten in Protokolldateien speichern. Importe bleiben flüchtig (kein Speichern).
      </p>

      <div class="flex flex-wrap gap-2">
        <button class="btn btn-sm" type="button" :disabled="!selected" @click="onExport">JSON exportieren</button>
        <button class="btn btn-ghost btn-sm" type="button" :disabled="!selected" @click="onCopy">Kopieren</button>
        <button class="btn btn-primary btn-sm" type="button" @click="pickFile">JSON importieren</button>
        <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="onFile" />
      </div>

      <p
        v-if="status"
        class="text-sm"
        :class="status.kind === 'ok' ? 'text-success' : 'text-error'"
      >
        {{ status.msg }}
      </p>
    </div>
  </section>
</template>
