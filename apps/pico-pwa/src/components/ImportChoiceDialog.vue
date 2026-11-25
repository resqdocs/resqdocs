<script setup lang="ts">
/**
 * Import von Vorlagen und Sammlungen (auch mit gespeicherten Abschnitten und Textbausteinen): je Eintrag
 * übernehmen ja/nein, Name frei wählbar, bei Namensgleichheit „Als neue …“ (Standard) oder „Überschreiben“.
 * Erscheint über allen Tabs, sobald eine Import-Stelle etwas abgelegt hat (useImportChoice). Abbrechen übernimmt
 * nichts. Dieselbe Auswahl wie im Online-Editor (ImportCollectionPick). Nach dem Übernehmen schließt das Fenster
 * gleich; das Ergebnis steht ein paar Sekunden als Hinweis über der Tab-Leiste (kein „Fertig“ zum Wegtippen).
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ImportCollectionPick from '@resqdocs/protocol-core-ui/components/ImportCollectionPick.vue'
import TabRef from '@resqdocs/protocol-core-ui/components/TabRef.vue'
import { initialCollectionRows, countTaken, toChoices, toNamedChoices, type CollectionRows } from '@resqdocs/protocol-core-ui/importPick'
import { importBlocksWithChoices, importSnippetsWithChoices, importMessage } from '@resqdocs/protocol-core-ui/importNamed'
import { useProtocolTree } from '@resqdocs/protocol-core-ui/useProtocolTree'
import { useBlockLibrary } from '@resqdocs/protocol-core-ui/useBlockLibrary'
import { useBausteine } from '@/composables/useBausteine'
import { pendingImport, clearImport } from '@/composables/useImportChoice'
import { activeTab } from '@/composables/useActiveTab'
import { importOrt, type ImportZiel } from './importNote'
import { importNotice } from '@resqdocs/protocol-core/templateNeeds'
import { FUNCTION_KINDS } from '@resqdocs/protocol-core/functions/registry'
import { useAppVersion } from '@/composables/useAppVersion'

const tree = useProtocolTree()
const blockLib = useBlockLibrary()
const bausteine = useBausteine()
const leer: CollectionRows = { trees: [], blocks: [], snippets: [] }
const rows = ref<CollectionRows>(leer)
// Ergebnis nach dem Übernehmen: verschwindet von selbst, Antippen schließt es früher.
/** Ergebnis-Hinweis: Text und wo das Übernommene liegt (Tab-Verweis mit Icon). */
const note = ref<{ text: string; where: ImportZiel } | null>(null)
// Der Ortshinweis nennt nur Tabs, in denen man gerade nicht ist.
const ort = computed(() => (note.value ? importOrt(note.value.where, activeTab.value) : 'keiner'))
let noteTimer: number | undefined
function showNote(text: string, where: ImportZiel): void {
  window.clearTimeout(noteTimer)
  note.value = { text, where }
  // Lesezeit nach Länge: 4 bis 10 Sekunden.
  noteTimer = window.setTimeout(() => (note.value = null), Math.min(10_000, Math.max(4000, text.length * 60)))
}
function hideNote(): void {
  window.clearTimeout(noteTimer)
  note.value = null
}
onBeforeUnmount(() => window.clearTimeout(noteTimer))
const busy = ref(false)
const existing = computed(() => ({
  trees: tree.protocols.value.map((p) => p.title ?? ''),
  blocks: blockLib.blocks.value.map((b) => b.title ?? ''),
  snippets: bausteine.snippets.value.map((s) => s.title ?? ''),
}))
const taken = computed(() => countTaken(rows.value))
// Nutzt die Vorlage etwas, das diese App-Version nicht kennt, steht das über der Auswahl. Übernehmen bleibt möglich.
const { version: appVersion } = useAppVersion()
const versionNotice = computed(() => {
  const p = pendingImport.value
  return p ? importNotice({ appVersion: appVersion.value, needs: p.needs, roots: [...p.trees, ...p.blocks], knownKinds: FUNCTION_KINDS }) : null
})
const nurVorlagen = computed(() => !!pendingImport.value && !pendingImport.value.blocks.length && !pendingImport.value.snippets.length)
const titel = computed(() => {
  const p = pendingImport.value
  if (!p) return ''
  if (nurVorlagen.value) return p.trees.length === 1 ? 'Vorlage übernehmen' : 'Vorlagen übernehmen'
  return p.trees.length + p.blocks.length + p.snippets.length === 1 ? 'Übernehmen' : 'Sammlung übernehmen'
})
const knopf = computed(() => {
  const n = taken.value.total
  if (nurVorlagen.value) return n === 0 ? 'Vorlagen wählen' : n === 1 ? '1 Vorlage übernehmen' : `${n} Vorlagen übernehmen`
  return n === 0 ? 'Auswählen' : n === 1 ? '1 Eintrag übernehmen' : `${n} Einträge übernehmen`
})

