<script setup lang="ts">
/**
 * Einsatz-Komponente der Funktion „Medikamentenplan". Eigener Zustand (Medikamentenzeilen) im selben
 * Werte-Store (useCaseValues.getRows/setRows) -> erbt Entwurf-Persistenz + DSGVO-Reset gratis.
 *
 * Mode-in-place (quellenbasiert NN/g/Baymard): fertige Medikamente erscheinen kompakt als Summary-Zeile,
 * Antippen oeffnet die Edit-Karte. GENAU EINE Karte offen (Maintainer-Entscheid) -> bei vielen Medikamenten
 * bleibt die Liste als Inhaltsverzeichnis lesbar. „fertig/raustippen": Fertig-Button ODER Fokus verlaesst
 * die Karte (focusout). v1 manuelle Erfassung; Packung-/BMP-Scan folgt.
 */
import { computed, ref } from 'vue'
import type { FunctionNode, MedikamenteRow, ArztRow } from '@resqdocs/protocol-core/model'
import { useCaseValues } from '@/rebuild/useCaseValues'
import { useProtocolTree } from '@/rebuild/useProtocolTree'
import { collectFunctionNodes } from '@resqdocs/protocol-core/creator'
import { formatMedikament } from '@resqdocs/protocol-core/functions/registry'
import { usePznLibrary } from '@/medications/usePznLibrary'
import { useMedicationLookup } from '@/medications/useMedicationLookup'
import { extractPznFromPackageCode, packageScanName, type PackageBarcodeFormat } from '@/medications/packageScan'
import PackageScanOverlay from '@/components/PackageScanOverlay.vue'
import MedplanReviewSheet from './MedplanReviewSheet.vue'

const props = defineProps<{ node: FunctionNode }>()
const caseValues = useCaseValues()
// Wurzel der aktiven Einsatz-Vorlage (Singleton) -> Cross-Funktion-Suche (Arzt an eine Aerzte-Funktion).
const { einsatzRoot } = useProtocolTree()
// dev-Scan-/Lookup-Logik 1:1 wiederverwendet (erprobt). PZN-Lookup: eigene Bibliothek (ownLabel) zuerst,
// sonst Community-Woerterbuch (resolve, per Default aus -> Platzhalter „PZN <nr>").
const pznLibrary = usePznLibrary()
const lookup = useMedicationLookup()

const rows = computed<MedikamenteRow[]>(() => caseValues.getRows(props.node.id) as MedikamenteRow[])
const filledCount = computed(() => rows.value.filter((r) => r.name.trim()).length) // leere Zeile zaehlt nicht
const label = computed(() => (props.node.title && props.node.title.trim()) || 'Medikamentenplan')

const editingIndex = ref<number | null>(null)
// Autofokus robust ohne nextTick-Race: Flag setzen, der Funktions-Ref fokussiert das Name-Input der
// frisch gemounteten Edit-Karte (egal in welcher Reihenfolge alte/neue Karte mounten/unmounten).
let focusNext = false
function setEditName(el: unknown): void {
  if (el && focusNext) {
    focusNext = false
    ;(el as HTMLInputElement).focus()
  }
}

const summary = (r: MedikamenteRow): string => formatMedikament(r) || 'Leeres Medikament'

function setRow(i: number, patch: Partial<MedikamenteRow>): void {
  caseValues.setRows(
    props.node.id,
    rows.value.map((r, j) => (j === i ? { ...r, ...patch } : r)),
  )
}
function removeRow(i: number): void {
  caseValues.setRows(
    props.node.id,
    rows.value.filter((_, j) => j !== i),
  )
  if (editingIndex.value === i) editingIndex.value = null
  else if (editingIndex.value !== null && i < editingIndex.value) editingIndex.value--
}
function openEdit(i: number): void {
  editingIndex.value = i
}
function closeEdit(): void {
  editingIndex.value = null
}
function onFocusOut(e: FocusEvent): void {
  const card = e.currentTarget as HTMLElement
  if (!card.contains(e.relatedTarget as Node | null)) closeEdit() // Fokus ganz aus der Karte raus
}
function addRow(): void {
  const cleaned = rows.value.filter((r) => r.name.trim()) // abgebrochene Leerzeilen aufraeumen
  focusNext = true // der Funktions-Ref der neuen Karte fokussiert beim Mount
  caseValues.setRows(props.node.id, [...cleaned, { name: '' }])
  editingIndex.value = cleaned.length
}

