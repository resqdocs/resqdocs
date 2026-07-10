<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { exportBlock, parseBlock } from '@resqdocs/protocol-core/blockIO'
import { blockStructureLabel } from '@/rebuild/blockSummary'
import { shareJson, copyToClipboard } from '@/utils/fileTransfer'
import { useBlockLibrary } from '@/rebuild/useBlockLibrary'
import ConfirmDialog from '@/components/rebuild/ConfirmDialog.vue'

/**
 * Blöcke im Bausteine-Menü (Rework Slice 2): wiederverwendbare v1-Container-Teilbäume. Mode-in-place
 * wie Snippets/Medikamente (Wiedererkennung): kompakte Zeile, Antippen öffnet die Karte zum Umbenennen;
 * Fokus raus / Esc / „Fertig" schließt und speichert; Löschen mit Rückfrage (irreversibel). Die STRUKTUR
 * ist hier read-only (Kurzinfo Anzahl Einträge) — angelegt werden Blöcke über „Als Baustein speichern"
 * im Vorlagen-Editor. NUR hier verwaltet; im Editor werden Blöcke nur eingefügt.
 */
const { blocks, addBausteinFromContainer, renameBlock, deleteBlock } = useBlockLibrary()

const editingId = ref<string | null>(null)
const draftTitle = ref('')

const summaryTitle = (b: Container): string => (b.title ?? '').trim() || '(ohne Titel)'

// Autofokus auf das Titel-Input der frisch gemounteten Karte (nextTick-Race vermeiden, wie MedplanFunction).
let focusNext = false
function setEditTitle(el: unknown): void {
  if (el && focusNext) {
    focusNext = false
    ;(el as HTMLInputElement).focus()
  }
}

function openEdit(b: Container): void {
  commitEdit() // die bisher offene Karte zuerst speichern (iOS: ein Button-Tap löst KEIN focusout aus)
  focusNext = true
  editingId.value = b.id
  draftTitle.value = b.title ?? ''
}
function commitEdit(): void {
  const id = editingId.value
  if (id) void renameBlock(id, draftTitle.value)
}
function closeEdit(): void {
  commitEdit()
  editingId.value = null
}
function onFocusOut(e: FocusEvent): void {
  if (pendingDelete.value !== null) return // Rückfrage offen: Karte bleibt offen
  const card = e.currentTarget as HTMLElement
  if (!card.contains(e.relatedTarget as Node | null)) closeEdit()
}

// Löschen mit Rückfrage (irreversibel). pendingDelete = block-id.
const pendingDelete = ref<string | null>(null)
const pendingTitle = computed(() => {
  const t = pendingDelete.value === editingId.value ? draftTitle.value : blocks.value.find((b) => b.id === pendingDelete.value)?.title
  return (t ?? '').trim() || '(ohne Titel)'
})
function confirmDelete(): void {
  const id = pendingDelete.value
  pendingDelete.value = null
  if (id) {
    void deleteBlock(id)
    if (editingId.value === id) editingId.value = null
  }
}

// --- Export/Import als Datei/JSON (eigenes resqdocs-block-Schema; Muster TemplateIO) ---
const importOpen = ref(false)
const importText = ref('')
const ioMsg = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

function toggleImport(): void {
  importOpen.value = !importOpen.value
  ioMsg.value = null
}
async function doImport(text: string): Promise<void> {
  const r = parseBlock(text)
  if (!r.ok) {
    ioMsg.value = { kind: 'err', text: r.error }
    return
  }
  // Als NEUER Block (frische Zufalls-id via addBausteinFromContainer -> keine Kollision); Titel behalten.
  const out = await addBausteinFromContainer(r.tree, (r.tree.title ?? '').trim() || 'Importierter Baustein')
  ioMsg.value = out.ok ? { kind: 'ok', text: `Block „${out.title}“ importiert.` } : { kind: 'err', text: out.error }
  if (out.ok) {
    importText.value = ''
    importOpen.value = false
  }
}
function onImportFile(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => void doImport(String(reader.result ?? ''))
  reader.readAsText(file)
  input.value = '' // dieselbe Datei erneut wählbar
}

