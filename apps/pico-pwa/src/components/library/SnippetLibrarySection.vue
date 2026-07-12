<script setup lang="ts">
import { computed, ref } from 'vue'
import type { LibrarySnippet } from '@/storage/types'
import { useBausteine } from '@/composables/useBausteine'
import ConfirmDialog from '@/components/rebuild/ConfirmDialog.vue'

/**
 * Snippets im Bausteine-Menü. Mode-in-place wie Medikamente/Ärzte (Wiedererkennung): kompakte
 * Summary-Zeile, Antippen öffnet die Edit-Karte (genau EINE offen); Fokus raus / Esc / „Fertig"
 * schließt und speichert. Löschen mit Rückfrage (irreversibel). NUR hier — im Editor werden Snippets
 * nur eingefügt, nicht bearbeitet.
 * Während der Bearbeitung wird ein lokaler Entwurf (draft) gehalten und erst beim Schließen per
 * updateSnippet gespeichert — so setzt kein reload() (async) den Cursor/Wert im offenen Feld zurück.
 */
const { snippets, addSnippet, updateSnippet, deleteSnippet } = useBausteine()

const editingId = ref<string | null>(null)
const draftTitle = ref('')
const draftText = ref('')

// Grosses Textfeld: der Snippet-Text in einem Vollbild-Sheet (Snippets koennen lange Texte sein). expandOpen
// haelt onFocusOut ab, die Karte zu schliessen, solange das Modal offen ist (wie der pendingDelete-Guard).
const expandOpen = ref(false)
const bigTextDialog = ref<HTMLDialogElement | null>(null)
const bigTextArea = ref<HTMLTextAreaElement | null>(null)
function openBigText(): void {
  expandOpen.value = true
  bigTextDialog.value?.showModal()
  requestAnimationFrame(() => bigTextArea.value?.focus()) // Autofokus wie LongTextField
}

// Autofokus auf das Titel-Input der frisch gemounteten Karte (nextTick-Race vermeiden, wie MedplanFunction).
let focusNext = false
function setEditTitle(el: unknown): void {
  if (el && focusNext) {
    focusNext = false
    ;(el as HTMLInputElement).focus()
  }
}

const preview = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, 60)
const summaryTitle = (s: LibrarySnippet): string => s.title.trim() || '(ohne Titel)'

function openEdit(s: LibrarySnippet): void {
  commitEdit() // die bisher offene Karte zuerst speichern (iOS: ein Button-Tap loest KEIN focusout aus)
  editingId.value = s.id
  draftTitle.value = s.title
  draftText.value = s.text
}
function commitEdit(): void {
  const id = editingId.value
  if (id) void updateSnippet(id, { title: draftTitle.value, text: draftText.value })
}
function closeEdit(): void {
  commitEdit()
  editingId.value = null
}
function onFocusOut(e: FocusEvent): void {
  if (pendingDelete.value !== null || expandOpen.value) return // Rückfrage/Groß-Modal offen: Karte bleibt offen
  const card = e.currentTarget as HTMLElement
  if (!card.contains(e.relatedTarget as Node | null)) closeEdit() // Fokus ganz aus der Karte raus
}
const adding = ref(false)
async function addAndEdit(): Promise<void> {
  if (adding.value) return // Doppel-Tap-Schutz: sonst zwei leere „Neues Snippet" (Re-Verify)
  adding.value = true
  try {
    commitEdit() // die bisher offene Karte zuerst speichern (iOS: Button-Tap ohne focusout)
    const id = await addSnippet()
    focusNext = true
    editingId.value = id
    draftTitle.value = 'Neues Snippet'
    draftText.value = ''
  } finally {
    adding.value = false
  }
}

