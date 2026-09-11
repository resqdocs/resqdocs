<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { App as CapApp } from '@capacitor/app'
import type { Container } from '@resqdocs/protocol-core/model'
import { exportBlock } from '@resqdocs/protocol-core/blockIO'
import { routeImport } from '@/composables/useImportRouting'
import { blockStructureLabel } from '@resqdocs/protocol-core-ui/blockSummary'
import { shareJson, copyToClipboard } from '@/utils/fileTransfer'
import { useBlockLibrary } from '@resqdocs/protocol-core-ui/useBlockLibrary'
import { useTransferShare } from '@resqdocs/protocol-core-ui/useTransferShare'
import { shouldCloseCard, tapIsPending } from '@resqdocs/protocol-core-ui/cardFocusGuard'
import type { TransferTtl } from '@resqdocs/protocol-core/transferClient'
import QrCode from '@/components/QrCode.vue'
import ConfirmDialog from '@resqdocs/protocol-core-ui/components/ConfirmDialog.vue'

/**
 * Blöcke im Bausteine-Menü (Rework Slice 2): wiederverwendbare v1-Container-Teilbäume. Mode-in-place
 * wie Snippets/Medikamente (Wiedererkennung): kompakte Zeile, Antippen öffnet die Karte zum Umbenennen;
 * Fokus raus / Esc / „Fertig" schließt und speichert; Löschen mit Rückfrage (irreversibel). Die STRUKTUR
 * ist hier read-only (Kurzinfo Anzahl Einträge) — angelegt werden Blöcke über „Als Baustein speichern"
 * im Vorlagen-Editor. NUR hier verwaltet; im Editor werden Blöcke nur eingefügt.
 */
const { blocks, renameBlock, deleteBlock } = useBlockLibrary()

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
  shareOpenId.value = null // Teilen-Panel gehoert zur alten Karte - sonst bleibt es verwaist offen
  shareReset()
  focusNext = true
  editingId.value = b.id
  draftTitle.value = b.title ?? ''
  // nextTick: editCardEl zeigt vor dem Rendern noch auf die ALTE Karte (oder auf null).
  void nextTick(() => scrollIntoViewSoon(editCardEl.value))
}
function commitEdit(): void {
  const id = editingId.value
  if (id) void renameBlock(id, draftTitle.value)
}
function closeEdit(): void {
  commitEdit()
  editingId.value = null
  shareOpenId.value = null
}
// Funktions-Refs, KEINE String-Refs: diese Elemente stehen in einem v-for, und dort setzt Vue eine
// String-Ref auf ein ARRAY (ref_for). Genau daran ist der erste Scroll-Versuch gescheitert - der
// Aufruf lief auf ein Array, scrollIntoView existiert dort nicht, und der Fehler verschwand still im
// requestAnimationFrame. Gleiches Muster wie setEditTitle weiter unten. Es ist immer nur EINE Karte
// offen (v-if/v-else je Zeile), also traegt eine einzelne Referenz.
const editCardEl = ref<HTMLElement | null>(null)
const sharePanelEl = ref<HTMLElement | null>(null)
function setEditCard(el: unknown): void {
  if (el) editCardEl.value = el as HTMLElement
  else if (!el) editCardEl.value = null
}
function setSharePanel(el: unknown): void {
  if (el) sharePanelEl.value = el as HTMLElement
  else if (!el) sharePanelEl.value = null
}

/** Ein frisch aufgeklapptes Element ins Bild holen. „nearest" scrollt nur, wenn noetig, und reisst die
 *  Liste nicht unnoetig herum; den Abstand zu Dock und Header liefert das scroll-margin am Element
 *  selbst (siehe Template) - scrollIntoView kennt weder die feste Dock-Leiste noch den sticky Header
 *  und schiebt sonst bis buendig an den Viewport-Rand, also HINTER das Dock.
 *
 *  Auf iOS verkleinert die Tastatur den sichtbaren Bereich (visualViewport), waehrend das Layout gleich
 *  bleibt - scrollIntoView rechnet aber mit dem Layout-Viewport. Deshalb einmal nachziehen, sobald sich
 *  der sichtbare Bereich nach dem Aufklappen aendert. Einmalig und zeitlich begrenzt, damit spaeteres
 *  eigenes Scrollen des Nutzers nicht ueberschrieben wird.
 *
 *  Instanceof-Pruefung bewusst streng: bei einer String-Ref in einem v-for liefert Vue ein ARRAY, und
 *  der Aufruf schlug dann still im requestAnimationFrame fehl (bekanntes Scroll-Problem). */
