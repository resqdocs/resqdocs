<script setup lang="ts">
/**
 * Vorlagen-Bibliothek im Editor (Slice 3, Redesign librarybar-mobile-redesign).
 * SCHMAL-SCREEN-FIRST: vertikale Liste (eine Zeile pro Vorlage, aktive markiert) statt horizontaler
 * Chips - die Auswahl gehoert nicht hinter Horizontal-Scroll (NN/g). Pro-Vorlage-Aktionen liegen in
 * einem Kebab (⋮) -> Bottom-Sheet (kein Cut-off, grosse Touch-Ziele; Material/GOV.UK: ueberlaufende
 * Button-Zeile ins Menu kollabieren). Import/Export (TemplateIO) sitzt hinter „Daten" (Progressive
 * Disclosure: seltene Utility-Aktion). Bibliotheks-Ops/Persistenz unveraendert; Vorlagenwechsel ueber
 * die Tree-API (selectProtocol), damit selectedId (EditorView) mitgesetzt wird.
 */
import { ref, computed, nextTick, watch } from 'vue'
import { useProtocolTree } from '@resqdocs/protocol-core-ui/useProtocolTree'
import { useTreeEditor } from '@resqdocs/protocol-core-ui/treeEditor'
import { useStorage } from '@/storage/useStorage'
import SaveStatusBadge from './SaveStatusBadge.vue'
import TemplateIO from './TemplateIO.vue'

const tree = useProtocolTree()
const editor = useTreeEditor()
const storage = useStorage()
const protocols = tree.protocols
const editorActiveId = tree.editorActiveId

const active = computed(() => protocols.value.find((p) => p.id === editorActiveId.value) ?? protocols.value[0])
const activeTitle = computed(() => (active.value?.title && active.value.title.trim()) || active.value?.id || '')
const activeIndex = computed(() => protocols.value.findIndex((p) => p.id === active.value?.id))
const isFirst = computed(() => activeIndex.value <= 0)
const isLast = computed(() => activeIndex.value >= protocols.value.length - 1)

function switchTo(id: string): void {
  if (id !== editorActiveId.value) editor.selectProtocol(id)
}

// --- Inline-Rename (Modus-Feedback: abweichender Hintergrund) ---
const renamingId = ref<string | null>(null)
const draftTitle = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
function setRenameRef(el: unknown): void {
  if (el) renameInput.value = el as HTMLInputElement
}
function startRename(id: string): void {
  renamingId.value = id
  draftTitle.value = protocols.value.find((p) => p.id === id)?.title ?? ''
  void nextTick(() => renameInput.value?.focus())
}
function commitRename(id: string): void {
  if (renamingId.value !== id) return // nach Esc/Wechsel kein blur-Commit
  const t = draftTitle.value.trim()
  if (t) tree.rename(id, t) // leerer Titel -> verwerfen, alter Name bleibt
  renamingId.value = null
}
function cancelRename(): void {
  renamingId.value = null
}
// Vorlagenwechsel (auch extern) beendet ein offenes Rename. Sync, damit onAdd direkt danach
// startRename() setzen kann, ohne dass der Watch es wieder loescht.
watch(editorActiveId, () => {
  renamingId.value = null
}, { flush: 'sync' })

// --- CRUD ---
function onAdd(): void {
  const p = tree.addProtocol('Neue Vorlage')
  editor.selectProtocol(p.id)
  startRename(p.id) // sofort umbenennbar
}
function onDuplicate(): void {
  const copy = tree.duplicate(editorActiveId.value)
  if (copy) editor.selectProtocol(copy.id)
}
const showDelete = ref(false)
function confirmDelete(): void {
  tree.removeProtocol(editorActiveId.value)
  editor.selectProtocol(editorActiveId.value) // auf die neue aktive Wurzel
  // verwaiste Standard-/Last-ids aus den Settings bereinigen (zeigen sonst auf eine geloeschte Vorlage)
  const ids = new Set(protocols.value.map((p) => p.id))
  if (storage.settings.defaultProtocolId && !ids.has(storage.settings.defaultProtocolId)) void storage.saveSettings({ defaultProtocolId: null })
  if (storage.settings.lastSelectedProtocolId && !ids.has(storage.settings.lastSelectedProtocolId)) void storage.saveSettings({ lastSelectedProtocolId: null })
  showDelete.value = false
}

