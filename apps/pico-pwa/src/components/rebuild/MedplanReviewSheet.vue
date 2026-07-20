<script setup lang="ts">
/**
 * BMP-Plan-Scan + Review-Sheet (Rework, Slice 3b). Traegt die erprobte Scan-/Review-LOGIK
 * (useMedplanScan, PZN-Lookup, Aussteller-Opt-in, Einzel-Transfer, Datenschutz) im Bottom-Sheet
 * des Rework-Stils. Dies ist die LIVE-Komponente des BMP-Scans.
 *
 * Maintainer-Entscheid: bei mehreren Medikamenten auf einmal ein editierbarer Review-Schritt vor der
 * Uebernahme. DSGVO: Roh-Scan + Entwurf nur im RAM (useMedplanScan), reset() verwirft alles; erst
 * „Uebernehmen" macht die GEPRUEFTEN Zeilen zu Einsatz-Werten.
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import type { MedikamenteRow, ArztRow } from '@resqdocs/protocol-core/model'
import { useMedplanScan } from '@/medplan/useMedplanScan'
import { useMedicationLookup } from '@/medications/useMedicationLookup'
import { usePznLibrary } from '@/medications/usePznLibrary'
import { useProtocolTree } from '@resqdocs/protocol-core-ui/useProtocolTree'
import { collectFunctionNodes } from '@resqdocs/protocol-core/creator'
import { formatMedikament, medikamentRowHasData, staerkeOhneDuplikat } from '@resqdocs/protocol-core/functions/registry'
import MedplanScanOverlay from '@/components/MedplanScanOverlay.vue'
import ConfirmDialog from '@resqdocs/protocol-core-ui/components/ConfirmDialog.vue'

// mode: 'camera' (Standard, „Plan scannen" → Kamera gleich auf) | 'scanner' („Externer Scanner" →
// Feld für HID-/Bluetooth-Scanner fokussiert, keine Kamera).
const props = withDefaults(defineProps<{ mode?: 'camera' | 'scanner' }>(), { mode: 'camera' })
const emit = defineEmits<{ apply: [rows: MedikamenteRow[], doctor?: ArztRow]; close: [] }>()

const lookup = useMedicationLookup()
void lookup.ensureLoaded()
const { error, structuredRows, totalPages, aussteller, ausstellerRolle, missingPages, ingest, updateRowName, setRowStaerke, removeRow, reset } =
  useMedplanScan((pzn) => lookup.resolve(pzn))

const pznLibrary = usePznLibrary()
void pznLibrary.ensureReady()
// Existiert im Protokoll eine Aerzte-Funktion? Dann geht der Aussteller dorthin (statt als Plan-Zeile).
const { einsatzRoot } = useProtocolTree()
const hasAerzte = computed(() => collectFunctionNodes(einsatzRoot.value, 'aerzte').length > 0)
const transferState = ref<Record<number, 'added' | 'exists'>>({})
/** Anzahl echter Medikamentenzeilen (mit Namen). */
const medCount = computed(() => structuredRows.value.filter((r) => r.name.trim()).length)