watch(pendingImport, (p) => {
  rows.value = p ? initialCollectionRows(p) : leer
  if (p) hideNote()
  // Für die Namensprüfung die Bibliotheken laden (der Import kann aus einem anderen Tab kommen).
  if (p?.blocks.length && !blockLib.loaded.value) void blockLib.reload().catch(() => {})
  if (p?.snippets.length && !bausteine.loaded.value) void bausteine.reload().catch(() => {})
}, { immediate: true })

async function take(): Promise<void> {
  const p = pendingImport.value
  if (!p || !taken.value.total || busy.value) return
  busy.value = true
  try {
    const t = tree.importWithChoices(toChoices(p.trees, rows.value.trees))
    const blocks = p.blocks.length ? await importBlocksWithChoices(toNamedChoices(p.blocks, rows.value.blocks), blockLib) : null
    const snippets = p.snippets.length
      ? await importSnippetsWithChoices(toNamedChoices(p.snippets, rows.value.snippets), {
          existing: () => bausteine.snippets.value,
          add: (title, text) => bausteine.addSnippetFrom(title, text, { strict: true }),
          update: (id, patch) => bausteine.updateSnippet(id, patch, { strict: true }),
        })
      : null
    // Konnte etwas nicht gespeichert werden, bleibt ein „1× lesen“-Link gültig (onCancel gibt ihn frei).
    if (blocks?.failed.length || snippets?.failed.length) p.onCancel?.()
    else p.onDone?.(t.added)
    const wo = !p.blocks.length && !p.snippets.length ? 'vorlagen' : !p.trees.length ? 'bausteine' : 'beide'
    const text = importMessage({ trees: t.added.length, treesOverwritten: t.overwritten, treesRenamed: t.renamed, blocks, snippets })
    clearImport()
    showNote(text, wo)
  } finally {
    busy.value = false
  }
}
function close(): void {
  const p = pendingImport.value
  clearImport()
  p?.onCancel?.()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="pendingImport" class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" :aria-label="titel" data-import-choice>
      <div class="modal-box flex max-h-[90vh] flex-col space-y-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h3 class="text-base font-semibold">{{ titel }}</h3>
        <p v-if="pendingImport.hint" class="text-sm text-warning" data-import-hint>{{ pendingImport.hint }}</p>
        <p v-if="versionNotice" class="text-sm text-warning" data-import-version-notice>{{ versionNotice }}</p>
        <ImportCollectionPick v-model:rows="rows" :content="pendingImport" :existing="existing" />
        <div class="modal-action mt-0">
          <button type="button" class="btn btn-ghost btn-sm min-h-11" data-back-close @click="close">Abbrechen</button>
          <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="!taken.total || busy" data-import-take @click="take">{{ knopf }}</button>
        </div>
      </div>
    </div>
    <!-- Ergebnis: über der Tab-Leiste, Live-Region steht immer im DOM, damit Screenreader die Meldung vorlesen. -->
    <div class="pointer-events-none fixed inset-x-0 z-[1000] flex justify-center px-4" style="bottom: calc(4.5rem + env(safe-area-inset-bottom))" role="status" aria-live="polite">
      <button v-if="note" type="button" class="pointer-events-auto max-w-md rounded-box border border-base-300 bg-base-100 px-4 py-3 text-left text-sm shadow-lg" data-import-note @click="hideNote">
        {{ note.text }}
        <template v-if="ort === 'vorlagen'">Du findest sie in <TabRef tab="vorlagen" />.</template>
        <template v-else-if="ort === 'bausteine'">Du findest sie in <TabRef tab="bausteine" />.</template>
        <template v-else-if="ort === 'nurVorlagen'">Vorlagen findest du in <TabRef tab="vorlagen" />.</template>
        <template v-else-if="ort === 'nurBausteine'">Gespeicherte Abschnitte und Textbausteine findest du in <TabRef tab="bausteine" />.</template>
        <template v-else-if="ort === 'beide'">Vorlagen findest du in <TabRef tab="vorlagen" />, gespeicherte Abschnitte und Textbausteine in <TabRef tab="bausteine" />.</template>
      </button>
    </div>
  </Teleport>
</template>