// --- Aktions-Sheet (Kebab) ---
// Variante a: Kebab setzt die Vorlage aktiv -> alle Ops bleiben 1:1 auf editorActiveId.
const sheetOpen = ref(false)
function openSheet(id: string): void {
  switchTo(id)
  sheetOpen.value = true
}
function sheetRename(): void {
  sheetOpen.value = false
  startRename(editorActiveId.value)
}
function sheetDuplicate(): void {
  sheetOpen.value = false
  onDuplicate()
}
// PRO-VORLAGE (wirkt auf DIESE Vorlage): „Teilen" = verschluesselter Link/QR (sichtbares Zeilen-Icon),
// „Als Datei exportieren" = Datei/JSON (Kebab). Beide oeffnen das Daten-Blatt FOKUSSIERT auf ihren
// Abschnitt — sauber getrennt (Teilen zeigt nie Datei-Kram und umgekehrt).
async function rowShare(id: string): Promise<void> {
  switchTo(id) // die getippte Zeile aktiv setzen -> TemplateIO teilt genau diese Vorlage
  dataOpen.value = true
  await nextTick()
  dataIo.value?.openShare()
}
async function sheetExportFile(): Promise<void> {
  sheetOpen.value = false // active ist durch openSheet bereits gesetzt
  dataOpen.value = true
  await nextTick()
  dataIo.value?.openExport()
}
// BIBLIOTHEKS-EBENE (legen eine NEUE Vorlage an -> gehoeren neben „Neue Vorlage", NICHT an eine Zeile):
async function receiveNewTemplate(): Promise<void> {
  dataOpen.value = true
  await nextTick()
  dataIo.value?.openReceive()
}
async function importNewTemplate(): Promise<void> {
  dataOpen.value = true
  await nextTick()
  dataIo.value?.openImportFile()
}
function sheetMove(delta: number): void {
  sheetOpen.value = false
  tree.moveProtocol(editorActiveId.value, delta)
}
function sheetDelete(): void {
  sheetOpen.value = false
  showDelete.value = true
}

// --- Daten-Sheet (Teilen/Empfangen + Datei-Export/Import) ---
const dataOpen = ref(false)
const dataIo = ref<InstanceType<typeof TemplateIO> | null>(null) // fuer die Direkt-Spruenge openShare/openReceive

// --- Liste einklappbar (offen by default); zugeklappt nur aktive Vorlage + Menue ---
const collapsed = ref(false)
</script>