function scrollIntoViewSoon(el: unknown): void {
  if (!(el instanceof HTMLElement)) return
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const doScroll = (): void => el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  requestAnimationFrame(() => requestAnimationFrame(doScroll))

  // Nachziehen, wenn die Tastatur den sichtbaren Bereich verkleinert (einmalig, max. 1 s Fenster).
  const vv = window.visualViewport
  if (!vv) return
  let done = false
  const once = (): void => {
    if (done) return
    done = true
    vv.removeEventListener('resize', once)
    requestAnimationFrame(doScroll)
  }
  vv.addEventListener('resize', once)
  window.setTimeout(() => {
    done = true
    vv.removeEventListener('resize', once)
  }, 1000)
}

// Pre-Kill-Flush + Speichern OHNE Schliessen (Muster EinsatzView.vue:157-167).
// Warum noetig: closeEdit ist zugleich der Speicherpfad. Sobald der Waechter das Schliessen
// unterdrueckt (Tap-Stempel, offenes Panel), faellt das Speichern mit aus - und der Fokus liegt danach
// AUSSERHALB der Karte, es kann also gar kein zweites focusout mehr entstehen. Der getippte Text stuende
// dann unbegrenzt nur im Arbeitsspeicher, ausgerechnet nach "Teilen" und "Als Datei", also genau bevor
// der Nutzer die App verlaesst.
function onAppHidden(): void {
  if (document.visibilityState === 'hidden') commitEdit()
}
let appStateListener: { remove: () => void } | undefined
onMounted(() => {
  document.addEventListener('visibilitychange', onAppHidden)
  window.addEventListener('pagehide', commitEdit)
  void CapApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) commitEdit()
  }).then((h) => {
    appStateListener = h
  })
})
onUnmounted(() => {
  commitEdit()
  document.removeEventListener('visibilitychange', onAppHidden)
  window.removeEventListener('pagehide', commitEdit)
  void appStateListener?.remove()
})

