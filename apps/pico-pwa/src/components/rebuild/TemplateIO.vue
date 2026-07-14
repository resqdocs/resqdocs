<script setup lang="ts">
/**
 * Vorlage exportieren/importieren (versioniertes JSON). Export mit Auswahl (Select, Default = aktive
 * Vorlage, folgt ihr bis zur manuellen Umstellung); der Pro-Vorlage-Export im Bibliotheks-Kebab teilt
 * sich die Share-Logik via useTemplateExport. Serialisierung/Validierung liegt rein + node-getestet in
 * rebuild/templateIO.ts. Import ergaenzt/ersetzt im geteilten Baum -> sofort in Editor UND Einsatz.
 */
import { ref, computed, watch } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { useProtocolTree } from '@resqdocs/protocol-core-ui/useProtocolTree'
import { useTreeEditor } from '@resqdocs/protocol-core-ui/treeEditor'
import { exportTemplate } from '@resqdocs/protocol-core/templateIO'
import { detectAndParse, kindNoun } from '@resqdocs/protocol-core/importRouter'
import { routeDetected } from '@/composables/useImportRouting'
import { useTemplateExport } from '@/composables/useTemplateExport'
import { useAppVersion } from '@/composables/useAppVersion'

const tree = useProtocolTree()
const { root } = tree
const protocols = tree.protocols
const editor = useTreeEditor()
// ?v=<echte App-Version> mitgeben -> die KI-Seite stempelt sie in den Prompt (Versions-Check ohne Rueckfrage).
const { version: appVersion } = useAppVersion()
const aiUrl = computed(() => `https://ai.resqdocs.app?v=${encodeURIComponent(appVersion.value)}`)

const mode = ref<'closed' | 'export' | 'import'>('closed')
const importText = ref('')
const msg = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)
const copied = ref(false)
const { sharing, shareTemplate } = useTemplateExport()

// Export-Auswahl (B): welche Vorlage? Default = die aktive und folgt ihr, bis manuell umgestellt.
const selectedId = ref(root.value.id)
watch(() => root.value.id, (id) => { selectedId.value = id })
const selectedTemplate = computed<Container>(() => protocols.value.find((p) => p.id === selectedId.value) ?? root.value)
const exportJson = computed(() => exportTemplate(selectedTemplate.value))

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

async function downloadExport(): Promise<void> {
  const res = await shareTemplate(selectedTemplate.value)
  if (!res.ok && res.error) msg.value = { kind: 'err', text: 'Export fehlgeschlagen: ' + res.error }
}

const pendingImport = ref<Container | null>(null)

function finishImport(added: Container): void {
  editor.selectProtocol(added.id)
  msg.value = { kind: 'ok', text: 'Vorlage importiert.' }
  importText.value = ''
  mode.value = 'closed'
}
async function load(text: string): Promise<void> {
  // Schema-erkennend: eine hier eingeworfene Baustein-/Snippet-Datei landet trotzdem am richtigen Ort.
  const r = detectAndParse(text)
  if (!r.ok) {
    msg.value = { kind: 'err', text: (r.kind ? `${kindNoun(r.kind)} erkannt, aber ` : '') + r.error }
    return
  }
  if (r.kind === 'protocol') {
    // Vorlage: Kennungs-Kollision -> fragen (ueberschreiben / als neue); sonst direkt als neue.
    if (tree.protocolExists(r.tree.id)) {
      pendingImport.value = r.tree
      return
    }
    finishImport(tree.importProtocol(r.tree))
    return
  }
  // Baustein/Snippet: zentral ans richtige Ziel (landet in der Bausteine-Bibliothek).
  const outcome = await routeDetected(r)
  msg.value = { kind: outcome.ok ? 'ok' : 'err', text: outcome.message }
  if (outcome.ok) {
    importText.value = ''
    mode.value = 'closed'
  }
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
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-base-content/60">Welche Vorlage exportieren?</span>
        <select v-model="selectedId" class="select select-sm w-full" aria-label="Vorlage zum Exportieren wählen">
          <option v-for="p in protocols" :key="p.id" :value="p.id">{{ (p.title && p.title.trim()) || p.id }}</option>
        </select>
      </label>
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-semibold text-base-content/60">Als JSON</span>
        <div class="flex gap-1">
          <button class="btn btn-ghost btn-xs" type="button" @click="copyExport">{{ copied ? 'Kopiert' : 'Kopieren' }}</button>
          <button class="btn btn-ghost btn-xs" type="button" :disabled="sharing" @click="downloadExport">Teilen</button>
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
      <!-- Erfolgskette rueckwaerts (#261): Vorlagen entstehen auch per eigenem LLM auf ai.resqdocs.app. -->
      <p class="text-xs text-base-content/50">
        Tipp: Auf
        <a :href="aiUrl" target="_blank" rel="noopener" class="link link-primary">ai.resqdocs.app</a>
        erstellst du Vorlagen mit deinem eigenen KI-Assistenten.
      </p>
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