<template>
  <div class="flex flex-col gap-2 rounded-lg border border-base-300 bg-base-100 p-2">
    <!-- Kopf: Collapse-Toggle (zugeklappt = aktive Vorlage) + Mehr-Menue (⋮) + Save-Status -->
    <div class="flex items-center justify-between gap-2">
      <button type="button" class="flex min-h-9 items-center gap-1 truncate text-left text-sm font-semibold text-base-content/70" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
        <span aria-hidden="true">{{ collapsed ? '▸' : '▾' }}</span>
        <span v-if="collapsed" class="truncate">{{ activeTitle }}</span>
        <span v-else>Vorlagen</span>
      </button>
      <div class="flex shrink-0 items-center gap-2">
        <SaveStatusBadge />
      </div>
    </div>

    <!-- vertikale Vorlagen-Liste: eine Zeile pro Vorlage (einklappbar) -->
    <ul v-if="!collapsed" class="flex flex-col gap-1">
      <li v-for="p in protocols" :key="p.id">
        <!-- Rename-Modus: input ersetzt die Zeile -->
        <form v-if="renamingId === p.id" class="join w-full" @submit.prevent="commitRename(p.id)">
          <input :ref="setRenameRef" v-model="draftTitle" class="input input-sm join-item flex-1 bg-warning/10" aria-label="Vorlage umbenennen" @keyup.esc="cancelRename" @blur="commitRename(p.id)" />
          <button type="submit" class="btn btn-sm btn-primary join-item">OK</button>
        </form>
        <!-- normale Zeile: ganze Flaeche auswaehlen + Kebab -->
        <div v-else class="flex items-center gap-1">
          <button
            type="button"
            class="flex min-h-11 flex-1 items-center gap-2 rounded-lg px-3 text-left text-sm"
            :class="p.id === editorActiveId ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-base-200'"
            :aria-current="p.id === editorActiveId ? 'true' : undefined"
            @click="switchTo(p.id)"
          >
            <span v-if="p.id === editorActiveId" aria-hidden="true">✓</span>
            <span class="truncate">{{ (p.title && p.title.trim()) || p.id }}</span>
          </button>
          <button type="button" class="btn btn-ghost btn-sm min-h-11 w-11 px-0" :aria-label="`${(p.title && p.title.trim()) || p.id} teilen (Link und QR)`" title="Teilen (Link & QR)" @click="rowShare(p.id)">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
          </button>
          <button type="button" class="btn btn-ghost btn-sm min-h-11 w-11 px-0 text-lg leading-none" :aria-label="`Aktionen für ${(p.title && p.title.trim()) || p.id}`" @click="openSheet(p.id)">⋮</button>
        </div>
      </li>
      <!-- Drei Entstehungswege einer NEUEN Vorlage (Bibliotheks-Ebene): leer · per verschluesseltem
           Link/QR empfangen · aus Datei importieren -->
      <li>
        <button type="button" class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-primary hover:bg-base-200" @click="onAdd">＋ Neue Vorlage</button>
      </li>
      <li>
        <button type="button" class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-primary hover:bg-base-200" @click="receiveNewTemplate">↓ Empfangen (Link & QR)</button>
      </li>
      <li>
        <button type="button" class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-primary hover:bg-base-200" @click="importNewTemplate">⭳ Aus Datei importieren…</button>
      </li>
    </ul>

    <!-- Aktions-Sheet fuer die aktive Vorlage -->
    <div class="modal modal-bottom" :class="{ 'modal-open': sheetOpen }" role="dialog" aria-modal="true">
      <div class="modal-box">
        <h3 class="truncate text-sm font-semibold">{{ activeTitle }}</h3>
        <ul class="menu w-full px-0">
          <li><button type="button" class="min-h-12" @click="sheetRename">Umbenennen</button></li>
          <li><button type="button" class="min-h-12" @click="sheetDuplicate">Duplizieren</button></li>
          <li><button type="button" class="min-h-12" @click="sheetExportFile">Als Datei exportieren…</button></li>
          <li><button type="button" class="min-h-12" :disabled="isFirst" @click="sheetMove(-1)">Nach oben</button></li>
          <li><button type="button" class="min-h-12" :disabled="isLast" @click="sheetMove(1)">Nach unten</button></li>
          <li><button type="button" class="min-h-12 text-error" :disabled="protocols.length <= 1" @click="sheetDelete">Löschen</button></li>
        </ul>
        <button type="button" class="btn btn-ghost btn-block" @click="sheetOpen = false">Schließen</button>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Schließen" @click="sheetOpen = false"></button>
    </div>

    <!-- Daten-Sheet: Export/Import (seltene Utility-Aktion, 1 Tap entfernt) -->
    <div class="modal modal-bottom" :class="{ 'modal-open': dataOpen }" role="dialog" aria-modal="true">
      <div class="modal-box">
        <h3 class="text-sm font-semibold">Daten</h3>
        <p class="pb-2 text-xs text-base-content/60"><b>Teilen/Empfangen</b> = verschlüsselter Link/QR. <b>Export/Import</b> = Datei/JSON.</p>
        <TemplateIO ref="dataIo" />
        <button type="button" class="btn btn-ghost btn-block mt-2" @click="dataOpen = false">Schließen</button>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Schließen" @click="dataOpen = false"></button>
    </div>

    <!-- Loesch-Bestaetigung (einzige Aktion mit ernsten Folgen) -->
    <div class="modal" :class="{ 'modal-open': showDelete }" role="dialog" aria-modal="true">
      <div class="modal-box">
        <h3 class="text-base font-semibold">Vorlage löschen?</h3>
        <p class="py-3 text-sm">Die Vorlage <strong>{{ activeTitle }}</strong> wird gelöscht. Das lässt sich nicht rückgängig machen.</p>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost btn-sm" @click="showDelete = false">Abbrechen</button>
          <button type="button" class="btn btn-error btn-sm" @click="confirmDelete">Vorlage löschen</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="showDelete = false"></button>
    </div>
  </div>
</template>
