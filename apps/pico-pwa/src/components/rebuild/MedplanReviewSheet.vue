<script setup lang="ts">
/**
 * BMP-Plan-Scan + Review-Sheet (Rework, Slice 3b). Traegt die erprobte Scan-/Review-LOGIK
 * (useMedplanScan, PZN-Lookup, Aussteller-Opt-in, Einzel-Transfer, Datenschutz) im Bottom-Sheet
 * des Rework-Stils. Dies ist die LIVE-Komponente des BMP-Scans.
 *
 * Bewusste Entscheidung: bei mehreren Medikamenten auf einmal ein editierbarer Review-Schritt vor der
 * Uebernahme. DSGVO: Roh-Scan + Entwurf nur im RAM (useMedplanScan), reset() verwirft alles; erst
 * „Uebernehmen" macht die GEPRUEFTEN Zeilen zu Einsatz-Werten.
 */
import { ref, computed, onMounted } from 'vue'
import type { MedikamenteRow, ArztRow } from '@resqdocs/protocol-core/model'
import { useMedplanScan } from '@/medplan/useMedplanScan'
import { useMedicationLookup } from '@/medications/useMedicationLookup'
import { usePznLibrary } from '@/medications/usePznLibrary'
import { useProtocolTree } from '@resqdocs/protocol-core-ui/useProtocolTree'
import { collectFunctionNodes } from '@resqdocs/protocol-core/creator'
import { formatMedikament, medikamentRowHasData, staerkeOhneDuplikat } from '@resqdocs/protocol-core/functions/registry'
import CodeScanOverlay from '@/components/CodeScanOverlay.vue'
import { BMP_PROFILE } from '@/medplan/scanProfiles'
import ConfirmDialog from '@resqdocs/protocol-core-ui/components/ConfirmDialog.vue'
import { libraryOffer, librarySignature, type LibraryEntryView } from '@resqdocs/protocol-core-ui/packageScanResult'
import { savePznEntry, shownName } from '@/medications/pznLibrarySave'

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
// Rückmeldung je Zeile nach dem Speichern in der eigenen PZN-Bibliothek.
const transferState = ref<Record<number, 'added' | 'updated'>>({})
// Was die Bibliothek zu den PZN des Plans kennt (Eintrag oder null = unbekannt), nachgeschlagen in resolveFromLibrary.
const libEntries = ref<Map<string, LibraryEntryView | null>>(new Map())
// Zeilen, deren Namen die Person hier selbst geändert hat (nicht das Nachziehen aus der Bibliothek).
const editedRows = ref<Set<number>>(new Set())
// Zuletzt gespeicherter Stand je Zeile (für den Haken); eine weitere Änderung bietet wieder an.
const savedSig = ref<Record<number, string>>({})
/**
 * Knopf „in die PZN-Bibliothek“: 'add' = die Bibliothek kennt die PZN nicht und statt des Platzhalters „PZN …“ steht
 * ein Name da; 'update' = sie kennt sie, und der Name wurde hier selbst geändert; 'done' = eben gespeichert (Haken).
 * Die Stärke steht im Prüf-Fenster nur da und lässt sich hier nicht ändern: Sie reist beim Neuaufnehmen mit, einen
 * vorhandenen Eintrag ändert sie nicht.
 */
function transferOffer(i: number): 'add' | 'update' | 'done' | null {
  const row = structuredRows.value[i]
  const pzn = row?.pzn
  if (!row || !pzn) return null
  if (savedSig.value[i] === librarySignature(row.name)) return 'done'
  return libraryOffer({ entry: libEntries.value.get(pzn), name: row.name, edited: editedRows.value.has(i) })
}
const anyTransfer = computed(() => structuredRows.value.some((_, i) => transferOffer(i) === 'add' || transferOffer(i) === 'update'))
function onRowNameInput(i: number, value: string): void {
  if (!editedRows.value.has(i)) editedRows.value = new Set([...editedRows.value, i])
  updateRowName(i, value)
}
/** Anzahl echter Medikamentenzeilen (mit Namen). */
const medCount = computed(() => structuredRows.value.filter((r) => r.name.trim()).length)