// --- Packung-Scan: EINE Zeile, direkt anhaengen (Maintainer-Entscheid: kompakt, kein Auto-Open) ---
const pkgScanOpen = ref(false)
const pkgScanMsg = ref<string | null>(null)
function startPackageScan(): void {
  pkgScanMsg.value = null
  pkgScanOpen.value = true
}
async function onPackageDecoded(p: { text: string; format: PackageBarcodeFormat }): Promise<void> {
  pkgScanOpen.value = false // Overlay ist nach einem Decode „done" -> schliessen
  const pzn = extractPznFromPackageCode(p.text, p.format)
  if (!pzn) {
    pkgScanMsg.value = 'Keine PZN auf der Packung erkannt — näher heranführen oder manuell eintippen.'
    return
  }
  const name = (await pznLibrary.ownLabel(pzn)) ?? packageScanName(pzn, lookup.resolve(pzn))
  const cleaned = rows.value.filter((r) => r.name.trim())
  caseValues.setRows(props.node.id, [...cleaned, { name, pzn }]) // anhaengen, kompakt (kein Edit-Open)
}

// --- BMP-Plan-Scan: Review-Sheet (mehrere Zeilen) -> nach Pruefung anhaengen ---
const bmpOpen = ref(false)
function onBmpApply(scanned: MedikamenteRow[], doctor?: ArztRow): void {
  const cleaned = rows.value.filter((r) => r.name.trim())
  caseValues.setRows(props.node.id, [...cleaned, ...scanned]) // gepruefte Zeilen anhaengen
  // Cross-Uebernahme: gewaehlten Aussteller an die erste Aerzte-Funktion anhaengen (falls vorhanden).
  if (doctor) {
    const aerzteNodes = collectFunctionNodes(einsatzRoot.value, 'aerzte')
    if (aerzteNodes.length) {
      const id = aerzteNodes[0].id
      // id ist eine aerzte-Funktion -> ihre rows sind ArztRow (Invariante: nur AerzteFunction schreibt sie).
      const existing = caseValues.getRows(id) as ArztRow[]
      caseValues.setRows(id, [...existing.filter((a) => a.name.trim()), doctor])
    }
  }
  editingIndex.value = null // BMP -> alles kompakt, Liste bleibt lesbar
  bmpOpen.value = false
}

