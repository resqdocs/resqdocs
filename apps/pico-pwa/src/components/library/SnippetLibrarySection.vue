<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { App as CapApp } from '@capacitor/app'
import type { LibrarySnippet } from '@/storage/types'
import { useBausteine } from '@/composables/useBausteine'
import { exportSnippet } from '@resqdocs/protocol-core/snippetIO'
import { routeImport } from '@/composables/useImportRouting'
import { shareJson, copyToClipboard } from '@/utils/fileTransfer'
import ConfirmDialog from '@resqdocs/protocol-core-ui/components/ConfirmDialog.vue'
import { useTransferShare } from '@resqdocs/protocol-core-ui/useTransferShare'
import { shouldCloseCard, tapIsPending } from '@resqdocs/protocol-core-ui/cardFocusGuard'
import type { TransferTtl } from '@resqdocs/protocol-core/transferClient'
import QrCode from '@/components/QrCode.vue'

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
  shareOpenId.value = null // Teilen-Panel gehoert zur alten Karte - sonst bleibt es verwaist offen
  shareReset()
  editingId.value = s.id
  draftTitle.value = s.title
  draftText.value = s.text
  // nextTick: editCardEl zeigt vor dem Rendern noch auf die ALTE Karte (oder auf null).
  void nextTick(() => scrollIntoViewSoon(editCardEl.value))
}
function commitEdit(): void {
  const id = editingId.value
  if (id) void updateSnippet(id, { title: draftTitle.value, text: draftText.value })
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
  // Geteilter Wächter (cardFocusGuard). Zwei Schutzschichten, die sich bewusst überlappen:
  // tapPending fängt den Tap AUF ein Bedienelement der Karte ab (Fokus steht noch im Textfeld, die
  // schützende Flagge existiert noch nicht), shareOpen/expandOpen fangen den späteren Fokuswechsel
  // in ein bereits geöffnetes Panel bzw. Modal ab.
  if (
    !shouldCloseCard({
      pendingDelete: pendingDelete.value !== null,
      tapPending: tapIsPending(lastTapAt, Date.now()),
      // NUR wenn das Panel zu DIESER Karte gehört. Sektionsweit geprüft würde ein verwaistes
      // shareOpenId (Panel bei Karte A offen gelassen, Karte B geöffnet) den Fokus-Commit von B
      // dauerhaft stilllegen - der Entwurf hinge ungespeichert im Speicher.
      shareOpen: shareOpenId.value !== null && shareOpenId.value === editingId.value,
      expandOpen: expandOpen.value,
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
const adding = ref(false)
async function addAndEdit(): Promise<void> {
  if (adding.value) return // Doppel-Tap-Schutz: sonst zwei leere „Neues Snippet" (Re-Verify)
  adding.value = true
  try {
    commitEdit() // die bisher offene Karte zuerst speichern (iOS: Button-Tap ohne focusout)
    shareOpenId.value = null // wie in openEdit: Teilen-Panel gehoert zur alten Karte
    shareReset()
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

// --- Export/Import als Datei/JSON (eigenes resqdocs-snippet-Schema; Muster wie BlockLibrarySection) ---
const importOpen = ref(false)
const importText = ref('')
const ioMsg = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

// --- Als verschlüsselten Kurz-Link teilen (Transfer, wie bei Vorlagen/Blöcken) ---
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
function openLinkShare(s: LibrarySnippet): void {
  shareOpenId.value = shareOpenId.value === s.id ? null : s.id
  // IMMER zurücksetzen. shareLink/shareError/ttl gehören dem Composable und damit der ganzen Sektion,
  // nicht der einzelnen Karte: ohne Reset beim Öffnen zeigte das Panel eines ANDEREN Snippets den Link
  // und QR-Code des vorherigen. Der Link ist das Geheimnis, und bei „1× lesen" verbrennt ein Scan den
  // fremden Einmal-Link. Der Preis (ein erzeugter Link ist nach dem Zuklappen weg) ist gewollt.
  shareReset()
  // Erst nach dem Rendern: das Panel haengt an einem v-if und existiert vorher nicht.
  if (shareOpenId.value === s.id) void nextTick(() => scrollIntoViewSoon(sharePanelEl.value))
}
function createSnippetLink(s: LibrarySnippet): void {
  void shareStart(exportSnippet(snippetPayload(s))).then(() => {
    // Der QR-Code laesst das Panel um ~180px wachsen - sonst liegt er wieder unter der Kante.
    if (shareLink.value) void nextTick(() => scrollIntoViewSoon(sharePanelEl.value))
  })
}
async function copySnippetLink(): Promise<void> {
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
  // Schema-erkennend: eine hier eingeworfene Block-/Vorlagen-Datei landet trotzdem am richtigen Ort.
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

// Export je Snippet (nur in der offenen Karte) — mit dem evtl. noch nicht committeten Draft-Titel/-Text.
const copiedId = ref<string | null>(null)
const sharing = ref(false) // Re-Entrancy-Guard: kein zweites Share, solange das System-Sheet offen ist
function snippetPayload(s: LibrarySnippet): { title: string; text: string } {
  return editingId.value === s.id ? { title: draftTitle.value, text: draftText.value } : { title: s.title, text: s.text }
}
async function exportCopy(s: LibrarySnippet): Promise<void> {
  const ok = await copyToClipboard(exportSnippet(snippetPayload(s)))
  if (ok) {
    copiedId.value = s.id
    window.setTimeout(() => {
      if (copiedId.value === s.id) copiedId.value = null
    }, 2000)
  } else {
    ioMsg.value = { kind: 'err', text: 'Kopieren nicht möglich.' }
  }
}
async function exportDownload(s: LibrarySnippet): Promise<void> {
  if (sharing.value) return // Doppeltipp: der 2. Share rejectet sonst mit „in progress" -> falscher Fehler
  sharing.value = true
  const p = snippetPayload(s)
  const name = (p.title.trim() || s.id || 'snippet').replace(/[^a-z0-9_-]+/gi, '-')
  try {
    // shareJson: nativ Cache-Datei + System-Share-Sheet, Web -> Blob-Download (wie BlockLibrarySection).
    await shareJson(`snippet-${name}.json`, exportSnippet(p), 'Snippet exportieren')
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
        <h3 class="font-semibold">Snippets</h3>
        <span v-if="snippets.length" class="badge badge-neutral badge-sm">{{ snippets.length }}</span>
        <button class="btn btn-ghost btn-sm ml-auto min-h-11 min-w-11 px-1.5" type="button" :class="importOpen ? 'btn-active' : ''" aria-label="Snippet aus Datei importieren" title="Aus Datei importieren" @click="toggleImport">
          <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
        </button>
        <button class="btn btn-primary btn-sm min-h-11 min-w-11 px-1.5" type="button" :disabled="adding" aria-label="Neues Snippet" title="Neues Snippet" @click="addAndEdit"><span class="text-lg leading-none" aria-hidden="true">＋</span></button>
      </div>

      <!-- Import: Snippet-JSON einfügen oder Datei wählen (eigenes resqdocs-snippet-Schema, getrennt von Blöcken/Vorlagen) -->
      <div v-if="importOpen" class="flex flex-col gap-2 rounded-lg border border-base-300 p-3">
        <span class="text-xs font-semibold text-base-content/60">Snippet-JSON einfügen oder Datei wählen</span>
        <textarea v-model="importText" rows="4" class="textarea textarea-bordered w-full text-xs" placeholder='{"schema":"resqdocs-snippet","version":1,"snippet":{ … }}' aria-label="Snippet-JSON"></textarea>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn btn-primary btn-sm min-h-11" type="button" :disabled="!importText.trim()" @click="doImport(importText)">Laden</button>
          <input type="file" accept="application/json,.json" class="file-input file-input-sm min-h-11" aria-label="Snippet-Datei wählen" @change="onImportFile" />
        </div>
        <p class="text-xs text-base-content/50">Wird als neues Snippet in die Bibliothek importiert.</p>
      </div>
      <p v-if="ioMsg" class="text-xs" :class="ioMsg.kind === 'ok' ? 'text-success' : 'text-error'">{{ ioMsg.text }}</p>

      <!-- Einspaltige Liste über die volle Breite: zugeklappt UND offen gleich breit (konsistent auf iPad;
           das frühere Dichte-Grid ließ zugeklappte Zeilen nur eine Spalte breit, die Edit-Karte aber voll). -->
      <div class="flex flex-col gap-2">
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
          <div class="flex flex-wrap justify-end gap-2">
            <button type="button" class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5" aria-label="Snippet-Text groß bearbeiten" title="Großes Textfeld" @click="openBigText">
              <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
            </button>
            <button type="button" class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5" :aria-label="copiedId === s.id ? 'Snippet-JSON kopiert' : 'Snippet-JSON kopieren'" title="Kopieren" @click="exportCopy(s)">
              <svg v-if="copiedId === s.id" class="size-5 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
              <svg v-else class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
            </button>
            <button type="button" class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5" aria-label="Snippet als Datei sichern" title="Als Datei" :disabled="sharing" @click="exportDownload(s)">
              <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7" /><path d="M12 16V3" /><path d="M8 7l4-4 4 4" /></svg>
            </button>
            <button type="button" class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5" :class="shareOpenId === s.id ? 'btn-active' : ''" aria-label="Snippet teilen (Link und QR)" title="Teilen (Link & QR)" @click="openLinkShare(s)">
              <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
            </button>
            <button type="button" class="btn btn-primary btn-sm min-h-11" @click="closeEdit">Fertig</button>
          </div>
          <!-- Als-Link-teilen-Panel (verschlüsselter Kurzzeit-Transfer wie bei Vorlagen/Blöcken) -->
          <div v-if="shareOpenId === s.id" :ref="setSharePanel" class="flex flex-col gap-2 rounded-lg border border-base-300 bg-base-100 p-2 [scroll-margin-block-end:calc(6rem+env(safe-area-inset-bottom))] [scroll-margin-block-start:4.5rem]">
            <div class="flex flex-wrap items-center gap-2">
              <label class="text-xs font-semibold text-base-content/60">Gültigkeit</label>
              <select v-model="shareTtl" class="select select-xs" aria-label="Gültigkeit des Transfer-Links">
                <option v-for="t in TTL_LABELS" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
              <button class="btn btn-primary btn-xs ml-auto" type="button" :disabled="shareBusy" @click="createSnippetLink(s)">{{ shareBusy ? 'Erstelle …' : 'Link erstellen' }}</button>
            </div>
            <p v-if="shareError" class="text-xs text-error">{{ shareError }}</p>
            <div v-if="shareLink" class="flex flex-col items-stretch gap-1 rounded bg-base-200 p-2">
              <div class="flex items-center gap-1">
                <input :value="shareLink.link" readonly class="input input-xs w-full font-mono" aria-label="Transfer-Link" />
                <button class="btn btn-ghost btn-xs" type="button" @click="copySnippetLink">{{ linkCopied ? 'Kopiert' : 'Kopieren' }}</button>
              </div>
              <QrCode :value="shareLink.link" :size="180" />
              <p class="text-xs text-base-content/50">Der Link ist das Geheimnis — nur mit vertrauten Personen teilen. Läuft ab bzw. wird nach dem Lesen gelöscht.</p>
            </div>
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