/** Entfernen + den Index-gekeyten transferState mit-reindizieren (sonst klebt das Feedback falsch). */
function onRemoveRow(i: number): void {
  removeRow(i)
  const next: Record<number, 'added' | 'exists'> = {}
  for (const [k, v] of Object.entries(transferState.value)) {
    const idx = Number(k)
    if (idx === i) continue
    next[idx > i ? idx - 1 : idx] = v
  }
  transferState.value = next
}
// Lösch-Schutz auch im Scan-Review (#260, Maintainer-Nachforderung): geprüfte Zeilen sind Arbeit —
// Einzel-✕ und Verwerfen/Schließen fragen nach, solange erfasste Zeilen da sind. Index-basiert ist
// hier sicher: hinter dem Modal wird nie eingefügt/entfernt (resolveFromLibrary ändert nur FELDER
// bestehender Zeilen: Name/Stärke); beim Bestätigen wird die Zeile defensiv gegengeprüft.
const pendingRemove = ref<number | 'discard' | null>(null)
function requestRemoveRow(i: number): void {
  // IMMER nachfragen: hier gibt es keine "leer geborenen" Zeilen - jede stammt aus einem Parse
  // (auch mit leergeraeumtem Namen bleibt sie gescannte Arbeit, #260-Nachbefund).
  if (structuredRows.value[i]) pendingRemove.value = i
}
function requestDiscard(): void {
  // Gleiches Daten-Gate wie das Zeilen-✕ (hasData statt nur Name) -> kein Schlupfloch bei namenlosen Zeilen.
  if (structuredRows.value.some(medikamentRowHasData)) pendingRemove.value = 'discard'
  else discardAndClose()
}
const confirmTitle = computed(() => {
  const p = pendingRemove.value
  if (p === 'discard') return 'Gescannte Liste verwerfen?'
  const r = typeof p === 'number' ? structuredRows.value[p] : undefined
  return `„${(r && formatMedikament(r)) || 'Medikament'}“ entfernen?`
})
const confirmMessage = computed(() =>
  pendingRemove.value === 'discard'
    ? `${medCount.value === 1 ? 'Der gescannte Eintrag wird' : `Alle ${medCount.value} gescannten Einträge werden`} verworfen und nicht übernommen.`
    : 'Der Eintrag wird aus der Scan-Liste entfernt und nicht übernommen.',
)
function confirmPending(): void {
  const p = pendingRemove.value
  pendingRemove.value = null
  if (p === 'discard') discardAndClose()
  else if (typeof p === 'number' && structuredRows.value[p]) onRemoveRow(p)
}

const scanOpen = ref(false)
const manualOpen = ref(false)
const manualText = ref('')
const manualTextarea = ref<HTMLTextAreaElement | null>(null)
// Externer-Scanner-Modus: dieselbe große Eingabe wie „Text einfügen", aber fokussiert + Enter-Übernahme,
// damit ein als HID-/Bluetooth-Tastatur gekoppelter Scanner (z. B. NETUM C750) hineintippt. scannerMode
// trennt das sauber vom unveränderten Einfüge-Pfad (dort bleibt Enter ein Zeilenumbruch).
const scannerMode = ref(false)

function rowPzn(i: number): string | undefined {
  return structuredRows.value[i]?.pzn
}
/** Label-Vorschlag: der Name, aber NICHT der „PZN <nr>"-Platzhalter. */
function rowLabel(i: number): string {
  const name = structuredRows.value[i]?.name?.trim() ?? ''
  return /^PZN \d/.test(name) ? '' : name
}
async function transferRow(i: number): Promise<void> {
  const pzn = rowPzn(i)
  if (!pzn) return
  // Stärke als eigener Vorschlag mit (Bibliothek hat seit #262 ein eigenes Feld; Konfliktregel:
  // vorhandene nicht-leere Stärke gewinnt) — NICHT mehr ins Label mischen.
  const result = await pznLibrary.addOne(pzn, rowLabel(i), structuredRows.value[i]?.staerke) // genau EINE PZN
  // Gegenprobe wie in resolveFromLibrary: waehrend des awaits kann eine Zeile davor entfernt worden
  // sein (Loesch-Rueckfrage vergroessert das Fenster) -> Feedback nie an die nachgerueckte Zeile heften.
  if (result !== 'invalid' && structuredRows.value[i]?.pzn === pzn) transferState.value = { ...transferState.value, [i]: result }
}
/** Nach dem Parse: „PZN <nr>"-Platzhalter aus DER EIGENEN Bibliothek nachziehen (Wirkstoff > Label). */
async function resolveFromLibrary(): Promise<void> {
  // Snapshot {Index, PZN}: die Liste kann zwischen den awaits wachsen/schrumpfen -> vor jedem
  // updateRowName per PZN gegen die AKTUELLE Zeile pruefen (kein falscher Treffer nach Reorder).
  const snapshot = structuredRows.value.map((r, i) => ({ i, pzn: r.pzn, name: (r.name ?? '').trim() }))
  for (const { i, pzn, name } of snapshot) {
    if (!pzn || !/^PZN \d/.test(name)) continue
    const e = await pznLibrary.entry(pzn)
    const resolved = e ? e.wirkstoff || e.label : ''
    if (resolved && structuredRows.value[i]?.pzn === pzn) {
      updateRowName(i, resolved)
      // Wirkstärke aus der EIGENEN Bibliothek mitziehen (#262) — nur leere Zeilen-Stärke füllen,
      // und nie doppelt dokumentieren, wenn der aufgelöste Name sie schon trägt.
      const st = staerkeOhneDuplikat(resolved, e?.staerke)
      if (st && !structuredRows.value[i]?.staerke) setRowStaerke(i, st)
    }
  }
}
async function onDecoded(raw: string): Promise<void> {
  scanOpen.value = false
  ingest(raw)
  await resolveFromLibrary()
}
async function onManualAdd(): Promise<void> {
  if (ingest(manualText.value.trim())) {
    manualText.value = ''
    manualOpen.value = false
    await resolveFromLibrary()
  }
}