/** Entfernen + die an den Zeilen-Index gebundenen Zustände mitziehen (sonst klebt die Rückmeldung an der falschen Zeile). */
function onRemoveRow(i: number): void {
  removeRow(i)
  const shift = <T,>(rec: Record<number, T>): Record<number, T> => {
    const next: Record<number, T> = {}
    for (const [k, v] of Object.entries(rec)) {
      const idx = Number(k)
      if (idx !== i) next[idx > i ? idx - 1 : idx] = v
    }
    return next
  }
  transferState.value = shift(transferState.value)
  savedSig.value = shift(savedSig.value)
  editedRows.value = new Set([...editedRows.value].filter((idx) => idx !== i).map((idx) => (idx > i ? idx - 1 : idx)))
}
// Lösch-Schutz auch im Scan-Review: geprüfte Zeilen sind Arbeit —
// Einzel-✕ und Verwerfen/Schließen fragen nach, solange erfasste Zeilen da sind. Index-basiert ist
// hier sicher: hinter dem Modal wird nie eingefügt/entfernt (resolveFromLibrary ändert nur FELDER
// bestehender Zeilen: Name/Stärke); beim Bestätigen wird die Zeile defensiv gegengeprüft.
const pendingRemove = ref<number | 'discard' | null>(null)
function requestRemoveRow(i: number): void {
  // IMMER nachfragen: hier gibt es keine "leer geborenen" Zeilen - jede stammt aus einem Parse
  // (auch mit leergeraeumtem Namen bleibt sie gescannte Arbeit).
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

function rowPzn(i: number): string | undefined {
  return structuredRows.value[i]?.pzn
}
async function transferRow(i: number): Promise<void> {
  const pzn = rowPzn(i)
  const offer = transferOffer(i)
  if (!pzn || (offer !== 'add' && offer !== 'update')) return
  const name = (structuredRows.value[i]?.name ?? '').trim()
  // Genau EINE PZN je Tipp. Neu: mit der Stärke aus dem Plan als eigenem Feld. Vorhanden: nur der geänderte Name.
  const result = await savePznEntry(pznLibrary, pzn, name, offer === 'add' ? structuredRows.value[i]?.staerke : undefined)
  // Gegenprobe wie in resolveFromLibrary: waehrend des awaits kann eine Zeile davor entfernt worden
  // sein (Loesch-Rueckfrage vergroessert das Fenster) -> Feedback nie an die nachgerueckte Zeile heften.
  if (result === 'invalid' || structuredRows.value[i]?.pzn !== pzn) return
  const vorher = libEntries.value.get(pzn)
  libEntries.value = new Map(libEntries.value).set(pzn, { name, staerke: vorher?.staerke ?? structuredRows.value[i]?.staerke ?? '' })
  savedSig.value = { ...savedSig.value, [i]: librarySignature(name) }
  transferState.value = { ...transferState.value, [i]: offer === 'add' ? 'added' : 'updated' }
}
/** Nach dem Parse: „PZN <nr>"-Platzhalter aus DER EIGENEN Bibliothek nachziehen (Wirkstoff > Label). */
async function resolveFromLibrary(): Promise<void> {
  // Snapshot {Index, PZN}: die Liste kann zwischen den awaits wachsen/schrumpfen -> vor jedem
  // updateRowName per PZN gegen die AKTUELLE Zeile pruefen (kein falscher Treffer nach Reorder).
  const snapshot = structuredRows.value.map((r, i) => ({ i, pzn: r.pzn, name: (r.name ?? '').trim() }))
  for (const { i, pzn, name } of snapshot) {
    if (!pzn) continue
    const e = await pznLibrary.entry(pzn)
    if (!libEntries.value.has(pzn)) libEntries.value = new Map(libEntries.value).set(pzn, e ? { name: shownName(e), staerke: e.staerke } : null)
    if (!/^PZN \d/.test(name)) continue // nur Platzhalter-Namen werden aus der Bibliothek ersetzt
    const resolved = e ? e.wirkstoff || e.label : ''
    if (resolved && structuredRows.value[i]?.pzn === pzn) {
      updateRowName(i, resolved)
      // Wirkstärke aus der EIGENEN Bibliothek mitziehen — nur leere Zeilen-Stärke füllen,
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

/** „Text einfügen“ (Zwischenablage): Feld auf- und zuklappen, kein Auto-Fokus, Enter ist ein Zeilenumbruch. */
function openManual(): void {
  manualOpen.value = !manualOpen.value
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
  scanOpen.value = true // die Kamera öffnet gleich
})
</script>

<template>
  <!-- BMP-Kamera als Vollbild (teleported; z-50 > Sheet z-40, liegt also darueber) -->
  <Teleport to="body">
    <CodeScanOverlay v-if="scanOpen" :profile="BMP_PROFILE" @decoded="onDecoded($event.text)" @cancel="scanOpen = false" />
  </Teleport>

  <!-- Prüf-Fenster (teleported; bewusst KEIN daisyUI .modal wegen z-999 über der Kamera). Am Handy füllt es den
       ganzen Bildschirm: Es öffnet aus dem Listen-Fenster heraus (ebenfalls Vollbild), ein halbhohes Blatt darüber
       ergäbe zwei Fenster übereinander. Auf breiten Bildschirmen bleibt es ein mittiger Dialog. -->
  <Teleport to="body">
    <div class="overlay-backdrop fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center" role="dialog" aria-modal="true">
      <div class="overlay-surface flex h-dvh w-full flex-col gap-3 overflow-hidden p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:mx-auto sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:rounded-2xl sm:pt-4" data-review-sheet>
        <div class="flex items-center justify-between gap-2">
          <span class="text-base font-semibold">Medikationsplan scannen</span>
          <div class="flex items-center gap-2">
            <span v-if="totalPages > 0" class="badge badge-sm" :class="missingPages.length ? 'badge-warning' : 'badge-success'">
              {{ missingPages.length ? `Seite ${missingPages.join(', ')} fehlt` : `${totalPages} Seite(n)` }}
            </span>
            <button type="button" class="btn btn-ghost btn-sm btn-circle min-h-11 min-w-11" aria-label="Schließen" data-back-close @click="requestDiscard">✕</button>
          </div>
        </div>

        <!-- Scan-/Eingabe-Steuerung -->
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm btn-primary min-h-11 gap-1" @click="scanOpen = true">{{ structuredRows.length ? 'Weitere Seite scannen' : 'Code scannen' }}</button>
          <button type="button" class="btn btn-sm btn-ghost min-h-11" @click="openManual">Text einfügen</button>
        </div>

        <div v-if="manualOpen" class="flex flex-col gap-2">
          <textarea
            v-model="manualText"
            rows="3"
            class="textarea textarea-bordered textarea-sm w-full font-mono"
            placeholder="Inhalt des Codes (XML, beginnt mit <MP …>) einfügen"
            aria-label="Inhalt des Codes"
          />
          <button type="button" class="btn btn-sm self-start min-h-11" :disabled="!manualText.trim()" @click="onManualAdd">Übernehmen</button>
        </div>

        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>

        <!-- EIN Scrollbereich fuer Ausstellende Praxis UND Medikamentenliste. Vorher stand die Praxis
             fest ueber der Liste: bei offenem Eingabefeld („Text einfügen“) blieb auf
             kleinen Displays fuer die Liste keine Hoehe mehr - die Medikamente waren nicht zu sehen und damit
             nicht zu scrollen. Jetzt scrollt die Praxis mit weg. min-h-0: sonst behaelt das flex-Kind
             min-height:auto und schrumpft nicht unter seine Inhaltshoehe. -->
        <div v-if="structuredRows.length" class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain">
          <!-- Aussteller (Opt-in; Default „nicht dokumentieren") - NUR wenn das Protokoll eine Aerzte-Funktion hat;
               ohne Aerzte-Funktion wird der Arzt aus dem Plan gar nicht gezeigt (und nie uebernommen). -->
          <div v-if="hasAerzte && aussteller" class="flex shrink-0 flex-col gap-1 rounded-lg bg-base-200 p-2">
            <span class="text-xs text-base-content/75">Ausstellende Praxis aus dem Plan:</span>
            <span class="text-sm">{{ aussteller.name }}<template v-if="aussteller.ort">, {{ aussteller.ort }}</template><template v-if="aussteller.nummer">, {{ aussteller.nummer.typ }} {{ aussteller.nummer.wert }}</template><template v-if="aussteller.telefon">, Tel. {{ aussteller.telefon }}</template></span>
            <!-- Radios wie gehabt, aber kompakt: ohne min-h-11 je Option und mit kleinem Zeilenabstand - vorher entstanden
                 beim Umbrechen große Lücken zwischen den Optionen. -->
            <div class="flex flex-wrap items-center gap-x-5 gap-y-0 text-sm" role="radiogroup" aria-label="Aussteller dokumentieren">
              <label class="flex cursor-pointer items-center gap-2 py-1.5"><input v-model="ausstellerRolle" type="radio" value="" class="radio radio-sm" /> nicht dokumentieren</label>
              <label class="flex cursor-pointer items-center gap-2 py-1.5"><input v-model="ausstellerRolle" type="radio" value="Hausarzt" class="radio radio-sm" /> als Hausarzt</label>
              <label class="flex cursor-pointer items-center gap-2 py-1.5"><input v-model="ausstellerRolle" type="radio" value="Facharzt" class="radio radio-sm" /> als Facharzt</label>
            </div>
            <p v-if="ausstellerRolle" class="text-xs text-success">→ wird in Kontakte/Ärzte übernommen</p>
          </div>

          <!-- Erklärt das Symbol, bevor man tippt (am Handy gibt es keinen Tooltip). Nur wenn ein Knopf zu sehen ist. -->
          <p v-if="anyTransfer" class="flex shrink-0 items-center gap-2 text-xs text-base-content/75" data-pzn-legend>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="h-5 w-5 shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>
            <span>übernimmt die PZN mit dem Namen der Zeile in deine PZN-Bibliothek bzw. speichert deine Änderung dort. Die App erkennt das Medikament dann beim nächsten Scan und schlägt es beim Tippen vor.</span>
          </p>

          <!-- Review-Liste: Name editierbar, PZN im Hintergrund (Transfer), entfernen -->
          <ul class="flex shrink-0 flex-col gap-1.5">
            <li v-for="(row, i) in structuredRows" :key="i" class="flex flex-col gap-0.5">
              <div class="flex items-center gap-1">
                <input :value="row.name" class="input input-sm flex-1" :aria-label="`Medikament ${i + 1} Name`" @input="onRowNameInput(i, ($event.target as HTMLInputElement).value)" />
                <span v-if="row.staerke" class="badge badge-ghost badge-sm shrink-0" :aria-label="`Wirkstärke ${row.staerke}`">{{ row.staerke }}</span>
                <!-- Ablage-Symbol statt Pfeil; nach dem Tipp ein Haken. Nur bei einer PZN, die die Bibliothek noch nicht kennt. -->
                <button
                  v-if="transferOffer(i)"
                  type="button"
                  class="btn btn-ghost btn-sm min-h-11 min-w-11 px-0"
                  :class="transferOffer(i) === 'done' ? 'text-success' : ''"
                  :aria-label="transferOffer(i) === 'done' ? `PZN ${rowPzn(i)} ist in der PZN-Bibliothek gespeichert` : transferOffer(i) === 'update' ? `Änderung zu PZN ${rowPzn(i)} in der PZN-Bibliothek speichern` : `PZN ${rowPzn(i)} in die PZN-Bibliothek übernehmen`"
                  :aria-disabled="transferOffer(i) === 'done' || undefined"
                  data-pzn-transfer
                  @click="transferRow(i)"
                >
                  <svg v-if="transferOffer(i) === 'done'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-6 w-6" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="h-6 w-6" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>
                </button>
                <button type="button" class="btn btn-ghost btn-sm min-h-11 min-w-11 text-error" :aria-label="`Medikament ${i + 1} entfernen`" @click="requestRemoveRow(i)">✕</button>
              </div>
              <span v-if="transferState[i] && transferOffer(i) === 'done'" class="pl-1 text-xs text-success">{{ transferState[i] === 'added' ? 'PZN in Bibliothek übernommen.' : 'In der PZN-Bibliothek gespeichert.' }}</span>
            </li>
          </ul>
        </div>
        <p v-else-if="!scanOpen" class="text-sm italic text-base-content/75">Noch nichts gescannt — „Code scannen" oder „Text einfügen".</p>

        <!-- Hinweis VOR der Knopfzeile: Die Knopfzeile klebt am unteren Rand und lag sonst über seiner ersten Zeile. -->
        <p class="mt-auto shrink-0 text-xs text-base-content/75">Nur auf dem Gerät, nichts wird gespeichert oder gesendet. Keine Patientendaten aus dem Code — Einträge vor der Übernahme prüfen.</p>

        <!-- Aktionen -->
        <div class="kb-actions flex shrink-0 justify-between gap-2 pt-2">
          <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="requestDiscard">Verwerfen</button>
          <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="!medCount" @click="applyAndClose">{{ medCount }} Medikament{{ medCount === 1 ? '' : 'e' }} übernehmen</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Lösch-Rückfrage: Einzelzeile oder ganze Scan-Liste; daisyUI-Modal (z-999) liegt über dem Sheet (z-40) -->
  <ConfirmDialog
    v-if="pendingRemove !== null"
    :title="confirmTitle"
    :message="confirmMessage"
    :confirm-label="pendingRemove === 'discard' ? 'Verwerfen' : 'Entfernen'"
    @confirm="confirmPending"
    @cancel="pendingRemove = null"
  />
</template>