// Scan-Art-Auswahl: EIN „Scannen"-Knopf -> kleines Sheet (Packung/Plan) statt zwei Direktbuttons.
const scanPickerOpen = ref(false)
function pickScan(kind: 'package' | 'plan'): void {
  scanPickerOpen.value = false
  if (kind === 'package') startPackageScan()
  else bmpOpen.value = true
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold">{{ label }}</span>
      <span v-if="filledCount" class="badge badge-neutral badge-sm">{{ filledCount }}</span>
    </div>

    <template v-for="(r, i) in rows" :key="i">
      <!-- READ: kompakte Summary-Zeile (Antippen -> bearbeiten) -->
      <button
        v-if="editingIndex !== i"
        type="button"
        class="flex min-h-11 w-full items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-left shadow-sm active:bg-base-200"
        :aria-expanded="false"
        :aria-label="`Medikament ${i + 1}: ${summary(r)} — bearbeiten`"
        @click="openEdit(i)"
      >
        <span class="min-w-0 flex-1 truncate text-sm">{{ summary(r) }}</span>
        <span class="shrink-0 text-base-content/40" aria-hidden="true">✎</span>
      </button>

      <!-- EDIT: Karte (Ring + Inputs + Fertig) -->
      <div
        v-else
        class="flex flex-col gap-2 rounded-xl border border-primary/40 bg-base-200 p-3 ring-1 ring-primary/20"
        @focusout="onFocusOut"
        @keydown.esc="closeEdit"
      >
        <div class="flex items-center gap-2">
          <input
            :ref="setEditName"
            class="input input-sm flex-1 font-medium"
            :value="r.name"
            placeholder="Medikament"
            :aria-label="`Medikament ${i + 1}`"
            @input="setRow(i, { name: ($event.target as HTMLInputElement).value })"
          />
          <button type="button" class="btn btn-ghost btn-sm btn-circle min-h-11 min-w-11 text-error" :aria-label="`${r.name || 'Medikament ' + (i + 1)} entfernen`" @click="removeRow(i)">✕</button>
        </div>
        <div class="flex gap-2">
          <input class="input input-sm w-28 shrink-0 text-center font-mono" :value="r.dosierung ?? ''" placeholder="1-0-1-0" aria-label="Dosierung" @input="setRow(i, { dosierung: ($event.target as HTMLInputElement).value })" />
          <input class="input input-sm min-w-0 flex-1" :value="r.kommentar ?? ''" placeholder="Hinweis (z. B. nüchtern)" aria-label="Hinweis" @input="setRow(i, { kommentar: ($event.target as HTMLInputElement).value })" />
        </div>
        <button type="button" class="btn btn-primary btn-sm min-h-11 self-end" @click="closeEdit">Fertig</button>
      </div>
    </template>

    <p v-if="!rows.length" class="text-xs italic text-base-content/50">Noch keine Medikamente erfasst.</p>

    <!-- Aktionsleiste: 1 Primaer (manuell) + 1 Sekundaer (Scannen, Kamera-Symbol) -> Auswahl-Sheet. -->
    <div class="flex gap-2">
      <button type="button" class="btn btn-primary btn-sm min-h-11 grow gap-1" @click="addRow"><span aria-hidden="true">＋</span> Medikament</button>
      <button type="button" class="btn btn-outline btn-sm min-h-11 grow gap-2" aria-haspopup="dialog" :aria-expanded="scanPickerOpen" @click="scanPickerOpen = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5 shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.822 1.316Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" /></svg>
        Scannen
      </button>
    </div>
    <p v-if="pkgScanMsg" class="text-xs text-warning" role="status">{{ pkgScanMsg }}</p>

    <!-- Scan-Art waehlen: komfortable Tiles (Maintainer-Wahl, sourced scan-sheet-beauty). daisyUI .modal
         modal-bottom wie MoveToPicker; 56px-Zeilen mit gefasstem Icon-Chip (Theme-Akzent). Teleport, weil ein
         backdrop-blur-Vorfahr des Einsatz-Shells fixed/Modal sonst einsperrt; schliesst VOR der Kamera -> kein z-Konflikt. -->
    <Teleport to="body">
      <div v-if="scanPickerOpen" class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true">
        <div class="modal-box flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
          <h3 class="text-base font-semibold">Scannen</h3>
          <button type="button" class="flex min-h-14 w-full items-center gap-4 rounded-xl bg-base-200 px-3 text-base font-normal transition-colors active:bg-base-300" @click="pickScan('package')">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="h-6 w-6" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.822 1.316Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" /></svg>
            </span>
            <span>Packung scannen</span>
          </button>
          <button type="button" class="flex min-h-14 w-full items-center gap-4 rounded-xl bg-base-200 px-3 text-base font-normal transition-colors active:bg-base-300" @click="pickScan('plan')">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="h-6 w-6" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            </span>
            <span>Plan (BMP) scannen</span>
          </button>
          <div class="mt-1 flex justify-end">
            <button type="button" class="btn btn-ghost" @click="scanPickerOpen = false">Abbrechen</button>
          </div>
        </div>
        <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="scanPickerOpen = false"></button>
      </div>
    </Teleport>

    <!-- Teleport an body: das Vollbild-Overlay (fixed inset-0) wuerde sonst von einem transformierten/
         backdrop-blur-Vorfahren des Einsatz-Shells auf den Inhaltsbereich eingesperrt. -->
    <Teleport to="body">
      <PackageScanOverlay v-if="pkgScanOpen" @decoded="onPackageDecoded" @cancel="pkgScanOpen = false" />
    </Teleport>

    <!-- BMP-Plan-Scan + Review (teleportet sich selbst) -->
    <MedplanReviewSheet v-if="bmpOpen" @apply="onBmpApply" @close="bmpOpen = false" />
  </div>
</template>