/** „Text einfügen" (Zwischenablage): Verhalten UNVERÄNDERT – Toggle, kein Auto-Fokus, Enter = Zeilenumbruch. */
function openManual(): void {
  if (manualOpen.value && !scannerMode.value) { manualOpen.value = false; return }
  scannerMode.value = false
  manualOpen.value = true
}
/** „Externer Scanner" (HID-/Bluetooth-Tastatur, z. B. NETUM C750): dieselbe Eingabe öffnen + fokussieren,
 *  damit die getippten Zeichen dort landen; danach identischer Pfad wie ein Kamera-Scan. */
function openScanner(): void {
  scannerMode.value = true
  manualOpen.value = true
  void nextTick(() => manualTextarea.value?.focus())
}
/** Enter im Feld NUR im Scanner-Modus übernehmen (abschließendes CR = freihändig); Einfüge-Modus: Zeilenumbruch. */
function onTextareaEnter(ev: KeyboardEvent): void {
  if (!scannerMode.value) return
  ev.preventDefault()
  void onScannerSubmit()
}
async function onScannerSubmit(): Promise<void> {
  // Trim-Guard: leeres Feld nicht an den Parser geben. Synchron leeren VOR dem await (keine Kollision mit
  // nächstem Seiten-Burst); Feld BLEIBT offen (kein manualOpen=false) für mehrseitige Pläne. Identischer
  // Pfad wie Kamera-Scan: ingest() + resolveFromLibrary() (PZN-Abgleich, Dosierung/Stärke, Aussteller).
  const text = manualText.value.trim()
  if (!text) return
  manualText.value = ''
  if (ingest(text)) await resolveFromLibrary()
  void nextTick(() => manualTextarea.value?.focus())
}
/** „Übernehmen": im Scanner-Modus mit Refokus (Mehrseiten), im Einfüge-Modus unverändert. */
function onManualSubmitClick(): void {
  if (scannerMode.value) void onScannerSubmit()
  else void onManualAdd()
}
function applyAndClose(): void {
  if (!medCount.value) return
  const meds = structuredRows.value.filter((r) => r.name.trim())
  // Der Aussteller/Arzt wird NUR uebernommen, wenn das Protokoll eine Aerzte-Funktion hat (dann geht er
  // SEPARAT an die Aerzte-Liste). Ohne Aerzte-Funktion wird er gar nicht angeboten (s. Template) und
  // auch nie als Plan-Zeile eingeschleust - der Medikamentenplan bekommt ausschliesslich Medikamente.
  const doctor: ArztRow | undefined =
    hasAerzte.value && ausstellerRolle.value && aussteller.value
      ? {
          name: aussteller.value.name,
          rolle: ausstellerRolle.value || undefined,
          ort: aussteller.value.ort,
          telefon: aussteller.value.telefon,
          arztnummer: aussteller.value.nummer?.wert,
        }
      : undefined
  emit('apply', meds, doctor)
  reset()
  emit('close')
}
function discardAndClose(): void {
  reset()
  emit('close')
}