// Löschen mit Rückfrage (irreversibel). pendingDelete = snippet-id.
const pendingDelete = ref<string | null>(null)
// Beim Loeschen aus der offenen Karte den DRAFT-Titel zeigen (nicht den evtl. veralteten Store-Titel),
// damit Dialog-Header und ✕-aria-label konsistent sind (Verify).
const pendingTitle = computed(() => {
  const t = pendingDelete.value === editingId.value ? draftTitle.value : snippets.value.find((s) => s.id === pendingDelete.value)?.title
  return (t ?? '').trim() || '(ohne Titel)'
})
function confirmDelete(): void {
  const id = pendingDelete.value
  pendingDelete.value = null
  if (id) {
    void deleteSnippet(id)
    if (editingId.value === id) editingId.value = null // die offene Karte war das gelöschte Snippet
  }
}
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-2 p-4">
      <div class="flex items-center gap-2">
        <h3 class="font-semibold">Snippets</h3>
        <span v-if="snippets.length" class="badge badge-neutral badge-sm">{{ snippets.length }}</span>
        <button class="btn btn-primary btn-xs ml-auto" type="button" :disabled="adding" @click="addAndEdit"><span aria-hidden="true">＋</span> Snippet</button>
      </div>

      <!-- Wide-Screens: Zeilen als Dichte-Grid (2->3->4 Spalten); die offene Edit-Karte spannt col-span-full. -->
      <div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <template v-for="s in snippets" :key="s.id">
        <!-- READ: kompakte Summary-Zeile (Antippen -> bearbeiten) -->
        <button
          v-if="editingId !== s.id"
          type="button"
          class="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-left shadow-sm active:bg-base-200"
          :aria-expanded="false"
          :aria-label="`Snippet ${summaryTitle(s)} — bearbeiten`"
          @click="openEdit(s)"
        >
          <span class="min-w-0 flex-1 truncate text-sm">
            <span class="font-medium">{{ summaryTitle(s) }}</span>
            <span v-if="s.text.trim()" class="text-base-content/50"> — {{ preview(s.text) }}</span>
          </span>
          <span class="shrink-0 text-base-content/40" aria-hidden="true">✎</span>
        </button>

        <!-- EDIT: Karte (Ring + Titel + Text + Fertig) -->
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
              aria-label="Snippet-Titel"
            />
            <button type="button" class="btn btn-ghost btn-sm btn-circle min-h-11 min-w-11 text-error" :aria-label="`Snippet ${draftTitle || 'ohne Titel'} löschen`" @click="pendingDelete = s.id">✕</button>
          </div>
          <textarea
            v-model="draftText"
            class="textarea textarea-bordered textarea-sm w-full"
            rows="3"
            placeholder="Neutraler Text …"
            aria-label="Snippet-Text"
          />
          <div class="flex justify-end gap-2">
            <button type="button" class="btn btn-ghost btn-sm min-h-11" aria-label="Snippet-Text groß bearbeiten" @click="openBigText"><span aria-hidden="true">⤢</span> Großes Textfeld</button>
            <button type="button" class="btn btn-primary btn-sm min-h-11" @click="closeEdit">Fertig</button>
          </div>
        </div>
      </template>
      </div>
      <p v-if="!snippets.length" class="px-1 py-1 text-sm text-base-content/60">Noch keine Snippets.</p>
    </div>

    <!-- Grosses Textfeld: der Text der OFFENEN Karte (draftText, live) in einem Vollbild-Sheet — Muster wie
         LongTextField (natives <dialog>, top-layer). BEWUSST auf Section-Ebene (EINMAL, ausserhalb des v-for):
         ein Template-Ref im v-for wuerde zum Array (ref_for) und showModal() wuerde werfen (Verify). Speichert
         NICHT selbst; Persistenz laeuft beim Karten-Schliessen (commitEdit); expandOpen haelt onFocusOut ab. -->
    <dialog ref="bigTextDialog" class="modal modal-bottom sm:modal-middle" @close="expandOpen = false">
      <div class="modal-box flex h-[85vh] max-h-none flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
        <h3 class="text-base font-semibold">{{ draftTitle.trim() || 'Snippet' }} — Text</h3>
        <textarea
          ref="bigTextArea"
          v-model="draftText"
          class="textarea textarea-bordered min-h-0 w-full flex-1 text-base leading-relaxed"
          placeholder="Neutraler Text …"
          aria-label="Snippet-Text"
        />
        <div class="flex justify-end">
          <button type="button" class="btn btn-primary btn-sm" @click="bigTextDialog?.close()">Fertig</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button aria-label="Schließen">close</button></form>
    </dialog>

    <ConfirmDialog
      v-if="pendingDelete"
      :title="`Snippet „${pendingTitle}“ löschen?`"
      message="Das Snippet wird aus der Bibliothek entfernt. Bereits eingefügte Kopien bleiben unverändert. Das lässt sich nicht rückgängig machen."
      confirm-label="Löschen"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </section>
</template>