// Tap-Stempel: pointerdown/mousedown liegen VOR dem Fokuswechsel, ein @click-Handler nicht.
// Ohne das schliesst der erste Tap auf „Teilen"/„Grosses Textfeld" die Karte, waehrend der Fokus noch
// im Textfeld steht - die schuetzende Flagge wuerde erst danach gesetzt.
let lastTapAt = 0
function onCardTap(): void {
  lastTapAt = Date.now()
}
function onFocusOut(e: FocusEvent): void {
  const card = e.currentTarget as HTMLElement
  // Geteilter Wächter (cardFocusGuard) — siehe SnippetLibrarySection: tapPending schützt den Tap auf
  // ein Bedienelement der Karte, shareOpen den späteren Fokuswechsel in ein offenes Panel.
  if (
    !shouldCloseCard({
      pendingDelete: pendingDelete.value !== null,
      tapPending: tapIsPending(lastTapAt, Date.now()),
      // NUR wenn das Panel zu DIESER Karte gehört - siehe SnippetLibrarySection: ein verwaistes
      // shareOpenId würde sonst den Fokus-Commit jeder anderen Karte stilllegen.
      shareOpen: shareOpenId.value !== null && shareOpenId.value === editingId.value,
      focusStaysInside: card.contains(e.relatedTarget as Node | null),
    })
  ) {
    // Schliessen unterdrueckt - aber NICHT das Speichern. Sonst nimmt der Waechter dem Tap genau den
    // Commit weg, den er vorher hatte, und der Text bleibt nur im Arbeitsspeicher.
    commitEdit()
    return
  }
  closeEdit()
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

// --- Als verschlüsselten Kurz-Link teilen (Transfer, wie bei Vorlagen) ---
const transferCfg = (import.meta.env.VITE_TRANSFER_URL as string | undefined)
  ? { baseUrl: import.meta.env.VITE_TRANSFER_URL as string }
  : undefined
const { ttl: shareTtl, shareBusy, shareLink, shareError, share: shareStart, reset: shareReset } = useTransferShare(transferCfg)
const shareOpenId = ref<string | null>(null)
const linkCopied = ref(false)
const TTL_LABELS: { value: TransferTtl; label: string }[] = [
  { value: 'burn', label: '1× lesen' },
  { value: '1h', label: '1 Stunde' },
  { value: '24h', label: '24 Stunden' },
  { value: '7d', label: '7 Tage' },
]
function openLinkShare(b: Container): void {
  shareOpenId.value = shareOpenId.value === b.id ? null : b.id
  // IMMER zurücksetzen — siehe SnippetLibrarySection: shareLink gehört der Sektion, nicht der Karte.
  // Ohne Reset beim Öffnen zeigte ein anderer Block den Link und QR-Code des vorherigen.
  shareReset()
  // Erst nach dem Rendern: das Panel haengt an einem v-if und existiert vorher nicht.
  if (shareOpenId.value === b.id) void nextTick(() => scrollIntoViewSoon(sharePanelEl.value))
}
function createBlockLink(b: Container): void {
  void shareStart(exportBlock(blockForExport(b))).then(() => {
    // Der QR-Code laesst das Panel um ~180px wachsen - sonst liegt er wieder unter der Kante.
    if (shareLink.value) void nextTick(() => scrollIntoViewSoon(sharePanelEl.value))
  })
}
async function copyBlockLink(): Promise<void> {
  if (!shareLink.value) return
  try {
    await navigator.clipboard.writeText(shareLink.value.link)
    linkCopied.value = true
    window.setTimeout(() => (linkCopied.value = false), 2000)
  } catch {
    /* Clipboard nicht verfügbar — Nutzer kann den Link manuell markieren. */
  }
}

function toggleImport(): void {
  importOpen.value = !importOpen.value
  ioMsg.value = null
}
async function doImport(text: string): Promise<void> {
  // Schema-erkennend: eine hier eingeworfene Snippet-/Vorlagen-Datei landet trotzdem am richtigen Ort.
  const outcome = await routeImport(text)
  ioMsg.value = { kind: outcome.ok ? 'ok' : 'err', text: outcome.message }
  if (outcome.ok) {
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
const sharing = ref(false) // Re-Entrancy-Guard: kein zweites Share, solange das System-Sheet offen ist
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
  if (sharing.value) return // Doppeltipp: der 2. Share rejectet sonst mit „in progress" -> falscher Fehler
  sharing.value = true
  const src = blockForExport(b)
  const name = ((src.title ?? '') || src.id || 'baustein').replace(/[^a-z0-9_-]+/gi, '-')
  try {
    // shareJson: nativ Cache-Datei + System-Share-Sheet („In Dateien sichern"/Teilen/AirDrop), Web -> Blob-
    // Download. Der rohe <a download>-Blob funktioniert in der nativen WebView NICHT.
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
        <button class="btn btn-ghost btn-sm ml-auto min-h-11 min-w-11 px-1.5" type="button" :class="importOpen ? 'btn-active' : ''" aria-label="Block aus Datei importieren" title="Aus Datei importieren" @click="toggleImport">
          <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
        </button>
      </div>

      <!-- Import: Block-JSON einfügen oder Datei wählen (eigenes resqdocs-block-Schema, getrennt von Vorlagen) -->
      <div v-if="importOpen" class="flex flex-col gap-2 rounded-lg border border-base-300 p-3">
        <span class="text-xs font-semibold text-base-content/60">Block-JSON einfügen oder Datei wählen</span>
        <textarea v-model="importText" rows="4" class="textarea textarea-bordered w-full text-xs" placeholder='{"schema":"resqdocs-block","version":1,"tree":{ … }}' aria-label="Block-JSON"></textarea>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn btn-primary btn-sm min-h-11" type="button" :disabled="!importText.trim()" @click="doImport(importText)">Laden</button>
          <input type="file" accept="application/json,.json" class="file-input file-input-sm min-h-11" aria-label="Block-Datei wählen" @change="onImportFile" />
        </div>
        <p class="text-xs text-base-content/50">Wird als neuer Block in die Bibliothek importiert.</p>
      </div>
      <p v-if="ioMsg" class="text-xs" :class="ioMsg.kind === 'ok' ? 'text-success' : 'text-error'">{{ ioMsg.text }}</p>

      <!-- Einspaltige Liste über die volle Breite (konsistent zugeklappt/offen; vorher Dichte-Grid). -->
      <div class="flex flex-col gap-2">
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
          class="flex flex-col gap-2 rounded-xl border border-primary/40 bg-base-200 p-3 ring-1 ring-primary/20 [scroll-margin-block-end:calc(6rem+env(safe-area-inset-bottom))] [scroll-margin-block-start:4.5rem]"
          :ref="setEditCard"
          @focusout="onFocusOut" @pointerdown="onCardTap" @mousedown="onCardTap"
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
            <button type="button" class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5" :aria-label="copiedId === b.id ? 'Block-JSON kopiert' : 'Block-JSON kopieren'" title="Kopieren" @click="exportCopy(b)">
              <svg v-if="copiedId === b.id" class="size-5 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
              <svg v-else class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
            </button>
            <button type="button" class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5" aria-label="Block als Datei sichern" title="Als Datei" :disabled="sharing" @click="exportDownload(b)">
              <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7" /><path d="M12 16V3" /><path d="M8 7l4-4 4 4" /></svg>
            </button>
            <button type="button" class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5" :class="shareOpenId === b.id ? 'btn-active' : ''" aria-label="Block teilen (Link und QR)" title="Teilen (Link & QR)" @click="openLinkShare(b)">
              <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
            </button>
            <button type="button" class="btn btn-primary btn-sm min-h-11" @click="closeEdit">Fertig</button>
          </div>
          <!-- Als-Link-teilen-Panel (verschlüsselter Kurzzeit-Transfer wie bei Vorlagen) -->
          <div v-if="shareOpenId === b.id" :ref="setSharePanel" class="flex flex-col gap-2 rounded-lg border border-base-300 bg-base-100 p-2 [scroll-margin-block-end:calc(6rem+env(safe-area-inset-bottom))] [scroll-margin-block-start:4.5rem]">
            <div class="flex flex-wrap items-center gap-2">
              <label class="text-xs font-semibold text-base-content/60">Gültigkeit</label>
              <select v-model="shareTtl" class="select select-xs" aria-label="Gültigkeit des Transfer-Links">
                <option v-for="t in TTL_LABELS" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
              <button class="btn btn-primary btn-xs ml-auto" type="button" :disabled="shareBusy" @click="createBlockLink(b)">{{ shareBusy ? 'Erstelle …' : 'Link erstellen' }}</button>
            </div>
            <p v-if="shareError" class="text-xs text-error">{{ shareError }}</p>
            <div v-if="shareLink" class="flex flex-col items-stretch gap-1 rounded bg-base-200 p-2">
              <div class="flex items-center gap-1">
                <input :value="shareLink.link" readonly class="input input-xs w-full font-mono" aria-label="Transfer-Link" />
                <button class="btn btn-ghost btn-xs" type="button" @click="copyBlockLink">{{ linkCopied ? 'Kopiert' : 'Kopieren' }}</button>
              </div>
              <QrCode :value="shareLink.link" :size="180" />
              <p class="text-xs text-base-content/50">Der Link ist das Geheimnis — nur mit vertrauten Personen teilen. Läuft ab bzw. wird nach dem Lesen gelöscht.</p>
            </div>
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