onMounted(() => {
  // „Plan" -> Kamera gleich öffnen; „Externer Scanner" -> Scanner-Feld öffnen + fokussieren (keine Kamera).
  if (props.mode === 'scanner') openScanner()
  else scanOpen.value = true
})
</script>

<template>
  <!-- BMP-Kamera als Vollbild (teleported; z-50 > Sheet z-40, liegt also darueber) -->
  <Teleport to="body">
    <MedplanScanOverlay v-if="scanOpen" @decoded="onDecoded" @cancel="scanOpen = false" />
  </Teleport>

  <!-- Review-Sheet (Bottom-Sheet, teleported; bewusst KEIN daisyUI .modal wegen z-999 ueber der Kamera) -->
  <Teleport to="body">
    <div class="overlay-backdrop fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center" role="dialog" aria-modal="true">
      <div class="overlay-surface flex max-h-[85vh] w-full flex-col gap-3 rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-lg sm:rounded-2xl">
        <div class="flex items-center justify-between gap-2">
          <span class="text-base font-semibold">Medikationsplan scannen</span>
          <div class="flex items-center gap-2">
            <span v-if="totalPages > 0" class="badge badge-sm" :class="missingPages.length ? 'badge-warning' : 'badge-success'">
              {{ missingPages.length ? `Seite ${missingPages.join(', ')} fehlt` : `${totalPages} Seite(n)` }}
            </span>
            <button type="button" class="btn btn-ghost btn-sm btn-circle min-h-11 min-w-11" aria-label="Schließen" @click="requestDiscard">✕</button>
          </div>
        </div>

        <!-- Scan-/Eingabe-Steuerung -->
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm btn-primary min-h-11 gap-1" @click="scanOpen = true">{{ structuredRows.length ? 'Weitere Seite scannen' : 'Code scannen' }}</button>
          <button type="button" class="btn btn-sm btn-ghost min-h-11" @click="openManual">Text einfügen</button>
        </div>

        <div v-if="manualOpen" class="flex flex-col gap-2">
          <p v-if="scannerMode" id="medplan-ext-scanner-hint" class="text-xs text-base-content/60">
            Externer Scanner (per Bluetooth oder Kabel als Tastatur gekoppelt): Feld ist aktiv – jetzt den
            BMP-Code scannen. Er wird automatisch übernommen (oder „Übernehmen" tippen); Prüfung, PZN-Abgleich
            und Dosierung/Stärke laufen genau wie beim Kamera-Scan.
          </p>
          <textarea
            ref="manualTextarea"
            v-model="manualText"
            rows="3"
            class="textarea textarea-bordered textarea-sm w-full font-mono"
            :placeholder="scannerMode ? 'BMP-Code hierher scannen (externer Scanner)…' : 'BMP-Code-Inhalt (XML, beginnt mit <MP …>) einfügen'"
            :aria-label="scannerMode ? 'BMP-Code scannen (externer Scanner)' : 'BMP-Code-Inhalt'"
            :aria-describedby="scannerMode ? 'medplan-ext-scanner-hint' : undefined"
            @keydown.enter="onTextareaEnter"
          />
          <button type="button" class="btn btn-sm self-start min-h-11" :disabled="!manualText.trim()" @click="onManualSubmitClick">Übernehmen</button>
        </div>

        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>

        <!-- Aussteller (Opt-in; Default „nicht dokumentieren") - NUR wenn das Protokoll eine Aerzte-Funktion hat;
             ohne Aerzte-Funktion wird der Arzt aus dem Plan gar nicht gezeigt (und nie uebernommen). -->
        <div v-if="hasAerzte && aussteller && structuredRows.length" class="flex flex-col gap-1 rounded-lg bg-base-200 p-2">
          <span class="text-xs text-base-content/60">Ausstellende Praxis aus dem Plan:</span>
          <span class="text-sm">{{ aussteller.name }}<template v-if="aussteller.ort">, {{ aussteller.ort }}</template><template v-if="aussteller.nummer">, {{ aussteller.nummer.typ }} {{ aussteller.nummer.wert }}</template><template v-if="aussteller.telefon">, Tel. {{ aussteller.telefon }}</template></span>
          <div class="flex flex-wrap items-center gap-3 text-sm" role="radiogroup" aria-label="Aussteller dokumentieren">
            <label class="flex min-h-11 items-center gap-1 py-2"><input v-model="ausstellerRolle" type="radio" value="" class="radio radio-sm" /> nicht dokumentieren</label>
            <label class="flex min-h-11 items-center gap-1 py-2"><input v-model="ausstellerRolle" type="radio" value="Hausarzt" class="radio radio-sm" /> als Hausarzt</label>
            <label class="flex min-h-11 items-center gap-1 py-2"><input v-model="ausstellerRolle" type="radio" value="Facharzt" class="radio radio-sm" /> als Facharzt</label>
          </div>
          <p v-if="ausstellerRolle" class="text-xs text-success">→ wird in die Ärzte-Liste übernommen</p>
        </div>

        <!-- Review-Liste: Name editierbar, PZN im Hintergrund (Transfer), entfernen -->
        <ul v-if="structuredRows.length" class="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          <li v-for="(row, i) in structuredRows" :key="i" class="flex flex-col gap-0.5">
            <div class="flex items-center gap-1">
              <input :value="row.name" class="input input-sm flex-1" :aria-label="`Medikament ${i + 1} Name`" @input="updateRowName(i, ($event.target as HTMLInputElement).value)" />
              <span v-if="row.staerke" class="badge badge-ghost badge-sm shrink-0" :aria-label="`Wirkstärke ${row.staerke}`">{{ row.staerke }}</span>
              <button v-if="rowPzn(i)" type="button" class="btn btn-ghost btn-sm min-h-11 min-w-11" :aria-label="`PZN ${rowPzn(i)} in die Bibliothek übernehmen`" :title="`PZN ${rowPzn(i)} in deine Bibliothek übernehmen`" @click="transferRow(i)">→</button>
              <button type="button" class="btn btn-ghost btn-sm min-h-11 min-w-11 text-error" :aria-label="`Medikament ${i + 1} entfernen`" @click="requestRemoveRow(i)">✕</button>
            </div>
            <span v-if="transferState[i]" class="pl-1 text-xs text-success">{{ transferState[i] === 'added' ? 'PZN in Bibliothek übernommen.' : 'PZN war bereits in der Bibliothek.' }}</span>
          </li>
        </ul>
        <p v-else-if="!scanOpen" class="text-sm italic text-base-content/50">Noch nichts gescannt — „Code scannen" oder „Text einfügen".</p>

        <!-- Aktionen -->
        <div class="mt-auto flex justify-between gap-2 pt-2">
          <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="requestDiscard">Verwerfen</button>
          <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="!medCount" @click="applyAndClose">{{ medCount }} Medikament{{ medCount === 1 ? '' : 'e' }} übernehmen</button>
        </div>

        <p class="text-xs text-base-content/50">Nur auf dem Gerät, nichts wird gespeichert oder gesendet. Keine Patientendaten aus dem Code — Einträge vor der Übernahme prüfen.</p>
      </div>
    </div>
  </Teleport>

  <!-- Lösch-Rückfrage (#260): Einzelzeile oder ganze Scan-Liste; daisyUI-Modal (z-999) liegt über dem Sheet (z-40) -->
  <ConfirmDialog
    v-if="pendingRemove !== null"
    :title="confirmTitle"
    :message="confirmMessage"
    :confirm-label="pendingRemove === 'discard' ? 'Verwerfen' : 'Entfernen'"
    @confirm="confirmPending"
    @cancel="pendingRemove = null"
  />
</template>
