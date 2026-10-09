<script setup lang="ts">
/**
 * Einsatz-Komponente der Funktion „Medikamentenplan". Eigener Zustand (Medikamentenzeilen) im selben
 * Werte-Store (useCaseValues.getRows/setRows) -> erbt Entwurf-Persistenz + DSGVO-Reset gratis.
 *
 * Mode-in-place (quellenbasiert NN/g/Baymard): fertige Medikamente erscheinen kompakt als Summary-Zeile,
 * Antippen oeffnet die Edit-Karte. GENAU EINE Karte offen (bewusste Entscheidung) -> bei vielen Medikamenten
 * bleibt die Liste als Inhaltsverzeichnis lesbar. „fertig/raustippen": Fertig-Button ODER Fokus verlaesst
 * die Karte (focusout). v1 manuelle Erfassung; Packung-/BMP-Scan folgt.
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { FunctionNode, MedikamenteRow, ArztRow } from '@resqdocs/protocol-core/model'
import { useCaseValues } from '@resqdocs/protocol-core-ui/useCaseValues'
import { useProtocolTree } from '@resqdocs/protocol-core-ui/useProtocolTree'
import { collectFunctionNodes } from '@resqdocs/protocol-core/creator'
import { formatMedikament, medikamentRowHasData, arztRowHasData, staerkeOhneDuplikat } from '@resqdocs/protocol-core/functions/registry'
import { usePznLibrary } from '@/medications/usePznLibrary'
import type { PznEntry } from '@/medications/pznLibrary'
import { meaningfulLength } from '@/medications/pznSuggest'
import { useMedicationLookup } from '@/medications/useMedicationLookup'
import { extractPznFromPackageCode, packageScanName, type PackageBarcodeFormat } from '@/medications/packageScan'
import CodeScanOverlay from '@/components/CodeScanOverlay.vue'
import { PACKAGE_PROFILE } from '@/medplan/scanProfiles'
import MedplanReviewSheet from './MedplanReviewSheet.vue'
import ConfirmDialog from '@resqdocs/protocol-core-ui/components/ConfirmDialog.vue'
import FunctionFillToggle from './FunctionFillToggle.vue'
import RequiredMark from '@/components/RequiredMark.vue'
import { isRequiredOpen } from '@resqdocs/protocol-core/required'
import { shouldCloseCard, tapIsPending } from '@resqdocs/protocol-core-ui/cardFocusGuard'

const props = defineProps<{ node: FunctionNode }>()
const caseValues = useCaseValues()
// Wurzel der aktiven Einsatz-Vorlage (Singleton) -> Cross-Funktion-Suche (Arzt an eine Aerzte-Funktion).
const { einsatzRoot } = useProtocolTree()
// dev-Scan-/Lookup-Logik 1:1 wiederverwendet (erprobt). PZN-Lookup: eigene Bibliothek zuerst
// (entry(): Wirkstoff vor Bezeichnung + Wirkstärke), sonst Community-Woerterbuch (resolve, per
// Default aus -> Platzhalter „PZN <nr>").
const pznLibrary = usePznLibrary()
const lookup = useMedicationLookup()

const rows = computed<MedikamenteRow[]>(() => caseValues.getRows(props.node.id) as MedikamenteRow[])
const filledCount = computed(() => rows.value.filter((r) => r.name.trim()).length) // leere Zeile zaehlt nicht
const label = computed(() => (props.node.title && props.node.title.trim()) || 'Medikamentenplan')
// Pflicht-Funktion „noch offen": keine Zeilen/kein Freitext/kein Standardtext -> reiner visueller Hinweis.
const isOpen = computed(() => // Funktionen fuehren ihren Status eigenstaendig (state:'function' mit status), nicht ueber den
// Feld-Tri-State. UNO Reverse ist fuer sie deshalb NICHT entschieden - bewusst kein Knoten hier.
isRequiredOpen(props.node, caseValues.get(props.node.id)))
// BEWAHREN: ruhend gemerkter Funktions-Freitext (prevText) -> antippbarer „zurueckholen"-Hinweis. Nie in der Ausgabe.
const preservedText = computed(() => caseValues.getFunctionPrevText(props.node.id))
function restorePreserved(): void {
  caseValues.setFunctionText(props.node.id, caseValues.getFunctionPrevText(props.node.id) || (props.node.default ?? ''))
}
const excluded = computed(() => caseValues.getFunctionStatus(props.node.id) === 'excluded') // Tri-State (Slice 2): nicht erhoben
// Tri-State (Slice 3): ✎ Freitext - ein eigener Text ersetzt in der Ausgabe die Zeilen (Zeilen bleiben erhalten).
const custom = computed(() => caseValues.getFunctionStatus(props.node.id) === 'custom')
const customText = computed(() => caseValues.getFunctionText(props.node.id))
function setCustomText(v: string): void {
  caseValues.setFunctionText(props.node.id, v)
}

const editingIndex = ref<number | null>(null)
// Zustand der Zeile beim OEFFNEN der Karte: Wer eine BEFUELLTE Zeile beim
// Bearbeiten leert (iOS-Backspace loescht gern das ganze markierte Wort), darf sie nicht ploetzlich
// als "leere Zeile" rueckfragefrei loeschen koennen. Still loeschen nur, wenn die Zeile leer
// GEOEFFNET wurde und leer ist (frische ＋-Zeile). editingLabel = Dialog-Text, falls leergeraeumt.
const editingHadData = ref(false)
const editingLabel = ref('')
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
// Lösch-Schutz: Rückfrage vor Datenverlust — Einzelzeile ODER „alle zurücksetzen" (Buttons
// oben+unten an der Liste). Ohne Rückfrage nur die frisch angelegte, nie befüllte Zeile (siehe
// editingHadData; Rückfragen nur bei destruktiven Aktionen, sonst stumpfen sie ab — NN/g
// confirmation-dialog). Gemerkt wird das ZEILEN-OBJEKT, nicht der Index: async Pfade (Packung-Scan)
// können rows während der offenen Rückfrage neu schreiben — beim Bestätigen löst indexOf die
// aktuelle Position auf; weg = No-op (fail-safe).
const pendingRemove = ref<MedikamenteRow | 'all' | null>(null)
function requestRemove(i: number): void {
  const r = rows.value[i]
  if (!r) return
  // Still loeschen NUR bei einer Zeile, die leer geoeffnet wurde UND leer ist (frisch angelegt,
  // nichts erfasst). Alles andere - auch eine gerade leergeraeumte Bestandszeile - fragt nach.
  const freshEmpty = editingIndex.value === i && !editingHadData.value && !medikamentRowHasData(r)
  if (freshEmpty) removeRow(i)
  else pendingRemove.value = r
}
function clearAll(): void {
  caseValues.setRows(props.node.id, [])
  editingIndex.value = null
}
function requestRemoveAll(): void {
  // Nur Leerzeilen? Nichts zu verlieren -> ohne Rückfrage leeren (konsistent zum Einzel-✕).
  if (rows.value.some(medikamentRowHasData)) pendingRemove.value = 'all'
  else clearAll()
}
const confirmTitle = computed(() => {
  const p = pendingRemove.value
  if (p === 'all') return 'Alle Medikamente zurücksetzen?'
  // Gerade leergeraeumte Bestandszeile: den Stand beim Oeffnen der Karte zeigen.
  const current = p ? formatMedikament(p) : ''
  return `„${current || editingLabel.value || 'Medikament'}“ entfernen?`
})
const confirmMessage = computed(() => {
  if (pendingRemove.value !== 'all') return 'Das lässt sich nicht rückgängig machen.'
  const n = rows.value.filter(medikamentRowHasData).length
  return `${n === 1 ? 'Der erfasste Eintrag wird' : `Alle ${n} erfassten Einträge werden`} entfernt. Das lässt sich nicht rückgängig machen.`
})
function confirmPendingRemove(): void {
  const p = pendingRemove.value
  pendingRemove.value = null
  if (p === 'all') clearAll()
  else if (p) {
    const i = rows.value.indexOf(p)
    if (i >= 0) removeRow(i)
  }
}
function openEdit(i: number): void {
  editingIndex.value = i
  const r = rows.value[i]
  editingHadData.value = r ? medikamentRowHasData(r) : false
  editingLabel.value = r ? formatMedikament(r) : ''
}
function closeEdit(): void {
  editingIndex.value = null
  closeSuggest()
  pendingStaerke.value = null
}
// Tap-Stempel: pointerdown/mousedown liegen VOR dem Fokuswechsel, ein @click-Handler nicht. Ohne das
// schliesst der Tap auf ein Bedienelement der Karte sie, waehrend der Fokus noch in einem Feld steht -
// eine schuetzende Flagge waere immer zu spaet. Gleiche Mechanik wie in den Bausteine-Bibliotheken.
let lastTapAt = 0
function onCardTap(): void {
  lastTapAt = Date.now()
}
function onFocusOut(e: FocusEvent): void {
  const card = e.currentTarget as HTMLElement
  // Geteilter Waechter (cardFocusGuard) - wie in AerzteFunction. Hier gibt es aktuell kein Element,
  // das den Fokus regulaer nach draussen gibt; der Schutz steht vorsorglich, damit ein spaeter
  // ergaenztes Auswahlfeld oder Modal nicht dieselbe Falle aufmacht.
  if (
    !shouldCloseCard({
      // Ein offener Dialog (Loeschung ODER Staerke-Rueckfrage) haelt die Karte offen: der Fokuswechsel
      // ins teleportierte Modal darf sie nicht schliessen (und damit die Rueckfrage abraeumen).
      pendingDelete: pendingRemove.value !== null || pendingStaerke.value !== null,
      tapPending: tapIsPending(lastTapAt, Date.now()),
      focusStaysInside: card.contains(e.relatedTarget as Node | null),
    })
  ) {
    return
  }
  closeEdit()
}
function addRow(): void {
  const cleaned = rows.value.filter(medikamentRowHasData) // nur WIRKLICH leere Zeilen aufraeumen (Eingaben nie stumm verwerfen)
  focusNext = true // der Funktions-Ref der neuen Karte fokussiert beim Mount
  closeSuggest() // frische Karte startet ohne Vorschlagsreste der vorigen Zeile
  pendingStaerke.value = null
  caseValues.setRows(props.node.id, [...cleaned, { name: '' }])
  editingIndex.value = cleaned.length
  editingHadData.value = false // frisch angelegt = leer geboren -> ✕ darf ohne Rueckfrage aufraeumen
  editingLabel.value = ''
}

// --- Packung-Scan: EINE Zeile, direkt anhaengen (bewusst kompakt, kein Auto-Open) ---
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
  // Strukturiert aus der EIGENEN Bibliothek: Wirkstoff (wichtiger als Bezeichnung,
  // konsistent zu resolveFromLibrary der Review-Sheets) + Wirkstärke als eigenes Feld —
  // ausser der Name (z. B. Label "Ibuflam 400 mg") trägt sie schon (keine Doppel-Doku).
  const e = await pznLibrary.entry(pzn)
  const name = (e && (e.wirkstoff || e.label)) || packageScanName(pzn, lookup.resolve(pzn))
  const staerke = staerkeOhneDuplikat(name, e?.staerke)
  const cleaned = rows.value.filter(medikamentRowHasData)
  caseValues.setRows(props.node.id, [...cleaned, { name, staerke, pzn }]) // anhaengen, kompakt (kein Edit-Open)
}

// --- Typeahead: das manuelle Namensfeld sucht in der PZN-Bibliothek --------------------------------
// Ab 3 Zeichen, entprellt. Auswahl fuellt Name/Staerke/PZN mit DERSELBEN Abbildung wie der Packung-Scan
// (Wirkstoff vor Bezeichnung, Staerke ohne Namens-Dublette). Leere oder nicht lesbare Bibliothek ->
// keine Vorschlaege, das Feld bleibt schlichtes Freitext-Input. Nur EINE Karte
// ist offen -> eine gemeinsame Vorschlagsliste, an editingIndex gebunden.
const suggestions = ref<PznEntry[]>([])
const suggestForRow = ref<number | null>(null)
let suggestTimer: ReturnType<typeof setTimeout> | null = null
// Grosszuegig, damit das gesuchte Medikament nicht unter der Kappung verschwindet; die Liste ist
// scrollbar und bei genau SUGGEST_LIMIT Treffern weist ein Hinweis auf „weiter eingrenzen".
const SUGGEST_LIMIT = 30
const suggestCapped = computed(() => suggestions.value.length >= SUGGEST_LIMIT)

// Nach der Auswahl gefragte Wirkstoffstaerke: der Name ist sicher zu
// uebernehmen, die Bibliotheks-Staerke passt aber nicht zwingend zur konkreten Verordnung (dasselbe
// Praeparat gibt es in mehreren Staerken). Darum wird sie NICHT automatisch gesetzt, sondern kurz
// abgefragt. Gilt genau fuer die zuletzt gewaehlte Zeile.
const pendingStaerke = ref<{ row: number; value: string } | null>(null)
const staerkeConfirmBtn = ref<HTMLButtonElement | null>(null)
// Beim Oeffnen den Bestaetigen-Knopf fokussieren (Tastatur/ESC, Fokusanker). Positive Frage ->
// Default-Fokus DARF hier auf „Uebernehmen" liegen (anders als ConfirmDialog vor Loeschungen).
watch(pendingStaerke, (v) => {
  if (v) void nextTick(() => staerkeConfirmBtn.value?.focus())
})
function applyStaerke(): void {
  if (pendingStaerke.value) setRow(pendingStaerke.value.row, { staerke: pendingStaerke.value.value })
  pendingStaerke.value = null
}
function dismissStaerke(): void {
  pendingStaerke.value = null
}

function onNameInput(i: number, value: string): void {
  setRow(i, { name: value })
  pendingStaerke.value = null // neue Eingabe verwirft eine offene Staerke-Rueckfrage
  if (suggestTimer) clearTimeout(suggestTimer)
  if (meaningfulLength(value) < 3) {
    suggestions.value = []
    suggestForRow.value = null
    return
  }
  suggestTimer = setTimeout(() => {
    void pznLibrary
      .suggest(value, SUGGEST_LIMIT)
      .then((hits) => {
        if (editingIndex.value !== i) return // Zeile gewechselt -> veraltetes Ergebnis verwerfen
        suggestions.value = hits
        suggestForRow.value = hits.length ? i : null
      })
      .catch(() => {
        suggestions.value = [] // nicht lesbare Bibliothek: still auf Freitext zurueckfallen
        suggestForRow.value = null
      })
  }, 180)
}

function chooseSuggestion(i: number, e: PznEntry): void {
  const name = e.wirkstoff || e.label
  // Name + PZN sofort; die Staerke nur auf Rueckfrage (und nur, wenn sie nicht ohnehin im Namen steckt).
  setRow(i, { name, pzn: e.pzn })
  closeSuggest()
  const staerke = staerkeOhneDuplikat(name, e.staerke)
  pendingStaerke.value = staerke ? { row: i, value: staerke } : null
}

function closeSuggest(): void {
  if (suggestTimer) {
    clearTimeout(suggestTimer)
    suggestTimer = null
  }
  suggestions.value = []
  suggestForRow.value = null
}

// --- BMP-Plan-Scan: Review-Sheet (mehrere Zeilen) -> nach Pruefung anhaengen ---
const bmpOpen = ref(false)
// Kamera (Standard) vs. externer HID-/Bluetooth-Scanner (öffnet das Feld statt der Kamera).
const bmpMode = ref<'camera' | 'scanner'>('camera')
function onBmpApply(scanned: MedikamenteRow[], doctor?: ArztRow): void {
  const cleaned = rows.value.filter(medikamentRowHasData)
  caseValues.setRows(props.node.id, [...cleaned, ...scanned]) // gepruefte Zeilen anhaengen
  // Cross-Uebernahme: gewaehlten Aussteller an die erste Aerzte-Funktion anhaengen (falls vorhanden).
  if (doctor) {
    const aerzteNodes = collectFunctionNodes(einsatzRoot.value, 'aerzte')
    if (aerzteNodes.length) {
      const id = aerzteNodes[0].id
      // id ist eine aerzte-Funktion -> ihre rows sind ArztRow (Invariante: nur AerzteFunction schreibt sie).
      const existing = caseValues.getRows(id) as ArztRow[]
      caseValues.setRows(id, [...existing.filter(arztRowHasData), doctor])
      // Cross-Scan bringt echte Daten -> NUR „nicht erhoben" aufheben. Einen ✎-Freitext NICHT antasten:
      // setFunctionStatus('confirmed') wuerde dessen text stumm verwerfen (Slice 3). rows sind via setRows schon erhalten.
      if (caseValues.getFunctionStatus(id) === 'excluded') caseValues.setFunctionStatus(id, 'confirmed')
    }
  }
  editingIndex.value = null // BMP -> alles kompakt, Liste bleibt lesbar
  bmpOpen.value = false
}

// Scan-Art-Auswahl: EIN „Scannen"-Knopf -> kleines Sheet (Packung/Plan) statt zwei Direktbuttons.
const scanPickerOpen = ref(false)
function pickScan(kind: 'package' | 'plan' | 'external'): void {
  scanPickerOpen.value = false
  if (kind === 'package') { startPackageScan(); return }
  // 'plan' -> Kamera; 'external' -> Plan-Sheet direkt im Scanner-Modus (Feld statt Kamera).
  bmpMode.value = kind === 'external' ? 'scanner' : 'camera'
  bmpOpen.value = true
}
</script>

<template>
  <div class="flex flex-col gap-2" :data-required-open="node.required && isOpen ? '' : undefined">
    <div class="flex items-center gap-2">
      <!-- Tri-State (Slice 2): ✓ erhoben / − nicht erhoben; bei − entfaellt die Funktion in der Ausgabe. -->
      <FunctionFillToggle :node="node" />
      <span class="text-sm font-semibold">{{ label }}<RequiredMark v-if="node.required" :open="isOpen" /></span>
      <span v-if="!excluded && !custom && filledCount" class="badge badge-neutral badge-sm">{{ filledCount }}</span>
      <!-- „Alle zurücksetzen" oben+unten. Sekundär-destruktiv (ghost+error, nie Primary) + Rückfrage. -->
      <button v-if="!excluded && !custom && rows.length" type="button" class="btn btn-ghost btn-sm ml-auto min-h-11 text-error" :aria-label="`Alle zurücksetzen: ${label}`" @click="requestRemoveAll">Alle zurücksetzen</button>
    </div>

    <p v-if="node.required && isOpen" class="pl-9 text-sm text-warning">Pflichtfeld – noch offen</p>

    <!-- BEWAHREN: getippter Funktions-Freitext ruht (Status ✓/−) -> antippbar zum verlustfreien Zurueckholen. -->
    <button v-if="preservedText" type="button" class="flex min-h-11 items-center gap-1.5 pl-9 text-left text-sm text-info hover:underline" :title="preservedText" @click="restorePreserved">
      <span aria-hidden="true">✎</span>
      <span>Getippter Text gemerkt — zurückholen</span>
    </button>

    <!-- nicht erhoben: Zeilen-Verwaltung aus, nur Hinweis. Daten bleiben erhalten und kommen beim Zurueckschalten wieder. -->
    <p v-if="excluded" class="text-xs italic text-base-content/50">nicht erhoben — erscheint nicht im Protokoll</p>

    <div v-else-if="custom" class="flex flex-col gap-1">
      <!-- Freitext ersetzt in der Ausgabe die Zeilen; vorbelegt mit dem Standardtext, Zeilen bleiben erhalten. -->
      <textarea
        class="textarea textarea-bordered textarea-sm w-full"
        rows="3"
        :value="customText"
        :aria-label="`${label}: Freitext`"
        :placeholder="node.default || 'z. B. Medikation siehe beiliegender Plan'"
        @input="setCustomText(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <p class="text-xs italic text-base-content/50">Freitext — ersetzt in der Ausgabe die Einträge. Erfasste Einträge bleiben erhalten.</p>
    </div>

    <template v-else>
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
        @pointerdown="onCardTap"
        @mousedown="onCardTap"
        @keydown.esc="closeEdit"
      >
        <div class="flex items-center gap-2">
          <input
            :ref="setEditName"
            class="input input-sm flex-1 font-medium"
            :value="r.name"
            placeholder="Medikament"
            role="combobox"
            :aria-expanded="suggestForRow === i && suggestions.length > 0"
            aria-autocomplete="list"
            :aria-label="`Medikament ${i + 1}`"
            @input="onNameInput(i, ($event.target as HTMLInputElement).value)"
            @keydown.esc.stop="closeSuggest"
          />
          <button type="button" class="btn btn-ghost btn-sm btn-circle min-h-11 min-w-11 text-error" :aria-label="`${r.name || 'Medikament ' + (i + 1)} entfernen`" @click="requestRemove(i)">✕</button>
        </div>
        <!-- Vorschlaege aus der PZN-Bibliothek: INNERHALB der Karte, damit der Tap-Guard
             (onCardTap/focusout) den Tap nicht als „Karte verlassen" wertet. Auswahl fuellt die Zeile. -->
        <div
          v-if="suggestForRow === i && suggestions.length"
          class="max-h-72 overflow-y-auto overscroll-contain rounded-box border border-base-300 bg-base-100"
        >
          <ul class="menu menu-sm w-full p-1" role="listbox" :aria-label="`Vorschläge für Medikament ${i + 1}`">
            <li v-for="s in suggestions" :key="s.pzn">
              <button type="button" role="option" class="flex flex-col items-start gap-0 py-1 text-left" @click="chooseSuggestion(i, s)">
                <span class="font-medium">{{ s.wirkstoff || s.label }}</span>
                <span class="text-xs text-base-content/60">
                  <template v-if="s.staerke">{{ s.staerke }} · </template>PZN {{ s.pzn }}<template v-if="s.wirkstoff && s.label && s.label !== s.wirkstoff"> · {{ s.label }}</template>
                </span>
              </button>
            </li>
          </ul>
          <p v-if="suggestCapped" class="px-3 pb-2 pt-0 text-xs italic text-base-content/50">Viele Treffer — weiter tippen zum Eingrenzen.</p>
        </div>
        <div class="flex gap-2">
          <input class="input input-sm min-w-0 flex-1" :value="r.staerke ?? ''" placeholder="Stärke (z. B. 400 mg)" aria-label="Wirkstärke" @input="setRow(i, { staerke: ($event.target as HTMLInputElement).value })" />
          <input class="input input-sm w-28 shrink-0 text-center font-mono" :value="r.dosierung ?? ''" placeholder="1-0-1-0" aria-label="Dosierung" @input="setRow(i, { dosierung: ($event.target as HTMLInputElement).value })" />
        </div>
        <input class="input input-sm w-full" :value="r.kommentar ?? ''" placeholder="Hinweis (z. B. nüchtern)" aria-label="Hinweis" @input="setRow(i, { kommentar: ($event.target as HTMLInputElement).value })" />
        <button type="button" class="btn btn-primary btn-sm min-h-11 self-end" @click="closeEdit">Fertig</button>
      </div>
    </template>

    <!-- Unterer Zurücksetzen-Button (Scan-Fluss/Daumenzone); mb-1 setzt den destruktiven Button von der
         Aktionsleiste ab (Proximity, Apple ≥12pt). Rückfrage macht ihn NN/g-konform (Reset-Ausnahme:
         Formular wird je Einsatz neu gefüllt). -->
    <button v-if="rows.length" type="button" class="btn btn-ghost btn-sm mb-1 min-h-11 self-end text-error" :aria-label="`Alle zurücksetzen: ${label}`" @click="requestRemoveAll">Alle zurücksetzen</button>
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
    </template>

    <!-- Scan-Art waehlen: komfortable Tiles (bewusste Wahl, sourced scan-sheet-beauty). daisyUI .modal
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
            <span class="flex flex-col text-left">
              <span>Packung scannen</span>
              <span class="text-xs text-base-content/60">Einzelnes Medikament von der Packung</span>
            </span>
          </button>
          <button type="button" class="flex min-h-14 w-full items-center gap-4 rounded-xl bg-base-200 px-3 text-base font-normal transition-colors active:bg-base-300" @click="pickScan('plan')">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="h-6 w-6" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            </span>
            <span class="flex flex-col text-left">
              <span>Plan (BMP) scannen</span>
              <span class="text-xs text-base-content/60">Ganzer Plan mit der Kamera</span>
            </span>
          </button>
          <button type="button" class="flex min-h-14 w-full items-center gap-4 rounded-xl bg-base-200 px-3 text-base font-normal transition-colors active:bg-base-300" @click="pickScan('external')">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="h-6 w-6" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.5v15M7.5 4.5v15M11.25 4.5v15M15 4.5v15M18.75 4.5v15" /></svg>
            </span>
            <span class="flex flex-col text-left">
              <span>Externer Scanner</span>
              <span class="text-xs text-base-content/60">Ganzer Plan mit Bluetooth-/Kabel-Scanner</span>
            </span>
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
      <CodeScanOverlay v-if="pkgScanOpen" :profile="PACKAGE_PROFILE" @decoded="onPackageDecoded" @cancel="pkgScanOpen = false" />
    </Teleport>

    <!-- BMP-Plan-Scan + Review (teleportet sich selbst) -->
    <MedplanReviewSheet v-if="bmpOpen" :mode="bmpMode" @apply="onBmpApply" @close="bmpOpen = false" />

    <!-- Lösch-Rückfrage: Einzelzeile mit Daten oder „alle zurücksetzen" (teleportet sich selbst) -->
    <ConfirmDialog
      v-if="pendingRemove !== null"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-label="pendingRemove === 'all' ? 'Alle zurücksetzen' : 'Entfernen'"
      @confirm="confirmPendingRemove"
      @cancel="pendingRemove = null"
    />

    <!-- Rückfrage Wirkstoffstärke: kleines BENIGNES Modal (primär „Übernehmen", kein Destruktiv-
         Stil, keine Scharfschalt-Sperre). ESC/Backdrop/„Nein" = nicht übernehmen. -->
    <Teleport to="body">
      <div
        v-if="pendingStaerke"
        class="modal modal-open"
        role="dialog"
        aria-modal="true"
        aria-label="Wirkstoffstärke übernehmen"
        @keydown.esc="dismissStaerke"
      >
        <div class="modal-box">
          <h3 class="text-base font-semibold">Wirkstoffstärke übernehmen?</h3>
          <p class="pt-2 text-sm text-base-content/70">
            Stärke <span class="font-medium">{{ pendingStaerke.value }}</span> in die Zeile übernehmen?
          </p>
          <div class="modal-action">
            <button type="button" class="btn btn-ghost min-h-12" @click="dismissStaerke">Nein</button>
            <button ref="staerkeConfirmBtn" type="button" class="btn btn-primary min-h-12" @click="applyStaerke">Übernehmen</button>
          </div>
        </div>
        <button type="button" class="modal-backdrop" aria-label="Nein" tabindex="-1" @click="dismissStaerke"></button>
      </div>
    </Teleport>
  </div>
</template>