// Export je Block (nur in der offenen Karte) — mit dem evtl. noch nicht committeten Draft-Titel.
const copiedId = ref<string | null>(null)
const sharing = ref(false) // Re-Entrancy-Guard: kein zweites Share, solange das System-Sheet offen ist (bug-316)
function blockForExport(b: Container): Container {
  return editingId.value === b.id ? { ...b, title: draftTitle.value.trim() || (b.title ?? '') } : b
}
async function exportCopy(b: Container): Promise<void> {
  const ok = await copyToClipboard(exportBlock(blockForExport(b)))
  if (ok) {
    copiedId.value = b.id
    window.setTimeout(() => {
      if (copiedId.value === b.id) copiedId.value = null
    }, 2000)
  } else {
    ioMsg.value = { kind: 'err', text: 'Kopieren nicht möglich.' }
  }
}
async function exportDownload(b: Container): Promise<void> {
  if (sharing.value) return // Doppeltipp: der 2. Share rejectet sonst mit „in progress" -> falscher Fehler (bug-316)
  sharing.value = true
  const src = blockForExport(b)
  const name = ((src.title ?? '') || src.id || 'baustein').replace(/[^a-z0-9_-]+/gi, '-')
  try {
    // shareJson: nativ Cache-Datei + System-Share-Sheet („In Dateien sichern"/Teilen/AirDrop), Web -> Blob-
    // Download. Der rohe <a download>-Blob funktioniert in der nativen WebView NICHT (bug-315).
    await shareJson(`baustein-${name}.json`, exportBlock(src), 'Baustein exportieren')
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    if (!/cancel|abbruch/i.test(m)) ioMsg.value = { kind: 'err', text: 'Export fehlgeschlagen: ' + m } // Nutzer-Abbruch nicht als Fehler
  } finally {
    sharing.value = false
  }
}
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-2 p-4">
      <div class="flex items-center gap-2">
        <h3 class="font-semibold">Blöcke</h3>
        <span v-if="blocks.length" class="badge badge-neutral badge-sm">{{ blocks.length }}</span>
        <button class="btn btn-ghost btn-xs ml-auto" type="button" :class="importOpen ? 'btn-active' : ''" @click="toggleImport">Importieren</button>
      </div>

      <!-- Import: Block-JSON einfügen oder Datei wählen (eigenes resqdocs-block-Schema, getrennt von Vorlagen) -->
      <div v-if="importOpen" class="flex flex-col gap-2 rounded-lg border border-base-300 p-3">
        <span class="text-xs font-semibold text-base-content/60">Block-JSON einfügen oder Datei wählen</span>
        <textarea v-model="importText" rows="4" class="textarea textarea-bordered w-full text-xs" placeholder='{"schema":"resqdocs-block","version":1,"tree":{ … }}' aria-label="Block-JSON"></textarea>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn btn-primary btn-sm min-h-11" type="button" :disabled="!importText.trim()" @click="doImport(importText)">Laden</button>
          <input type="file" accept="application/json,.json" class="file-input file-input-sm" aria-label="Block-Datei wählen" @change="onImportFile" />
        </div>
        <p class="text-xs text-base-content/50">Wird als neuer Block in die Bibliothek importiert.</p>
      </div>
      <p v-if="ioMsg" class="text-xs" :class="ioMsg.kind === 'ok' ? 'text-success' : 'text-error'">{{ ioMsg.text }}</p>

      <!-- Wide-Screens: Zeilen als Dichte-Grid (2->3->4 Spalten); die offene Edit-Karte spannt col-span-full. -->
      <div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <template v-for="b in blocks" :key="b.id">
        <!-- READ: kompakte Summary-Zeile (Antippen -> umbenennen) -->
        <button
          v-if="editingId !== b.id"
          type="button"
          class="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-left shadow-sm active:bg-base-200"
          :aria-label="`Block ${summaryTitle(b)} — umbenennen`"
          @click="openEdit(b)"
        >
          <span class="min-w-0 flex-1 truncate text-sm">
            <span class="font-medium">{{ summaryTitle(b) }}</span>
            <span class="text-base-content/50"> — {{ blockStructureLabel(b) }}</span>
          </span>
          <span class="shrink-0 text-base-content/40" aria-hidden="true">✎</span>
        </button>

        <!-- EDIT: Karte (Ring + Titel + read-only Struktur-Info + Fertig) -->
        <div
          v-else
          class="col-span-full flex flex-col gap-2 rounded-xl border border-primary/40 bg-base-200 p-3 ring-1 ring-primary/20"
          @focusout="onFocusOut"
          @keydown.esc="closeEdit"
        >
          <div class="flex items-center gap-2">
            <input
              :ref="setEditTitle"
              v-model="draftTitle"
              class="input input-sm flex-1 font-medium"
              placeholder="Titel"
              aria-label="Block-Titel"
            />
            <button type="button" class="btn btn-ghost btn-sm btn-circle min-h-11 min-w-11 text-error" :aria-label="`Block ${draftTitle || 'ohne Titel'} löschen`" @click="pendingDelete = b.id">✕</button>
          </div>
          <p class="px-1 text-xs text-base-content/60">Wiederverwendbarer Block · {{ blockStructureLabel(b) }}</p>
          <div class="flex flex-wrap justify-end gap-2">
            <button type="button" class="btn btn-ghost btn-sm min-h-11" aria-label="Block-JSON kopieren" @click="exportCopy(b)">{{ copiedId === b.id ? 'Kopiert' : 'Kopieren' }}</button>
            <button type="button" class="btn btn-ghost btn-sm min-h-11" aria-label="Block teilen oder als Datei sichern" :disabled="sharing" @click="exportDownload(b)">Teilen</button>
            <button type="button" class="btn btn-primary btn-sm min-h-11" @click="closeEdit">Fertig</button>
          </div>
        </div>
      </template>
      </div>
      <p v-if="!blocks.length" class="px-1 py-1 text-sm text-base-content/60">
        Noch keine Blöcke. Im Vorlagen-Editor einen Container über „Als Baustein speichern" ablegen.
      </p>
    </div>

    <ConfirmDialog
      v-if="pendingDelete"
      :title="`Block „${pendingTitle}“ löschen?`"
      message="Der Block wird aus der Bibliothek entfernt. Bereits eingefügte Kopien bleiben unverändert. Das lässt sich nicht rückgängig machen."
      confirm-label="Löschen"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </section>
</template>
