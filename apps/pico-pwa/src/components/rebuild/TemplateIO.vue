<script setup lang="ts">
/**
 * Vorlage exportieren/importieren (versioniertes JSON). „Fuer den Moment" nur die aktuelle
 * Vorlage (Mehrfach-Verwaltung folgt). Serialisierung/Validierung liegt rein + node-getestet in
 * rebuild/templateIO.ts. Import ersetzt den geteilten Baum -> sofort in Editor UND Einsatz.
 */
import { ref, computed } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { useProtocolTree } from '@/rebuild/useProtocolTree'
import { useTreeEditor } from '@/rebuild/treeEditor'
import { exportTemplate, parseTemplate } from '@resqdocs/protocol-core/templateIO'

const tree = useProtocolTree()
const { root } = tree
const editor = useTreeEditor()

const mode = ref<'closed' | 'export' | 'import'>('closed')
const importText = ref('')
const msg = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)
const copied = ref(false)

const exportJson = computed(() => exportTemplate(root.value))

function toggle(m: 'export' | 'import'): void {
  mode.value = mode.value === m ? 'closed' : m
  msg.value = null
}

async function copyExport(): Promise<void> {
  try {
    await navigator.clipboard.writeText(exportJson.value)
    copied.value = true
  } catch {
    copied.value = false
  }
  window.setTimeout(() => (copied.value = false), 2000)
}

function downloadExport(): void {
  const name = (root.value.title || root.value.id || 'vorlage').replace(/[^a-z0-9_-]+/gi, '-')
  const blob = new Blob([exportJson.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `protokoll-${name}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const pendingImport = ref<Container | null>(null)

function finishImport(added: Container): void {
  editor.selectProtocol(added.id)
  msg.value = { kind: 'ok', text: 'Vorlage importiert.' }
  importText.value = ''
  mode.value = 'closed'
}
function load(text: string): void {
  const r = parseTemplate(text)
  if (!r.ok) {
    msg.value = { kind: 'err', text: r.error }
    return
  }
  // Kennungs-Kollision -> fragen (ueberschreiben / als neue importieren); sonst direkt als neue.
  if (tree.protocolExists(r.tree.id)) {
    pendingImport.value = r.tree
    return
  }
  finishImport(tree.importProtocol(r.tree))
}
function doOverwrite(): void {
  if (pendingImport.value) finishImport(tree.overwriteProtocol(pendingImport.value))
  pendingImport.value = null
}
function doRename(): void {
  if (pendingImport.value) finishImport(tree.importProtocol(pendingImport.value, true))
  pendingImport.value = null
}
function cancelImport(): void {
  pendingImport.value = null
}

function onFile(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => load(String(reader.result ?? ''))
  reader.readAsText(file)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap justify-center gap-2">
      <button class="btn btn-sm" type="button" :class="mode === 'export' ? 'btn-primary' : ''" @click="toggle('export')">Exportieren</button>
      <button class="btn btn-sm" type="button" :class="mode === 'import' ? 'btn-primary' : ''" @click="toggle('import')">Importieren</button>
    </div>

    <div v-if="mode === 'export'" class="flex flex-col gap-2 rounded-lg border border-base-300 p-3">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-semibold text-base-content/60">Aktuelle Vorlage als JSON</span>
        <div class="flex gap-1">
          <button class="btn btn-ghost btn-xs" type="button" @click="copyExport">{{ copied ? 'Kopiert' : 'Kopieren' }}</button>
          <button class="btn btn-ghost btn-xs" type="button" @click="downloadExport">Datei</button>
        </div>
      </div>
      <pre class="max-h-60 overflow-auto rounded bg-base-200 p-2 text-xs"><code>{{ exportJson }}</code></pre>
    </div>

    <div v-if="mode === 'import'" class="flex flex-col gap-2 rounded-lg border border-base-300 p-3">
      <span class="text-xs font-semibold text-base-content/60">JSON einfügen oder Datei wählen</span>
      <textarea v-model="importText" rows="5" class="textarea textarea-bordered w-full text-xs" placeholder='{"schema":"resqdocs-protocol","version":1,"tree":{ ... }}'></textarea>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn btn-primary btn-sm" type="button" :disabled="!importText.trim()" @click="load(importText)">Laden</button>
        <input type="file" accept="application/json,.json" class="file-input file-input-sm" @change="onFile" />
      </div>
      <p class="text-xs text-base-content/50">Wird als neue Vorlage importiert — bei gleicher Kennung wird gefragt.</p>
    </div>

    <p v-if="msg" class="text-xs" :class="msg.kind === 'ok' ? 'text-success' : 'text-error'">{{ msg.text }}</p>

    <!-- Kollision: Vorlage mit gleicher Kennung existiert -> ueberschreiben oder als neue importieren -->
    <div class="modal" :class="{ 'modal-open': pendingImport !== null }" role="dialog" aria-modal="true">
      <div class="modal-box">
        <h3 class="text-base font-semibold">Vorlage existiert bereits</h3>
        <p class="py-3 text-sm">Es gibt schon eine Vorlage mit der Kennung <strong>{{ pendingImport?.id }}</strong>. Überschreiben oder als neue Vorlage importieren?</p>
        <div class="modal-action flex-wrap">
          <button type="button" class="btn btn-ghost btn-sm" @click="cancelImport">Abbrechen</button>
          <button type="button" class="btn btn-sm" @click="doRename">Als neue importieren</button>
          <button type="button" class="btn btn-error btn-sm" @click="doOverwrite">Überschreiben</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="cancelImport"></button>
    </div>
  </div>
</template>
